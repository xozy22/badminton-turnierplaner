<?php
/**
 * Plugin Name: BOSS Live Results
 * Description: Receives live tournament snapshots from the BOSS desktop app and renders matches, standings, and brackets via shortcodes.
 * Version:     1.0.6
 * Author:      BOSS
 * License:     MIT
 * Text Domain: boss-live-results
 *
 * Storage model: one snapshot per tournament-id, kept as a Custom Post Type
 * (slug `boss-tour-{id}`) with the JSON in `post_content` and a few meta
 * fields (`boss_tid`, `boss_status`, `boss_pushed_at`) for fast list queries.
 *
 * Auth: shared secret in the `X-BOSS-Secret` HTTP header. The same string
 * goes into the BOSS desktop settings.
 */

defined('ABSPATH') || exit;

const BOSS_CPT             = 'boss_tournament';
const BOSS_OPT_SECRET      = 'boss_live_secret';
const BOSS_PLUGIN_VERSION  = '1.0.6';
const BOSS_SCHEMA_VERSION  = 1;

// ---------------------------------------------------------------------------
// Custom Post Type registration
// ---------------------------------------------------------------------------

add_action('init', function () {
    register_post_type(BOSS_CPT, [
        'label'           => 'BOSS Tournaments',
        'public'          => false,
        'show_ui'         => true,
        'show_in_menu'    => false, // Linked from our settings page only.
        'supports'        => ['title'],
        'capability_type' => 'post',
    ]);
});

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Largest snapshot accepted, in bytes. A 64-player tournament with all
 *  sets played lands around 120 KB; 2 MB leaves generous headroom while
 *  keeping a runaway or hostile body out of the posts table. */
const BOSS_MAX_BODY_BYTES = 2097152;

/** Failed authentications tolerated per IP before the endpoint stops
 *  answering, and the window they are counted in. Only *failures* count:
 *  a tournament in progress pushes on every score, and throttling the
 *  legitimate client would be a denial of service against its own user. */
const BOSS_AUTH_FAIL_MAX    = 10;
const BOSS_AUTH_FAIL_WINDOW = 900; // 15 minutes

/** Cache key for the per-IP failure counter. The IP is hashed rather than
 *  stored: the counter is not a visitor log, and a transient that outlives
 *  its purpose should not hold an address. */
function boss_fail_key() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : 'unknown';
    return 'boss_authfail_' . md5($ip);
}

function boss_auth_failures() {
    return (int) get_transient(boss_fail_key());
}

function boss_note_auth_failure() {
    $key = boss_fail_key();
    $n   = (int) get_transient($key);
    // set_transient refreshes the window on each failure, so a slow drip
    // of guesses cannot outlast it by pacing itself just under the edge.
    set_transient($key, $n + 1, BOSS_AUTH_FAIL_WINDOW);
}

function boss_clear_auth_failures() {
    delete_transient(boss_fail_key());
}

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------

add_action('rest_api_init', function () {
    register_rest_route('boss/v1', '/push', [
        'methods'             => 'POST',
        'callback'            => 'boss_handle_push',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route('boss/v1', '/snapshot/(?P<id>\d+)', [
        'methods'             => 'GET',
        'callback'            => 'boss_handle_get_one',
        'permission_callback' => '__return_true',
    ]);
    register_rest_route('boss/v1', '/tournaments', [
        'methods'             => 'GET',
        'callback'            => 'boss_handle_list',
        'permission_callback' => '__return_true',
    ]);
});

/**
 * POST /wp-json/boss/v1/push
 *
 * Handles three payload shapes:
 *   - {schema:1, test:true}                       → ping/health-check
 *   - {schema:1, delete:true, tournament:{id:N}}  → delete a tournament
 *   - {schema:1, tournament:{id:N, ...}, ...}     → upsert snapshot
 */
function boss_handle_push(WP_REST_Request $req) {
    if (boss_auth_failures() >= BOSS_AUTH_FAIL_MAX) {
        return new WP_Error('too_many', 'Too many failed attempts', [
            'status' => 429,
        ]);
    }

    // Size is checked before anything reads the body, so an oversized
    // request costs a header lookup rather than a parse.
    $raw = $req->get_body();
    if (strlen($raw) > BOSS_MAX_BODY_BYTES) {
        return new WP_Error('too_large', 'Payload too large', ['status' => 413]);
    }

    $stored = (string) get_option(BOSS_OPT_SECRET, '');
    $sent   = (string) $req->get_header('x_boss_secret');
    if ($stored === '' || !hash_equals($stored, $sent)) {
        boss_note_auth_failure();
        return new WP_Error('forbidden', 'Invalid secret', ['status' => 401]);
    }
    boss_clear_auth_failures();

    $body = $req->get_json_params();
    if (!is_array($body) || (int) ($body['schema'] ?? 0) !== BOSS_SCHEMA_VERSION) {
        return new WP_Error('bad_schema', 'Schema mismatch', ['status' => 400]);
    }

    // Health-check ping: BOSS settings "Test connection" sends this.
    if (!empty($body['test'])) {
        return [
            'ok'             => true,
            'plugin_version' => BOSS_PLUGIN_VERSION,
            'schema'         => BOSS_SCHEMA_VERSION,
        ];
    }

    $tid = (int) ($body['tournament']['id'] ?? 0);
    if ($tid <= 0) {
        return new WP_Error('bad_id', 'Missing tournament.id', ['status' => 400]);
    }

    // Delete-path: BOSS user clicked "Stop live publishing" or completed/archived.
    if (!empty($body['delete'])) {
        $existing = get_page_by_path("boss-tour-$tid", OBJECT, BOSS_CPT);
        if ($existing) {
            wp_delete_post($existing->ID, true);
        }
        return ['ok' => true, 'deleted' => true, 'tournament_id' => $tid];
    }

    // Upsert snapshot.
    $existing = get_page_by_path("boss-tour-$tid", OBJECT, BOSS_CPT);
    $payload  = [
        'post_type'    => BOSS_CPT,
        'post_status'  => 'publish',
        'post_name'    => "boss-tour-$tid",
        'post_title'   => sanitize_text_field($body['tournament']['name'] ?? "Tournament $tid"),
        'post_content' => wp_slash(wp_json_encode($body)),
    ];
    if ($existing) {
        $payload['ID'] = $existing->ID;
    }

    $post_id = wp_insert_post($payload, true);
    if (is_wp_error($post_id)) {
        return $post_id;
    }

    update_post_meta($post_id, 'boss_tid', $tid);
    update_post_meta(
        $post_id,
        'boss_status',
        sanitize_text_field((string) ($body['tournament']['status'] ?? ''))
    );
    update_post_meta(
        $post_id,
        'boss_pushed_at',
        sanitize_text_field((string) ($body['pushed_at'] ?? ''))
    );
    // Mark the snapshot as final once the desktop app sends the closing
    // push (status = completed/archived). Used as a hint by frontend.js
    // and by `[boss_tournaments]` so completed tournaments show "Final"
    // instead of "Live".
    if (!empty($body['final'])) {
        update_post_meta($post_id, 'boss_final', '1');
    }

    return ['ok' => true, 'tournament_id' => $tid];
}

/** GET /wp-json/boss/v1/snapshot/{id} — full snapshot or {empty:true}. */
function boss_handle_get_one(WP_REST_Request $req) {
    $tid  = (int) $req['id'];
    $post = get_page_by_path("boss-tour-$tid", OBJECT, BOSS_CPT);
    if (!$post) {
        return ['empty' => true, 'tournament_id' => $tid];
    }
    $data = json_decode($post->post_content, true);
    return is_array($data) ? $data : ['empty' => true, 'tournament_id' => $tid];
}

/**
 * GET /wp-json/boss/v1/tournaments — page of known tournaments.
 *
 * Used to fetch everything at once. A club that has run live results for a
 * few seasons accumulates hundreds of snapshots, and an unbounded list is
 * both a slow page and a free way to make the server do work.
 *
 * Accepts ?per_page (1..100, default 50) and ?page (1-based).
 */
function boss_handle_list(WP_REST_Request $req) {
    $per_page = (int) ($req->get_param('per_page') ?: 50);
    $per_page = max(1, min(100, $per_page));
    $page     = max(1, (int) ($req->get_param('page') ?: 1));

    $posts = get_posts([
        'post_type'   => BOSS_CPT,
        'numberposts' => $per_page,
        'offset'      => ($page - 1) * $per_page,
        'orderby'     => 'meta_value',
        'meta_key'    => 'boss_pushed_at',
        'order'       => 'DESC',
    ]);

    return array_map(function ($p) {
        return [
            'id'        => (int) get_post_meta($p->ID, 'boss_tid', true),
            'name'      => $p->post_title,
            'status'    => (string) get_post_meta($p->ID, 'boss_status', true),
            'pushed_at' => (string) get_post_meta($p->ID, 'boss_pushed_at', true),
            'final'     => (bool) get_post_meta($p->ID, 'boss_final', true),
        ];
    }, $posts);
}

// ---------------------------------------------------------------------------
// Admin settings page
// ---------------------------------------------------------------------------

add_action('admin_menu', function () {
    add_options_page(
        'BOSS Live',
        'BOSS Live',
        'manage_options',
        'boss-live',
        'boss_render_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('boss_live_settings', BOSS_OPT_SECRET, [
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => '',
    ]);
});

function boss_render_settings_page() {
    if (!current_user_can('manage_options')) {
        wp_die('Insufficient permissions');
    }
    $secret   = (string) get_option(BOSS_OPT_SECRET, '');
    $endpoint = rest_url('boss/v1/push');
    $list_url = admin_url('edit.php?post_type=' . BOSS_CPT);
    ?>
    <div class="wrap">
        <h1>BOSS Live Results</h1>
        <p>Receives tournament snapshots from the BOSS desktop app and exposes them via shortcodes.</p>

        <h2>Connection</h2>
        <table class="form-table" role="presentation">
            <tr>
                <th scope="row"><label>Endpoint URL</label></th>
                <td>
                    <code><?php echo esc_html($endpoint); ?></code>
                    <p class="description">Paste this into the BOSS desktop &rarr; Settings &rarr; Live publishing.</p>
                </td>
            </tr>
        </table>

        <form method="post" action="options.php">
            <?php settings_fields('boss_live_settings'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="boss_live_secret">Shared secret</label></th>
                    <td>
                        <input
                            id="boss_live_secret"
                            name="<?php echo esc_attr(BOSS_OPT_SECRET); ?>"
                            type="password"
                            value="<?php echo esc_attr($secret); ?>"
                            class="regular-text"
                            autocomplete="off"
                        />
                        <button type="button" class="button" id="boss_live_secret_toggle"
                                aria-controls="boss_live_secret" aria-expanded="false">Show</button>
                        <p class="description">Same value as in BOSS desktop. Pick a long random string.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button('Save'); ?>
        </form>
        <script>
        (function () {
            var field  = document.getElementById('boss_live_secret');
            var toggle = document.getElementById('boss_live_secret_toggle');
            if (!field || !toggle) { return; }
            toggle.addEventListener('click', function () {
                var shown = field.type === 'text';
                field.type = shown ? 'password' : 'text';
                toggle.textContent = shown ? 'Show' : 'Hide';
                toggle.setAttribute('aria-expanded', shown ? 'false' : 'true');
            });
        })();
        </script>

        <h2>Stored tournaments</h2>
        <p><a href="<?php echo esc_url($list_url); ?>" class="button">Open list in admin</a></p>

        <h2>Shortcodes</h2>
        <ul style="list-style: disc; padding-left: 1.5em;">
            <li><code>[boss_tournaments]</code> &mdash; list of all tournaments</li>
            <li><code>[boss_status id="123"]</code> &mdash; live/final badge + last push time</li>
            <li><code>[boss_matches id="123"]</code> &mdash; current matches table</li>
            <li><code>[boss_standings id="123"]</code> &mdash; standings table</li>
            <li><code>[boss_bracket id="123"]</code> &mdash; KO bracket (when applicable)</li>
        </ul>
        <p>Without an <code>id</code>, shortcodes also pick up <code>?tid=</code> from the page URL.</p>
    </div>
    <?php
}

// ---------------------------------------------------------------------------
// Shortcodes — server-side render the empty container; frontend.js fills it.
// ---------------------------------------------------------------------------

function boss_resolve_id($atts) {
    if (!empty($atts['id'])) {
        return (int) $atts['id'];
    }
    if (isset($_GET['tid'])) {
        return (int) $_GET['tid'];
    }
    return 0; // 0 = "auto-pick" — frontend.js will fall back to first listed.
}

add_shortcode('boss_tournaments', function () {
    return '<div class="boss-block" data-boss="tournaments"><div class="boss-loading">Loading…</div></div>';
});

add_shortcode('boss_status', function ($atts) {
    $id = boss_resolve_id($atts);
    return '<div class="boss-block" data-boss="status" data-tid="' . esc_attr($id) . '"><div class="boss-loading">…</div></div>';
});

add_shortcode('boss_matches', function ($atts) {
    $id = boss_resolve_id($atts);
    return '<div class="boss-block" data-boss="matches" data-tid="' . esc_attr($id) . '"><div class="boss-loading">Loading matches…</div></div>';
});

add_shortcode('boss_standings', function ($atts) {
    $id = boss_resolve_id($atts);
    return '<div class="boss-block" data-boss="standings" data-tid="' . esc_attr($id) . '"><div class="boss-loading">Loading standings…</div></div>';
});

add_shortcode('boss_bracket', function ($atts) {
    $id = boss_resolve_id($atts);
    return '<div class="boss-block" data-boss="bracket" data-tid="' . esc_attr($id) . '"><div class="boss-loading">Loading bracket…</div></div>';
});

// ---------------------------------------------------------------------------
// Frontend assets
// ---------------------------------------------------------------------------

add_action('wp_enqueue_scripts', function () {
    wp_enqueue_style(
        'boss-live',
        plugins_url('style.css', __FILE__),
        [],
        BOSS_PLUGIN_VERSION
    );
    wp_enqueue_script(
        'boss-live',
        plugins_url('frontend.js', __FILE__),
        [],
        BOSS_PLUGIN_VERSION,
        true
    );
    wp_localize_script('boss-live', 'BOSS_LIVE', [
        'rest_base' => esc_url_raw(rest_url('boss/v1')),
        'interval'  => 15000, // 15s poll
    ]);
});
