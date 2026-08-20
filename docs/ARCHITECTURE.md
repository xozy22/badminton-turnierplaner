# BOSS — Architektur

Diese Seite beantwortet die Fragen, für die man sonst
`pages/TournamentView/index.tsx` lesen müsste. Sie beschreibt das
Datenmodell, die Sonderfälle darin, den Lebenszyklus eines Turniers und den
Weg der Live-Ergebnisse.

---

## Die Schichten

```
┌─────────────────────────────────────────────────────────┐
│  React 19 + Vite                                        │
│  pages/          eine Route je Verzeichnis              │
│  components/ui/  Modal, Icon, ConfirmDialog, States     │
├─────────────────────────────────────────────────────────┤
│  lib/            keine Komponenten, nur Logik           │
│  db.ts           Datenzugriff, zwei Backends            │
│  formats/        je Turnierformat eine Engine           │
│  scoring.ts      Ergebnisprüfung, Tabellenstände        │
├─────────────────────────────────────────────────────────┤
│  Tauri 2 (Rust)  Datenbankpfad, Backup, Transaktionen   │
│  tauri-plugin-sql → sqlx → SQLite                       │
└─────────────────────────────────────────────────────────┘
```

**Zwei Backends, ein Interface.** `db.ts` spricht im Programm mit SQLite,
im Browser mit `localStorage`. Das ist kein Zufallsprodukt, sondern
Absicht: die Oberfläche lässt sich ohne Rust-Build entwickeln und prüfen.
Jeder Datenbanktest läuft deshalb **zweimal** — gegen echtes SQLite (über
`node:sqlite`, mit der realen Migrationskette aus `src-tauri/src/lib.rs`)
und gegen den Browser-Ersatz. Weicht einer ab, ist es ein Fehler.

---

## Datenmodell

```
sportstaetten ──┬── sessions ──┐
                │              │
                └── tournaments ┴── rounds ── matches ── sets
                        │
                        └── tournament_players ── players
```

- **`sportstaetten`** — der physische Ort, mit `halls` (JSON) als
  Feldaufteilung. Die Wahrheit über Felder liegt hier, nicht am Turnier.
- **`sessions`** — mehrere Turniere, die parallel am selben Ort laufen und
  sich den Feldpool teilen. Freiwillig: ohne `session_id` verhält sich ein
  Turnier wie vor Version 2.8.
- **`tournaments`** — die Einstellungen. Die Sonderfälle darin stehen unten.
- **`rounds`** — trägt `phase` und optional `group_number`.
- **`matches`** — bis zu vier Spieler-IDs (`team1_p1`, `team1_p2`,
  `team2_p1`, `team2_p2`); `p2` ist `NULL` im Einzel und `0` in Altdaten.
- **`sets`** — ein Datensatz je Satz, nicht je Spiel.

### Felder, deren Name nicht das sagt, was sie bedeuten

Diese drei haben mehr Fehler verursacht als alles andere im Datenmodell:

| Feld | Erwartung | Tatsächlich |
|------|-----------|-------------|
| `num_groups` | Anzahl Gruppen | Bei Schweizer System, Monrad und Waterfall lag hier bis Migration v15 die **Rundenzahl**. Seither gibt es `planned_rounds`; `num_groups` bedeutet wieder überall dasselbe. |
| `qualify_per_group` | Qualifikanten je Gruppe | Seit v2.6 die **Größe des KO-Feldes insgesamt** (also 8 = Viertelfinale), nicht die Zahl pro Gruppe. Der Name blieb. |
| `phase` bei Monrad | `"monrad"` | `"swiss"`. Monrad und Schweizer System teilen sich die Rundenmechanik, und die Phase folgt der Mechanik, nicht dem Format. Waterfall und King of the Court setzen überhaupt keine Phase — ihre Runden stehen mit `NULL` in der Tabelle. |

### Phase je Format

Welche `rounds.phase`-Werte ein Format erzeugt:

| Format | Phasen |
|--------|--------|
| `round_robin`, `random_doubles` | `group` |
| `elimination` | `ko`, dazu `third_place` bei aktiviertem Spiel um Platz 3 |
| `group_ko` | zuerst `group`, dann `ko` (+ `third_place`) |
| `swiss`, `monrad` | `swiss` |
| `waterfall`, `king_of_court` | keine (`NULL`) |
| `double_elimination` | `winners`, `losers`, `ko` (Finale), `third_place` |

`current_phase` am Turnier ist der Stand, nicht die Historie: `"ready"`
heißt ausgelost, aber noch nicht begonnen; `NULL` heißt Entwurf.

---

## Lebenszyklus eines Turniers

```
draft ──[Auslosung]──> active ──[abschließen]──> completed ──> archived
  │                       │                          │
  │                    Runden                    letzter
  │                  entstehen                  Live-Push
  │                  nacheinander                (final: true)
  └─ bearbeitbar      └─ Ergebnisse, Feldzuweisung, Rücknahme
```

1. **`draft`** — alles änderbar. Spieler kommen dazu, Format und
   Punktregeln stehen zur Wahl. Noch keine Runde existiert.
2. **Auslosung** — die Anwesenheitsprüfung entfernt Fehlende, dann erzeugt
   die Engine des Formats die erste Runde. Der Status springt auf `active`.
3. **`active`** — Ergebnisse werden eingetragen, Felder zugewiesen. Die
   Folgerunde entsteht erst, wenn die vorige vollständig ist. Die Rücknahme
   einer Runde löscht sie samt Spielen und Sätzen.
4. **`completed`** — die Tabelle steht fest. Der Live-Push sendet einen
   letzten Schnappschuss mit `final: true`.
5. **`archived`** — aus den Listen verschwunden, Daten erhalten.

### Wo die nächste Runde herkommt

Jedes Format ist eine `FormatEngine` in `lib/formats/`. Die Registry
`FORMAT_ENGINES` bildet `TournamentFormat` auf die Engine ab; `engineFor()`
holt sie. Eine Engine bekommt den Zustand (Spieler, bisherige Runden,
Ergebnisse) und liefert einen Plan: welche Runden mit welchen Paarungen
entstehen sollen. Sie schreibt nicht selbst in die Datenbank — das trennt
die Auslosungslogik von der Speicherung und macht sie ohne Datenbank
prüfbar.

---

## Live-Veröffentlichung

```
Turnier ändert sich
      │
      ▼
useLivePublisher ──[Signatur unverändert?]──> nichts tun
      │ (geändert, ~1,5 s Verzögerung)
      ▼
buildSnapshot ──[Anonymisierungsstufe]──> PublicPlayer, PublicStandingEntry
      │
      ▼
POST https://…/wp-json/boss/v1/push     X-BOSS-Secret
      │
      ▼
WordPress-Plugin ──> ein Beitrag je Turnier ──> Shortcodes
```

Vier Punkte, die man kennen muss:

- **Nur `PublicPlayer` verlässt die Anwendung.** Geburtsdatum, Geschlecht
  und interne Zeitstempel bleiben hier. Das galt lange nur für die
  Spielerliste, während die Tabellenstände das vollständige Objekt trugen —
  siehe `REVIEW-BACKLOG.md` I3. Beide Wege laufen jetzt durch
  `toPublicStandings`.
- **Die Signatur** ist ein Hash des Schnappschusses ohne Zeitstempel.
  Ändert sich nichts, wird der 60-Sekunden-Herzschlag übersprungen.
- **HTTPS ist Pflicht**, geprüft in `postJson` — dem einen Trichter, durch
  den jede Übertragung läuft. Das Geheimnis reist in einem Kopfzeilenfeld
  mit.
- **Pro Turnier freigeschaltet**, nicht global. Die Zustimmung steht in
  `app_settings`, nicht am Turnier.

---

## Was wo geprüft wird

| Prüfung | Befehl | Verbindlich in CI |
|---------|--------|-------------------|
| Typen | `pnpm build` | ja |
| Tests (beide Backends) | `pnpm test` | ja |
| Übersetzungsschlüssel | `pnpm check:i18n` | ja |
| Emojis in der Oberfläche | `pnpm check:emoji` | ja |
| Versionsgleichstand | `pnpm check:version` | ja |
| Farbkontraste | `node scripts/check-contrast.mjs` | nein (Bericht in `docs/contrast.md`) |
| Lint | `pnpm lint` | beratend |
| Rust | `cargo check`, `cargo test` | ja |

---

## Weiterlesen

- [`REVIEW-BACKLOG.md`](../REVIEW-BACKLOG.md) — warum die Dinge so sind,
  wie sie sind, samt der Fehler, die dahin geführt haben.
- [`CHANGELOG.md`](../CHANGELOG.md) — was sich wann geändert hat.
- [`docs/contrast.md`](contrast.md) — gemessene Kontraste aller Farbschemata.
