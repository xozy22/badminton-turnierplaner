# Changelog

Alle nennenswerten Änderungen an BOSS, neueste zuerst. Das Format folgt
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/); die Versionen folgen
[Semantic Versioning](https://semver.org/lang/de/).

> **Zur Sprache:** Die Einträge ab v2.7.0 standen ursprünglich in den beiden
> READMEs und sind teils deutsch, teils englisch verfasst. Sie sind hier
> unverändert übernommen — historische Notizen umzuschreiben würde riskieren,
> ihre Bedeutung zu verschieben. Korrigiert wurden nur ASCII-Ersatzschreibungen
> („zurueck" → „zurück"), HTML-Entitäten (`&amp;` → `&`) und die
> Überschriften, die jetzt `## [Version] — Datum · Titel` lauten, damit
> `scripts/build-release-notes.mjs` sie lesen kann. Eine sachlich falsche
> Aussage ist unten als solche gekennzeichnet.
>
> **Englisch:** [CHANGELOG.en.md](CHANGELOG.en.md), gepflegt ab 2.10.0. Für
> ältere Versionen zeigt die Anwendung den deutschen Text — er ist das
> Original, und eine nachträgliche Übersetzung wäre keine Quelle mehr.

---

## [Unreleased]

Ein Durchgang durch `REVIEW-BACKLOG.md`, 75 Punkte in sechs Phasen. Die
Kurzfassung dessen, was sich für Nutzer ändert:

### Planung

- **„Wie lange dauert das?"** Bei der Spielerauswahl steht jetzt, wie viele
  Spiele das gewählte Format ergibt und wie lange sie dauern werden — auf so
  vielen Feldern, wie die Halle hat. Gerechnet wird mit den **eigenen**
  Spielzeiten: BOSS misst seit jeher, wie lange ein Spiel wirklich dauert.
  Solange zu wenige gemessen sind, steht eine grobe Schätzung da, und die
  Anzeige sagt, dass es eine ist. Formate ohne festes Ende — King of the
  Court, zufällige Doppel — bekommen keine Zahl, sondern den Hinweis, dass sie
  laufen, solange man mag.

### Meldungen, Auslosung und Ausdruck

Sechs weitere Punkte aus dem BTP-Vergleich.

- **Die Auslosung wird gezeigt, bevor sie gilt.** Übernehmen, neu auslosen
  oder verwerfen — bis zum Übernehmen ist nichts gespeichert. Gilt auch für
  Folgerunden; beim Schweizer System und bei zufälligen Doppeln wird jede
  Runde neu gelost. „Neu auslosen" erscheint nur, wo ein zweiter Versuch
  überhaupt etwas anderes ergeben kann. *(C4)*
- **Schiedsrichterzettel**, acht je Blatt, mit Paarung, Feld und leeren
  Kästchen für die Sätze — auch ganz leer zum Selbstausfüllen. *(D3)*
- **Warteliste.** Wer nicht mehr hineinpasst, reiht sich ein; sagt jemand ab,
  rückt der Erste nach. Die Reihenfolge steht nicht mehr in irgendeinem Kopf.
  *(E1)*
- **Abmeldungen bleiben erhalten.** Bisher wurden sie gelöscht und damit auch
  aus der Abrechnung. „Abmelden" behält den Eintrag, „entfernen" löscht
  weiterhin — eine Fehleingabe ist keine Absage. *(E2)*
- **Startgeld wahlweise bei der Meldung fällig** statt beim Antreten. Ändert,
  wer in der Abrechnung auftaucht: Abgemeldete zahlen dann trotzdem. *(E3)*
- **Weitere Posten** neben dem Startgeld — Nachmeldung, Bälle, Hallenbeitrag,
  je Spieler oder für das ganze Turnier. Der Startgeld-Export führt sie mit
  auf und nennt jetzt auch den Meldestatus. *(E4)*

### Aktualisierung

- **Die Release-Notes sagen jetzt etwas.** Bisher stand im Aktualisierungs­
  dialog wörtlich „Release v2.9.0" — der Text, den der Workflow in die
  Veröffentlichung schrieb und den der Updater von dort übernahm. Er kommt
  jetzt aus diesem Changelog.
- **Versionshistorie in den Einstellungen**, jede Version zum Aufklappen. Sie
  ist Teil des Programms und liest sich ohne Netz — in einer Halle mit
  schlechtem WLAN ist das der Unterschied zwischen „lesbar" und „leer".
- **Eine Abfrage statt drei.** Startleiste, Einstellungen und die
  Installation fragten den Server getrennt; dazwischen konnte sich die
  Antwort ändern, sodass eine andere Fassung installiert wurde als die
  angezeigte.
- **„Später" bleibt gesagt.** Die Leiste kam bei jedem Start wieder. Die
  Ablehnung gilt jetzt dauerhaft — aber nur für diese eine Version, damit
  ein Wegklicken nicht alle folgenden verdeckt.
- **Höchstens eine Abfrage pro Tag** beim Start statt einer bei jedem.

### Turnierbetrieb

Vier Punkte aus dem Vergleich mit dem BTP (`FEATURE-BACKLOG.md`).

- **Spieltag und Startzeit** am Turnier. Bisher stand dort nur, wann das
  Turnier *angelegt* wurde — für eine im Juli geplante Vereinsmeisterschaft im
  September also der Juli, auch auf dem Ausdruck. Beide Angaben sind optional;
  ein spontan aufgesetztes Turnier braucht kein eigenes Datum. *(A1)*
- **Ein Spiel ohne Ergebnis ablegen.** „Nicht angetreten", „Aufgegeben",
  „Disqualifiziert" und „Kein Spiel", letzteres für den Fall, dass beide
  Seiten fehlen und niemand gewinnt. Vorher blockierte ein solches Spiel den
  Turnierabschluss dauerhaft, und der einzige Ausweg war, einen ganzen Spieler
  aus der Meldeliste zu nehmen — was alle seine übrigen Spiele mit vergibt.
  *(D1)*
- **Vereinskameraden werden in Runde eins getrennt**, soweit die Auslosung es
  zulässt: im K.-o.-Baum und bei der Gruppenaufteilung. Setzplätze haben
  Vorrang, und wo eine Trennung nicht möglich ist, wird sie nicht erzwungen.
  Der Verein war längst je Spieler erfasst und lag ungenutzt. *(C2)*
- **Setzgruppen statt fester Ränge.** Die Setzplätze 3/4, 5/8 und 9/16 sind
  Gruppen — wer darin welche Position bekommt, wird bei jeder Auslosung neu
  gelost, wie es die Turnierordnung vorsieht. *(C1)*

### Sicherheit und Datenschutz

- **Geburtsdaten wurden veröffentlicht.** Die Tabellenstände trugen das
  vollständige Spieler-Objekt an die öffentliche Vereinsseite — Geburtsdatum
  und Geschlecht inbegriffen —, obwohl an anderer Stelle ausdrücklich das
  Gegenteil zugesichert war. Behoben; beide Filterpfade laufen jetzt durch
  eine Stelle. *(Siehe den Hinweis bei v2.7.0.)*
- **Anonymisierungsstufe** für die Live-Veröffentlichung: voller Name, oder
  abgekürzt („Max M."), wahlweise ohne Verein. Beim Einschalten erscheint ein
  Hinweis, was gleich öffentlich wird.
- **Das gemeinsame Geheimnis** kann nicht mehr über `http://` gehen — es reist
  in einem Kopfzeilenfeld jeder Übertragung mit. Im WordPress-Adminbereich ist
  es maskiert.
- **Grenzen für den WordPress-Endpunkt**: Größenlimit, eine Bremse gegen das
  Durchprobieren des Geheimnisses, Seitenweise-Abruf der Turnierliste.

### Datensicherheit

- **Automatische Sicherheitskopien** vor dem Wiederherstellen, dem Löschen
  aller Daten und jeder Datenbank-Aktualisierung. Die letzten fünf bleiben
  erhalten, im Ordner `backups/` neben der Datenbank.
- **Backups aus neueren Programmversionen** werden abgelehnt statt eingespielt.
- **Ein Turnier zu löschen** verlangt jetzt, das Wort zu tippen — vorher genügte
  ein Klick für alle Runden, Spiele und Ergebnisse.

### Bedienung

- **Vollständige Tastaturbedienung** in allen Dialogen: Fokusfalle, Escape,
  Rücksprung auf das auslösende Element.
- **Sechs Farbschemata**, darunter zwei in Vereinsfarben, alle auf Kontrast
  geprüft (WCAG AA, Fließtext 4,5:1).
- **Symbole statt Emojis** in der gesamten Oberfläche — Emojis wurden von
  Screenreadern mit Namen vorgelesen, die niemand gewählt hatte.
- **Lade- und Leerzustände** auf jeder Seite, ohne Layoutsprung. Die
  Turnieransicht zeigte für eine gelöschte Turnier-ID endlos „Wird geladen".
- **Englisch ist jetzt wirklich englisch** — Formatnamen, Fehlermeldungen aus
  dem Programmkern, Datums-, Zeit- und Währungsangaben folgen der Einstellung.

### Unter der Haube

- Startpaket von 2394 KB auf 264 KB, Installationsgröße von 9,1 MB auf 3,9 MB.
- 480 Tests, davon jeder Datenbanktest gegen echtes SQLite **und** den
  Browser-Ersatz.
- Ein Walkover-Kennzeichen überlebte das Zurücksetzen eines Ergebnisses und
  verfälschte die Tabelle. Turniereinstellungen überlebten ihr Turnier, weil
  SQLite Zeilennummern wiederverwendet.

---

## [2.9.0] — 2026-05-03 · Match per Rechtsklick zurück in die Warteschlange
- **Rechtsklick auf eine belegte Court-Karte** öffnet ein kompaktes Floating-Menü mit der Aktion "🔄 Match zurück in die Warteschlange". Klick darauf clear't `match.court`, das Match landet wieder im Queue-Bucket der Court-Overview, Sätze und Match-Status bleiben erhalten. Toast bestätigt die Aktion. Reversibel — erneutes Drag-Drop weist das Match wieder einem Feld zu
- **Menü-Verhalten**: schließt per Klick-außerhalb, Esc-Taste, oder nach der Aktion. Position wird viewport-clamped (rechts/unten am Rand klappt es nach links/oben statt zu überlaufen). z-index analog zu bestehenden Modals
- **Guards**: Rechtsklick auf freie Felder öffnet kein Custom-Menü (Browser-Default bleibt). Aktion ist nur verfügbar wenn das Turnier `status === "active"` ist — gleiche Regel wie Drag-Drop. Score-Inputs in der Card (heute keine, für zukünftige Inline-Eingabe vorbereitet) würden ebenfalls durchgereicht
- **Code**: neue Komponente `CourtContextMenu.tsx` (~80 Zeilen, kapselt Positioning + Dismissal-Listener), `CourtOverview` bekommt einen optionalen `onUnassign`-Prop, `TournamentView` mappt das auf das bestehende `handleCourtChange(matchId, null)` — keine neue DB-Logik, der Pfad existiert seit v2.0 (`clearMatchCourt`)
- **i18n**: 2 neue Keys (`court_context_menu_unassign`, `court_context_menu_unassign_done`)

## [2.8.10] — 2026-04-28 · Hallen-Section: Single-Hall ohne Checkbox
- **Checkbox bei Single-Hall-Sportstätten entfernt**: Bei einer Sportstätte mit nur einer Halle macht die Hallen-Checkbox keinen Sinn — abhaken bedeutet 0 Felder = Turnier kaputt. Section rendert jetzt eine schlichte Info-Zeile "🏟 Halle 1 (2 Felder)" statt einer scheinbar funktionsfähigen Checkbox. Bei 2+ Hallen bleibt das Checkbox-Verhalten unverändert
- **Defensive: 0-Hallen-Auswahl wird verhindert**: Auch bei Multi-Hall-Venues kann der User nicht alle Hallen abwählen — die letzte verbleibende Halle wird automatisch wieder aktiviert, statt das Turnier in einen 0-Felder-Zustand zu fahren

## [2.8.9] — 2026-04-28 · Hallen-Section: Klarheit + Quick-Edit
- **"📌 Aus Sportstätte X übernommen"-Hinweis**: Im Tournament-Wizard direkt unter den Hallen-Checkboxen erklärt eine kleine, kursive Notiz, **woher** die Hallen + Felder kommen. Beseitigt die Verwirrung, warum Hall-Namen und Court-Counts read-only aussehen — die gehören zur Sportstätte, nicht zum Turnier
- **"→ Sportstätte bearbeiten"-Shortcut**: Direkt daneben ein Quick-Link zur `/sportstaetten?edit={venueId}`-Route. Sportstätten-Page liest den `edit`-Query-Param, öffnet die Ziel-Zeile automatisch im Edit-Modus, scrollt sie sanft in den Viewport und stripped den Param wieder raus damit Refresh-Loops nicht passieren. Die geöffnete Zeile bekommt einen dezenten emerald Ring zur visuellen Hervorhebung
- **i18n**: 2 neue Keys (`tournament_halls_synced_from_venue`, `tournament_halls_edit_venue_link`)

## [2.8.8] — 2026-04-28 · Sportstätte als first-class Bestandteil von Export & Import
- **Sportstätte ist jetzt garantierter Bestandteil jeder Vorlage**: Der Export emittiert den `venue`-Block immer (statt nur wenn `tournament.venue_id` gesetzt war). Falls aus historischen Gründen kein `venue_id` da ist, wird der Block aus `tournament.hall_config` + Turniername synthetisiert. Dadurch ist der Roundtrip Export → Import vollständig verlustfrei
- **Export-Modal zeigt Sportstätte-Preview**: Vor dem Export sieht der User in einer violetten Info-Zeile genau, welche Sportstätte mitgeschrieben wird (Name, Anzahl Hallen + Felder, optional Stadt). Bei dem theoretischen Edge-Case "kein venue + kein hall_config" gibt es eine amber Warnzeile als Hinweis
- **Importer: Single-Pipeline match-or-create**: Die alte Vier-Pfade-Heuristik (v2.8.7) ist auf einen einzigen Pfad reduziert: Template-Venue-Spec synthetisieren (aus `venue` oder Fallback `hall_config`) → per case-insensitive Name gegen lokale Sportstätten matchen → bei Treffer verlinken, sonst aus dem Block neu anlegen. Der "erste vorhandene nehmen"-Shortcut ist entfernt — er produzierte unerwartete Verknüpfungen wenn der User mehrere Sportstätten hatte
- **i18n**: 2 unbenutzte Keys entfernt (`import_venue_fallback_existing`, `import_venue_created_fallback`), 2 neue Keys (`template_export_venue_label`, `template_export_venue_missing`)

## [2.8.7] — 2026-04-28 · Vorlagen-Import & Sportstätten
- **Vorlagen-Export Format v3**: Der Export schreibt jetzt zusätzlich einen `venue`-Block ins Template-JSON (`name`, `address`, `zip`, `city`, `halls[]`). v2-Reader ignorieren das Feld einfach (vorwärts-kompatibel). `hall_config` bleibt drin für den Backward-Compat. `enable_third_place` wird jetzt auch exportiert
- **Importer mit Venue-Resolution-Pipeline**: Vier Pfade, automatisch in Priority-Reihenfolge angewendet:
  1. **v3-Template mit `venue.name`** → Match per case-insensitive Name gegen lokale Sportstätten → bei Treffer verlinken, sonst aus dem Block neu anlegen (Adresse, Hallen, alles übernommen)
  2. **Legacy v2-Template + lokale Sportstätte existiert** → erste lokale Sportstätte wird verknüpft (User kann im Wizard wechseln)
  3. **Legacy v2-Template + keine lokale Sportstätte** → automatische Sportstätte aus `tpl.hall_config` mit Auto-Name "{Turniername} - Sportstätte"
  4. **Keine Sportstätte überhaupt verfügbar** → Import bricht mit klarer Fehlermeldung ab (sollte durch Hard-Guard in v2.8.2 schon vorher abgefangen sein)
- **Smart-Sync der Halle**: Nach erfolgreichem Venue-Match wird `tournament.hall_config` mit `venue.halls` synchronisiert — vermeidet das "Sportstätte zeigt 6 Felder, Turnier zeigt 4 Felder"-UI-Mismatch bei Non-Session-Turnieren
- **Toast-Feedback**: Jeder der vier Pfade emittiert einen eigenen erklärenden Toast ("Sportstätte 'X' verknüpft" / "Neue Sportstätte 'Y' aus Vorlage angelegt" / etc.) damit der TD weiß was passiert ist
- **i18n**: 4 neue Keys (`import_venue_*`)

## [2.8.6] — 2026-04-27 · Session-End-Lifecycle ausgebaut
- **Pre-End-Stats im Confirm-Modal**: beim Klick auf "Session beenden" zeigt das Modal jetzt einen Status-Block — wieviele Turniere noch aktiv sind und wieviele Matches gerade auf Court stehen. Zwei Render-Pfade: amber-Warnbox wenn was läuft, emerald-OK wenn die Session sicher abgeschlossen werden kann. Daten werden async per neuem `getSessionEndStats(sessionId)` Helper geladen, Modal rendert instant mit "Stand wird geladen..."-Placeholder
- **Attach-Guard für ended/archived Sessions**: `attachTournamentToSession()` wirft jetzt einen Error wenn die Ziel-Session nicht `active` ist. UI: der "+ Turnier hinzufügen"-Button auf der Session-Detail-Seite ist disabled bei nicht-aktiven Sessions, mit erklärender Hinweiszeile darunter. Detach bleibt in jedem Status erlaubt — kaputte Verknüpfungen muss man immer lösen können
- **Session-Pill adaptiert sich an Status**: in der Turnierübersicht (`/tournaments`) und im TournamentView-Header zeigt der Session-Pill jetzt grauen Style + "(beendet)" / "(archiviert)"-Suffix wenn die Session nicht mehr aktiv ist. Auf einen Blick erkennbar dass die Workspace administrativ geschlossen ist
- **Dashboard-Status-Banner**: das Session-Dashboard (`/sessions/:id/live`) bekommt einen Status-Banner über dem Header — amber "⏹ Session beendet am {date}" bei `ended`, grau "📦 Session archiviert" bei `archived`
- **Smart-Polling**: `useSessionContext(sessionId, paused)` akzeptiert jetzt einen optionalen `paused`-Parameter. Das Dashboard pausiert das 5s-Polling automatisch wenn die Session nicht-active ist UND kein angedocktes Turnier mehr `status="active"` hat — der Header zeigt dann "⏸ Live-Polling pausiert" statt "Live aktiv". Daten werden beim Mount weiterhin einmal gefetched, danach statisch
- **i18n**: 12 neue Keys für die Status-Texte (`sessions_end_stats_*`, `session_pill_*_suffix`, `session_dashboard_ended_banner` / `_archived_banner` / `_polling_paused`, `session_attach_blocked_status_hint`)

## [2.8.5] — 2026-04-27 · Session-Pill in Turnierübersicht
- **Turniere mit Session-Verknüpfung sind jetzt auf einen Blick erkennbar**: in der Turnierliste (`/tournaments`) zeigt jede Karte neben dem Namen einen violetten "🔗 Session-Name"-Pill, wenn das Turnier einer Multi-Tournament-Workspace zugeordnet ist. Tooltip zeigt den vollen Session-Namen falls abgeschnitten. Sessions werden mit den Turnieren parallel geladen — kein Extra-Roundtrip pro Karte
- **Visuell konsistent** mit dem Session-Header in der TournamentView (gleicher violetter Pill-Style)

## [2.8.4] — 2026-04-27 · Sportstätte-Löschen-Guard
- **Sportstätten in Benutzung sind jetzt lösch-geschützt**: bisher konnte eine Sportstätte gelöscht werden auch wenn aktive Turniere oder Sessions sie referenzierten — das hinterließ `venue_id`-Pointer, die ins Leere zeigten und das Session-Dashboard kaputt machten (`hall_config`-Lookup über `venue.halls` schlug fehl). Jetzt blockiert ein neuer Pre-Flight-Check `getVenueUsage(id)` das Löschen, wenn ein Turnier mit Status `draft`/`active` oder eine Session mit Status `active` die Sportstätte nutzt
- **Block-Modal mit Detail-Liste**: statt des regulären Löschen-Confirms erscheint ein 🔒 Block-Modal mit der Liste aller blockierenden Turniere (inkl. Status-Badge) und Sessions plus einem Hinweis, wie der User entsperren kann (Turnier beenden/archivieren oder einer anderen Sportstätte zuweisen)
- **DB-Layer Defense in Depth**: `deleteSportstätte()` ruft selbst nochmal `getVenueUsage()` auf bevor `DELETE` ausgeführt wird und wirft eine getypte Error-Meldung wenn doch was zwischen Pre-Flight und Delete reingerutscht ist (race condition zwischen Tabs / Live-Push). Toast surface'd den Fehler im UI
- **i18n**: 5 neue Keys (`venues_delete_blocked_*`)

## [2.8.3] — 2026-04-27 · End-Session Modal Polish
- **Session beenden**: der "Session beenden"-Button öffnete bisher das native Browser-`confirm()`-Popup — passte optisch nicht zum Rest der App und sah aus wie ein Bug. Ersetzt durch das Standard-Modal, identisch zum bestehenden Löschen-Dialog (Header, Session-Name, Erklärungs-Text, Cancel + amber-farbenen Bestätigen-Button). Trifft Sessions-Liste und Session-Detail-Page; native confirm() ist dort komplett entfernt

## [2.8.2] — 2026-04-27 · Mandatory Venue + Settings Cleanup
- **Sportstätte ist jetzt Pflichtfeld**: Multi-Tournament-Sessions setzen einen festen Veranstaltungsort voraus, daher ist die Sportstätte beim Turnier-Erstellen jetzt zwingend erforderlich. Die "Keine"-Option im Venue-Dropdown ist entfernt; das Feld zeigt eine "Sportstätte auswählen"-Aufforderung mit roter Markierung. Wizard-Buttons "Weiter" / "Turnier erstellen" sind disabled solange keine Sportstätte ausgewählt ist
- **Hard-Block bei keiner Sportstätte**: Klick auf "Neues Turnier" (Home + Tournaments) prüft erst ob eine Sportstätte existiert. Wenn nicht, redirect zu `/sportstaetten` mit einer Toast-Erklärung "Bitte zuerst eine Sportstätte anlegen". Der Wizard zeigt zusätzlich ein gelbes Hinweis-Panel mit "Sportstätte anlegen"-Shortcut
- **Settings -> Voreinstellungen entschlackt**: Die "Standard-Hallen"-Einstellung (defaultHalls + defaultCourts Backward-Compat) ist entfernt — Hallen werden ausschließlich pro Sportstätte in `/sportstaetten` definiert. Nur die Spielzeit-Timer-Schwellenwerte bleiben in den Voreinstellungen. Legacy `defaultHalls` / `defaultCourts` Settings werden beim Lesen ignoriert und beim nächsten Speichern entfernt — keine separate Migration nötig
- **TournamentCreate**: kein loadSettings-Import mehr nötig, hallConfig wird ausschließlich aus der ausgewählten Sportstätte abgeleitet (parseHallConfig(venue.halls))
- **i18n**: 5 neue Keys für die Validierungs- und Empty-State-Texte; 5 obsolete Settings-Keys entfernt

## [2.8.1] — 2026-04-27 · Hotfix: TournamentView White Screen
- **Tournament öffnen führte zu weißem Screen**: Regression aus v2.8.0. Der `useMemo` für `sessionSiblings` sass nach dem `if (!tournament) return <div>Loading</div>`-Early-Return. Beim ersten Render (tournament=null) wurden weniger Hooks aufgerufen als beim zweiten (tournament geladen) → React-Hooks-Order-Violation, sichtbar als weißer Screen. Hook ist jetzt vor dem Early-Return platziert. Daten sind nicht betroffen

## [2.8.0] — 2026-04-27 · Multi-Tournament Sessions
- **Sessions** as an opt-in bundle of tournaments running in parallel at the same venue. Tournaments without a `session_id` keep all pre-v2.8 single-tournament behavior — sessions are purely additive
- **Sessions list** (`/sessions`) with Active / Ended / Archived filter pills, status transitions (end → reactivate → archive → unarchive), inline create form (name + venue + optional auto-attach of running tournaments at that venue)
- **Session detail page** (`/sessions/:id`) for renaming, attaching/detaching tournaments, and quick-jumping into the dashboard or a specific tournament
- **Venue/Session Dashboard** (`/sessions/:id/live`) — fullscreen bird's-eye view rendering: courts grid grouped by hall (live cross-tournament occupancy with timers), per-tournament queue with filter pills, last 10 results across the session. 5s polling cadence (consistent with TV mode and Live-Push)
- **Cross-tournament conflict detection**: when assigning a court to a match in a sessioned tournament, the dropdown disables courts already in use by sibling tournaments and the player-conflict modal triggers when a player is on a court in another tournament of the same session. The hard guard now spans the whole session, not just the current tournament
- **Session pill + tournament switcher in TournamentView**: sessioned tournaments get a header strip with the session name, a count of attached tournaments, a one-click switcher to any sibling, and a `📺 Open Dashboard` shortcut
- **Hall-config unification for sessioned tournaments**: when a session has a venue, that venue's `halls` is the source of truth — the tournament's local `hall_config` copy is bypassed so all sibling tournaments see the same physical court grid
- **Sportstätten "Active Sessions" panel**: links each active session to its live dashboard for quick navigation
- **Schema**: migrations v12 (sessions table) + v13 (`tournaments.session_id` FK, `ON DELETE SET NULL`). `ensureExpectedSchema` extended to defensively self-heal both. LocalStorage fallback parity for browser debugging
- **Sidebar nav**: new 🔗 Sessions entry between Tournaments and Statistics

## [2.7.5] — 2026-04-27 · Score-Entry Polish & TournamentView Refactor
- **Score entry — typing "12" no longer settles to "2"**: rapid keystrokes used to occasionally lose digits because the controlled input value got clobbered by a re-render storm. `handleScoreChange` now optimistically updates the local sets-state per keystroke and skips the per-keystroke `loadAll()` (still runs on blur), so the input value reflects what you just typed even during async DB round-trips
- **Auto-select-on-focus only on real focus events**: a ref-based guard prevents `e.target.select()` from re-firing during React re-renders that restore focus mid-typing. The new pattern preserves the convenient "Tab into a field, immediately type to overwrite" behavior without clobbering in-progress entries
- **Winner-detection moved to Enter only**: pressing Tab through a set still triggers the auto-fill suggestion (e.g. type 12 in 21-Ext-30 mode → opponent fills to 21; type 25 → opponent fills to 23 with the 2-point lead rule), but the match is no longer marked `completed` until you press **Enter**. Lets the TD review and adjust auto-fill suggestions across multiple sets before committing the match. The full `autoFillOpponentScore` rule set (all five point modes + caps + 2-point lead) is preserved 1:1 — only the "confirm" step is now explicit
- **TournamentView refactor (Phase 1)**: the 3983-line monolithic `src/pages/TournamentView.tsx` is split into a directory of smaller, single-purpose files:
  - `index.tsx` (orchestrator, ~2900 lines, –28%)
  - `components/MatchCard.tsx` + `CompletedMatchesSection.tsx`
  - `components/modals/{StartKoModal, EditTournamentModal, RestWarningModal, PlayerConflictModal, ReopenConfirmModal, UndoRoundModal}.tsx`
  - `lib/{effectiveScoring, undoTarget}.ts` (pure helpers)
  - 11 new files, each under 400 lines, all single-responsibility. No behavior change — purely structural. Vite resolves `pages/TournamentView/index.tsx` transparently as the route, so no router changes needed

## [2.7.4] — 2026-04-26 · Live-Push Controls & Smarter Undo
- **Push controls per tournament**: Live-aktive Turniere bekommen jetzt drei kompakte Aktionen — den vorhandenen "Live aktiv" Pill plus zwei Icon-Buttons (32×32) ⏸️ Pause / 🔄 Push jetzt. Pause hält das Opt-In aufrecht, unterdrückt aber Pushes (Discovery-Filter respektiert die neue `live_publish_paused_tournament_ids` Liste in app_settings). Push jetzt feuert sofort einen Snapshot, ignoriert Debounce + Heartbeat-Dedup + Backoff
- **Auto-Backoff bei Verbindungsfehlern**: nach 3 aufeinander folgenden Push-Fehlern stuft sich der Publisher automatisch zurück (30s → 2min → 5min) und überspringt event/heartbeat-Pushes während des Cooldown. Manuelle und finale Pushes ignorieren den Backoff. Erfolgreicher Push setzt den Counter sofort zurück
- **Final-Snapshot beim Turnier-Ende**: erkennt die Status-Transition `active → completed/archived` und sendet **einen** abschließenden Snapshot mit `final: true`-Flag, bevor der Publisher abgebaut wird. Das WP-Plugin (v1.0.4) speichert ein `boss_final` Meta und der Status-Badge bleibt sticky auf "Final" — auch wenn der Status danach noch flackern sollte
- **Inline Push-Status**: kleiner Hinweis-Text neben dem Live-Button — `Push 12s ago` / `Fehler vor 2 min` / `Wartet (Verbindung gestört)` / `Pausiert — kein Push` / `Noch kein Push`. Aktualisiert sich sekündlich, ohne dass ein Push tatsächlich passiert sein muss
- **Push-Verlauf in den Settings**: rotierender Buffer der letzten 50 Push-Versuche (Zeitstempel, Turnier, Reason, HTTP-Status oder Fehler, Dauer in ms) — eingeklappt auf 10 Einträge mit "Alle anzeigen", "Verlauf leeren"-Button, Auto-Refresh alle 5s. Persistiert in `app_settings.live_publish_log`, überlebt App-Restart
- **WordPress plugin v1.0.4**: handhabt `final: true` (speichert `boss_final` post-meta), Status-Renderer respektiert das Flag (sticky "Final" auch wenn snapshot-internal status anders aussieht), Court-Header-Spalte breiter (7% → 10%) damit "COURT" nicht abgeschnitten wird, Status-Spalte leicht breiter (12% → 14%)
- **Rückgängig komplett überarbeitet**: Detection-Heuristik nutzt jetzt `id desc` (zuletzt **angelegte** Runde) statt `round_number`-Tail (was bei group_ko fast immer "Gruppe N · letzte Runde" lieferte, egal wann gespielt). Erkennt das Final + Bronze Pärchen (gleiche `round_number`, `phase="ko"` + `phase="third_place"`) und löscht beide in einem Schritt. Doppel-KO-Runden (`winners`/`losers`) werden nun ebenfalls korrekt für die Phase-Transition berücksichtigt. Confirm-Modal zeigt Rich-Preview: Runden-Label, Match-Count, ⚠ bei `completedCount > 0` (Datenverlust-Warnung) oder `activeOnCourtCount > 0` (Match auf Feld), Sätze-Count, Phase-Hinweis ("zurück auf Entwurf" / "zurück in Gruppenphase"), Confirm-Button rosé statt amber wenn Daten verloren gehen. Toast danach mit Runden-Label + gelöschten Match/Set-Counts
- **"Live aktivieren" für Drafts ist jetzt disabled**: das Opt-In wurde vorher vom `LivePublisherHost`-Filter (`status === "active"`) eh ignoriert, der Button suggerierte aber Aktivität. Jetzt zeigt der Button bei `status === "draft"` `disabled:opacity-50 disabled:cursor-not-allowed` mit Tooltip "Erst nach Turnier-Start"

## [2.7.3] — 2026-04-26 · Self-Healing Schema Check
- **Resilient to incomplete migrations**: On every DB connect a defensive `ensureExpectedSchema` pass runs `PRAGMA table_info` against `tournaments` + `tournament_players` and adds any missing column the JS code expects (`cap`, `ko_points_per_set`, `ko_sets_to_win`, `ko_cap`, `venue_id`, `min_rest_minutes`, `enable_third_place` on tournaments; `retired`, `payment_status`, `payment_method`, `paid_date`, `seed_rank` on tournament_players). Idempotent — no-op when migrations ran cleanly. Fixes "table tournaments has no column named cap" errors that surfaced after restoring an old DB backup or moving the DB file across BOSS versions, where `tauri-plugin-sql` had stopped halfway through the migration chain. Each ALTER TABLE is `try/catch`-wrapped so an isolated quirk on one column can't abort the rest

## [2.7.2] — 2026-04-26 · Group-Phase Sync, Restructured TV Mode & Live Push Fixes
- **Smart court queue**: During `Group + KO` group phase, the unassigned-match queue is grouped by group and ordered by remaining-match count (largest backlog on top). The tournament director naturally picks from the lagging group first → all groups finish around the same time before KO can start. Queue spans all groups even when a single group round is "active" — picking a round button no longer hides the other groups
- **Per-group progress bar**: Compact bar above the round selector showing each group's `<completed>/<total>`, with embedded read-only round pills (`[1✓][2✓][3]`) for at-a-glance status. Lagging groups get a ⚠ icon. Visible during the group phase and stays as a history reference once KO has started (all-emerald, all ✓). Replaces the old per-group round buttons that no longer made sense once the queue spans all groups
- **Group tab — match log per round**: When drilling into a single group on the Gruppen tab, a "Partien" card now lists every match segmented per round (Runde 1/2/3 with mini-headers), with sets won + per-set point detail and a winner highlight. Tables share `table-fixed` column widths so all rounds align column-by-column. The "Beendet" toggle on the Spiele tab is now a simple show/hide collapse instead of a two-mode switch
- **TV mode rebuilt** on the same data helpers as the main view: per-group progress strip in the header, smart-queue grouped (max 5 visible per group + `+N more`), seed badges (`S1`/`S2`/…) on court and queue cards, dedicated 🥉 section for the bronze playoff, multi-hall support with hall headers + locally-numbered courts (Halle B → "Court 1"), per-card round/group context label (`G1·R3` / Halbfinale / 🥉 Bronze), read-only player-conflict marker (🚫), recent results segmented per group during group phase. Also fixed a hooks-order regression that turned the page white on first load
- **Live publishing — WordPress plugin v1.0.2**: `[boss_matches]` was only ever rendering the *current* round, hiding every completed match in earlier rounds. Now segmented one section per round across the whole tournament with human-readable headings (`Group 1 — Round 2`, `Quarterfinal`, `Semifinal`, `Final`, `🥉 Third Place`, `Winners — Round 1`, …), inline status sort (Live → Pending → Done), and **two score columns**: Sets won (`2:0`) plus per-set detail (`21:18, 21:15`). Standings + per-round match tables now use `table-layout: fixed` with explicit `<colgroup>` widths so all groups and all rounds line up column-by-column instead of drifting based on the longest player name. Plugin version bump = automatic browser cache-bust on the next page load
- **Bronze toggle pre-checked for new tournaments**: regression from v2.7.1 fixed — the "Spiel um Platz 3 austragen" checkbox now reflects the real default (ON for KO formats) when starting a new tournament, instead of always being unchecked

## [2.7.1] — 2026-04-25 · KO & Match-Flow Polish
- **Spiel um Platz 3 (Bronze playoff)**: Per-tournament toggle (default ON for new KO tournaments). When the semi-finals complete, a bronze match is auto-created alongside the Final. Works for `Elimination`, `Group Stage + KO`, and `Double Elimination` (Bronze = LB-final loser vs. LB-semifinal loser there). Rendered as a dedicated 🥉 panel below the bracket and a separate round button in the Spiele tab. Scope can be flipped off in the wizard for events that skip 3rd place
- **Seed badges in tournament view**: Players that received a seed in the wizard now show a compact `S1` / `S2` / … badge next to their name in the **Gruppen-Tab** (singles + doubles tables) and the **Verwaltungs-Tab**. Seed rank is now persisted per-tournament-player (was previously thrown away after the bracket draw), so the information survives the tournament lifecycle
- **Player-on-court conflict guard**: When the next round is drawn early and a player is still active on another court, the affected match is hard-blocked from being assigned to a court. The waiting card shows a 🚫 marker, the dropdown disables conflicted courts, and a rose-themed modal lists which players are still on which court — no bypass (unlike the rest-time warning), since two simultaneous matches with the same player would never finish
- **Bronze toggle pre-checked for new tournaments**: Fixed a regression where "Spiel um Platz 3 austragen" was unchecked by default after creating a new tournament — initial draft creation now sets the flag honestly so the wizard checkbox reflects the real default

## [2.7.0] — 2026-04-25 · Live Publishing to WordPress
> **Nachtrag zur Zusicherung unten:** Der Satz „Only first name, last name,
> and club are transmitted. Birth dates and payment info are deliberately
> stripped“ galt nur für die Spielerliste des Schnappschusses. Die
> **Tabellenstände** trugen das vollständige Datenbank-Objekt, also auch
> Geburtsdatum und Geschlecht, bis dies im Zuge von REVIEW-BACKLOG.md I3
> behoben wurde. Wer zwischen v2.7.0 und dieser Korrektur live veröffentlicht
> hat, sollte davon ausgehen, dass diese Felder öffentlich abrufbar waren.


- **Per-tournament opt-in**: Each tournament has its own "📡 Live aktivieren" toggle in the detail view — off by default. Multiple parallel tournaments can run live independently, each pushing under its own ID
- **Connection setup once**: Endpoint URL + shared secret are stored in Settings → "Live-Veröffentlichung (WordPress)". A "Test connection" button verifies the WP plugin responds
- **Tournament ID badge**: The Live button displays the tournament ID (`ID: 42`) so the WordPress shortcode (`[boss_matches id="42"]`) can be assembled without searching — tooltip even shows the ready-to-paste shortcode template
- **Event-driven push**: Snapshots are pushed within ~1.5s of any state change (score, court assignment, match completion, round draw) plus a 60s heartbeat as a liveness signal. A signature hash skips redundant heartbeats when nothing changed
- **Stop publishing**: Click the active "📡 Live aktiv" button → confirm modal → opt-in is removed AND a delete request is sent so the WordPress page drops the snapshot. Even if the WP server is offline, opt-in is removed locally so no further pushes are attempted
- **Companion WordPress plugin** (`/wordpress-plugin/boss-live-results/`): Single-file PHP plugin with REST endpoint, custom post type for snapshot storage, and 5 shortcodes — `[boss_tournaments]` (list), `[boss_matches id]`, `[boss_standings id]`, `[boss_bracket id]`, `[boss_status id]`. Vanilla-JS frontend polls every 15s, no React/jQuery dependency
- **Privacy-aware**: Only first name, last name, and club are transmitted. Birth dates and payment info are deliberately stripped before push — DSGVO-friendly, public sites must not expose member PII
- **Hardened**: Outbound HTTP is allowed only to `*/wp-json/boss/v1/*` (Tauri capability allowlist). Authentication via `X-BOSS-Secret` header (constant-time `hash_equals` on the WP side)

