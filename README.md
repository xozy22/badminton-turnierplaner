<p align="center">
  <img src="public/logo.png" alt="BOSS - Badminton Operating and Scheduling System" width="300" />
</p>

<h1 align="center">BOSS - Badminton Operating &amp; Scheduling System</h1>

<p align="center">
  A cross-platform desktop application for planning and running badminton tournaments.<br/>
  Built with <a href="https://tauri.app/">Tauri 2</a>, React, TypeScript, and SQLite. Available in English and German.
</p>

<p align="center">
  <a href="https://github.com/xozy22/boss-badminton">GitHub Repository</a> &middot;
  <a href="README_DE.md">🇩🇪 Deutsche Version</a>
</p>

## Screenshots

| Matches | Standings |
|---|---|
| ![Matches](screenshots/turnierbetrieb-spiele.png) | ![Standings](screenshots/turnierbetrieb-rangliste.png) |

| Management (Entry Fee + Players) | Player Management |
|---|---|
| ![Management](screenshots/turnierbetrieb-verwaltung.png) | ![Players](screenshots/spielerverwaltung.png) |

| Tournament Wizard |
|---|
| ![Wizard](screenshots/wizard-einstellungen.png) |

## Features

### Tournament Management
- **9 Formats**: Round Robin, Elimination (KO), Random Doubles, Group Stage + KO, Swiss System, Double Elimination, Monrad, King of the Court, Waterfall
- **Format Info Modal**: Detailed description with ASCII diagram and pros/cons for every format
- **3 Modes**: Singles, Doubles, Mixed
- **5 Point Systems** (independently configurable): 11 Pts Hard Cap, 11 Pts Ext. to 20, 15 Pts Hard Cap, 15 Pts Ext. to 25, 21 Pts Ext. to 30 (default)
- **Sets to Win** (independently configurable): Best of 1, Best of 3, Best of 5 — stored separately from the point system so any combination is possible
- All auto-fill, validation, and winner logic adapts automatically to the selected point system and sets-to-win
- **Tournament Wizard**: Step-by-step creation with tab navigation (Settings -> Players -> Teams -> Seeding -> Create)
  - Auto-save on every step - no data loss when navigating between tabs
  - Draft summary showing all settings and participants before starting
  - Start button only enabled after wizard completion and team validation
  - Club filter + gender filter + search for player selection
  - Auto-focus search after selection for rapid player picking; search text auto-selected so next query can be typed immediately
  - Selected players shown as colored chips (blue/pink by gender)
- **Manual Team Pairing**: Click two players to form a team in Doubles/Mixed
  - Mixed mode: Women/Men in separate columns, same gender greyed out
  - "Auto-assign remaining" for quick fill
  - Teams are persisted and restored when editing
  - Tournament creation blocked until all teams are formed
- **Separate KO Scoring**: When starting the KO phase in Group + KO format, a modal allows optionally setting a different point system and sets-to-win for KO rounds (e.g. Best of 1 in groups, Best of 3 in KO)
- **Smart KO Qualification**: Configurable KO bracket size (4/8/16/32), auto-filled with best runners-up across groups
- **Percentage-based Standings**: Match win %, set win %, point win %
- **Entry Fee Management**: Smart per-person or per-team billing
  - Fixed teams (KO, Group+KO, Double Elimination): one payment per team, partner auto-marked as paid
  - Non-fixed teams + Singles: individual payment per player
  - Payment status per player (Cash, Transfer, PayPal) with editable date
  - Paid (green) and open (red) amounts visible in header
  - Overview with total sum, grouped by club
- **Seeding**: Pick exactly which players are seeded via per-player checkbox (opt-in, nothing seeded by default), then order them via Drag & Drop or arrow keys — supported for KO, Double-KO, and Group Stage + KO (singles); unseeded players are drawn randomly
  - **Snake distribution for groups**: 4 groups + 8 seeds → G1=[1,8], G2=[2,7], G3=[3,6], G4=[4,5] — top seeds are spread evenly instead of clashing early
- **Template System** (v2, cross-PC transfer): Export/import tournaments as JSON files
  - Selectable: Settings, Players, Teams (individually or combined)
  - **Full player records** (first name, last name, gender, birth date, club) are exported — not just display names
  - **Auto-create on import**: Players that don't exist on the target PC are automatically created in the player database
  - **ID remapping**: Teams are re-linked through an internal ID map so team pairings survive cross-PC transfer even when player IDs differ
  - **Hall config** (multi-hall setups with court counts) is preserved
  - **Summary modal** after import shows how many players were matched / newly created / skipped, and how many team pairings were transferred
  - Backward compatible with v1 templates (full name is split into first + last name)
  - Export uses native save dialog in the packaged app (EXE/DMG)
  - **Import button** on the Tournaments list page — opens native file dialog, creates tournament with all settings pre-filled and matching players already added, then navigates straight to the wizard
- **Archiving**: Archive and restore completed tournaments
- **Reopen Tournament**: Reactivate accidentally ended tournaments
- **Undo Last Round**: Delete the last round and go back — in Group + KO format, undoing the KO round restores the group phase (Start KO button reappears), undoing all group rounds resets to pre-start state
- **Injury/Retirement with Undo**: Mark players as injured (walkovers for open matches), restore for future rounds (walkovers preserved)
- **Attendance Check**: Before the draw runs, a modal lists all registered players with checkboxes (all checked by default). Uncheck absent players — they are removed from the tournament before the draw, resulting in fewer byes and a fairer bracket
- **Auto-Naming**: Tournament name auto-generated from date + mode + format, editable
- **Save Confirmation**: Green toast notification confirms all changes (settings, players, teams, halls) were saved after editing a tournament draft
- **Unified Toast Notifications**: A global toast context (`useToast`) replaces native browser alerts for save confirmations, import summaries, and error reporting across the app — non-blocking, stackable, auto-dismissing

### Sportstaette als first-class Bestandteil von Export & Import (v2.8.8)
- **Sportstaette ist jetzt garantierter Bestandteil jeder Vorlage**: Der Export emittiert den `venue`-Block immer (statt nur wenn `tournament.venue_id` gesetzt war). Falls aus historischen Gruenden kein `venue_id` da ist, wird der Block aus `tournament.hall_config` + Turniername synthetisiert. Dadurch ist der Roundtrip Export → Import vollstaendig verlustfrei
- **Export-Modal zeigt Sportstaette-Preview**: Vor dem Export sieht der User in einer violetten Info-Zeile genau, welche Sportstaette mitgeschrieben wird (Name, Anzahl Hallen + Felder, optional Stadt). Bei dem theoretischen Edge-Case "kein venue + kein hall_config" gibt es eine amber Warnzeile als Hinweis
- **Importer: Single-Pipeline match-or-create**: Die alte Vier-Pfade-Heuristik (v2.8.7) ist auf einen einzigen Pfad reduziert: Template-Venue-Spec synthetisieren (aus `venue` oder Fallback `hall_config`) → per case-insensitive Name gegen lokale Sportstaetten matchen → bei Treffer verlinken, sonst aus dem Block neu anlegen. Der "erste vorhandene nehmen"-Shortcut ist entfernt — er produzierte unerwartete Verknuepfungen wenn der User mehrere Sportstaetten hatte
- **i18n**: 2 unbenutzte Keys entfernt (`import_venue_fallback_existing`, `import_venue_created_fallback`), 2 neue Keys (`template_export_venue_label`, `template_export_venue_missing`)

### Vorlagen-Import & Sportstaetten (v2.8.7)
- **Vorlagen-Export Format v3**: Der Export schreibt jetzt zusaetzlich einen `venue`-Block ins Template-JSON (`name`, `address`, `zip`, `city`, `halls[]`). v2-Reader ignorieren das Feld einfach (vorwaerts-kompatibel). `hall_config` bleibt drin fuer den Backward-Compat. `enable_third_place` wird jetzt auch exportiert
- **Importer mit Venue-Resolution-Pipeline**: Vier Pfade, automatisch in Priority-Reihenfolge angewendet:
  1. **v3-Template mit `venue.name`** → Match per case-insensitive Name gegen lokale Sportstaetten → bei Treffer verlinken, sonst aus dem Block neu anlegen (Adresse, Hallen, alles uebernommen)
  2. **Legacy v2-Template + lokale Sportstaette existiert** → erste lokale Sportstaette wird verknuepft (User kann im Wizard wechseln)
  3. **Legacy v2-Template + keine lokale Sportstaette** → automatische Sportstaette aus `tpl.hall_config` mit Auto-Name "{Turniername} - Sportstaette"
  4. **Keine Sportstaette ueberhaupt verfuegbar** → Import bricht mit klarer Fehlermeldung ab (sollte durch Hard-Guard in v2.8.2 schon vorher abgefangen sein)
- **Smart-Sync der Halle**: Nach erfolgreichem Venue-Match wird `tournament.hall_config` mit `venue.halls` synchronisiert — vermeidet das "Sportstaette zeigt 6 Felder, Turnier zeigt 4 Felder"-UI-Mismatch bei Non-Session-Turnieren
- **Toast-Feedback**: Jeder der vier Pfade emittiert einen eigenen erklaerenden Toast ("Sportstaette 'X' verknuepft" / "Neue Sportstaette 'Y' aus Vorlage angelegt" / etc.) damit der TD weiss was passiert ist
- **i18n**: 4 neue Keys (`import_venue_*`)

### Session-End-Lifecycle ausgebaut (v2.8.6)
- **Pre-End-Stats im Confirm-Modal**: beim Klick auf "Session beenden" zeigt das Modal jetzt einen Status-Block — wieviele Turniere noch aktiv sind und wieviele Matches gerade auf Court stehen. Zwei Render-Pfade: amber-Warnbox wenn was laeuft, emerald-OK wenn die Session sicher abgeschlossen werden kann. Daten werden async per neuem `getSessionEndStats(sessionId)` Helper geladen, Modal rendert instant mit "Stand wird geladen..."-Placeholder
- **Attach-Guard fuer ended/archived Sessions**: `attachTournamentToSession()` wirft jetzt einen Error wenn die Ziel-Session nicht `active` ist. UI: der "+ Turnier hinzufuegen"-Button auf der Session-Detail-Seite ist disabled bei nicht-aktiven Sessions, mit erklaerender Hinweiszeile darunter. Detach bleibt in jedem Status erlaubt — kaputte Verknuepfungen muss man immer loesen koennen
- **Session-Pill adaptiert sich an Status**: in der Turnieruebersicht (`/tournaments`) und im TournamentView-Header zeigt der Session-Pill jetzt grauen Style + "(beendet)" / "(archiviert)"-Suffix wenn die Session nicht mehr aktiv ist. Auf einen Blick erkennbar dass die Workspace administrativ geschlossen ist
- **Dashboard-Status-Banner**: das Session-Dashboard (`/sessions/:id/live`) bekommt einen Status-Banner ueber dem Header — amber "⏹ Session beendet am {date}" bei `ended`, grau "📦 Session archiviert" bei `archived`
- **Smart-Polling**: `useSessionContext(sessionId, paused)` akzeptiert jetzt einen optionalen `paused`-Parameter. Das Dashboard pausiert das 5s-Polling automatisch wenn die Session nicht-active ist UND kein angedocktes Turnier mehr `status="active"` hat — der Header zeigt dann "⏸ Live-Polling pausiert" statt "Live aktiv". Daten werden beim Mount weiterhin einmal gefetched, danach statisch
- **i18n**: 12 neue Keys fuer die Status-Texte (`sessions_end_stats_*`, `session_pill_*_suffix`, `session_dashboard_ended_banner` / `_archived_banner` / `_polling_paused`, `session_attach_blocked_status_hint`)

### Session-Pill in Turnieruebersicht (v2.8.5)
- **Turniere mit Session-Verknuepfung sind jetzt auf einen Blick erkennbar**: in der Turnierliste (`/tournaments`) zeigt jede Karte neben dem Namen einen violetten "🔗 Session-Name"-Pill, wenn das Turnier einer Multi-Tournament-Workspace zugeordnet ist. Tooltip zeigt den vollen Session-Namen falls abgeschnitten. Sessions werden mit den Turnieren parallel geladen — kein Extra-Roundtrip pro Karte
- **Visuell konsistent** mit dem Session-Header in der TournamentView (gleicher violetter Pill-Style)

### Sportstaette-Loeschen-Guard (v2.8.4)
- **Sportstaetten in Benutzung sind jetzt loesch-geschuetzt**: bisher konnte eine Sportstaette geloescht werden auch wenn aktive Turniere oder Sessions sie referenzierten — das hinterliess `venue_id`-Pointer, die ins Leere zeigten und das Session-Dashboard kaputt machten (`hall_config`-Lookup ueber `venue.halls` schlug fehl). Jetzt blockiert ein neuer Pre-Flight-Check `getVenueUsage(id)` das Loeschen, wenn ein Turnier mit Status `draft`/`active` oder eine Session mit Status `active` die Sportstaette nutzt
- **Block-Modal mit Detail-Liste**: statt des regulaeren Loeschen-Confirms erscheint ein 🔒 Block-Modal mit der Liste aller blockierenden Turniere (inkl. Status-Badge) und Sessions plus einem Hinweis, wie der User entsperren kann (Turnier beenden/archivieren oder einer anderen Sportstaette zuweisen)
- **DB-Layer Defense in Depth**: `deleteSportstaette()` ruft selbst nochmal `getVenueUsage()` auf bevor `DELETE` ausgefuehrt wird und wirft eine getypte Error-Meldung wenn doch was zwischen Pre-Flight und Delete reingerutscht ist (race condition zwischen Tabs / Live-Push). Toast surface'd den Fehler im UI
- **i18n**: 5 neue Keys (`venues_delete_blocked_*`)

### End-Session Modal Polish (v2.8.3)
- **Session beenden**: der "Session beenden"-Button oeffnete bisher das native Browser-`confirm()`-Popup — passte optisch nicht zum Rest der App und sah aus wie ein Bug. Ersetzt durch das Standard-Modal, identisch zum bestehenden Loeschen-Dialog (Header, Session-Name, Erklaerungs-Text, Cancel + amber-farbenen Bestaetigen-Button). Trifft Sessions-Liste und Session-Detail-Page; native confirm() ist dort komplett entfernt

### Mandatory Venue + Settings Cleanup (v2.8.2)
- **Sportstaette ist jetzt Pflichtfeld**: Multi-Tournament-Sessions setzen einen festen Veranstaltungsort voraus, daher ist die Sportstaette beim Turnier-Erstellen jetzt zwingend erforderlich. Die "Keine"-Option im Venue-Dropdown ist entfernt; das Feld zeigt eine "Sportstaette auswaehlen"-Aufforderung mit roter Markierung. Wizard-Buttons "Weiter" / "Turnier erstellen" sind disabled solange keine Sportstaette ausgewaehlt ist
- **Hard-Block bei keiner Sportstaette**: Klick auf "Neues Turnier" (Home + Tournaments) prueft erst ob eine Sportstaette existiert. Wenn nicht, redirect zu `/sportstaetten` mit einer Toast-Erklaerung "Bitte zuerst eine Sportstaette anlegen". Der Wizard zeigt zusaetzlich ein gelbes Hinweis-Panel mit "Sportstaette anlegen"-Shortcut
- **Settings -> Voreinstellungen entschlackt**: Die "Standard-Hallen"-Einstellung (defaultHalls + defaultCourts Backward-Compat) ist entfernt — Hallen werden ausschliesslich pro Sportstaette in `/sportstaetten` definiert. Nur die Spielzeit-Timer-Schwellenwerte bleiben in den Voreinstellungen. Legacy `defaultHalls` / `defaultCourts` Settings werden beim Lesen ignoriert und beim naechsten Speichern entfernt — keine separate Migration noetig
- **TournamentCreate**: kein loadSettings-Import mehr noetig, hallConfig wird ausschliesslich aus der ausgewaehlten Sportstaette abgeleitet (parseHallConfig(venue.halls))
- **i18n**: 5 neue Keys fuer die Validierungs- und Empty-State-Texte; 5 obsolete Settings-Keys entfernt

### Hotfix: TournamentView White Screen (v2.8.1)
- **Tournament oeffnen fuehrte zu weissem Screen**: Regression aus v2.8.0. Der `useMemo` fuer `sessionSiblings` sass nach dem `if (!tournament) return <div>Loading</div>`-Early-Return. Beim ersten Render (tournament=null) wurden weniger Hooks aufgerufen als beim zweiten (tournament geladen) → React-Hooks-Order-Violation, sichtbar als weisser Screen. Hook ist jetzt vor dem Early-Return platziert. Daten sind nicht betroffen

### Multi-Tournament Sessions (v2.8.0)
- **Sessions** as an opt-in bundle of tournaments running in parallel at the same venue. Tournaments without a `session_id` keep all pre-v2.8 single-tournament behavior — sessions are purely additive
- **Sessions list** (`/sessions`) with Active / Ended / Archived filter pills, status transitions (end → reactivate → archive → unarchive), inline create form (name + venue + optional auto-attach of running tournaments at that venue)
- **Session detail page** (`/sessions/:id`) for renaming, attaching/detaching tournaments, and quick-jumping into the dashboard or a specific tournament
- **Venue/Session Dashboard** (`/sessions/:id/live`) — fullscreen bird's-eye view rendering: courts grid grouped by hall (live cross-tournament occupancy with timers), per-tournament queue with filter pills, last 10 results across the session. 5s polling cadence (consistent with TV mode and Live-Push)
- **Cross-tournament conflict detection**: when assigning a court to a match in a sessioned tournament, the dropdown disables courts already in use by sibling tournaments and the player-conflict modal triggers when a player is on a court in another tournament of the same session. The hard guard now spans the whole session, not just the current tournament
- **Session pill + tournament switcher in TournamentView**: sessioned tournaments get a header strip with the session name, a count of attached tournaments, a one-click switcher to any sibling, and a `📺 Open Dashboard` shortcut
- **Hall-config unification for sessioned tournaments**: when a session has a venue, that venue's `halls` is the source of truth — the tournament's local `hall_config` copy is bypassed so all sibling tournaments see the same physical court grid
- **Sportstaetten "Active Sessions" panel**: links each active session to its live dashboard for quick navigation
- **Schema**: migrations v12 (sessions table) + v13 (`tournaments.session_id` FK, `ON DELETE SET NULL`). `ensureExpectedSchema` extended to defensively self-heal both. LocalStorage fallback parity for browser debugging
- **Sidebar nav**: new 🔗 Sessions entry between Tournaments and Statistics

### Score-Entry Polish &amp; TournamentView Refactor (v2.7.5)
- **Score entry — typing "12" no longer settles to "2"**: rapid keystrokes used to occasionally lose digits because the controlled input value got clobbered by a re-render storm. `handleScoreChange` now optimistically updates the local sets-state per keystroke and skips the per-keystroke `loadAll()` (still runs on blur), so the input value reflects what you just typed even during async DB round-trips
- **Auto-select-on-focus only on real focus events**: a ref-based guard prevents `e.target.select()` from re-firing during React re-renders that restore focus mid-typing. The new pattern preserves the convenient "Tab into a field, immediately type to overwrite" behavior without clobbering in-progress entries
- **Winner-detection moved to Enter only**: pressing Tab through a set still triggers the auto-fill suggestion (e.g. type 12 in 21-Ext-30 mode → opponent fills to 21; type 25 → opponent fills to 23 with the 2-point lead rule), but the match is no longer marked `completed` until you press **Enter**. Lets the TD review and adjust auto-fill suggestions across multiple sets before committing the match. The full `autoFillOpponentScore` rule set (all five point modes + caps + 2-point lead) is preserved 1:1 — only the "confirm" step is now explicit
- **TournamentView refactor (Phase 1)**: the 3983-line monolithic `src/pages/TournamentView.tsx` is split into a directory of smaller, single-purpose files:
  - `index.tsx` (orchestrator, ~2900 lines, –28%)
  - `components/MatchCard.tsx` + `CompletedMatchesSection.tsx`
  - `components/modals/{StartKoModal, EditTournamentModal, RestWarningModal, PlayerConflictModal, ReopenConfirmModal, UndoRoundModal}.tsx`
  - `lib/{effectiveScoring, undoTarget}.ts` (pure helpers)
  - 11 new files, each under 400 lines, all single-responsibility. No behavior change — purely structural. Vite resolves `pages/TournamentView/index.tsx` transparently as the route, so no router changes needed

### Live-Push Controls &amp; Smarter Undo (v2.7.4)
- **Push controls per tournament**: Live-aktive Turniere bekommen jetzt drei kompakte Aktionen — den vorhandenen "Live aktiv" Pill plus zwei Icon-Buttons (32×32) ⏸️ Pause / 🔄 Push jetzt. Pause hält das Opt-In aufrecht, unterdrückt aber Pushes (Discovery-Filter respektiert die neue `live_publish_paused_tournament_ids` Liste in app_settings). Push jetzt feuert sofort einen Snapshot, ignoriert Debounce + Heartbeat-Dedup + Backoff
- **Auto-Backoff bei Verbindungsfehlern**: nach 3 aufeinander folgenden Push-Fehlern stuft sich der Publisher automatisch zurück (30s → 2min → 5min) und überspringt event/heartbeat-Pushes während des Cooldown. Manuelle und finale Pushes ignorieren den Backoff. Erfolgreicher Push setzt den Counter sofort zurück
- **Final-Snapshot beim Turnier-Ende**: erkennt die Status-Transition `active → completed/archived` und sendet **einen** abschließenden Snapshot mit `final: true`-Flag, bevor der Publisher abgebaut wird. Das WP-Plugin (v1.0.4) speichert ein `boss_final` Meta und der Status-Badge bleibt sticky auf "Final" — auch wenn der Status danach noch flackern sollte
- **Inline Push-Status**: kleiner Hinweis-Text neben dem Live-Button — `Push 12s ago` / `Fehler vor 2 min` / `Wartet (Verbindung gestört)` / `Pausiert — kein Push` / `Noch kein Push`. Aktualisiert sich sekündlich, ohne dass ein Push tatsächlich passiert sein muss
- **Push-Verlauf in den Settings**: rotierender Buffer der letzten 50 Push-Versuche (Zeitstempel, Turnier, Reason, HTTP-Status oder Fehler, Dauer in ms) — eingeklappt auf 10 Einträge mit "Alle anzeigen", "Verlauf leeren"-Button, Auto-Refresh alle 5s. Persistiert in `app_settings.live_publish_log`, überlebt App-Restart
- **WordPress plugin v1.0.4**: handhabt `final: true` (speichert `boss_final` post-meta), Status-Renderer respektiert das Flag (sticky "Final" auch wenn snapshot-internal status anders aussieht), Court-Header-Spalte breiter (7% → 10%) damit "COURT" nicht abgeschnitten wird, Status-Spalte leicht breiter (12% → 14%)
- **Rückgängig komplett überarbeitet**: Detection-Heuristik nutzt jetzt `id desc` (zuletzt **angelegte** Runde) statt `round_number`-Tail (was bei group_ko fast immer "Gruppe N · letzte Runde" lieferte, egal wann gespielt). Erkennt das Final + Bronze Pärchen (gleiche `round_number`, `phase="ko"` + `phase="third_place"`) und löscht beide in einem Schritt. Doppel-KO-Runden (`winners`/`losers`) werden nun ebenfalls korrekt für die Phase-Transition berücksichtigt. Confirm-Modal zeigt Rich-Preview: Runden-Label, Match-Count, ⚠ bei `completedCount > 0` (Datenverlust-Warnung) oder `activeOnCourtCount > 0` (Match auf Feld), Sätze-Count, Phase-Hinweis ("zurück auf Entwurf" / "zurück in Gruppenphase"), Confirm-Button rosé statt amber wenn Daten verloren gehen. Toast danach mit Runden-Label + gelöschten Match/Set-Counts
- **"Live aktivieren" für Drafts ist jetzt disabled**: das Opt-In wurde vorher vom `LivePublisherHost`-Filter (`status === "active"`) eh ignoriert, der Button suggerierte aber Aktivität. Jetzt zeigt der Button bei `status === "draft"` `disabled:opacity-50 disabled:cursor-not-allowed` mit Tooltip "Erst nach Turnier-Start"

### Self-Healing Schema Check (v2.7.3)
- **Resilient to incomplete migrations**: On every DB connect a defensive `ensureExpectedSchema` pass runs `PRAGMA table_info` against `tournaments` + `tournament_players` and adds any missing column the JS code expects (`cap`, `ko_points_per_set`, `ko_sets_to_win`, `ko_cap`, `venue_id`, `min_rest_minutes`, `enable_third_place` on tournaments; `retired`, `payment_status`, `payment_method`, `paid_date`, `seed_rank` on tournament_players). Idempotent — no-op when migrations ran cleanly. Fixes "table tournaments has no column named cap" errors that surfaced after restoring an old DB backup or moving the DB file across BOSS versions, where `tauri-plugin-sql` had stopped halfway through the migration chain. Each ALTER TABLE is `try/catch`-wrapped so an isolated quirk on one column can't abort the rest

### Group-Phase Sync, Restructured TV Mode &amp; Live Push Fixes (v2.7.2)
- **Smart court queue**: During `Group + KO` group phase, the unassigned-match queue is grouped by group and ordered by remaining-match count (largest backlog on top). The tournament director naturally picks from the lagging group first → all groups finish around the same time before KO can start. Queue spans all groups even when a single group round is "active" — picking a round button no longer hides the other groups
- **Per-group progress bar**: Compact bar above the round selector showing each group's `<completed>/<total>`, with embedded read-only round pills (`[1✓][2✓][3]`) for at-a-glance status. Lagging groups get a ⚠ icon. Visible during the group phase and stays as a history reference once KO has started (all-emerald, all ✓). Replaces the old per-group round buttons that no longer made sense once the queue spans all groups
- **Group tab — match log per round**: When drilling into a single group on the Gruppen tab, a "Partien" card now lists every match segmented per round (Runde 1/2/3 with mini-headers), with sets won + per-set point detail and a winner highlight. Tables share `table-fixed` column widths so all rounds align column-by-column. The "Beendet" toggle on the Spiele tab is now a simple show/hide collapse instead of a two-mode switch
- **TV mode rebuilt** on the same data helpers as the main view: per-group progress strip in the header, smart-queue grouped (max 5 visible per group + `+N more`), seed badges (`S1`/`S2`/…) on court and queue cards, dedicated 🥉 section for the bronze playoff, multi-hall support with hall headers + locally-numbered courts (Halle B → "Court 1"), per-card round/group context label (`G1·R3` / Halbfinale / 🥉 Bronze), read-only player-conflict marker (🚫), recent results segmented per group during group phase. Also fixed a hooks-order regression that turned the page white on first load
- **Live publishing — WordPress plugin v1.0.2**: `[boss_matches]` was only ever rendering the *current* round, hiding every completed match in earlier rounds. Now segmented one section per round across the whole tournament with human-readable headings (`Group 1 — Round 2`, `Quarterfinal`, `Semifinal`, `Final`, `🥉 Third Place`, `Winners — Round 1`, …), inline status sort (Live → Pending → Done), and **two score columns**: Sets won (`2:0`) plus per-set detail (`21:18, 21:15`). Standings + per-round match tables now use `table-layout: fixed` with explicit `<colgroup>` widths so all groups and all rounds line up column-by-column instead of drifting based on the longest player name. Plugin version bump = automatic browser cache-bust on the next page load
- **Bronze toggle pre-checked for new tournaments**: regression from v2.7.1 fixed — the "Spiel um Platz 3 austragen" checkbox now reflects the real default (ON for KO formats) when starting a new tournament, instead of always being unchecked

### KO &amp; Match-Flow Polish (v2.7.1)
- **Spiel um Platz 3 (Bronze playoff)**: Per-tournament toggle (default ON for new KO tournaments). When the semi-finals complete, a bronze match is auto-created alongside the Final. Works for `Elimination`, `Group Stage + KO`, and `Double Elimination` (Bronze = LB-final loser vs. LB-semifinal loser there). Rendered as a dedicated 🥉 panel below the bracket and a separate round button in the Spiele tab. Scope can be flipped off in the wizard for events that skip 3rd place
- **Seed badges in tournament view**: Players that received a seed in the wizard now show a compact `S1` / `S2` / … badge next to their name in the **Gruppen-Tab** (singles + doubles tables) and the **Verwaltungs-Tab**. Seed rank is now persisted per-tournament-player (was previously thrown away after the bracket draw), so the information survives the tournament lifecycle
- **Player-on-court conflict guard**: When the next round is drawn early and a player is still active on another court, the affected match is hard-blocked from being assigned to a court. The waiting card shows a 🚫 marker, the dropdown disables conflicted courts, and a rose-themed modal lists which players are still on which court — no bypass (unlike the rest-time warning), since two simultaneous matches with the same player would never finish
- **Bronze toggle pre-checked for new tournaments**: Fixed a regression where "Spiel um Platz 3 austragen" was unchecked by default after creating a new tournament — initial draft creation now sets the flag honestly so the wizard checkbox reflects the real default

### Live Publishing to WordPress (v2.7.0)
- **Per-tournament opt-in**: Each tournament has its own "📡 Live aktivieren" toggle in the detail view — off by default. Multiple parallel tournaments can run live independently, each pushing under its own ID
- **Connection setup once**: Endpoint URL + shared secret are stored in Settings → "Live-Veroeffentlichung (WordPress)". A "Test connection" button verifies the WP plugin responds
- **Tournament ID badge**: The Live button displays the tournament ID (`ID: 42`) so the WordPress shortcode (`[boss_matches id="42"]`) can be assembled without searching — tooltip even shows the ready-to-paste shortcode template
- **Event-driven push**: Snapshots are pushed within ~1.5s of any state change (score, court assignment, match completion, round draw) plus a 60s heartbeat as a liveness signal. A signature hash skips redundant heartbeats when nothing changed
- **Stop publishing**: Click the active "📡 Live aktiv" button → confirm modal → opt-in is removed AND a delete request is sent so the WordPress page drops the snapshot. Even if the WP server is offline, opt-in is removed locally so no further pushes are attempted
- **Companion WordPress plugin** (`/wordpress-plugin/boss-live-results/`): Single-file PHP plugin with REST endpoint, custom post type for snapshot storage, and 5 shortcodes — `[boss_tournaments]` (list), `[boss_matches id]`, `[boss_standings id]`, `[boss_bracket id]`, `[boss_status id]`. Vanilla-JS frontend polls every 15s, no React/jQuery dependency
- **Privacy-aware**: Only first name, last name, and club are transmitted. Birth dates and payment info are deliberately stripped before push — DSGVO-friendly, public sites must not expose member PII
- **Hardened**: Outbound HTTP is allowed only to `*/wp-json/boss/v1/*` (Tauri capability allowlist). Authentication via `X-BOSS-Secret` header (constant-time `hash_equals` on the WP side)

### Player Management
- **First Name + Last Name** as separate fields
- **Date of Birth** with auto-calculated age
- **Club** with autocomplete dropdown (existing clubs suggested, free text for new)
- **Excel Import** (ExcelJS) with column mapping and fuzzy duplicate detection (Levenshtein-based similarity catches near-matches like "Schmidt" vs "Schmitt")
  - Column headers auto-detected by name (DE + EN keywords) and pre-mapped — fully overridable
  - No data splitting: First Name and Last Name always stay in separate columns as imported
  - Live preview in the mapping step shows First Name and Last Name as separate columns
  - DD.MM.YYYY, YYYY-MM-DD, MM/DD/YYYY date formats auto-detected
- **Excel Import in Tournament Wizard**: Import players directly during creation, all auto-selected
- **Excel Export** with native save dialog (First Name, Last Name, Date of Birth, Age, Club)
- **Sortable Columns**: Click headers to sort by first name or last name (ascending/descending)
- **Gender Filter + Search** for player selection
- **Injury/Retirement**: Styled modal with team impact warning; fixed teams exclude partner automatically, random doubles exclude only the injured player
- **Remove Player Confirmation**: Deleting a player from the central player database now goes through a styled confirm modal (no more native `confirm()` popup) listing the player name; the list page stays responsive because the delete runs as an async action with spinner feedback

### Venues
- **Halls with individual court counts**: Each venue has multiple halls, each hall its own courts
- Inline hall editor: name + court count per hall, add/remove
- **JSON Export/Import**: Export and import venues as files (native save dialog in packaged app)
- **Tournament Integration**: Select venue during creation, choose halls via checkbox; venue selection is persisted and restored when editing a tournament draft
- **Grouped Court Display**: Courts in tournament grouped by hall with section headers
- **Default Halls in Settings**: Applied when no venue is selected

### Match Operations
- **Court Assignment**: Drag & Drop or double-click to assign matches to courts
  - Occupied courts detected and blocked (consistent across rounds)
  - Double-click on waiting match: court selection popup (with 1 free court: direct assignment)
  - Double-click on occupied court: scrolls to match and focuses first input
  - Timer starts automatically on assignment, shows duration in accent color
  - Score entry only possible after court assignment
- **Smart Match View**: Automatic sorting by status
  - "On Court": Running matches with full score entry
  - "Completed": Compact one-liners with set score + individual points (e.g. 2:0 (21:15, 21:18)), expandable
  - 3-second delay: freshly completed matches stay visible before sliding down
  - Edited matches stay in the completed section (no jumping up)
- **Auto-Fill Score**: Badminton rally point system — auto-fills opponent score based on active scoring mode
- **Score Validation**: Invalid results detected and marked
- **Match Winner Auto-Reset**: Correcting a score automatically resets the winner
- **Fair Draw**: With odd player count, the player with most matches sits out; with random doubles, previous partnerships weighted to avoid repetition
- **Early Round Draw**: For Random Doubles and Round Robin (doubles/mixed), the next round can be drawn as soon as one match of the current round is completed — no need to wait for all courts to finish. New matches appear in the court queue under a "— Round N —" separator and are immediately assignable to free courts
- **Court Timer**: Configurable warning (yellow) and critical (red) thresholds
- **Minimum Rest Time**: Optional per-tournament setting (minutes) — when assigning a match to a court, a warning modal lists any player who hasn't rested long enough since their last completed match with the remaining minutes, giving the tournament director a clear info base with an "Assign anyway" bypass
- **Resting Player Indicator**: While a player's rest interval is still running, a small clock icon (⏱) appears next to their name everywhere they show up during the tournament — match cards, court overview, TV mode, and KO bracket. Hover shows remaining minutes. The icon auto-disappears after one minute without a refresh and incurs zero cost when `min_rest_minutes = 0`.

### TV/Projector Mode
- **Separate fullscreen window** optimized for landscape and distance readability
- **Badminton Court SVG** background on court cards
- **Live Timer** on each court, match queue, recent results with winner highlighting
- **Player Announcement Banner** with animation ("Please go to court!")
- **5-second polling** with bulk queries for performance
- Adapts to selected color theme
- **F11** = fullscreen toggle, **Escape** = close window

### Statistics Dashboard
- **Tournament Overview**: Total tournaments by status, format distribution, mode distribution
- **Match Statistics**: Completed matches, average/longest/shortest duration, avg points per set, closest match
- **Court Utilization**: Courts used, matches per court, average time per court
- **Player Demographics**: Gender split, age distribution, top clubs
- **Cross-tournament Player Rankings**: Win rate, points per match, medals for Top 3
- **Tournament Filter**: View stats for all tournaments or a specific one

### Standings & Evaluation
- **Percentage-based Rankings**: Match win %, set win %, point win %
- **Group Tables**: Separate table per group with qualifier marking (Q)
- **Smart KO Qualification**: Configurable bracket size (4/8/16/32), auto-filled with best runners-up
- **Medals**: Gold/Silver/Bronze for Top 3
- **Tournament Report**: Printable report with highlights (closest match, biggest win, most points)
- **Print View**: Match schedule, current round, standings or complete report
- **PDF Export**: Save tournament report as PDF
- **Certificate Generator**: Festive certificates for Top 3 (gold border, BOSS branding, signature line)

### Language
- **English** (default) and **German**
- Language selection in Settings
- Instant switch, persistently saved

### Design & Themes
- **4 Color Themes**: Emerald (Green), Sapphire (Blue), Amber (Orange), Dark (Dark Mode)
- **5 Fonts**: Inter, Nunito, Roboto, Poppins, Montserrat (all bundled locally for offline use)
- **7 Font Sizes**: XXS, XS, S, M, L, XL, XXL - persistently saved
- Full **Dark Mode**: All pages, modals, inputs, tables, bracket view
- **Custom Club Logo**: Upload with crop tool (1:1 cropper, 500KB limit), stored in SQLite (included in backups)
- **Badminton Court SVG**: Subtle court background on court cards
- Theme-aware print view adapts to selected color scheme

### Usability
- **Dynamic Document Titles**: Browser/window title reflects the current page (e.g. `BOSS - Tournament Name`, `BOSS - Players`, `BOSS - Settings`) so it is obvious which window is which when running multiple BOSS instances
- **Loading States**: Long-running actions (tournament create, template import, Excel import, database reset) show inline spinners and disable their trigger buttons; no more double-clicks kicking off duplicate work
- **Form Validation**: Number inputs (entry fee, rest time, court counts, timer thresholds) now enforce `required / min / max` bounds at the input level, surfacing the native browser validation UI before the action runs

### Settings
- **Auto-Update**: Automatic check on app start (banner notification), manual check in Settings
- **Language**: English / German selection
- **Design**: 4 color themes, 5 fonts, 7 font sizes, custom club logo with cropper
- **Defaults**: Default courts, timer thresholds (warning yellow, critical red)
- **Database**: Show/change storage location, backup & restore
- **Credits**: Collapsible section listing idea & development authors, extensible for future contributors
- **Danger Zone**: Delete all players, delete all tournaments, or full database reset (DROP + CREATE with safety confirmation)

### Technical
- **Cross-Platform**: Windows + macOS (Intel + Apple Silicon) via native builds
- **Auto-Update**: Signed releases from GitHub, automatic check on start, manual check in Settings
- **Offline-capable**: Runs completely locally, no internet needed (fonts bundled)
- **SQLite** with foreign key enforcement (PRAGMA)
- **Bulk queries** for TV mode and performance-critical paths
- **Cryptographic randomization**: `crypto.getRandomValues` for fair draws
- **pnpm** package manager
- **GitHub Actions CI/CD** for cross-platform builds
- **ExcelJS** for Excel import/export (replaced vulnerable xlsx/SheetJS)
- **Restricted filesystem scope**: Only $APPDATA, $DOWNLOAD, $DESKTOP, $DOCUMENT accessible
- **i18n Sanity Script**: `pnpm run check:i18n` verifies that every translation key declared in `types.ts` exists in both `de.ts` and `en.ts` and reports missing/extra/unused keys — part of the release checklist

## Tech Stack

| Component | Technology |
|---|---|
| Desktop Framework | [Tauri 2](https://tauri.app/) (Rust) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS 4 |
| Database | SQLite (tauri-plugin-sql) |
| Build Tool | Vite |
| Excel | ExcelJS |
| Fonts | Inter, Nunito, Roboto, Poppins, Montserrat (bundled) |
| Package Manager | pnpm |

## Prerequisites

For development:

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/) (stable)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) with C++ Workload (Windows)

For using the app:

- Windows 10/11 (x64) or macOS (Intel / Apple Silicon)
- WebView2 Runtime (pre-installed on Windows 10/11)

## Development

```bash
# Install dependencies
pnpm install

# Start development server (opens desktop window)
pnpm tauri dev

# Create release build
pnpm tauri build
```

The first build takes a few minutes as Rust compiles all dependencies. Subsequent builds are much faster.

## Build Output

After `pnpm tauri build`, the installers are located at:

```
src-tauri/target/release/bundle/
├── nsis/  → BOSS_x64-setup.exe
└── msi/   → BOSS_x64_en-US.msi
```

## Project Structure

```
src/
├── components/
│   ├── bracket/       # KO Bracket Visualization
│   ├── courts/        # Court Overview, Court Timer
│   ├── layout/        # Sidebar, Layout
│   ├── match/         # Match Components
│   ├── players/       # Excel Import
│   ├── print/         # Print View, Tournament Report, Certificate Generator
│   ├── standings/     # Standings Components
│   └── tournament/    # Tournament Components (Format Info, Team Pairing,
│                      #   Seeding, Templates, Retire Player, etc.)
├── hooks/
│   └── useTimer.ts    # Court Timer Hook
├── lib/
│   ├── i18n/          # Translation files
│   │   ├── en.ts      #   English translations
│   │   ├── de.ts      #   German translations
│   │   └── types.ts   #   Translation type definitions
│   ├── db.ts          # SQLite Wrapper
│   ├── draw.ts        # Draw Algorithms (Round Robin, KO, Groups, Swiss, etc.)
│   ├── highlights.ts  # Tournament Highlights (closest match, biggest win)
│   ├── I18nContext.tsx # React Context for Internationalization
│   ├── livePublish.ts  # WordPress live-publish snapshot builder + push
│   ├── useLivePublisher.tsx # Global publisher host (multi-tournament)
│   ├── scoring.ts     # Score Calculation, Validation, Auto-Fill
│   ├── stats.ts       # Statistics Calculations
│   ├── theme.ts       # Theme Definitions (4 color schemes)
│   ├── ThemeContext.tsx# React Context for Theme System
│   └── types.ts       # TypeScript Interfaces
├── pages/
│   ├── Home.tsx             # Dashboard
│   ├── Players.tsx          # Player Management
│   ├── Settings.tsx         # Settings (Language, Design, DB, Defaults)
│   ├── Sportstaetten.tsx    # Venues with Halls
│   ├── Statistics.tsx       # Statistics Dashboard
│   ├── TournamentCreate.tsx # Tournament Wizard
│   ├── Tournaments.tsx      # Tournament List + Archive
│   ├── TournamentView.tsx   # Tournament View (Matches, Courts, Standings)
│   └── TvMode.tsx           # TV/Projector Mode
├── App.tsx
└── main.tsx

src-tauri/
├── src/
│   ├── lib.rs         # Rust Backend (DB Migrations, Backup, Storage Location)
│   └── main.rs        # Entry Point
├── capabilities/      # Tauri Permission Capabilities
├── Cargo.toml
└── tauri.conf.json

wordpress-plugin/
└── boss-live-results/  # Companion WP plugin for the Live Publishing feature
    ├── boss-live-results.php  # REST endpoint, CPT storage, 5 shortcodes
    ├── frontend.js            # Vanilla-JS poller (no React/jQuery)
    ├── style.css              # Theme-neutral, dark-mode aware
    └── README.md              # Plugin setup + shortcode reference
```

## License

MIT
