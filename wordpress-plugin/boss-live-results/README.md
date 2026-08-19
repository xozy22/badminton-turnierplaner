# BOSS Live Results

WordPress plugin that receives live tournament snapshots from the BOSS desktop app and renders them via shortcodes.

## What it does

While a tournament is running in BOSS, the desktop app pushes JSON snapshots to your WordPress site every time something changes (score entered, match started, court assigned) plus a 60-second heartbeat. This plugin stores the latest snapshot per tournament and exposes shortcodes you can drop onto any page or post.

Multiple tournaments can run in parallel — each one is stored independently and can be displayed on its own page (or all together on a list page).

Privacy by design: BOSS only transmits first name, last name, and club. Birth dates and payment info stay on the local desktop.

## Which versions work together

The plugin and the desktop app have separate version numbers on purpose:
the plugin ships into someone else's WordPress, so its number has to mean
"the plugin changed", not "the desktop app changed".

What the two sides actually agree on is the **schema version** in every
payload. The plugin rejects anything whose schema it does not know, rather
than storing a snapshot it cannot render.

| Desktop app | Plugin  | Schema | Notes |
|-------------|---------|--------|-------|
| 2.7.0+      | 1.0.0+  | 1      | first release of live publishing |
| 2.7.2+      | 1.0.2+  | 1      | matches segmented per round; older plugins show the current round only |
| 2.7.4+      | 1.0.4+  | 1      | final snapshot (`final: true`); older plugins ignore the flag and keep showing "Live" |
| 2.9.0+      | 1.0.6+  | 1      | HTTPS required, size and rate limits, privacy levels |

A newer app with an older plugin keeps working — the extra fields are
ignored. The other way round is also fine: the plugin renders what it
receives. Only a change of the **schema** number breaks the pairing, and
that has not happened yet.

## Installation

1. Zip the `boss-live-results` folder.
2. WordPress Admin → Plugins → Add New → Upload Plugin → choose the ZIP → activate.
3. Go to **Settings → BOSS Live**.
4. Set a **Shared secret** (any long random string — pick one yourself).
5. Copy the **Endpoint URL** shown on that page (e.g. `https://your-site.com/wp-json/boss/v1/push`).

## BOSS desktop setup

1. Open BOSS → Settings → "Live publishing (WordPress)".
2. Enable the toggle.
3. Paste the **Endpoint URL** from above.
4. Paste the **same Shared secret**.
5. Click **Test connection** — you should see "Connection OK".
6. Save.

From now on, every active tournament pushes its state to the WP site automatically.

## Shortcodes

All `id` attributes are optional. Without `id`, the shortcode auto-resolves:
- if the page URL has `?tid=123`, that wins;
- otherwise it picks the first active tournament from the list.

| Shortcode | Renders |
|---|---|
| `[boss_tournaments]` | Bullet list of all tournaments with status badge and link to `?tid=N` |
| `[boss_status id="123"]` | Live/Final badge plus last-update time |
| `[boss_matches id="123"]` | Current round table: court, teams, score, status |
| `[boss_standings id="123"]` | Ranking table (team or singles, auto). For group_ko: per-group sub-tables. |
| `[boss_bracket id="123"]` | KO bracket (formats `elimination`, `group_ko`, `double_elimination`) |

### Recommended page layouts

**Overview page** — list of all live tournaments:
```
[boss_tournaments]
```

**Universal detail page** — link to it as `?tid=42`, `?tid=43`, etc:
```
[boss_status][boss_matches][boss_standings][boss_bracket]
```

**Static page for one specific tournament**:
```
[boss_status id="42"]
[boss_matches id="42"]
[boss_standings id="42"]
[boss_bracket id="42"]
```

## How it works under the hood

- **Storage**: each tournament becomes a Custom Post Type entry (`boss_tournament`) with slug `boss-tour-{id}`. The full JSON snapshot lives in `post_content`; status and timestamp are mirrored to post meta for fast list queries.
- **Auth**: `X-BOSS-Secret` header on every push, compared with `hash_equals` (timing-safe) against the option value.
- **Frontend**: a single `frontend.js` polls `/wp-json/boss/v1/snapshot/{id}` every 15 seconds and renders into all matching `[data-boss]` containers. No React, no jQuery.
- **Cleanup**: when BOSS sends a delete request (user clicked "Stop live publishing", or the tournament was deleted), the CPT entry is removed.

## REST API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/wp-json/boss/v1/push` | Receive snapshot / delete / test (requires `X-BOSS-Secret`) |
| `GET` | `/wp-json/boss/v1/tournaments` | Public list of all stored tournaments |
| `GET` | `/wp-json/boss/v1/snapshot/{id}` | Public snapshot for one tournament |

The two GET routes are public on purpose — the snapshots are meant to be displayed publicly. They contain no sensitive data.

## Troubleshooting

**"Connection failed" in BOSS**:
- Check that the URL ends with `/wp-json/boss/v1/push` (no trailing slash).
- Make sure the WP site is reachable from the BOSS machine.
- Permalinks must be set to anything other than "Plain" (Settings → Permalinks).

**HTTP 401 Unauthorized**:
- Secret mismatch. Re-paste in both BOSS and WP.

**Page shows "No data yet."**:
- Tournament hasn't been pushed yet (BOSS has to be running with live publishing enabled and the tournament must be active).
- Check the status row at `Settings → BOSS Live → Stored tournaments` — should list at least one entry.

**Frontend not updating**:
- Caching plugins can interfere. Exclude `/wp-json/boss/v1/*` from your cache.

## Removing a tournament from the website

Two ways:
1. In BOSS desktop, open the tournament → click "📡 Stop live publishing". This sends a delete request and removes the entry from WP.
2. In WP admin under "Tournaments" (the BOSS CPT, accessible via the settings page), delete the entry manually.

## License

MIT
