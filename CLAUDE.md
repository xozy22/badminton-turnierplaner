# CLAUDE.md

Konventionen dieses Projekts. Gilt für alle, die hier arbeiten — Menschen
wie Modelle.

Die Architektur steht in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), die
Begründungen für den heutigen Zustand in
[REVIEW-BACKLOG.md](REVIEW-BACKLOG.md).

---

## Sprache

- **Nutzersichtbarer Text ist niemals fest verdrahtet.** Er steht in
  `src/lib/i18n/` — in allen drei Dateien (`types.ts`, `de.ts`, `en.ts`),
  sonst schlägt `pnpm check:i18n` fehl.
- **Deutsche Texte mit echten Umlauten.** „für", nicht „fuer"; „größer",
  nicht „groesser". Die Prüfung kennt eine Liste erlaubter Wörter für die
  Fälle, in denen „ss" oder „ue" richtig sind („dass", „neue").
- **Platzhalter über `fill()`** aus `i18n/format.ts`, nicht über
  `.replace()`-Ketten. Ein `{name}`, das ungefüllt in der Oberfläche landet,
  ist zweimal ausgeliefert worden — die Prüfung sucht danach.
- **Kommentare und Commit-Nachrichten auf Englisch**, der Rest des Codes
  ebenfalls. Nur die Rust-Datei ist historisch deutsch kommentiert; das
  bleibt konsistent innerhalb der Datei.

## Oberfläche

- **Keine Emojis.** Sie werden auf jedem System anders dargestellt, folgen
  nicht der Textfarbe, und Screenreader lesen sie mit Namen vor, die niemand
  gewählt hat. Stattdessen `<Icon name="…" />` aus `components/ui/Icon.tsx`.
  `pnpm check:emoji` erzwingt das und kennt beide Schreibweisen — das
  Zeichen selbst und `\u{...}`-Escapes.
- **Dialoge über `components/ui/Modal.tsx`**, nie handgebaut. Das Bauteil
  bringt Fokusfalle, Escape, Fokusrückgabe und Scroll-Sperre mit.
  Bestätigungen über `useConfirm()`, nicht über `confirm()`.
- **Farben nur über Tokens.** `text-primary`, `bg-surface`, `border-line` —
  keine Tailwind-Palette (`text-gray-700`) und kein `dark:`, weil das an das
  Betriebssystem gebunden ist statt an das gewählte Farbschema. Neue Farben
  kommen in `src/index.css` und in **alle sechs** Schemata.
  `node scripts/check-contrast.mjs` prüft 77 Paare gegen WCAG AA.
- **Größen in `rem`**, nicht in `px` — die Schriftgrößen-Einstellung
  skaliert über die Wurzelschriftgröße und erreicht `px` nicht.

## Daten

- **`$N` in SQLite ist benannt, nicht positionsbezogen.** Dieselbe Nummer
  darf mehrfach vorkommen und verbraucht **einen** Wert. Ein Rewrite nach
  `?` muss die Argumentliste entsprechend aufblähen.
- **Zeitstempel schreiben über `nowIso()`**, lesen über `parseDbDate()`.
  SQLites zonenloses Format wird von `new Date()` als Ortszeit gelesen.
- **`ORDER BY created_at` braucht einen Zweitschlüssel** (`, id`), sonst ist
  die Reihenfolge bei gleicher Sekunde undefiniert.
- **Jeder Datenbanktest läuft gegen beide Backends.** Das Muster steht in
  `db.test.ts`: `for (const backend of BACKENDS)`.

## Arbeitsweise

- **Vor dem Behaupten prüfen.** Wenn eine Aussage über das Verhalten des
  Programms getroffen wird, gehört ein Beleg dazu — ein Test, eine Messung,
  ein Blick in die laufende Anwendung. Mehrere Fehler in diesem Projekt
  entstanden dadurch, dass ein Kommentar etwas behauptete, was der Code
  nicht tat.
- **Ein Punkt, ein Commit.** Die Nachricht nennt, was sich ändert und
  warum — nicht, welche Dateien angefasst wurden; das steht im Diff.
- **`REVIEW-BACKLOG.md` mitführen.** Ein erledigter Punkt wird dort
  abgehakt, mit dem, was tatsächlich getan wurde, einschließlich der
  Abweichungen vom ursprünglichen Vorschlag.

## Befehle

```bash
pnpm dev            # Entwicklungsserver
pnpm test           # Tests, beide Backends
pnpm build          # Typprüfung und Bündelung
pnpm check:i18n     # Übersetzungsschlüssel
pnpm check:emoji    # Emojis in der Oberfläche
pnpm check:version  # package.json gegen tauri.conf.json
```

Alle laufen in der CI. `pnpm lint` läuft dort beratend — die 13
verbleibenden Meldungen betreffen `set-state-in-effect` in fünf Dateien und
sind in D3 vermerkt.
