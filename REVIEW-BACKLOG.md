# BOSS — Vollständiger Review & Überarbeitungs-Backlog

Stand: 2026-08-18 · Basis: Commit `e783243` (v2.9.0) · Umfang: ~27.000 Zeilen TS/TSX, 462 Zeilen Rust, 319 Zeilen PHP

Jeder Punkt ist als eigenständige Aufgabe formuliert: **Problem → Fix → Fertig-Kriterium**.
Reihenfolge = empfohlene Abarbeitung. Abhaken per `[x]`.

---

## Empfohlene Meilensteine

| Phase | Inhalt | Warum zuerst |
|---|---|---|
| **0** ✅ | J1, J2 (CI + Test-Setup) — erledigt | Ohne Netz kein Umbau der Turnierlogik |
| **1** ✅ | A1–A7 (kritische Bugs) — erledigt | Formate/Freilose/Setzliste sind teilweise kaputt |
| **2** ✅ | B1–B14 (Turnierlogik & Fairness) — erledigt | Kern des Produkts |
| **3** ⏳ | C1–C9, D1–D9 (Daten & Architektur) — C-Reihe erledigt, D1/D2/D5 teilweise | Basis für alles Weitere |
| | offen: Ansichten in Komponenten zerlegen (D1), Anzeige-Eigenschaften in die Format-Engines (D2), Datenbankverwaltung aus den Einstellungen lösen (D5) | |
| **4** ✅ | E1–E4 (Performance) — erledigt; E5 wartet auf F1 | Schnelle Gewinne |
| **5** | F1–F10, G1–G5 (Design & Barrierefreiheit) | Das „komplett überarbeitet"-Gefühl |
| **6** | H1 ✅, H2–H5, I1–I5, J3–J6 | Politur & Sicherheit |

---

## Arbeiten mit der Testsuite (seit Phase 0)

```bash
pnpm test
```

`pnpm test` führt alle Tests aus, `pnpm test:watch` beobachtet Änderungen, `pnpm test:coverage` prüft zusätzlich die Abdeckungsschwellen.

**Wichtig für die Abarbeitung:** Bekannte Fehler aus diesem Backlog sind bereits als Tests hinterlegt und mit `it.fails(...)` markiert — sie tragen die Backlog-Nummer im Namen (z. B. `A1: accepts every tournament format the app offers`). Solche Tests sind **grün, solange der Fehler existiert**. Sobald du den Fehler behebst, meldet Vitest `Expect test to fail` — das ist das Signal, dass der Fix wirkt.

Der Ablauf pro Backlog-Punkt ist damit:

1. Zugehörigen `it.fails`-Test suchen (Backlog-Nummer im Testnamen).
2. Fehler beheben.
3. `.fails` aus dem Test entfernen — er bleibt als Regressionsschutz stehen.
4. Punkt hier abhaken.

Aktuell hinterlegt: keine. Alle Marker sind entfallen — die zugehörigen Tests sind jetzt reguläre Regressionstests.

Die Abdeckungsschwellen in `vitest.config.ts` sind eine Ratsche: global knapp unter dem Ist-Wert, für `scoring.ts`, `draw.ts`, `restTime.ts` und `courtConflicts.ts` dagegen hoch. Beim Herauslösen von Logik aus den Views (D1/D2) die globalen Werte mit anheben.

---

# A · Kritische Fehler

### [x] A1 — Fünf von neun Turnierformaten lassen sich gar nicht anlegen — **erledigt**
**Schwere:** kritisch · **Aufwand:** S · **Dateien:** `src-tauri/src/lib.rs` (Migration v14)

**Problem:** Migration v1 erstellte `tournaments` mit einem CHECK, der nur `round_robin`, `elimination`, `random_doubles` und `group_ko` kannte. Jeder Versuch, ein Swiss-, Doppel-KO-, Monrad-, King-of-the-Court- oder Waterfall-Turnier anzulegen, scheiterte an `CHECK constraint failed` — obwohl alle neun Formate im Wizard angeboten werden.

**Umgesetzt:** Migration v14 baut den kompletten Turnier-Graph neu auf (`tournaments`, `tournament_players`, `rounds`, `matches`, `sets`) und lässt den Format-CHECK weg — welche Formate gültig sind, gehört zur `TournamentFormat`-Union in TypeScript.

Zwei Fallstricke schließen den naheliegenden Weg aus (beide im Code dokumentiert): sqlx aktiviert Foreign Keys auf **jeder** Verbindung, und Migrationen laufen in einer Transaktion — dort ist `PRAGMA foreign_keys=OFF` wirkungslos. Und `ALTER TABLE … RENAME` schreibt die FK-Klauseln der referenzierenden Tabellen mit um, sodass ein Rename-and-Drop Runden, Spiele und Sätze per Cascade mitnimmt (`legacy_alter_table` verhindert das nicht — gegen SQLite 3.50 geprüft). Deshalb: alles sichern, Kind-zu-Eltern droppen, Eltern-zu-Kind neu anlegen, zurückschreiben.

**Abgesichert durch:** `src/test/migrations.test.ts` fährt die echte Migrationskette gegen In-Memory-SQLite, prüft alle neun Formate und dass eine bestehende Datenbank den Umbau mit allen Turnieren, Runden, Spielen und Sätzen übersteht. Dieser Test hat die Cascade-Falle aufgedeckt, bevor sie Daten kosten konnte.

---

### [x] A2 — Freilose im KO: Spieler verschwinden aus dem Turnier — **erledigt**
**Schwere:** kritisch · **Aufwand:** M · **Dateien:** `src/lib/draw.ts`, `src/pages/TournamentView/index.tsx`, `src/lib/scoring.ts`, Migration v14

**Problem:** Freilos-Partien wurden beim Turnierstart herausgefiltert, und die Folgerunde sammelte ausschließlich Sieger gespielter Partien. Wer ein Freilos hatte, existierte in keiner Runde und war nach Runde 1 aus dem Turnier verschwunden — bei jeder Teilnehmerzahl, die keine Zweierpotenz ist.

**Umgesetzt:** Ein Freilos ist jetzt ein echtes Match ohne Gegner: `matches.team2_p1` ist seit Migration v14 NULL-fähig, das Match wird direkt als abgeschlossen mit `winner_team = 1` gespeichert, und die bestehende Sieger-Logik trägt den Spieler damit von selbst weiter. Die Bracket-Erzeugung (`buildBracket`) berechnet die korrekte Anzahl Erstrunden-Partien und vergibt die Freilose an die höchsten Seeds. In der Oberfläche erscheint "Freilos" statt eines leeren Namens (Spielansicht, Court-Übersicht, Bracket, TV-Modus, Druck); die Rangliste zählt ein Freilos **nicht** als Sieg, damit Quoten und Tiebreaks nicht verfälscht werden.

**Verifiziert:** In der laufenden App mit 6 Spielern (2 gesetzt): Runde 1 = 2 Partien + 2 Freilose für die gesetzten Spieler, Runde 2 = beide Freilos-Spieler plus beide Sieger im Halbfinale. Dazu Regressionstests für 3/5/6/7/11/13 Teilnehmer in `src/lib/draw.test.ts`.

**Bewusst offen:** `advanceDoubleElimination` verarbeitet Freilose korrekt, seine Bracket-Struktur bleibt aber die alte — sie wird in B4 ersetzt.

---

### [x] A3 — Doppel-KO-Bracket ignoriert Setzliste und wirft Teams weg — **erledigt**
**Schwere:** hoch · **Aufwand:** S · **Dateien:** `src/lib/draw.ts`, `src/pages/TournamentView/index.tsx`

**Problem:** `generateEliminationBracketDoubles` nahm keine Setzliste entgegen und mischte rein zufällig; überzählige Teams fielen stillschweigend heraus.

**Umgesetzt:** Einzel und Doppel teilen sich jetzt einen Kern (`buildBracket`) über den Begriff "Teilnehmer" — ein Spieler oder ein Team. `generateEliminationBracketDoubles(teams, seedTeams?)` nimmt gesetzte Teams entgegen; die Turnieransicht leitet sie aus den Spieler-Setzplätzen ab, wobei ein Team den besten Rang seiner beiden Spieler erbt. Überzählige Teams verschwinden nicht mehr, sie bekommen ein Freilos.

**Abgesichert durch:** Tests für Setzreihenfolge, Freilos-Vergabe an gesetzte Teams und unbekannte Seed-Einträge in `src/lib/draw.test.ts`.

---

### [x] A4 — Setzliste geht beim Start verloren, wenn nicht direkt aus dem Wizard gestartet wird — **erledigt**
**Schwere:** hoch · **Aufwand:** S · **Dateien:** `src/pages/TournamentView/index.tsx`

**Problem:** Die Auslosung nutzte ausschließlich die Setzliste aus dem React-Router-State. Wer den Entwurf speicherte und das Turnier später startete, bekam eine ungesetzte Zufallsauslosung — ohne jeden Hinweis, obwohl `seed_rank` in der Datenbank stand.

**Umgesetzt:** Die Auslosung liest die Setzliste aus der persistierten Spalte `seed_rank` (memoisiert als `seedOrder`); der Router-State greift nur noch, solange die Spielerdaten beim allerersten Rendern nicht geladen sind. Damit überlebt die Setzung Reload, Neustart und einen Start Tage später.

**Verifiziert:** Im Rauchtest gingen die Freilose an genau die beiden Spieler mit `seed_rank` 1 und 2 — die Seeds kamen dabei ausschließlich aus der Datenbank, ohne Wizard-Navigation.

---

### [x] A5 — Spieler löschen scheitert stumm (ursprünglich: FK-Enforcement) — **erledigt**
**Schwere:** hoch · **Aufwand:** S · **Dateien:** `src/lib/db.ts`, `src/pages/Players.tsx`

**Befund korrigiert:** Die Annahme, Foreign Keys seien unzuverlässig aktiv, war falsch. sqlx setzt `PRAGMA foreign_keys = ON` als Default beim Aufbau **jeder** Verbindung (`sqlx-sqlite/src/options/mod.rs:185`); der Aufruf in `db.ts` ist redundant.

**Der reale Schaden lag woanders:** Weil `matches` die Spieler ohne `ON DELETE` referenziert, verweigert SQLite das Löschen jedes Spielers, der schon einmal gespielt hat. `Players.tsx` fing den Fehler ab und schrieb ihn nur in die Konsole — für den Nutzer passierte beim Klick auf "Löschen" sichtbar nichts. Bei Mehrfachauswahl brach der Vorgang zudem beim ersten Fehler ab, nachdem bereits gelöscht worden war.

**Umgesetzt:** `deletePlayer` prüft die Verwendung vorab und wirft einen typisierten `PlayerInUseError`, der die betroffenen Turniere benennt. Die Spielerverwaltung löscht, was löschbar ist, und meldet den Rest namentlich per Toast. Der irreführende Kommentar in `db.ts` ist richtiggestellt.

**Bleibt für C8:** Soft-Delete, damit Spieler mit Historie archiviert statt blockiert werden.

---

### [x] A6 — Turnierstart ist nicht atomar — **erledigt**
**Schwere:** hoch · **Aufwand:** M · **Dateien:** `src-tauri/src/lib.rs`, `src/lib/db.ts`, `src/pages/TournamentView/index.tsx`

**Problem:** Der Turnierstart setzte zuerst den Status auf `active` und erzeugte danach Dutzende Runden und Spiele in Einzelschritten. Brach etwas ab, blieb ein aktives Turnier ohne oder mit halbem Spielplan zurück, das sich nicht mehr starten ließ.

**Umgesetzt:** Ein Transaktions-Helper im Frontend reicht nicht — das SQL-Plugin führt jedes Statement auf einer beliebigen Verbindung seines Pools aus, ein `BEGIN` aus dem Frontend würde die folgenden Statements also nicht einschließen. Stattdessen gibt es das Rust-Kommando `execute_transaction`, das eine Statement-Liste auf **einer** Verbindung in einer Transaktion abarbeitet; Parameter dürfen per `{"__lastInsertId": n}` auf die ID eines vorherigen Statements verweisen (Runde anlegen, dann ihre Spiele).

Darauf setzen zwei fachliche Funktionen in `db.ts` auf: `createSchedule(tournamentId, rounds, {status, phase})` schreibt Runden, Spiele und den Statuswechsel gemeinsam, `deleteRoundsAtomically` ist das Gegenstück fürs Undo. Umgestellt sind Turnierstart, KO-Phasenstart, KO-Folgerunde (Finale und Bronze-Spiel gehören zusammen), Schweizer System, Monrad, King of the Court, Waterfall, Zufallsdoppel und das Undo. Status- und Phasenwechsel passieren jetzt **mit** dem Spielplan statt davor.

**Bewusst offen:** `advanceDoubleElimination` schreibt weiterhin einzeln — die Funktion wird in B4 ohnehin ersetzt.

---

### [x] A7 — Backup-Wiederherstellung und DB-Ortswechsel ohne Neustart — **erledigt**
**Schwere:** hoch · **Aufwand:** S · **Dateien:** `src-tauri/src/lib.rs`, `src/pages/Settings.tsx`

**Problem:** `restore_db` kopierte das Backup über die geöffnete Datenbank, `change_db_dir` schrieb die neue Konfiguration, während die App weiter in die alte Datei schrieb. Beides konnte Daten verlieren oder die Datei beschädigen.

**Umgesetzt:** Alle Datei-Operationen laufen jetzt über eine vorgemerkte Aktion (`pending_db_action.json`), die beim nächsten Start ausgeführt wird, bevor das SQL-Plugin die Datenbank öffnet — dasselbe Muster, das der Wipe schon richtig gemacht hat. Abgedeckt sind `restore`, `move_db`, `reset_dir` und `wipe`; der alte Wipe-Marker wird weiterhin gelesen. Vor dem Zurückspielen eines Backups entsteht eine Sicherheitskopie `*.pre-restore`, die Prüfung des SQLite-Headers bleibt vor dem Neustart, damit eine falsche Datei sofort gemeldet wird. Auch "Speicherort zurücksetzen" läuft über diesen Weg (neues Kommando `reset_db_dir`) — vorher wurde nur die Konfigurationsdatei gelöscht, während die App weiter in die alte Datenbank schrieb. Die Meldungstexte in beiden Sprachen sagen an, dass die App neu startet.

---

# B · Turnierlogik & Fairness

### [x] B1 — Rangliste sortiert nach Prozenten und bevorzugt dadurch Spieler mit wenigen Spielen — **erledigt**
**Schwere:** hoch · **Aufwand:** M · **Dateien:** `src/lib/scoring.ts`

**Problem:** Sortierkriterium 1 war die Siegquote. Wer 1:0 stand (100 %), stand vor 5:1 (83 %) — in jeder laufenden Runde, in Gruppen ungleicher Größe und nach Aufgaben. Kein Direktvergleich, keine Differenzen.

**Umgesetzt:** Ein dokumentiertes Regelwerk in `rankSubjects`, für Einzel und Teams identisch:

1. Siege (absolut)
2. Direktvergleich unter allen Punktgleichen — Mini-Tabelle aus den Spielen untereinander
3. Satzdifferenz innerhalb dieser Mini-Tabelle
4. Satzdifferenz gesamt
5. Punktdifferenz gesamt
6. stabiler Schlüssel, damit die Reihenfolge zwischen zwei Renderings nicht springt

Bei Schweizer System und Monrad schiebt sich die Buchholz-Wertung an die zweite Stelle (siehe B2). Die Prozentwerte sind aus der Sortierung verschwunden; die Anzeige zeigt weiterhin Siege, Sätze und Punkte.

**Abgesichert durch:** Tests für Siege vor Quote, Direktvergleich, Satz- und Punktdifferenz, Dreier-Patt über die Mini-Tabelle und Stabilität bei identischen Bilanzen.

---

### [x] B2 — Schweizer System: keine Freilos-Buchhaltung, kein Buchholz, greedy Paarung — **erledigt**
**Schwere:** hoch · **Aufwand:** L · **Dateien:** `src/lib/draw.ts`, `src/lib/scoring.ts`, `src/pages/TournamentView/index.tsx`, `src/components/tournament/RanglisteTab.tsx`

**Umgesetzt, alle drei Teile:**

- **Freilose:** `pickByePlayer` vergibt das Freilos an den am schlechtesten platzierten Spieler, der noch keins hatte. Es wird als echtes Bye-Match gespeichert (möglich seit A2), taucht damit in der Historie auf und zählt als Sieg — in einem Schweizer System muss der Spieler mit dem Feld mithalten können, anders als im KO.
- **Paarung:** `pairWithoutRematch` sucht mit Backtracking eine wiederholungsfreie Paarung und fällt erst auf Wiederholungen zurück, wenn nachweislich keine existiert. Der greedy Vorgänger konnte einen späteren Spieler in ein vermeidbares Rematch drängen. Eine Schrittgrenze verhindert, dass eine pathologische Historie die App blockiert.
- **Buchholz:** Summe der Siege aller Gegner, berechnet über `calculateStandings(..., { withBuchholz: true })`, als Kriterium direkt nach den Siegen und als Spalte „BHZ" in der Rangliste (nur bei Swiss/Monrad sichtbar).

**Korrektur am ursprünglichen Befund:** Der greedy Algorithmus ließ keinen Spieler ohne Match — dieser Zweig ist bei gerader Feldgröße nicht erreichbar. Der reale Schaden waren die vermeidbaren Wiederholungspaarungen.

**Abgesichert durch:** Tests für Freilos-Verteilung über fünf Runden, Ausschluss des Freilos-Spielers aus der Paarung, wiederholungsfreie Lösung in einer eng gestrickten Historie und den Rückfall auf ein Rematch, wenn wirklich keins vermeidbar ist.

---

### [x] B3 — Monrad ist funktional identisch zum Schweizer System, aber ohne dessen Schutzmechanismen — **erledigt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/lib/draw.ts`, `src/pages/TournamentView/index.tsx`

**Problem:** `generateMonradRound` paarte strikt 1-2, 3-4, 5-6 ohne jede Rematch-Prüfung. Bei unveränderter Tabelle entstand Runde für Runde exakt dieselbe Paarung.

**Umgesetzt:** Monrad behält die Paarung nach Rang, nutzt aber dieselbe Backtracking-Suche wie das Schweizer System, sobald eine Begegnung schon stattgefunden hat — die klassische Monrad-Korrektur (Verschiebung um eine Position). Die Turnieransicht baut die Historie dafür auf und übergibt sie; Freilose werden wie bei Swiss vergeben und gezählt.

**Bewusst beibehalten:** Monrad läuft weiterhin unter `phase='swiss'` in der Datenbank. Eine eigene Phase wäre sauberer, ändert aber nichts am Verhalten und hätte eine weitere Migration bedeutet.

---

### [x] B4 — Doppel-KO: Verliererrunde ist strukturell falsch — **erledigt**
**Schwere:** hoch · **Aufwand:** L · **Dateien:** `src/lib/doubleElimination.ts` (neu), `src/pages/TournamentView/index.tsx`

**Problem:** Der Code sagte es selbst: „For simplicity: losers from winners bracket form new losers round". Absteiger spielten nur untereinander, nie gegen die Überlebenden der Verliererrunde. Dadurch lief das Bracket nie auf einen Verlierer-Champion zusammen; das Grand Final hing an Längenprüfungen, ein Bracket-Reset fehlte.

**Umgesetzt:** Ein eigenes Modul `doubleElimination.ts` leitet den Zustand aus den gespeicherten Spielen ab und sagt, welche Runden als Nächstes fällig sind. Es enthält keine Datenbank- und keine React-Abhängigkeit, ist also direkt testbar. Die Regeln:

- **Minor-Runde:** Überlebende der Verliererrunde gegen die Spieler, die gerade aus der Gewinnerrunde gefallen sind
- **Major-Runde:** die Sieger einer Minor-Runde untereinander
- **Rundenweise Einspeisung:** wartende Absteiger kommen nach der Runde ihres Ausscheidens ins Bracket, nicht alle auf einmal — sonst trifft ein Viertelfinal-Verlierer zwei Stufen zu früh auf einen Erstrunden-Verlierer
- **Parallele Runden:** die Funktion liefert alle gerade fälligen Runden, weil Gewinner- und Verliererrunde in der Halle gleichzeitig laufen
- **Grand Final + Bracket-Reset:** gewinnt der Verlierer-Champion das Finale, haben beide eine Niederlage und es wird genau einmal wiederholt
- **Bronze:** die Verlierer der Runde vor dem Verlierer-Finale, sofern aktiviert

**Verifiziert:** Simulation eines vollständigen 8er-Turniers — jeder Teilnehmer scheidet erst nach zwei Niederlagen aus, es bleibt genau ein Champion. In der laufenden App erzeugt ein Klick auf „Bracket weiterschalten" korrekt Gewinnerrunde 2 **und** die Verliererrunde mit allen vier Erstrunden-Verlierern.

**Anmerkung:** Das Grand Final wird als Gewinnerrunde mit einem Spiel gespeichert; welche Runde ein Grand Final ist, steht in `app_settings`. Das vermeidet eine weitere Migration für ein einzelnes Match.

---

### [x] B5 — King of the Court: Warteschlange wird nicht geführt — **erledigt**
**Schwere:** hoch · **Aufwand:** M · **Dateien:** `src/lib/draw.ts`, `src/lib/db.ts`, `src/pages/TournamentView/index.tsx`

**Problem:** Die Schlange wurde bei jedem Aufruf aus der alphabetisch sortierten Spielerliste neu gebaut. Der Herausforderer war praktisch immer derselbe Spieler, der Rest kam nie dran — das Format war unbrauchbar.

**Umgesetzt:** Die Warteschlange ist der Zustand des Formats und wird jetzt persistiert (`app_settings`, pro Turnier). `advanceKingOfCourtQueue` rotiert sie nach jedem Spiel: Sieger vorne, Verlierer ans Ende, alle anderen rücken auf. Spieler, die das Turnier verlassen haben, fallen heraus; neu hinzugekommene werden angehängt. Turniere, die vor dieser Änderung gestartet wurden, fallen einmalig auf die alte Rekonstruktion zurück.

**Abgesichert durch:** Test über sechs Runden, in dem jeder Spieler mindestens einmal auf dem Feld steht — mit der alten Logik spielten zwei Spieler alles und vier gar nicht.

**Bewusst nicht geändert:** King of the Court bleibt ein Ein-Feld-Format. Der Wizard weist jetzt darauf hin, wenn die Sportstätte mehr Felder hat (B13).

---

### [x] B6 — Waterfall: ungerade Spielerzahl und Rundenzahl ungeklärt — **erledigt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/lib/draw.ts`, `src/pages/TournamentView/index.tsx`

**Umgesetzt:**
- `generateWaterfallRound` respektiert die Feldzahl der Sportstätte statt so viele Spiele anzusetzen, wie Spieler da sind.
- Wer keinen Platz bekommt, wird als Aussetzer **zurückgegeben und namentlich angezeigt** statt still hinten aus dem Array zu fallen.
- Die Auswahl der Aussetzer richtet sich nach der bisherigen Pausenzahl (wenigste Pausen zuerst dran), bei Gleichstand nach der Leiterposition. Vorher pausierte immer dasselbe untere Ende der Leiter.
- `advanceWaterfall` lässt Aussetzer auf ihrer Leiterposition stehen — wer nicht spielt, steigt weder auf noch ab.
- Die Rundenzahl kommt aus `planned_rounds` (siehe B7).

**Abgesichert durch:** Tests für Feldgrenze, gemeldete Aussetzer, unveränderte Leiterposition und eine Rotation über sechs Runden.

---

### [x] B7 — `num_groups` wird als Rundenzahl zweckentfremdet — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** Migration v15, `src/lib/types.ts`, `src/lib/db.ts`, `src/pages/TournamentCreate.tsx`, `src/pages/TournamentView/index.tsx`

**Umgesetzt:** Migration v15 legt `tournaments.planned_rounds` an, überträgt die Werte der betroffenen Bestandsturniere aus `num_groups` und setzt dort `num_groups = 0`. Wizard und Turnieransicht lesen und schreiben getrennte Felder; die Rundenauswahl hat einen eigenen State. `num_groups` bedeutet damit wieder ausschließlich „Anzahl Gruppen" — auch für Statistik, Live-Snapshot und WordPress-Plugin.

---

### [x] B8 — Aufgabe/Walkover verfälscht die Statistik — **erledigt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** Migration v15, `src/lib/scoring.ts`, `src/lib/db.ts`, `src/pages/TournamentView/index.tsx`

**Problem:** Bei einer Aufgabe wurden für jedes offene Spiel volle Sätze mit 21:0 geschrieben. Diese erfundenen Punkte flossen in Satz- und Punktquote, in Tiebreaks, in die KO-Qualifikation und in die Statistikseite.

**Umgesetzt:** `matches.walkover` (Migration v15). `setMatchWalkover` schreibt den Sieg, löscht etwaige Sätze und gibt das Feld frei. Beide Ranglisten-Berechnungen zählen den Sieg, ignorieren aber Sätze und Punkte eines Walkovers — auch dann, wenn aus Altdaten noch Satz-Zeilen daran hängen.

**Abgesichert durch:** Tests, dass ein Walkover als Sieg zählt, aber weder Sätze noch Punkte beisteuert.

---

### [x] B9 — Gruppeneinteilung im Doppel ohne Snake-Verteilung — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/lib/draw.ts`, `src/pages/TournamentView/index.tsx`

**Umgesetzt:** `splitTeamsIntoGroups(teams, numGroups, seedTeams?)` verteilt gesetzte Teams im Schlangensystem wie die Einzel-Variante (4 Gruppen, 8 Seeds → G1=[1,8], G2=[2,7], …); ungesetzte Teams werden gemischt aufgefüllt. Die Turnieransicht leitet die gesetzten Teams aus den Spieler-Setzplätzen ab und übergibt sie.

---

### [x] B10 — Random Doubles / Mixed: Aussetzer-Anzeige und Fairness inkonsistent — **erledigt**
**Schwere:** niedrig · **Aufwand:** S · **Dateien:** `src/lib/draw.ts`, `src/pages/TournamentView/index.tsx`

**Umgesetzt:**
- Beide Auslosungen geben jetzt `{ matches, byePlayers }` zurück; alle Aussetzer (bis zu drei im Doppel) werden nach der Auslosung namentlich als Hinweis angezeigt.
- Mixed nutzt dieselben Fairness-Eingaben wie das Zufallsdoppel: wer am wenigsten gespielt hat, kommt zuerst aufs Feld, und Wiederholungspaarungen werden gewichtet statt nur gezählt. Vorher setzte aus, wer zufällig am Ende der gemischten Liste stand — Runde für Runde.

**Abgesichert durch:** Tests für vollständige Aussetzer-Meldung, gleichmäßige Pausenverteilung über neun Runden und Vermeidung von Wiederholungspaarungen im Mixed.

---

### [x] B11 — KO-Qualifikation vergleicht Gruppenzweite über Prozentwerte — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/lib/scoring.ts`, `src/pages/TournamentView/index.tsx`

**Umgesetzt:** `rankAcrossGroups` sortiert die Nachrücker nach Siegen, Satzdifferenz und Punktdifferenz — Direktvergleich entfällt, weil sie nie gegeneinander gespielt haben. Bei **ungleich großen Gruppen** rechnet `limitStandingsToTopN` (bzw. die Team-Variante) die Ergebnisse gegen die Letztplatzierten der größeren Gruppen heraus, sodass die Bilanzen vergleichbar sind. Die Gruppensieger-Reihenfolge dient zugleich als Setzliste für das KO-Bracket, sodass Gruppensieger getrennt bleiben und bei krummen Feldern die Freilose bekommen.

---

### [x] B12 — Partner-Erkennung bei Aufgabe ist unzuverlässig und asymmetrisch — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/pages/TournamentView/index.tsx`

**Umgesetzt:** `getFixedPartner` liest den Partner aus der persistierten Teamliste (`team_config`) statt aus dem ersten Match-Treffer. Einzel und Formate mit wechselnden Partnern liefern konsequent `null`. Aufgeben und Reaktivieren nutzen dieselbe Funktion — vorher prüften beide unterschiedliche Bedingungen, sodass im Einzel ein Gegner als „Partner" mit ausgeschlossen werden konnte.

---

### [x] B13 — Keine Format-spezifische Teilnehmer-Validierung — **erledigt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/lib/tournamentValidation.ts` (neu), `src/pages/TournamentCreate.tsx`

**Umgesetzt:** Ein eigenes Modul prüft die Konfiguration und liefert Befunde in zwei Stufen — Fehler blockieren den Start, Hinweise werden nur angezeigt. Abgedeckt sind unter anderem:

| Prüfung | Stufe |
|---|---|
| Mindestteilnehmer je Format (KotC 3, Waterfall 4, sonst 2/4) | Fehler |
| Mixed ohne zwei Damen und zwei Herren | Fehler |
| Ungerade Spielerzahl bei festen Teams | Fehler (bei wechselnden Partnern: Hinweis) |
| Unvollständige Teampaarung | Fehler |
| Mehr Gruppen als Teilnehmer füllen können, KO-Größe über Teilnehmerzahl | Fehler |
| Freilose im KO, unausgeglichenes Mixed, Aussetzer im Waterfall | Hinweis |
| Mehr Runden als mögliche Gegner, sehr langes Rundenturnier, King of the Court auf mehreren Feldern | Hinweis |

Der Wizard zeigt beides im Zusammenfassungsschritt und lässt den Start-Button bei Fehlern gesperrt.

**Abgesichert durch:** 29 Tests in `src/lib/tournamentValidation.test.ts`.

---

### [x] B14 — Modulo-Bias im Shuffle — **erledigt**
**Schwere:** niedrig · **Aufwand:** XS · **Dateien:** `src/lib/draw.ts`

**Umgesetzt:** `randomInt` zieht per Rejection Sampling gleichverteilt: Werte aus dem unvollständigen letzten Block werden verworfen und neu gezogen. Der Fisher-Yates-Shuffle nutzt es an jeder Stelle.

**Abgesichert durch:** Verteilungstest über 20.000 Durchläufe — jede Position jedes Werts liegt innerhalb von 15 % des Erwartungswerts.

---

# C · Datenhaltung & Persistenz

### [x] C1 — Keine Datenbank-Indizes — **erledigt**
**Schwere:** mittel · **Aufwand:** XS · **Dateien:** Migration v16

**Umgesetzt:** Indizes auf `matches(round_id)`, `matches(court)`, `matches(status)`, `sets(match_id, set_number)`, `rounds(tournament_id)`, `tournament_players(player_id)`, `tournaments(session_id | venue_id | status)` und `sessions(venue_id)`. Der Schema-Test prüft, dass die heißen Fremdschlüssel abgedeckt sind.

---

### [x] C2 — `sets` ohne Eindeutigkeit, `upsertSet` als Lese-Schreib-Paar — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** Migration v16, `src/lib/db.ts`

**Umgesetzt:** Migration v16 räumt vorhandene Duplikate ab (je Match und Satznummer bleibt der jüngste Eintrag) und legt danach einen `UNIQUE`-Index an. `upsertSet` ist ein einzelnes `INSERT … ON CONFLICT … DO UPDATE` statt SELECT-dann-INSERT/UPDATE — zwei schnelle Tastendrücke können keine doppelte Zeile mehr erzeugen, deren Punkte doppelt zählen.

---

### [x] C3 — Zeitzonen-Chaos bei Zeitstempeln — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/lib/datetime.ts` (neu), `src/lib/db.ts`, `src/lib/stats.ts`, `src/components/print/CertificateGenerator.ts`, Sessions-Seiten

**Umgesetzt:** Ein Modul mit `parseDbDate`, `dbDateToMillis`, `byNewest`, `formatDate/Time/DateTime` und `nowIso`. Es erkennt beide gespeicherten Formen — SQLites zonenloses `datetime('now')` (UTC) und JavaScripts ISO mit `Z` — und liefert für beide denselben Zeitpunkt. Alle Lesestellen nutzen es: Turniersortierung, Statistik-Dauern, Urkunde und die drei Sessions-Seiten, die je einen eigenen Workaround hatten. Geschrieben wird ausschließlich ISO-UTC über `nowIso()`.

**Abgesichert durch:** 16 Tests, darunter der direkte Vergleich beider Formen und die Sortierung über gemischte Werte.

---

### [x] C4 — Einstellungen liegen in zwei Systemen — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/lib/appSettings.ts` (neu), `src/pages/Settings.tsx`, `src/components/courts/CourtTimer.tsx`

**Umgesetzt:** Ein Modul hält die Einstellungen. Die Datenbank (`app_settings`) ist die maßgebliche Quelle, `localStorage` nur noch ein synchroner Spiegel — nötig, weil Werte wie die Timer-Schwellen schon während des ersten Renderings gebraucht werden. Beim ersten Start nach der Umstellung übernimmt `syncSettingsFromDb` die vorhandenen lokalen Werte und schreibt sie in die Datenbank; damit wandern bestehende Installationen von selbst mit, und ein Backup enthält künftig die vollständige Konfiguration.

---

### [x] C5 — Doppelte Datenbank-Implementierung (Tauri + localStorage) — **erledigt**
**Schwere:** hoch · **Aufwand:** L · **Dateien:** `src/lib/db.ts`, `src/lib/sessions.ts`, `src/lib/db.test.ts` (neu), `src/lib/sessions.test.ts` (neu), `src/test/sqliteBackend.ts` (neu)

**Problem:** Jede der ~60 Funktionen enthält zwei vollständige Implementierungen: SQL für Tauri und ein Array-Backend für den Browser-Fallback. Die Zweige driften auseinander, und niemand merkt es — die Datenschicht hatte keinen einzigen Test.

**Gewählter Weg:** Statt eine der beiden Implementierungen zu entfernen, laufen jetzt **beide gegen dieselbe Testsuite**. `src/test/sqliteBackend.ts` legt eine In-Memory-SQLite an, spielt die echte Migrationskette aus `src-tauri/src/lib.rs` ein und tritt an die Stelle der beiden Tauri-Module, die `db.ts` importiert — einschließlich einer Nachbildung des Rust-Kommandos `execute_transaction` samt seiner `__lastInsertId`-Rückverweise. Jeder Testfall läuft damit zweimal: gegen den Fallback und gegen das echte SQL. Eine Verhaltensweise, die es nur in einem der beiden gibt, wird sofort rot.

Der Browser-Fallback bleibt damit erhalten — er ist der einzige Weg, die App ohne Tauri-Build zu bedienen, und jeder Smoke-Test dieser Überarbeitung lief darüber.

**Ertrag: vier reale Fehler**, drei davon in beiden Pfaden, einer als echte Drift:

1. *Kampflos-Siege überlebten das Zurücksetzen.* `reopenMatch` und `updateMatchResult(null)` löschten das `walkover`-Flag nicht, und `scoring.ts` verwirft die Sätze jedes so markierten Spiels — die Rangliste wies eine falsche Satz- und Punktdifferenz aus.
2. *Turnierbezogene Einstellungen überlebten ihr Turnier.* `kotc_queue_<id>` und `grand_final_rounds_<id>` fielen aus der Löschkaskade; da SQLite die `rowid` neu vergibt, erbte das nächste King-of-the-Court-Turnier eine fremde Warteschlange.
3. *Die Turnierliste sortierte instabil.* `ORDER BY created_at DESC` ohne Tiebreaker, während SQLite `created_at` nur sekundengenau füllt: zwei am selben Tag angelegte Turniere erschienen in zufälliger, zwischen zwei Aufrufen wechselnder Reihenfolge. Der Fallback speichert Millisekunden und hätte das nie gezeigt.
4. *Drift:* `getSessionEndStats` gab im Fallback hart `matchesOnCourt: 0` zurück, mit dem Kommentar, der Store kenne keine Spiele pro Turnier. Er kennt sie. Der Bestätigungsdialog vor dem Beenden einer Session meldete im Browser-Modus „0 Spiele auf dem Feld", während welche liefen.

**Abdeckung:** 436 Tests (von 300); `db.ts` von 47 % auf 91 %, `sessions.ts` auf 94 %, Gesamtprojekt von 37 % auf 72 %. Schwellen in `vitest.config.ts` entsprechend angehoben, inklusive eigener Werte für beide Dateien.

**Fertig wenn:** ~~Kein `isTauri()`-Zweig mehr in der Datenschicht~~ — die Zweige bleiben bewusst bestehen; die Testsuite läuft gegen beide, wodurch Drift dieselbe Sichtbarkeit bekommt wie ein Syntaxfehler. Ein späterer Umbau auf eine einzige Implementierung ist damit auch abgesichert, falls er kommen soll.

---

### [x] C6 — Spielernamen dreifach gespeichert, Inserts mit dreistufigem Fallback — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** Migration v18, `src/lib/db.ts`

**Umgesetzt:** Migration v18 füllt `first_name`/`last_name` endgültig, synchronisiert `name` und entfernt die toten Spalten `age` und `birth_year`. Im Code sind die dreistufigen try/catch-Kaskaden in `createPlayer`/`updatePlayer` verschwunden, und die drei inline-Rekonstruktionen („falls first_name leer, splitte name") sind durch einen gemeinsamen `rowToPlayer`-Mapper ersetzt. `name` bleibt als Spalte erhalten, weil `ORDER BY` und die veröffentlichten Snapshots sie lesen — sie wird beim Schreiben mitgepflegt.

---

### [x] C7 — `ensureExpectedSchema` als Dauerlösung — **erledigt**
**Schwere:** niedrig · **Aufwand:** S · **Dateien:** `src/lib/db.ts`, `src/test/migrations.test.ts`

**Umgesetzt:** Statt bei jedem Start ALTER-TABLE-Statements auf Verdacht abzusetzen, prüft `verifySchema` die erwarteten Tabellen und Spalten und wirft einen typisierten `SchemaMismatchError` mit der Liste des Fehlenden. Ein falsches Schema ist damit ein Problem, das vor dem ersten Spiel sichtbar wird, statt mitten im Turnier an einem INSERT zu scheitern.

**Zusätzlich abgesichert:** Ein Test liest `REQUIRED_SCHEMA` aus `db.ts` und prüft es gegen die real ausgeführte Migrationskette. Wer künftig eine Spalte im Code erwartet, ohne eine Migration zu schreiben, bekommt einen roten Test statt einer App, die nicht startet.

---

### [x] C8 — Gelöschte Spieler hinterlassen „?" in historischen Turnieren — **erledigt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** Migration v17, `src/lib/db.ts`, `src/pages/Players.tsx`

**Umgesetzt:** `players.archived_at` (Migration v17). `removePlayer` entscheidet selbst: Wer noch nie gespielt hat, wird gelöscht; wer Spiele hat, wird archiviert — die Zeile bleibt, die Historie bleibt lesbar, und aus den Auswahllisten verschwindet der Spieler trotzdem. Die Spielerverwaltung meldet beide Fälle getrennt, blendet Archivierte hinter einem Schalter ein und bietet dort „Wiederherstellen" an.

---

### [x] C9 — Ergebnisse lassen sich nicht exportieren — **erledigt**
**Schwere:** niedrig · **Aufwand:** M · **Dateien:** `src/lib/resultExport.ts` (neu), `src/pages/TournamentView/index.tsx`

**Umgesetzt:** Vier Exporte über ein Menü neben dem Druck-Knopf:

| Export | Inhalt |
|---|---|
| Spiele (CSV) | Runde, Phase, Gruppe, Feld, beide Teams, Sieger, Wertung (gespielt / kampflos / Freilos), alle Sätze, Endzeit |
| Rangliste (CSV) | Platz, Name, Verein, Bilanz, Sätze, Punkte — plus Buchholz, wenn die Tabelle eine hat |
| Startgeld (CSV) | Zahlungsstatus, Methode, Datum, Betrag |
| Alles (JSON) | vollständiger Snapshot in derselben Form wie beim Live-Publishing |

Trennzeichen ist das Semikolon und die Datei beginnt mit einem BOM, damit Excel sie ohne Zutun als UTF-8 mit korrekten Umlauten öffnet. In der Desktop-App wählt ein nativer Dialog den Ort, im Browser wird heruntergeladen.

**Verifiziert:** In der laufenden App erzeugt „Spiele (CSV)" eine Datei mit korrekten Siegern, Satzergebnissen und Zeitstempeln. Dazu 17 Tests für Formatierung, Escaping, Doppel-Namen, Freilose und Walkover.

---

# D · Architektur & Code-Qualität

### [~] D1 — `TournamentView/index.tsx` ist mit 3052 Zeilen unwartbar — **verkleinert, Ziel nicht erreicht**
**Schwere:** hoch · **Aufwand:** L · **Dateien:** `src/pages/TournamentView/index.tsx`

**Problem:** Eine Datei mit 3052 Zeilen, die Zustand, Datenzugriff, Formatlogik, Drag-and-drop und das gesamte Markup vereint.

**Bisher umgesetzt:** Die Formatlogik ist nach `src/lib/formats/` gewandert (siehe D2), die Ergebnis-Ausgabe nach `src/lib/resultExport.ts`, Validierung nach `src/lib/tournamentValidation.ts`, die Undo-Vorschau nach `lib/undoTarget.ts`. Die Datei ist damit von 3052 auf **2407 Zeilen** geschrumpft und enthält im Wesentlichen noch Zustand, Ereignisbehandlung und Markup.

**Was fehlt:** Das Kriterium „keine Datei über 600 Zeilen" ist deutlich verfehlt. Über der Grenze liegen weiterhin: `TournamentView/index.tsx` (2407), `db.ts` (1837), `TournamentCreate.tsx` (1526), `i18n/types.ts` (1015), `lib.rs` (998), `en.ts`/`de.ts` (je 986), `draw.ts` (970), `TvMode.tsx` (904), `scoring.ts` (785), `Players.tsx` (764), `ExcelImport.tsx` (754), `Sportstaetten.tsx` (738). Bei den Übersetzungs- und Migrationsdateien ist die Länge ohne Belang — es sind Tabellen. Bei den Ansichten steht der Umbau aus: Markup in Abschnitts-Komponenten, Zustand in eigene Hooks.

**Fertig wenn:** Keine Ansichts- oder Logikdatei über 600 Zeilen; jede Hook-Datei einzeln testbar.

---

### [~] D2 — Format-Logik als if/else-Kaskade statt Strategie pro Format — **Engine steht, View verzweigt noch**
**Schwere:** hoch · **Aufwand:** L · **Dateien:** `src/lib/formats/` (neu), `src/pages/TournamentView/index.tsx`

**Problem:** Start und Fortschritt jedes der neun Formate lagen als if/else-Kaskade in der Ansicht.

**Bisher umgesetzt:** `src/lib/formats/` enthält eine `FormatEngine` pro Format hinter einer gemeinsamen Schnittstelle (`start`, `canAdvance`, `advance`, `progress`) und eine Registry. Die Ansicht ruft `engineFor(format)` — der gesamte Start- und Weiterschaltpfad ist frei von Format-Verzweigungen, und 37 Tests decken die Engines ab, darunter ein Durchlauf jedes Formats von Anfang bis Ende.

**Was fehlt:** In der Ansicht stehen weiterhin **14** Abfragen auf `tournament.format` — für Anzeigeentscheidungen: Buchholz-Wertung bei Swiss/Monrad, Gruppenfortschritt bei `group_ko`, Bracket-Ansicht bei den K.-o.-Formaten, Warteschlange bei King of the Court. Ein neues Format braucht also weiterhin Eingriffe in der Ansicht. Der zweite Teil des Kriteriums ist damit offen; dafür müssten die Engines auch ihre Anzeige-Eigenschaften beschreiben (etwa `hasBracket`, `usesBuchholz`, `hasGroupPhase`).

**Fertig wenn:** Ein neues Format lässt sich durch Anlegen **einer** Datei plus Registry-Eintrag ergänzen; die Ansicht enthält keine formatspezifischen Verzweigungen mehr.

---

### [x] D3 — 59 ESLint-Fehler, keine Durchsetzung — **weitgehend erledigt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** projektweit, `eslint.config.js`

**Stand: von 64 Meldungen auf 14** (10 Fehler, 4 Warnungen).

Behoben: sämtliche 43 `no-explicit-any` — die Datenbankschicht ist typisiert (siehe D9), der Router-State, die `theme`-Props und der Vorlagen-Import ebenfalls; die ungenutzten Variablen; `useTimer` leitet seinen Wert ab, statt ihn im Effekt zu setzen; `coverage/` ist aus dem Lint-Lauf ausgenommen.

Bewusst abgeschaltet: `react-refresh/only-export-components` für die Context-Module und `Settings.tsx`. Provider und zugehöriger Hook in einer Datei ist gängige Praxis; die Regel betrifft ausschließlich die Granularität von Hot Reload.

**Rest (14):** ausschließlich `react-hooks/set-state-in-effect` und `exhaustive-deps` in den Lade- und Polling-Pfaden (`sessionContext`, `useLivePublisher`, `Statistics`, `TournamentCreate`, `CourtContextMenu`) sowie eine Memoization-Warnung. Diese Muster verschwinden mit dem Umbau der Datenschicht (D7/D8) — vorher würde man sie nur verschieben. Bis dahin läuft `pnpm lint` in CI als Hinweis mit.

---

### [x] D4 — Keine automatisierten Tests — **erledigt**
**Schwere:** hoch · **Aufwand:** M (Setup) + laufend · **Dateien:** `src/lib/*.test.ts`, `src/test/*`

**Stand:** 246 Tests in 8 Dateien. Abgedeckt sind `scoring` (97 %), `draw` (91 %), `restTime` (98 %), `courtConflicts`, `datetime` (92 %), `doubleElimination`, `tournamentValidation` sowie die Migrationskette gegen eine echte SQLite.

Die Coverage-Schwellen in `vitest.config.ts` sind eine Ratsche: pro Modul hoch, global knapp unter dem Ist-Wert (aktuell ~39 %). Der globale Wert steigt automatisch, sobald Logik aus den Views in testbare Module wandert (D1/D2) — die Views selbst sind bislang nicht abgedeckt.

**Offen:** Komponententests. Sie werden erst nach D1/D2 sinnvoll, weil die Views heute Datenzugriff, Formatlogik und Darstellung vermischen.

---

### [~] D5 — `Settings.tsx` (1513 Zeilen) vermischt Konfiguration, Datenbankverwaltung und Bildbearbeitung — **aufgeteilt, Ziel knapp verfehlt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/pages/Settings.tsx`, `src/pages/settings/*`

**Bisher umgesetzt:** Vier eigenständige Module — `LogoSettings` (361 Zeilen, Upload und Zuschnitt), `LivePublishSettings` (352, WordPress-Anbindung und Push-Protokoll), `AppearanceSettings` (173, Thema, Sprache, Schrift) und `UpdateSettings` (152, Aktualisierungen). `Settings.tsx` ist von 1513 auf **499 Zeilen** geschrumpft und im Wesentlichen eine Seite aus Abschnitten.

**Was fehlt:** Das Kriterium lautete „unter 200 Zeilen". Die verbleibenden 499 sind überwiegend Datenbankverwaltung — Speicherort, Sicherung, Wiederherstellung, Zurücksetzen —, die als fünftes Modul herausgelöst gehört.

**Fertig wenn:** `Settings.tsx` ist eine Seite mit Abschnitts-Komponenten, unter 200 Zeilen.

---

### [x] D6 — Keine Error Boundary — **erledigt**
**Schwere:** mittel · **Aufwand:** XS · **Dateien:** `src/components/layout/ErrorBoundary.tsx` (neu), `src/App.tsx`

**Umgesetzt:** Eine Fehlergrenze um alle Routen. Statt eines weißen Fensters — wie beim Hotfix v2.8.1 — erscheint eine verständliche Meldung mit dem Hinweis, dass die Daten gespeichert sind, einem „Neu laden"-Knopf, einem Knopf zum Kopieren der technischen Details und einem aufklappbaren Stacktrace.

---

### [x] D7 — `loadAll()` als einziges Aktualisierungsmuster — **erledigt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/pages/TournamentView/index.tsx`

**Problem:** Nahezu jede Aktion endete mit `loadAll()` — Turnier, alle Spieler der Datenbank, Teilnehmer, alle Runden, alle Spiele, alle Sätze, Zahlungsdaten und Rangliste neu laden. Bei der Ergebniseingabe, der häufigsten Handlung im laufenden Turnier, ist davon nichts nötig außer Spielen, Sätzen und Rangliste.

**Umgesetzt in zwei Schritten:**

*Parallelisierung.* Die acht Abfragen in `loadAll` liefen nacheinander, obwohl keine von der anderen abhängt — über Tauris IPC ist jede ein eigener Serialisierungs-Sprung. Jetzt ein `Promise.all`.

*Gezielte Invalidierung.* Neu ist `refreshScores`, das nur Spiele, Sätze und die daraus folgende Rangliste lädt — zwei Abfragen statt acht. Daran hängen die drei Handler, die ausschließlich Spiele verändern: Ergebniseingabe, Feldzuweisung und das Wiederöffnen eines Spiels. Die Teilnehmerliste kommt dabei aus dem State statt aus der Datenbank; alles, was sie verändert, läuft weiterhin über `loadAll` und erzeugt den Callback neu.

Strukturelle Änderungen — Runden erzeugen, Spieler hinzufügen oder abmelden, Turnierstatus — behalten bewusst den vollständigen Reload.

**Fertig wenn:** ~~Feldzuweisung und Ergebniseingabe lösen keinen Komplett-Reload mehr aus~~ — im Browser gegengeprüft: Ein Spiel per Kontextmenü vom Feld nehmen aktualisiert die Feldanzeige sofort, ohne die übrigen sieben Abfragen.

---

### [x] D8 — Kein State-/Query-Layer trotz vieler Polling-Quellen — **erledigt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/lib/usePolling.ts` (neu), `src/lib/sessionContext.ts`, `src/lib/useLivePublisher.tsx`, `src/pages/settings/LivePublishSettings.tsx`

**Problem:** Mehrere unabhängige Polling-Schleifen, jede mit eigenem `cancelled`-Flag, eigenem try/catch und eigenem Aufräumen. Vier Kopien desselben Musters sind vier Gelegenheiten, das Flag zu vergessen — und ein vergessenes Flag schreibt State in eine bereits ausgehängte Komponente.

**Umgesetzt:** `usePolling(tick, options, deps)` kapselt das Muster einmal. Der Tick bekommt eine `cancelled()`-Funktion, die er nach jedem `await` prüfen kann; Intervall, erster sofortiger Durchlauf, Pausieren, Abschalten und das Aufräumen liegen im Hook. Der Kern steckt in `startPolling`, einer gewöhnlichen Funktion — deshalb prüfen die sieben Tests den echten Code und nicht eine Nachbildung davon.

Umgestellt: der Session-Kontext, der Konfigurationslader und die Turnier-Erkennung des Live-Publishers sowie das Push-Protokoll.

**Zwei Schleifen bleiben bewusst von Hand geschrieben** und tragen jetzt eine Begründung im Code: Der Heartbeat des Publishers darf gerade *keinen* sofortigen ersten Durchlauf haben, und die Snapshot-Schleife besitzt einen Debounce-Timer, der zusammen mit dem Intervall aufgeräumt werden muss.

**Fertig wenn:** ~~Nur noch eine zentrale Refresh-Strategie im Code~~ — ein gemeinsames Polling-Grundgerüst mit zwei dokumentierten Ausnahmen. Im Browser gegengeprüft: Das Session-Dashboard bemerkt ein abgeschlossenes Spiel innerhalb des Intervalls, ohne Neuladen.

---


### [x] D9 — Datenbankschicht ist untypisiert — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/lib/db.ts`

**Umgesetzt:** Ein `SqlDatabase`-Interface beschreibt die tatsächlich genutzte Oberfläche des SQL-Plugins (`select`, `execute`); `tauriDb` ist damit typisiert statt `any`. Der localStorage-Store hat einen vollständigen Typ für die Turnier-Spieler-Verknüpfung bekommen (`StoredTournamentPlayer`), wodurch sämtliche `as any`-Zugriffe auf `retired`, `payment_status`, `seed_rank`, `team_config` und Verwandte entfallen sind. `db.ts` ist von 30 Lint-Fehlern auf 0 gegangen.

---

# E · Performance

### [x] E1 — 2,4 MB JavaScript in einem einzigen Chunk — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/App.tsx`, `src/pages/Players.tsx`, `src/components/players/ExcelImport.tsx`, `src/components/print/PrintDialog.tsx`, `src/components/print/CertificateGenerator.ts`

**Problem:** Das Startbundle war 2.394 KB. `exceljs`, `jspdf` und `html2canvas` wurden statisch importiert und landeten darin, obwohl sie nur beim Excel-Import, beim Druck und bei der Urkunde gebraucht werden. Kein `React.lazy` im Projekt.

**Umgesetzt:** Die drei schweren Bibliotheken kommen jetzt per `await import()` genau dann, wenn jemand exportiert, druckt oder eine Urkunde erzeugt — zusammen 1,5 MB, die beim Start niemand braucht. In `ExcelImport` und `CertificateGenerator` bleibt der Typ-Import stehen (`import type`), der zur Laufzeit verschwindet.

Dazu eine Route pro Seite über `React.lazy` + `Suspense`. Die Startseite bleibt bewusst statisch — sie ist das, worauf das Fenster öffnet, ein Nachladen brächte nur ein Aufblitzen des Platzhalters.

**Ergebnis:** Startbundle **264 KB** statt 2.394 KB. Größte nachgeladene Brocken: exceljs 924 KB, jspdf 404 KB, html2canvas 200 KB, die Turnieransicht 172 KB.

**Fertig wenn:** ~~Start-Chunk unter 600 KB~~ — 264 KB. Im Browser gegengeprüft: alle elf Routen laden ihren Chunk, der Excel-Export zieht `exceljs` erst beim Klick nach und erzeugt eine gültige Datei.

---

### [x] E2 — 121 Schriftdateien (~1,9 MB) für fünf Familien — **erledigt**
**Schwere:** mittel · **Aufwand:** XS · **Dateien:** `src/main.tsx`, `src/lib/fonts.ts` (neu), `src/lib/ThemeContext.tsx`, `public/`

**Problem:** Alle fünf wählbaren Familien wurden in `main.tsx` mit allen Gewichten importiert — und über den Standard-Einstiegspunkt der `@fontsource`-Pakete mit **allen Subsets**: Kyrillisch, Griechisch, Vietnamesisch und Devanagari inklusive. Tatsächlich waren es 242 Dateien mit 4,1 MB, für eine Oberfläche, die es auf Deutsch und Englisch gibt.

**Umgesetzt:** `main.tsx` lädt nur noch den lateinischen Schnitt der Standardfamilie Inter, in den fünf Gewichten, die die Oberfläche wirklich verwendet (400–800; das einzige `font-light` im ganzen Projekt rechtfertigt keine sechste Datei). Die anderen vier Familien holt `ensureFontFamily` in `src/lib/fonts.ts` nach, sobald jemand sie in den Einstellungen wählt. Schlägt der Nachladeversuch fehl, greift der System-Stack, der ohnehin hinter jeder Familie steht — eine fehlgeschlagene Schrift kostet ein anderes Schriftbild, keinen kaputten Bildschirm.

**Dabei aufgefallen — zwei Bilddateien, die zusammen mehr wogen als das JavaScript:**

`public/favicon.svg` war mit 1.200 KB kein Vektor, sondern ein 690×687-PNG, das ein Favicon-Generator in eine SVG-Hülle base64-kodiert hatte — für ein Symbol, das der Browser mit 16 bis 32 Pixeln darstellt. Ersetzt durch ein 128×128-PNG mit 40 KB.

`public/logo.png` war 844×844 groß und 1.118 KB schwer, wird aber nirgends größer als 160 CSS-Pixel angezeigt (Sidebar `w-40`, TV-Modus `w-10`). Als 512×512-WebP sind es 115 KB — genug Reserve für ein 3×-Display. Die App-Icons unter `src-tauri/icons/` sind davon unberührt.

**Ergebnis:** 50 Schriftdateien mit 1.036 KB statt 242 mit 4.136 KB; `dist` insgesamt **3,9 MB** statt 9,1 MB.

**Fertig wenn:** ~~`dist` unter 4 MB; Schriftwechsel funktioniert weiterhin~~ — beides erfüllt; im Browser gegengeprüft, dass beim Wechsel auf Montserrat die Familie nachgeladen und angewandt wird.

---

### [x] E3 — Vier Polling-Schleifen mit Voll-Reload — **erledigt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/lib/changeEvents.ts` (neu), `src/lib/db.ts`, `src/pages/TvMode.tsx`, `src/lib/sessionContext.ts`

**Problem:** Der TV-Modus lud alle 5 Sekunden das komplette Turnier neu, der Session-Kontext ebenso über alle Turniere der Session. Auf einem Hallen-Laptop ist das Dauerlast — und ein eingetragenes Ergebnis stand trotzdem bis zu fünf Sekunden lang nicht an der Wand.

**Umgesetzt:** Schreibvorgänge melden sich selbst. `notifyDataChanged` in `src/lib/changeEvents.ts` verschickt eine Änderungsmeldung an alle Fenster; 23 Schreibpfade in der Datenschicht rufen sie auf — Ergebnisse, Sätze, Kampflos, Feldzuweisung, Wiederöffnen, Spielplan, Turnierstatus und -phase.

Der Transportweg richtet sich nach der Umgebung: In Tauri der Event-Bus (`emit`/`listen`), der zuverlässig alle WebView-Fenster erreicht; im Browser-Build ein `BroadcastChannel`. Zusätzlich gibt es eine prozessinterne Zustellung, weil Schreiber und Zuhörer oft im selben Fenster sitzen und keiner der beiden Transportwege an den eigenen Absender liefert.

Das Polling bleibt als Sicherheitsnetz — für Änderungen, die ohne Meldung passieren —, aber mit 30 statt 5 Sekunden.

**Fertig wenn:** ~~Ein eingetragenes Ergebnis erscheint im TV-Modus in unter 1 Sekunde, ohne dauerhaftes Polling~~ — mit zwei Fenstern gemessen: **9 ms** von der Meldung bis zur sichtbaren Anzeige, und in zehn Sekunden Ruhe keine einzige DOM-Änderung mehr (vorher alle fünf Sekunden ein vollständiger Neuaufbau).

**Noch offen — eine Verifikation, die diese Umgebung nicht leisten kann:** Gemessen wurde der Browser-Weg über `BroadcastChannel`. Der Tauri-Weg ist implementiert und typgeprüft, aber nicht praktisch erprobt; dafür braucht es einen echten Tauri-Build mit zwei Fenstern unter Windows. Der Backlog hielt ohnehin fest, dass `BroadcastChannel` zwischen getrennten WebViews als unzuverlässig gilt — genau deshalb liegt dort jetzt der Event-Bus.

---

### [x] E4 — Schreibvorgänge in Schleifen statt Sammeloperationen — **erledigt**
**Schwere:** niedrig · **Aufwand:** S · **Dateien:** `src/lib/db.ts`, `src/lib/sessionContext.ts`, `src/test/sqliteBackend.ts`

**Problem:** `setTournamentSeeds` setzte ein `UPDATE` pro Spieler ab, `getSessionMatches` eine Abfrage pro Turnier. Jeder Aufruf ist ein IPC-Roundtrip.

**Umgesetzt:**

*Setzliste.* Ein einziges `UPDATE … SET seed_rank = CASE player_id WHEN … END`, dessen `ELSE NULL` zugleich die nicht gesetzten Spieler leert — das vorherige „erst alles auf NULL, dann N Updates" entfällt komplett. Bei 32 Setzplätzen: ein Roundtrip statt 33.

*Session-Spiele.* Neu ist `getMatchesForTournaments(ids)` mit `WHERE r.tournament_id IN (…)`. Das Dashboard fragte bisher pro Turnier einzeln ab — alle fünf Sekunden, solange es offen ist.

*Rundenerzeugung* lief bereits seit A6 über eine Transaktion; das ist jetzt belegt statt angenommen.

**Dabei aufgefallen — der Testadapter war untreu.** `getPlayerMatchUsage` prüft eine Spieler-ID gegen vier Spalten und verwendet dafür `$1` viermal bei einem einzigen Parameter. Für SQLite ist `$1` ein *benannter* Platzhalter, das ist also korrekt. Der Adapter in `sqliteBackend.ts` ersetzte aber jedes `$N` durch ein positionales `?` — aus einem Parameter wurden vier Slots, drei davon NULL. Der Test war grün, weil sein Spieler zufällig in der ersten Spalte stand. Der Adapter expandiert die Argumentliste jetzt entsprechend, und ein neuer Test stellt alle vier Spalten auf die Probe.

**Fertig wenn:** ~~Start eines Round-Robin mit 16 Spielern braucht eine Transaktion statt 120 Einzelabfragen~~ — als Test formuliert: Das Testbackend zählt Roundtrips, und drei Fälle belegen je genau einen für den 16-Spieler-Spielplan (120 Spiele), die Setzliste und die Session-Abfrage. Gegengeprüft, indem die Schleifenvariante kurz zurückgeholt wurde — der Test schlug an.

---

### [ ] E5 — 145 KB CSS — **wartet auf F1**
**Schwere:** niedrig · **Aufwand:** S · **Dateien:** `src/lib/theme.ts`, projektweit

**Problem:** Tailwind kann kaum etwas entfernen, weil die Klassennamen in `theme.ts` als Strings zusammengesetzt und über Props verteilt werden.

**Stand:** Das CSS-Bündel ist inzwischen bei **80 KB** statt 145 KB — der Rückgang stammt aus E2, wo die eingebetteten `@font-face`-Blöcke der vier nicht geladenen Familien entfielen. Die eigentliche Ursache ist unverändert und lässt sich nicht getrennt von F1 lösen: Solange die Klassen zur Laufzeit zusammengesetzt werden, sieht Tailwinds Scanner sie nicht als tot an. Das Ziel von 60 KB kommt mit der Umstellung auf CSS-Variablen.

**Fertig wenn:** CSS-Bundle unter 60 KB — gemeinsam mit F1.

---

# F · Design & Bedienung

### [x] F1 — Theme-System aus vier handgepflegten Klassen-Tabellen — **erledigt**
**Schwere:** hoch · **Aufwand:** L · **Dateien:** `src/index.css`, `src/lib/theme.ts`, `src/lib/ThemeContext.tsx`

**Problem:** Vier Themes × ~50 Schlüssel als Tailwind-Klassenstrings, die jede Komponente per `theme.cardBg` durchreichen musste. Dark Mode war ein eigener Farbsatz statt einer Variante — jede neue Komponente musste alle vier Themes bedienen, was systematisch vergessen wurde.

**Umgesetzt:** Jede Farbe hat jetzt einen semantischen Namen als CSS-Variable in `src/index.css`. `:root` trägt die hellen Flächen und den grünen Akzent; ein Theme überschreibt nur, was abweicht — Blau und Orange ändern sechs Akzentwerte und sonst nichts, Dunkel tauscht die Flächen und lässt den Akzent stehen. `@theme inline` macht die Tokens als Tailwind-Utilities verfügbar (`bg-surface`, `text-muted`, `border-line`), Verläufe als eigene `@utility`-Regeln.

`theme.ts` ist von 356 auf 265 Zeilen geschrumpft: statt vier Tabellen genau eine, deren Werte auf die Tokens zeigen. Ein Theme besteht damit aus einem Variablenblock und einem Eintrag mit Name und Farbtupfer. Das Umschalten passiert über ein `data-theme`-Attribut am Wurzelelement.

**Was das mitgelöst hat:** Die im Backlog erwähnte Ursache für Fehler wie „WP-Plugin-Zeile im Dark Mode zu dunkel" — es gibt keinen zweiten Farbsatz mehr, der auseinanderlaufen könnte.

**Fertig wenn:** ~~`theme.ts` ist auf eine Token-Definition geschrumpft; ein neues Theme entsteht durch Hinzufügen eines Variablensatzes~~ — erfüllt. Der dritte Teil („keine Komponente erhält Farben mehr als Prop") ist die Aufräumarbeit von F2: Die Komponenten lesen weiterhin `theme.x`, bekommen darüber aber ausschließlich Token-Utilities. In allen vier Themes im Browser gegengeprüft.

---

### [x] F2 — Hartcodierte Farben umgehen das Theme — **erledigt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** 40 Dateien in `src/pages` und `src/components`, `src/index.css`

**Problem:** Neben dem Theme existierten feste Klassen: `bg-amber-500`, `bg-violet-600`, `text-rose-400`, `bg-gray-100`. Im dunklen Theme entstanden dadurch Kontrastbrüche, und der TV-Modus pflegte eine eigene, parallele Farbtabelle.

**Umgesetzt:** 384 Klassen in 40 Dateien auf semantische Tokens abgebildet — Grautöne auf Flächen, Linien und Textstufen; Rosé auf `danger`, Bernstein auf `warning`, Blau auf `info`. Für die K.-o.-Phase gibt es ein eigenes Token `--phase`, statt sie mit „Information" zu vermischen: Violett kennzeichnet sie in dieser Anwendung seit jeher, und als eigenes Token bleibt sie unterscheidbar und trotzdem themefähig.

Der TV-Modus hat seine Vier-Themes-Tabelle verloren und nutzt `--accent-bright` — den hellen Akzent, den jedes Theme für dunkle Flächen ohnehin definiert. Auf dem Beamerhintergrund sind das 10,5:1 (grün), 7,9:1 (blau) und 8,9:1 (orange), alle über AAA.

**Zwei Fehler, die dabei ans Licht kamen:**

*Weiße Schrift auf `bg-amber-600` liegt bei 3,19:1* und verfehlt AA — das ist der „Nächste Runde"-Knopf, eines der meistbenutzten Bedienelemente im laufenden Turnier. Er steht jetzt auf `--warning` (amber-700) mit 5,02:1.

*Die 19 `dark:`-Klassen im Code waren an die Systemeinstellung gekoppelt, nicht an das gewählte Theme.* Tailwind v4 setzt die `dark:`-Variante standardmäßig auf `prefers-color-scheme`, und das Projekt hatte nichts anderes konfiguriert. Wer sein Betriebssystem dunkel gestellt und in der App das helle Theme gewählt hatte, bekam an diesen Stellen dunkle Farben auf hellen Flächen — und umgekehrt blieben sie im dunklen Theme aus, wenn das System hell stand. Eine `@custom-variant`-Regel bindet `dark:` jetzt an `[data-theme="dark"]`.

**Was bewusst stehen bleibt:** 190 Farbliterale, die kategorisch statt semantisch sind — Geschlechts-Badges, Medaillenränge, die dekorativen Statistikkarten und der Bronze-Akzent des Spiels um Platz 3. Sie tragen Bedeutung, die kein Theme ändern soll. Der Druck (`src/components/print/`) behält ebenfalls feste Farben: Papier ist immer weiß.

**Fertig wenn:** ~~Eine Suche nach `bg-amber-|bg-violet-|text-rose-|bg-gray-1` liefert keine Treffer mehr~~ — 0 Treffer. CSS-Bündel bei 64 KB (von 145 KB).

---

### [ ] F3 — Aktionsleiste im Turnier-Header überläuft
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/pages/TournamentView/index.tsx:2050-2260`

**Problem:** Je nach Zustand stehen bis zu zehn Knöpfe nebeneinander in einem `flex gap-2` ohne Umbruch: Bearbeiten, Vorlage, Löschen, Start, Nächste Runde, KO starten, Nächste KO-Runde, Undo, Beenden, Drucken, Live, TV. Keine Hierarchie zwischen „das ist jetzt dran" und „selten gebraucht"; auf 1200 px Fensterbreite (der konfigurierten Standardgröße!) wird es eng.

**Fix:** Eine klar hervorgehobene Primäraktion („Was ist jetzt zu tun?"), zwei bis drei Sekundäraktionen, der Rest in ein Überlaufmenü (⋯). Zustandsabhängig statt kumulativ.

**Fertig wenn:** Bei 1200 px Breite steht in jedem Turnierzustand höchstens eine Knopfreihe ohne Umbruch.

---

### [x] F4 — Drei verschiedene Bestätigungsmuster — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/components/ui/ConfirmDialog.tsx` (neu), `src/pages/SessionDetail.tsx`, `src/pages/Tournaments.tsx`

**Problem:** Gestylte Modals, ein natives `confirm()` beim Lösen eines Turniers von einer Session und ein natives `alert()` beim Vorlagen-Importfehler — optisch und im Verhalten drei Welten. Die nativen ignorieren das Theme und blockieren das ganze Fenster.

**Umgesetzt:** `useConfirm()` auf dem Modal-Fundament aus F5. Es liefert den Dialog und eine `ask`-Funktion, die auf die Antwort wartet: `if (!(await ask({ title, tone: "danger" }))) return;`. Titel, Text, Symbol, Gefahrenstufe, Beschriftungen und ein optionales Bestätigungswort sind Parameter.

Das `confirm()` in `SessionDetail` ist darauf umgestellt, das `alert()` in `Tournaments` geht durch den Toast-Mechanismus wie jede andere Fehlermeldung.

**Nicht angetastet:** Die `save()`-Aufrufe aus `@tauri-apps/plugin-dialog` — das sind Dateiauswahl-Dialoge des Betriebssystems, die genau so aussehen sollen, wie der Nutzer sie kennt.

**Fertig wenn:** ~~Keine Treffer mehr für `confirm(` und `alert(` in `src/`~~ — nur noch in Kommentaren, die die Umstellung beschreiben. Im Browser gegengeprüft.

---

### [~] F5 — Kein gemeinsames Modal-Fundament — **Fundament steht, 5 von 13 umgestellt**
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/components/ui/Modal.tsx` (neu), fünf Modal-Dateien

**Problem:** Dreizehn Modals, jedes mit eigenem Overlay-Markup. Kein Fokus-Trap, keine Fokus-Rückgabe beim Schließen, kein `role="dialog"`/`aria-modal`, kein Scroll-Sperre im Hintergrund, Escape nur vereinzelt. Ein Nutzer mit Tastatur konnte aus dem Dialog heraus in eine Seite tabben, die er nicht sieht.

**Umgesetzt:** `src/components/ui/Modal.tsx` bringt alles an einer Stelle mit — Portal, Overlay, `role="dialog"` mit `aria-modal` und `aria-labelledby`, Fokus in den Dialog beim Öffnen und zurück zum auslösenden Element beim Schließen, umlaufender Tab-Fokus, Escape, gezählte Scroll-Sperre (damit ein Dialog über einem Dialog die Seite nicht vorzeitig freigibt) und ein Fußbereich mit einheitlicher Knopfreihenfolge. Ein Klick auf den Hintergrund schließt nur dort, wo das ungefährlich ist; bei destruktiven Dialogen ist das abgeschaltet.

Dazu `ModalCancelButton` und `ModalConfirmButton` mit den Tönen `accent`, `danger`, `warning` und `phase`, damit Knopfreihenfolge und Farbgebung nicht mehr je Dialog variieren.

**Umgestellt:** `RemovePlayerModal`, `RetirePlayerModal`, `ReopenConfirmModal`, `UnpublishModal`, `RestWarningModal`. Alle fünf im Browser geprüft: Rolle und Beschriftung gesetzt, Fokus wandert hinein, Escape schließt, Fokus kehrt zum auslösenden Knopf zurück, Hintergrund wird gesperrt und wieder freigegeben.

**Was fehlt:** Acht Dialoge mit eigenem Aufbau — `AttendanceCheckModal`, `DeleteTournamentModal`, `FormatInfoModal`, `TemplateExportModal`, `EditTournamentModal`, `PlayerConflictModal`, `StartKoModal`, `UndoRoundModal`. Sie tragen mehr Inhalt als eine Bestätigung; die Umstellung ist gleichartig, aber je Datei eigene Arbeit. Bis dahin bleiben sie ohne Fokus-Trap und ohne Escape.

**Fertig wenn:** Jedes Modal schließt mit Escape, fängt den Tab-Fokus und gibt ihn beim Schließen an das auslösende Element zurück.

---

### [ ] F6 — Feldzuweisung nur per Maus
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/components/courts/CourtOverview.tsx:143-210`

**Problem:** Zuweisung erfolgt über HTML5-Drag-and-Drop plus Doppelklick. Es gibt keine Tastaturbedienung und keine Touch-Unterstützung (HTML5-DnD funktioniert auf Touchscreens nicht) — auf einem Hallen-Tablet ist die Kernfunktion damit nicht bedienbar. Der Kontextmenü-Weg (v2.9.0) deckt nur das Zurücknehmen ab.

**Fix:** Jede Match-Karte bekommt eine erreichbare Aktion „Feld zuweisen" (Menü mit freien Feldern, per Tastatur bedienbar); Drag-and-Drop bleibt als Beschleuniger. Alternativ Pointer-Events-basiertes DnD, das auch auf Touch funktioniert.

**Fertig wenn:** Ein komplettes Turnier lässt sich ausschließlich per Tastatur und ausschließlich per Touch durchführen.

---

### [ ] F7 — Lade- und Leerzustände uneinheitlich
**Schwere:** niedrig · **Aufwand:** S · **Dateien:** projektweit (`{t.common_loading}` als nackter Text)

**Problem:** Ladezustände sind meist ein unformatiertes „Wird geladen…" ohne Layout — die Seite springt beim Eintreffen der Daten. Leerzustände („noch keine Spieler", „noch keine Runde") sind je Seite unterschiedlich gestaltet, teils fehlen sie.

**Fix:** `<LoadingState>`- und `<EmptyState>`-Komponenten (Icon, Titel, erklärender Satz, primäre Handlungsaufforderung), durchgängig verwenden; Skeletons für Listen und Tabellen.

**Fertig wenn:** Jede Seite hat einen definierten Lade- und Leerzustand ohne Layoutsprung.

---

### [ ] F8 — Keine durchdachte Fenster-/Bildschirmanpassung
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/components/layout/Layout.tsx`, `src/components/layout/Sidebar.tsx`, Tabellen-Views

**Problem:** Feste Sidebar, breite Tabellen ohne horizontales Scrollen, Standardfenster 1200 × 800. Bei geteiltem Bildschirm oder auf einem 13-Zoll-Laptop bricht das Layout. Der TV-Modus ist separat gepflegt statt eine Ansichtsvariante zu sein.

**Fix:** Sidebar unter einer Breitenschwelle einklappbar (Icon-Leiste), Tabellen in scrollbare Container, Kartenlayout als Alternative für schmale Fenster; kleinste sinnvolle Fenstergröße in `tauri.conf.json` als `minWidth`/`minHeight` festlegen.

**Fertig wenn:** Bei 900 px Fensterbreite ist jede Seite vollständig bedienbar, ohne dass Inhalt abgeschnitten wird.

---

### [ ] F9 — Der nächste Schritt ist nicht erkennbar
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/pages/TournamentView/index.tsx`, `src/pages/Home.tsx`

**Problem:** Ob als Nächstes ausgelost, gestartet, ein Feld zugewiesen, die KO-Phase begonnen oder das Turnier beendet werden muss, erschließt sich nur daraus, welcher Knopf gerade sichtbar ist. Für einen Turnierleiter unter Zeitdruck ist das zu implizit — besonders bei den mehrphasigen Formaten.

**Fix:** Statusleiste unter dem Header: „Phase X von Y · N Spiele offen · Nächster Schritt: …" mit direkter Aktion. Kombinierbar mit dem bestehenden `GroupProgressBar`.

**Fertig wenn:** In jedem Turnierzustand benennt die Oberfläche den nächsten Schritt in einem Satz.

---

### [ ] F10 — Emojis als Icon-System
**Schwere:** niedrig · **Aufwand:** M · **Dateien:** projektweit

**Problem:** 🚀 🏆 🎲 ➡️ ↩️ 📦 🔓 📋 🗑️ 📺 🔗 📌 werden als Icons verwendet. Darstellung, Größe und Grundlinie unterscheiden sich je nach Betriebssystem und Schriftart; Screenreader lesen sie als Text vor („Rakete Turnier starten"); Farbanpassung ans Theme ist unmöglich.

**Fix:** Ein SVG-Icon-Set (z. B. Lucide, tree-shakebar) einführen, Emojis in funktionalen Elementen ersetzen. Wo Emojis bewusst dekorativ bleiben (TV-Modus, Medaillen), `aria-hidden="true"` setzen.

**Fertig wenn:** Alle Knöpfe und Navigationselemente verwenden SVG-Icons; verbliebene Emojis sind für Screenreader ausgeblendet.

---

# G · Barrierefreiheit

### [ ] G1 — Nahezu keine ARIA-Auszeichnung
**Schwere:** mittel · **Aufwand:** M · **Dateien:** projektweit (16 `aria-`-Vorkommen in der gesamten Anwendung)

**Problem:** Modals ohne `role="dialog"`/`aria-modal`/`aria-labelledby`, Tabs ohne `role="tablist"`/`aria-selected`, Icon-Knöpfe ohne `aria-label`, Tabellen ohne `scope`-Attribute, Fortschrittsbalken ohne `role="progressbar"`.

**Fix:** Semantisches HTML bevorzugen (`<button>`, `<nav>`, `<table>` mit `<th scope>`), ARIA nur ergänzend; Modal-Rollen zentral über F5 lösen; Tab-Leisten über ein gemeinsames `<Tabs>`-Muster.

**Fertig wenn:** Ein Durchlauf mit einem Accessibility-Prüfwerkzeug meldet auf den Hauptseiten keine kritischen Verstöße.

---

### [ ] G2 — Tastaturbedienung und Fokus-Sichtbarkeit ungeprüft
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `src/index.css`, projektweit

**Problem:** Kein globaler `:focus-visible`-Stil. Es gibt anklickbare `<div>`-Elemente ohne `tabIndex`; die Reihenfolge des Tab-Fokus wurde nie geprüft. Score-Eingabe hat eine eigene Enter/Tab-Logik, die undokumentiert ist.

**Fix:** Globalen, gut sichtbaren Fokusring über Token definieren; alle interaktiven Elemente als `<button>`/`<a>` umsetzen; Tastaturkürzel (Enter = Ergebnis bestätigen, Escape = schließen, F11 = Vollbild) an einer Stelle dokumentieren und in einer Hilfe-Übersicht anzeigen.

**Fertig wenn:** Jede Kernaufgabe (Turnier anlegen, Ergebnis eintragen, Feld zuweisen) ist rein per Tastatur mit sichtbarem Fokus durchführbar.

---

### [x] G3 — Farbkontraste nicht geprüft — **erledigt**
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/index.css`, `scripts/check-contrast.mjs` (neu), `docs/contrast.md` (neu)

**Problem:** `textMuted: "text-gray-400"` auf weißem Grund erreichte etwa 2,8:1 und verfehlte WCAG AA deutlich; bei weiteren Paaren bestand derselbe Verdacht.

**Umgesetzt:** Bei der Token-Definition (F1) wurde jedes Text-/Hintergrund-Paar durchgerechnet. Vier Verstöße kamen heraus, drei davon schwerer als vermutet:

| Paar | vorher | jetzt |
|---|---|---|
| Gedämpfter Text auf Weiß | **2,54:1** | 4,83:1 |
| Gedämpfter Text auf dunkler Fläche | **3,67:1** | 6,99:1 |
| Weiß auf grünem Primärknopf | **3,77:1** | 5,48:1 |
| Weiß auf orangem Primärknopf | **3,56:1** | 5,18:1 |

Die beiden letzten betreffen den wichtigsten Knopf der Anwendung: Grün und Orange lagen auf der 600er-Stufe, auf der weiße Schrift AA nicht erreicht. Beide stehen jetzt auf 700.

Im dunklen Theme wird der Akzent **nicht** überschrieben. Emerald-600 wirkt auf dunklem Grund gefälliger, trägt aber nur 3,77:1 mit weißer Schrift; emerald-700 hält 5,48:1 für die Beschriftung und hebt sich mit 3,23:1 von der Fläche ab — über den 3:1, die ein gefülltes Bedienelement braucht.

**Dauerhaft abgesichert:** `scripts/check-contrast.mjs` liest die Tokens direkt aus `index.css` und prüft 51 Paare über alle vier Themes; `--table` erzeugt `docs/contrast.md`. Wer einen Wert über die Grenze schiebt, bekommt einen Fehler statt einer stillen Verschlechterung. Das Skript hat sich sofort bewährt — es fand einen Verstoß, den ich selbst gerade erst eingebaut hatte.

**Fertig wenn:** ~~Alle Text-/Hintergrund-Paare erreichen mindestens 4,5:1, dokumentiert in einer Kontrasttabelle~~ — 51 von 51 bestehen; Tabelle in `docs/contrast.md`.

---

### [x] G4 — Formularfelder ohne Beschriftung, Statusänderungen ohne Ansage — **erledigt**
**Schwere:** niedrig · **Aufwand:** S · **Dateien:** `src/pages/TournamentView/components/MatchCard.tsx`, `src/lib/ToastContext.tsx`

**Problem:** Die Punkteingabefelder waren nur durch ihre Position zugeordnet — ein Screenreader nannte beim Fokussieren nichts als „Eingabefeld". Toasts wurden nicht angesagt.

**Umgesetzt:** Jedes Eingabefeld trägt eine Beschriftung aus Satznummer und Teamname, gebildet aus dem neuen Schlüssel `score_input_label` — im Browser geprüft: „Satz 1, Punkte für Spieler 2". Ungültige Eingaben sind zusätzlich mit `aria-invalid` ausgezeichnet, der Doppelpunkt zwischen den Feldern als dekorativ ausgeblendet.

Der Toast-Bereich ist eine `aria-live`-Region, die **dauerhaft im Baum bleibt** — eine Live-Region muss existieren, bevor sich ihr Inhalt ändert, sonst überhört ein Screenreader die erste Meldung. Fehler unterbrechen (`assertive`), alles andere wartet (`polite`).

**Fertig wenn:** ~~Screenreader nennt beim Fokussieren eines Score-Feldes Satz und Team; Toasts werden vorgelesen~~ — erfüllt.

---

### [x] G5 — Bewegungsreduzierung nicht berücksichtigt — **erledigt**
**Schwere:** niedrig · **Aufwand:** XS · **Dateien:** `src/index.css`

**Umgesetzt:** Eine `@media (prefers-reduced-motion: reduce)`-Regel setzt Animations- und Übergangsdauern global auf 0,01 ms und schaltet weiches Scrollen ab. Bewusst nicht auf `none`: Eine derart kurze Dauer lässt Übergänge trotzdem zu Ende laufen und ihre `transitionend`-Rückrufe auslösen, auf die einzelne Komponenten sich verlassen.

**Fertig wenn:** ~~Bei aktivierter Systemeinstellung laufen keine Animationen mehr~~ — erfüllt.

---

# H · Sprache & Texte

### [x] H1 — Die deutsche Oberfläche verwendet durchgehend keine Umlaute — **erledigt**
**Schwere:** hoch (Wahrnehmung) · **Aufwand:** S · **Dateien:** `src/lib/i18n/de.ts`, `src/lib/i18n/format.ts` (neu), `src/lib/scoring.ts`, `scripts/check-i18n-keys.mjs`

**Umgesetzt:** `de.ts` ist vollständig auf korrekte Rechtschreibung umgestellt — rund 250 Ersatzschreibungen, einschließlich der ß-Fälle („Größe", „Schließen", „Straße", „großen"). Der Turnierleiter liest jetzt „Verlängerung", „Sportstätte", „Löschen", „zurück", „Überweisung".

**Dabei aufgefallen und mitbehoben — drei Fehler, die den Text kaputt gemacht haben:**

*Deutscher Text in der englischen Oberfläche.* `getScoringDescription` in `scoring.ts` und die sieben Fehlermeldungen von `isScoreValid` waren fest verdrahtetes Deutsch. Wer die App auf Englisch stellte, bekam trotzdem „Rallypoint bis 21, Verlaengerung bei 20:20" und „Bei 30 muss der Gegner mind. 28 haben". Beide Funktionen geben jetzt Übersetzungsschlüssel plus Parameter zurück; die Ansicht setzt sie ein.

*Rohe Platzhalter auf dem Bildschirm.* Es gibt keinen Interpolationshelfer — jede Stelle schrieb ihr eigenes `.replace("{count}", …)`, und zwei vergaßen es: die Kopfzeile zeigte „Gewinnsätze (Best of {count})" und das Sitzungs-Dashboard „+ 3 +{count} weitere". Neu ist `src/lib/i18n/format.ts` mit `fill(template, params)` und sechs Tests.

*„Best of 3" war unübersetzbar* — hart kodiertes Englisch mitten in der deutschen Ansicht, obwohl der Schlüssel dafür existierte.

**Wächter gegen Rückfälle:** `check-i18n-keys.mjs` prüft jetzt zusätzlich (a) ASCII-Ersatzschreibungen in `de.ts`, mit Positivliste für „aktuell", „Dauer", „neue", „zuerst" und die englischen Fachbegriffe, und (b) Schlüssel mit Platzhaltern, die als `{t.key}` roh gerendert werden. Beide Prüfungen wurden gegen die tatsächlichen Fehler gegengeprüft: absichtlich zurückgedreht, Meldung erschien, wieder behoben.

**Nicht angetastet:** `PaymentMethod = "ueberweisung"` in `types.ts` ist ein gespeicherter Datenbankwert, kein Anzeigetext — eine Umbenennung bräuchte eine Migration ohne sichtbaren Gewinn, da die Anzeige ohnehin über die Übersetzung läuft.

**Fertig wenn:** ~~Kein Ersatzschreibungs-Treffer mehr in `de.ts`~~ — 0 Treffer, im Browser auf Deutsch und Englisch gegengeprüft.

---

### [ ] H2 — 55 ungenutzte Übersetzungsschlüssel
**Schwere:** niedrig · **Aufwand:** XS · **Dateien:** `src/lib/i18n/de.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/types.ts`

**Problem:** `pnpm check:i18n` meldet 55 ungenutzte Schlüssel (u. a. `tournament_unsaved_warning`, `tournaments_delete_confirm_word`, `stats_by_status`). Teils Reste entfernter Funktionen, teils Hinweis auf nie fertiggestellte Features. Das Skript existiert, wird aber von nichts erzwungen.

**Fix:** Jeden Schlüssel prüfen: entfernen oder die zugehörige Funktion nachziehen. `check:i18n` anschließend in CI verpflichtend machen (J1).

**Fertig wenn:** `pnpm check:i18n` meldet 0 ungenutzte Schlüssel und läuft in CI.

---

### [ ] H3 — Deutsche Changelog-Abschnitte im englischen README
**Schwere:** niedrig · **Aufwand:** S · **Dateien:** `README.md` (46 KB), `README_DE.md` (34 KB)

**Problem:** Ab v2.7 sind die Versionsabschnitte auf Deutsch mitten im englischen Dokument („Match per Rechtsklick zurueck in die Warteschlange (v2.9.0)"). Beide READMEs sind zugleich Feature-Dokumentation und Changelog und dadurch für Neueinsteiger unbrauchbar lang.

**Fix:** `CHANGELOG.md` abspalten (Keep-a-Changelog-Format), README auf Zweck, Screenshots, Installation, Kurzüberblick und Entwicklungshinweise kürzen (Ziel: unter 300 Zeilen), deutsche und englische Fassung inhaltlich abgleichen.

**Fertig wenn:** README unter 300 Zeilen, Changelog vollständig ausgelagert, beide Sprachen konsistent.

---

### [ ] H4 — Deutsche Texte im Code statt in der Übersetzung
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/lib/types.ts:120,220,227,234`, `src/lib/db.ts:392`, `src/lib/scoring.ts:88,222`, `src-tauri/src/lib.rs` (alle Fehlermeldungen)

**Problem:** `MODE_LABELS`, `FORMAT_LABELS`, `STATUS_LABELS`, `PAYMENT_METHOD_LABELS` sind fest deutsch; Validierungsfehler aus `scoring.ts` („Punkte duerfen nicht negativ sein") ebenfalls; die Rust-Kommandos geben deutsche Fehlertexte zurück, die im UI unübersetzt erscheinen. Bei englischer Spracheinstellung mischen sich beide Sprachen.

**Fix:** Label-Konstanten entweder entfernen (i18n-Schlüssel existieren bereits parallel!) oder als Schlüsselreferenzen umbauen; Validierungsfehler als Fehlercodes zurückgeben und im UI übersetzen; Rust-Fehler als Codes statt Klartext liefern.

**Fertig wenn:** Bei englischer Spracheinstellung erscheint kein deutscher Text mehr — auch nicht in Fehlermeldungen.

---

### [ ] H5 — Datums- und Zahlenformate teilweise fest auf `de-DE`
**Schwere:** niedrig · **Aufwand:** XS · **Dateien:** `src/components/courts/CourtTimer.tsx:53`, `src/pages/SessionDashboard.tsx:242`, `src/pages/TournamentCreate.tsx:56`

**Problem:** `toLocaleTimeString("de-DE")` und manuell zusammengebaute Datumsformate (`DD.MM.YYYY`) ignorieren die gewählte Sprache; Startgeldbeträge werden ohne `Intl.NumberFormat` formatiert.

**Fix:** Aktive Sprache aus dem I18n-Kontext an `Intl.DateTimeFormat`/`Intl.NumberFormat` durchreichen; zentrale Formatierungshelfer (zusammen mit C3).

**Fertig wenn:** Sprachumschaltung ändert auch Datums-, Zeit- und Währungsdarstellung.

---

# I · Sicherheit & Datenschutz

### [ ] I1 — Content-Security-Policy erlaubt beliebige Ziele
**Schwere:** mittel · **Aufwand:** XS · **Dateien:** `src-tauri/tauri.conf.json:23`

**Problem:** `connect-src 'self' ipc: … https: http:` erlaubt Verbindungen zu jedem beliebigen Host, auch unverschlüsselt. Für eine App, die genau einen konfigurierbaren Endpunkt anspricht, ist das unnötig weit — und `http:` bedeutet, dass das Shared Secret im Klartext über das Netz gehen kann.

**Fix:** `http:` streichen (nur `https:` erlauben), im Einstellungsdialog HTTP-Endpunkte ablehnen oder mit deutlicher Warnung versehen. Die `http:`-Regel in `capabilities/default.json` entsprechend entfernen.

**Fertig wenn:** Ein `http://`-Endpunkt wird beim Speichern abgelehnt; die CSP enthält kein `http:` mehr.

---

### [ ] I2 — Live-Push-Secret im Klartext gespeichert und angezeigt
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src/lib/livePublish.ts:24`, `src/pages/Settings.tsx`, `wordpress-plugin/boss-live-results/boss-live-results.php:210`

**Problem:** Das gemeinsame Geheimnis liegt unverschlüsselt in `app_settings` (also in jedem `.db`-Backup, das der Nutzer weitergibt) und wird sowohl im Desktop-Einstellungsdialog als auch im WordPress-Adminbereich als `type="text"` im Klartext angezeigt.

**Fix:** Im WordPress-Adminbereich `type="password"` mit „Anzeigen"-Umschalter; im Desktop dasselbe. Secret aus dem Vorlagen-Export und aus jeder Log-/Fehlerausgabe fernhalten (prüfen!). Optional: Speicherung im Betriebssystem-Schlüsselbund über ein Tauri-Plugin.

**Fertig wenn:** Das Secret ist nirgends im Klartext sichtbar und in keiner exportierten Datei enthalten (außer bewusst im Backup, dann dokumentiert).

---

### [ ] I3 — WordPress-Endpunkt ohne Begrenzung, personenbezogene Daten öffentlich
**Schwere:** mittel · **Aufwand:** M · **Dateien:** `wordpress-plugin/boss-live-results/boss-live-results.php:44-140`

**Problem:** `/push` hat `permission_callback => '__return_true'` mit manueller Secret-Prüfung (korrekt via `hash_equals`), aber keine Ratenbegrenzung und keine Größenprüfung — der Payload wird 1:1 als Post-Inhalt gespeichert. `/tournaments` lädt mit `numberposts => -1` alles. Zudem veröffentlicht die Anwendung Vor- und Nachnamen sowie Vereinszugehörigkeit von Vereinsmitgliedern auf einer öffentlichen Website; das ist eine Verarbeitung personenbezogener Daten, für die es weder einen Hinweis noch eine Einwilligungsmöglichkeit gibt.

**Fix:** Größenlimit und einfache Ratenbegrenzung für `/push`; `numberposts` begrenzen und paginieren; im Desktop beim Aktivieren von Live-Ergebnissen einen Datenschutzhinweis anzeigen und optional Anzeige nur mit abgekürztem Nachnamen („Max M.") oder ohne Verein anbieten.

**Fertig wenn:** Endpunkte sind begrenzt; beim Aktivieren erscheint ein Datenschutzhinweis mit wählbarer Anonymisierungsstufe.

---

### [ ] I4 — „Ordner öffnen" funktioniert genau dann nicht, wenn man es braucht
**Schwere:** niedrig · **Aufwand:** XS · **Dateien:** `src-tauri/src/lib.rs:180-206`

**Problem:** `open_folder` verweigert jeden Pfad außerhalb des App-Datenverzeichnisses — bei einem benutzerdefinierten Datenbankordner (die Funktion, für die der Knopf existiert) schlägt er also immer fehl. Zusätzlich ist nur der Windows-Zweig implementiert; unter macOS und Linux gibt die Funktion stillschweigend `Ok(())` zurück, ohne etwas zu tun.

**Fix:** Erlaubte Pfade auf „App-Datenverzeichnis **oder** konfigurierter DB-Ordner" erweitern; `open`/`xdg-open` für macOS und Linux ergänzen; bei nicht unterstützten Plattformen einen echten Fehler zurückgeben statt Erfolg vorzutäuschen.

**Fertig wenn:** Der Knopf öffnet den tatsächlich verwendeten Datenbankordner auf allen unterstützten Plattformen — oder meldet verständlich, warum nicht.

---

### [ ] I5 — Backup-Datei ohne Integritätsschutz, kein automatisches Backup
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src-tauri/src/lib.rs:113`, `src/pages/Settings.tsx:182`

**Problem:** Backups sind manuell und werden nur beim Restore per Header-Prüfung als SQLite erkannt (gut), aber es gibt keine Schema-Versionsprüfung: eine neuere Backup-Datei lässt sich in eine ältere App-Version einspielen. Ein automatisches Backup vor riskanten Aktionen (Restore, Wipe, Migration) existiert nicht — bei einem Turnier mit 60 Teilnehmern ist Datenverlust das teuerste Fehlerbild überhaupt.

**Fix:** Schema-Version aus dem Backup lesen und bei Inkompatibilität ablehnen; automatisches Sicherheitsbackup (Rotation über die letzten 5) vor Restore, Wipe und jeder Migration; sichtbarer Hinweis, wo diese liegen.

**Fertig wenn:** Vor jeder destruktiven Aktion entsteht automatisch ein Backup; inkompatible Backups werden mit klarer Meldung abgelehnt.

---

# J · Werkzeuge, Tests, Auslieferung, Dokumentation

### [x] J1 — Keine kontinuierliche Integration für Qualitätsprüfungen — **erledigt**
**Schwere:** hoch · **Aufwand:** XS · **Dateien:** `.github/workflows/ci.yml`

**Problem:** Der einzige Workflow ist `release.yml` und läuft nur bei Tags. Typprüfung, Lint, i18n-Prüfung und Build laufen nie automatisch — deswegen sind 59 Lint-Fehler und 55 tote Übersetzungsschlüssel aufgelaufen.

**Umgesetzt:** `ci.yml` läuft bei jedem Push und Pull Request, mit zwei Jobs:
- **frontend** — `tsc -b`, `pnpm test:coverage`, `vite build` (blockierend); `pnpm lint` und `pnpm check:i18n` als Hinweis (`continue-on-error`), weil beide noch Altlasten melden.
- **rust** — Linux-Build-Abhängigkeiten, Frontend-Build (für `generate_context!`), `cargo check --locked` (blockierend), `cargo clippy` als Hinweis.

**Offen:** `continue-on-error` bei Lint entfernen, sobald D3 erledigt ist; dasselbe bei `check:i18n` nach H2. Beim ersten Lauf prüfen, ob `cargo check` in der Linux-Umgebung durchläuft (bisher wurde nur unter Windows/macOS gebaut — siehe J3).

---

### [x] J2 — Test-Infrastruktur einrichten — **erledigt**
**Schwere:** hoch · **Aufwand:** S (Setup) · **Dateien:** `vitest.config.ts`, `tsconfig.test.json`, `src/test/factories.ts`, `src/test/migrations.test.ts`, `src/lib/*.test.ts`

**Problem:** Voraussetzung für D4 und für die gesamte Phase 2 — ohne Tests ist der Umbau der Turnierlogik ein Blindflug.

**Umgesetzt:** Vitest mit v8-Coverage; Skripte `test`, `test:watch`, `test:coverage`; eigenes TypeScript-Projekt `tsconfig.test.json` (Node-Typen), Testdateien aus dem App-Build ausgeschlossen. **130 Tests**, davon 11 als `it.fails` markierte Belege für bekannte Fehler:

| Datei | Inhalt |
|---|---|
| `src/lib/scoring.test.ts` | Satzgültigkeit, Auto-Fill (inkl. Konsistenzprüfung über alle fünf Punktsysteme), Siegerermittlung, Einzel- und Team-Rangliste |
| `src/lib/draw.test.ts` | Alle neun Formate: Rundenturnier, KO mit Setzliste, Zufallsdoppel, Mixed, Swiss, Monrad, King of the Court, Waterfall, Gruppenaufteilung |
| `src/lib/restTime.test.ts` | Ruhezeiten inkl. Grenzwerte und Batch-/Einzelabgleich |
| `src/lib/courtConflicts.test.ts` | Doppelbelegung von Spielern und Feldern |
| `src/test/migrations.test.ts` | Führt die echte Migrationskette aus `lib.rs` gegen In-Memory-SQLite aus und prüft Tabellen, Spalten und Constraints |

**Offen:** Weitere Module abdecken, sobald sie testbar sind (`stats.ts`, `groupProgress.ts`, `undoTarget.ts`, `livePublish.ts`-Snapshot); Komponententests erst nach D1/D2 sinnvoll.

---

### [ ] J3 — Release baut kein Linux-Paket
**Schwere:** niedrig · **Aufwand:** XS · **Dateien:** `.github/workflows/release.yml`

**Problem:** Die Matrix enthält Windows und zwei macOS-Ziele. Das README wirbt mit „cross-platform desktop application", Linux fehlt.

**Fix:** `ubuntu-latest` mit den nötigen Systemabhängigkeiten ergänzen (AppImage/deb) — oder die Aussage im README auf Windows und macOS korrigieren. Passt inhaltlich zu I4 (plattformspezifischer Code nur für Windows).

**Fertig wenn:** Entweder erzeugt der Release ein Linux-Artefakt, oder die Dokumentation nennt die unterstützten Plattformen korrekt.

---

### [ ] J4 — Versionsnummern an drei Stellen, `package.json` steht auf 0.0.0
**Schwere:** niedrig · **Aufwand:** XS · **Dateien:** `package.json:4`, `src-tauri/tauri.conf.json:4`, `wordpress-plugin/boss-live-results/boss-live-results.php:5,22`

**Problem:** `package.json` = `0.0.0`, `tauri.conf.json` = `2.9.0`, WordPress-Plugin = `1.0.5`. Die App-Version wird im Live-Snapshot mitgesendet — welche Quelle dort landet, ist nicht offensichtlich.

**Fix:** Eine führende Quelle festlegen (`tauri.conf.json`) und die übrigen daraus generieren oder per Release-Skript synchronisieren; Kompatibilitätsmatrix App-Version ↔ Plugin-Version dokumentieren.

**Fertig wenn:** Ein Versionssprung erfordert genau eine Änderung; alle angezeigten Versionen stimmen überein.

---

### [ ] J5 — Kein Diagnose-/Fehlerprotokoll für den Turnierleiter
**Schwere:** mittel · **Aufwand:** S · **Dateien:** `src-tauri/src/lib.rs:440` (Logger nur bei `debug_assertions`), `src/lib/ToastContext.tsx`

**Problem:** `tauri-plugin-log` ist nur im Debug-Build aktiv. In der ausgelieferten Anwendung landen Fehler ausschließlich in der Browser-Konsole, an die der Nutzer nicht herankommt. Tritt in der Halle ein Fehler auf, gibt es nichts zu melden außer „ging nicht".

**Fix:** Logging auch im Release aktivieren (Datei im App-Datenverzeichnis, Rotation), Frontend-Fehler (`console.error`, Error Boundary aus D6, Live-Push-Fehler) dorthin schreiben, und in den Einstellungen einen Knopf „Diagnosedaten exportieren" anbieten.

**Fertig wenn:** Ein reproduzierter Fehler ist in einer exportierbaren Logdatei nachvollziehbar.

---

### [ ] J6 — Keine Entwicklerdokumentation zur Architektur
**Schwere:** niedrig · **Aufwand:** S · **Dateien:** `CLAUDE.md` oder `docs/ARCHITECTURE.md` (neu)

**Problem:** Es gibt keine `CLAUDE.md` und keine Architekturübersicht. Wissen wie „`num_groups` speichert bei Swiss die Rundenzahl", „Monrad läuft unter `phase='swiss'`" oder „`qualify_per_group` enthält seit v2.6 die KO-Größe, nicht die Anzahl pro Gruppe" steckt ausschließlich in Kommentaren mitten im Code — genau solche Altlasten erzeugen die Fehler in diesem Backlog.

**Fix:** Kurze Architekturseite: Datenmodell mit Diagramm, Bedeutung der Sonderfelder, Format-Matrix (welches Format nutzt welche Phasen/Spalten), Lebenszyklus eines Turniers, Live-Publishing-Ablauf. Zusätzlich `CLAUDE.md` mit Projektkonventionen für künftige Sitzungen.

**Fertig wenn:** Ein neuer Mitwirkender versteht Datenmodell und Turnier-Lebenszyklus, ohne `TournamentView/index.tsx` zu lesen.

---

## Was bereits gut ist (nicht anfassen)

- `src/lib/restTime.ts`, `src/lib/courtConflicts.ts`, `src/lib/groupProgress.ts`, `src/pages/TournamentView/lib/undoTarget.ts` — kleine, reine, sauber dokumentierte Module. Das ist der Zielzustand für den Rest.
- Spielerkonflikt-Prüfung bei der Feldzuweisung (harte Sperre, kein Umgehen) — sachlich richtig gelöst.
- Ruhezeiten-Warnung mit bewusstem Übergehen-Pfad — gute Unterscheidung zwischen „physisch unmöglich" und „unerwünscht".
- Live-Publishing: Änderungssignatur zur Vermeidung überflüssiger Übertragungen, Backoff, Push-Protokoll, sparsamer öffentlicher Datensatz (keine Geburtsdaten, keine Zahlungsdaten).
- WordPress-Frontend arbeitet konsequent mit `textContent` statt `innerHTML` — keine XSS-Fläche.
- Sicherheitsprüfungen beim Wiederherstellen (SQLite-Header) und beim Löschen von Sportstätten (Nutzungsprüfung mit Begründung).
- Der Wipe-über-Neustart-Marker ist die technisch korrekte Lösung — sie sollte auf Restore und Ordnerwechsel übertragen werden (A7).
