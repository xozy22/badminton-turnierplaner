<p align="center">
  <img src="public/logo.png" alt="BOSS - Badminton Operating and Scheduling System" width="300" />
</p>

<h1 align="center">BOSS - Badminton Operating &amp; Scheduling System</h1>

<p align="center">
  Eine plattformuebergreifende Desktop-Anwendung zur Planung und Durchfuehrung von Badminton-Turnieren.<br/>
  Gebaut mit <a href="https://tauri.app/">Tauri 2</a>, React, TypeScript und SQLite. Verfuegbar auf Englisch und Deutsch.
</p>

<p align="center">
  <a href="https://github.com/xozy22/boss-badminton">GitHub Repository</a> &middot;
  <a href="README.md">🇬🇧 English Version</a> &middot;
  <a href="CHANGELOG.md">Changelog</a>
</p>

## Screenshots

| Turnierbetrieb (Spiele) | Rangliste |
|---|---|
| ![Spiele](screenshots/turnierbetrieb-spiele.png) | ![Rangliste](screenshots/turnierbetrieb-rangliste.png) |

| Verwaltung (Startgeld + Teilnehmer) | Spielerverwaltung |
|---|---|
| ![Verwaltung](screenshots/turnierbetrieb-verwaltung.png) | ![Spieler](screenshots/spielerverwaltung.png) |

| Turnier-Wizard |
|---|
| ![Wizard](screenshots/wizard-einstellungen.png) |

## Features

### Turnierverwaltung
- **9 Formate**: Jeder gegen Jeden, KO-System, Wechselnde Partner, Gruppenphase + KO, Schweizer System, Doppel-KO, Monrad, King of the Court, Waterfall
- **Format-Info-Modal**: Ausfuehrliche Beschreibung mit ASCII-Diagramm und Vor-/Nachteile fuer jedes Format
- **3 Modi**: Einzel, Doppel, Mixed
- **5 Punktemodi** (unabhaengig konfigurierbar): 11 Pkt Harter Cap, 11 Pkt Verlaengerung bis 20, 15 Pkt Harter Cap, 15 Pkt Verlaengerung bis 25, 21 Pkt Verlaengerung bis 30 (Standard)
- **Gewinnsaetze** (unabhaengig konfigurierbar): Best of 1, Best of 3, Best of 5 — separat vom Punktemodus gespeichert, sodass jede Kombination moeglich ist
- Auto-Fill, Validierung und Gewinner-Logik passen sich automatisch an Punktemodus und Gewinnsaetze an
- **Turnier-Wizard**: Schrittweise Erstellung mit Tab-Navigation (Einstellungen -> Spieler -> Teams -> Setzliste -> Erstellen)
  - Auto-Save bei jedem Schritt - kein Datenverlust beim Wechseln zwischen Tabs
  - Draft-Zusammenfassung mit allen Einstellungen und Teilnehmern vor dem Start
  - Start-Button erst nach Wizard-Abschluss und Team-Validierung aktiviert
  - Vereinsfilter + Geschlechterfilter + Suche bei Spielerauswahl
  - Auto-Fokus Suchfeld nach Auswahl fuer schnelles Hinzufuegen; Suchtext wird automatisch markiert sodass sofort eine neue Suche eingegeben werden kann
  - Ausgewaehlte Spieler als farbige Chips (blau/pink nach Geschlecht)
- **Manuelle Team-Zuordnung**: Zwei Spieler nacheinander anklicken bildet ein Team in Doppel/Mixed
  - Mixed-Modus: Damen/Herren in getrennten Spalten, gleiches Geschlecht ausgegraut
  - "Restliche automatisch zuordnen" fuer schnelles Auffuellen
  - Teams werden persistiert und beim Bearbeiten wiederhergestellt
  - Turniererstellung blockiert bis alle Teams gebildet sind
- **Separates KO-Scoring**: Beim Starten der KO-Phase im Format Gruppenphase + KO kann optional ein anderer Punktemodus und andere Gewinnsätze für die KO-Runden eingestellt werden (z.B. Best of 1 in der Gruppe, Best of 3 im KO)
- **Smarte KO-Qualifikation**: KO-Bracket-Groesse waehlbar (4/8/16/32), automatisch mit besten Nachrueckern aufgefuellt
- **Prozentuale Rangliste**: Siegquote %, Satzquote %, Punktequote %
- **Startgeld-Verwaltung**: Intelligente Abrechnung pro Person oder pro Team
  - Feste Teams (KO, Gruppen+KO, Doppel-KO): Eine Zahlung pro Team, Partner automatisch als bezahlt markiert
  - Nicht-feste Teams + Einzel: Individuelle Zahlung pro Spieler
  - Zahlungsstatus pro Spieler (Bar, Ueberweisung, PayPal) mit editierbarem Datum
  - Bezahlter (gruen) und offener (rot) Betrag im Header sichtbar
  - Uebersicht mit Gesamtsumme, gruppiert nach Verein
- **Setzliste/Seeding**: Pro Spieler per Checkbox auswaehlen wer gesetzt ist (Opt-In, standardmaessig niemand gesetzt), dann per Drag & Drop oder Pfeiltasten sortieren — unterstuetzt fuer KO, Doppel-KO und Gruppenphase + KO (Einzel); ungesetzte Spieler werden zufaellig zugelost
  - **Snake-Verteilung auf Gruppen**: 4 Gruppen + 8 Gesetzte → G1=[1,8], G2=[2,7], G3=[3,6], G4=[4,5] — Top-Seeds werden gleichmaessig verteilt statt frueh aufeinander zu treffen
- **Vorlagen-System** (v2, cross-PC-faehig): Turniere als JSON-Datei exportieren/importieren
  - Waehlbar: Einstellungen, Spieler, Teams (einzeln oder kombiniert)
  - **Vollstaendige Spielerdaten** (Vorname, Nachname, Geschlecht, Geburtsdatum, Verein) werden exportiert — nicht nur Anzeigenamen
  - **Auto-Anlage beim Import**: Spieler, die auf dem Ziel-PC noch nicht existieren, werden automatisch in der Spielerverwaltung angelegt
  - **ID-Remapping**: Teams werden ueber eine interne ID-Map neu verknuepft, so dass Paarungen auch bei unterschiedlichen Spieler-IDs erhalten bleiben
  - **Hallen-Konfiguration** (Multi-Hallen-Setups mit Feldanzahlen) bleibt erhalten
  - **Zusammenfassungs-Dialog** nach dem Import zeigt wie viele Spieler zugeordnet / neu angelegt / uebersprungen wurden und wie viele Team-Paarungen uebernommen wurden
  - Rueckwaertskompatibel mit v1-Vorlagen (Gesamtname wird in Vor- und Nachname gesplittet)
  - Export nutzt nativen Speichern-Dialog in der gepackten App (EXE/DMG)
  - **Import-Button** auf der Turnierliste — oeffnet nativen Datei-Dialog, legt Turnier mit allen Einstellungen an und fuegt passende Spieler direkt hinzu, navigiert dann in den Wizard
- **Archivierung**: Beendete Turniere archivieren und wiederherstellen
- **Turnier wieder oeffnen**: Versehentlich beendete Turniere reaktivieren
- **Letzte Runde rueckgaengig**: Letzte Runde loeschen und zurueck — im Format Gruppenphase + KO wird beim Rueckgaengig der KO-Runde die Gruppenphase wiederhergestellt (KO starten erscheint wieder), beim Rueckgaengig aller Gruppenrunden wird der Vor-Start-Zustand hergestellt
- **Verletzung/Aufgabe mit Rueckgaengig**: Spieler als verletzt markieren (Walkovers fuer offene Spiele), fuer zukuenftige Runden wiederherstellen (Walkovers bleiben erhalten)
- **Anwesenheitscheck**: Vor der Auslosung zeigt ein Modal alle angemeldeten Spieler mit Checkboxen (alle standardmaessig aktiviert). Abwesende Spieler abwaehlen — sie werden vor der Auslosung aus dem Turnier entfernt, was weniger Freilose und eine fairere Auslosung ergibt
- **Auto-Benennung**: Turniername automatisch generiert aus Datum + Modus + Format, editierbar
- **Speichern-Bestaetigung**: Gruener Toast bestätigt dass alle Änderungen (Einstellungen, Spieler, Teams, Hallen) nach dem Bearbeiten eines Turnier-Drafts gespeichert wurden
- **Einheitliche Toast-Benachrichtigungen**: Ein globaler Toast-Kontext (`useToast`) ersetzt native Browser-Alerts fuer Speicher-Bestaetigungen, Import-Zusammenfassungen und Fehlermeldungen in der gesamten App — nicht blockierend, stapelbar, selbst-schliessend

### Spielerverwaltung
- **Vorname + Nachname** als separate Felder
- **Geburtsdatum** mit automatisch berechnetem Alter
- **Verein** mit Autocomplete-Dropdown (vorhandene Vereine vorgeschlagen, Freitext fuer neue)
- **Excel-Import** (ExcelJS) mit Spaltenmapping und Fuzzy-Duplikaterkennung (Levenshtein-basierte Aehnlichkeitspruefung erkennt Tippfehler wie "Schmidt" vs "Schmitt")
  - Spaltenheader werden automatisch anhand von DE-/EN-Keywords erkannt und vorbelegt — manuell ueberschreibbar
  - Kein Aufteilen von Daten: Vorname und Nachname bleiben immer in separaten Spalten
  - Live-Vorschau im Mapping-Schritt zeigt Vorname und Nachname als separate Spalten
  - DD.MM.YYYY, YYYY-MM-DD, MM/DD/YYYY Datumsformate automatisch erkannt
- **Excel-Import im Turnier-Wizard**: Spieler direkt bei Erstellung importieren, alle automatisch ausgewaehlt
- **Excel-Export** mit nativem Speichern-Dialog (Vorname, Nachname, Geburtsdatum, Alter, Verein)
- **Sortierbare Spalten**: Klick auf Header sortiert nach Vor- oder Nachname (auf-/absteigend)
- **Geschlechterfilter + Suche** bei der Spielerauswahl
- **Verletzung/Aufgabe**: Gestylter Modal-Dialog mit Team-Auswirkungs-Warnung; feste Teams schliessen Partner automatisch aus, wechselnde Partner schliessen nur den verletzten Spieler aus
- **Spieler-Entfernen-Bestaetigung**: Das Loeschen eines Spielers aus der zentralen Spielerverwaltung laeuft jetzt ueber einen gestylten Bestaetigungs-Modal (kein natives `confirm()`-Popup mehr) mit Anzeige des Spielernamens; die Liste bleibt reaktionsfaehig, da der Loeschvorgang als Async-Action mit Spinner-Feedback ausgefuehrt wird

### Sportstaetten
- **Hallen mit individueller Feldanzahl**: Jede Sportstaette hat mehrere Hallen, jede Halle eigene Felder
- Inline Hallen-Editor: Name + Feldanzahl pro Halle, Hinzufuegen/Entfernen
- **JSON Export/Import**: Sportstaetten als Datei exportieren und importieren (nativer Speichern-Dialog in der gepackten App)
- **Turnier-Integration**: Bei Turniererstellung Sportstaette waehlen, Hallen per Checkbox auswaehlen; Sportstaetten-Auswahl wird gespeichert und beim erneuten Bearbeiten eines Turnier-Drafts wiederhergestellt
- **Gruppierte Court-Anzeige**: Felder im Turnier nach Halle gruppiert mit Sektions-Headern
- **Standard-Hallen in Einstellungen**: Greifen wenn keine Sportstaette gewaehlt

### Spielbetrieb
- **Feldzuweisung**: Spiele per Drag & Drop oder Doppelklick auf Spielfelder ziehen
  - Belegte Felder werden erkannt und blockiert (runden-uebergreifend konsistent)
  - Doppelklick auf wartendes Spiel: Feld-Auswahl per Popup (bei 1 freien Feld: direkte Zuweisung)
  - Doppelklick auf belegtes Feld: Scrollt zum Spiel und fokussiert das erste Eingabefeld
  - Timer startet automatisch bei Zuweisung, zeigt Spieldauer in Akzentfarbe
  - Ergebniseingabe erst nach Feldzuweisung moeglich
- **Smarte Match-Ansicht**: Automatische Sortierung nach Status
  - "Auf dem Feld": Laufende Spiele mit voller Ergebniseingabe
  - "Beendet": Kompakte Einzeiler mit Satzstand + Einzelpunkten (z.B. 2:0 (21:15, 21:18)), aufklappbar
  - 3-Sekunden-Delay: Frisch beendete Spiele bleiben kurz sichtbar bevor sie nach unten rutschen
  - Bearbeitete Spiele bleiben in der Beendet-Sektion (kein Hochrutschen)
- **Auto-Fill Score**: Badminton Rallypoint-System — berechnet Gegner-Score automatisch basierend auf dem aktiven Spielmodus
- **Score-Validierung**: Ungueltige Ergebnisse werden erkannt und markiert
- **Gewinner-Auto-Reset**: Bei Ergebniskorrektur wird der Gewinner automatisch zurueckgesetzt
- **Faire Auslosung**: Bei ungerader Spielerzahl setzt der Spieler mit den meisten Spielen aus; bei wechselnden Partnern werden bisherige Partnerschaften gewichtet vermieden
- **Vorzeitiges Losen**: Bei Wechselnden Partnern und Jeder-gegen-Jeden (Doppel/Mixed) kann die nächste Runde ausgelost werden, sobald ein Spiel der aktuellen Runde abgeschlossen ist — ohne auf alle Felder warten zu müssen. Die neuen Spiele erscheinen in der Queue unterhalb einer „— Runde N —" Trennlinie und können sofort freien Feldern zugewiesen werden
- **Court-Timer**: Konfigurierbare Warnung (gelb) und Kritisch (rot) Schwellenwerte
- **Mindest-Ruhezeit**: Optionale Einstellung pro Turnier (in Minuten) — beim Zuweisen eines Matches zeigt ein Warnmodal alle Spieler, die seit ihrem letzten beendeten Spiel noch nicht lange genug pausiert haben, inklusive verbleibender Minuten; der Turnierleiter entscheidet und kann mit "Trotzdem zuweisen" durchgehen
- **Ruhezeit-Indikator am Spieler**: Solange die Pausezeit eines Spielers noch laeuft, erscheint ein kleines Uhrsymbol (⏱) neben seinem Namen ueberall wo er waehrend des Turniers auftaucht — MatchCards, Platzuebersicht, TV-Modus und KO-Bracket. Tooltip zeigt verbleibende Minuten. Das Symbol verschwindet automatisch nach einer Minute ohne Refresh und verursacht null Kosten wenn `min_rest_minutes = 0`.

### TV-/Beamer-Modus
- **Separates Vollbild-Fenster** optimiert fuer Querformat und Lesbarkeit aus der Ferne
- **Badminton Court SVG** als Hintergrundbild auf Feld-Karten
- **Live-Timer** auf jedem Feld, Warteschlange, letzte Ergebnisse mit Gewinner-Hervorhebung
- **Spieleraufruf-Banner** mit Animation ("Bitte zum Feld!")
- **5-Sekunden-Polling** mit Bulk-Queries fuer Performance
- Passt sich an das gewaehlte Farbdesign an
- **F11** = Vollbild-Toggle, **Escape** = Fenster schliessen

### Statistik-Dashboard
- **Turnier-Uebersicht**: Turniere nach Status, Format-Verteilung, Modus-Verteilung
- **Spiel-Statistiken**: Abgeschlossene Spiele, durchschnittliche/laengste/kuerzeste Dauer, Punkte pro Satz, knappstes Spiel
- **Feldauslastung**: Genutzte Felder, Spiele pro Feld, durchschnittliche Zeit pro Feld
- **Teilnehmer-Statistiken**: Geschlechterverteilung, Altersverteilung, Top-Vereine
- **Turnier-uebergreifende Spieler-Rangliste**: Siegquote, Punkte pro Spiel, Medaillen fuer Top 3
- **Turnier-Filter**: Statistiken fuer alle Turniere oder ein bestimmtes anzeigen

### Rangliste & Auswertung
- **Prozentuale Rangliste**: Siegquote %, Satzquote %, Punktequote %
- **Gruppen-Tabellen**: Separate Tabelle pro Gruppe mit Qualifikanten-Markierung (Q)
- **Smarte KO-Qualifikation**: Bracket-Groesse waehlbar (4/8/16/32), automatisch mit besten Nachrueckern aufgefuellt
- **Medaillen**: Gold/Silber/Bronze fuer die Top 3
- **Turnierbericht**: Druckbarer Bericht mit Highlights (knappstes Spiel, hoechster Sieg, meiste Punkte)
- **Druckansicht**: Spielplan, aktuelle Runde, Rangliste oder kompletter Bericht
- **PDF-Export**: Turnierbericht als PDF-Datei speichern
- **Urkunden-Generator**: Festliche Urkunden fuer Platz 1-3 (Goldrahmen, BOSS-Branding, Unterschriftszeile)

### Sprache
- **Englisch** (Standard) und **Deutsch**
- Sprachauswahl in den Einstellungen
- Sofortiger Wechsel, persistent gespeichert

### Design & Themes
- **4 Farbdesigns**: Smaragd (Gruen), Saphir (Blau), Bernstein (Orange), Dunkel (Dark Mode)
- **5 Schriftarten**: Inter, Nunito, Roboto, Poppins, Montserrat (alle lokal gebundelt fuer Offline-Nutzung)
- **7 Schriftgroessen**: XXS, XS, S, M, L, XL, XXL - persistent gespeichert
- Vollstaendiger **Dark Mode**: Alle Seiten, Modals, Inputs, Tabellen, Bracket-Ansicht
- **Custom Vereinslogo**: Upload mit Zuschnitt-Tool (1:1 Cropper, 500KB Limit), gespeichert in SQLite (im Backup enthalten)
- **Badminton Court SVG**: Dezentes Spielfeld-Hintergrundbild auf Feld-Karten
- Theme-konforme Druckansicht passt sich dem gewaehlten Farbschema an

### Bedienung
- **Dynamische Fenstertitel**: Der Browser-/Fenstertitel spiegelt die aktuelle Seite wider (z.B. `BOSS - Turniername`, `BOSS - Spieler`, `BOSS - Einstellungen`) — so ist bei mehreren BOSS-Fenstern sofort ersichtlich, welches welches ist
- **Ladezustaende**: Laenger dauernde Aktionen (Turnier erstellen, Vorlage importieren, Excel-Import, Datenbank-Reset) zeigen Inline-Spinner und deaktivieren ihre Trigger-Buttons; keine Doppelklicks loesen mehr doppelte Vorgaenge aus
- **Formular-Validierung**: Zahlenfelder (Startgeld, Ruhezeit, Feldanzahl, Timer-Schwellenwerte) erzwingen jetzt `required / min / max` auf Input-Ebene und zeigen die native Browser-Validierung bevor die Aktion laeuft

### Einstellungen
- **Auto-Update**: Automatische Pruefung beim App-Start (Banner-Benachrichtigung), manueller Check in Einstellungen
- **Sprache**: Englisch / Deutsch Auswahl
- **Design**: 4 Farbdesigns, 5 Schriftarten, 7 Schriftgroessen, Custom Vereinslogo mit Cropper
- **Voreinstellungen**: Standard-Spielfelder, Timer-Schwellenwerte (Warnung gelb, Kritisch rot)
- **Datenbank**: Speicherort anzeigen/aendern, Backup & Wiederherstellung
- **Credits**: Aufklappbarer Abschnitt mit Idee- und Umsetzungs-Credits, erweiterbar fuer weitere Mitwirkende
- **Gefahrenzone**: Alle Spieler loeschen, alle Turniere loeschen oder kompletter Datenbank-Reset (DROP + CREATE mit Sicherheitsabfrage)

### Technisch
- **Cross-Platform**: Windows + macOS (Intel + Apple Silicon) ueber native Builds
- **Auto-Update**: Signierte Releases von GitHub, automatische Pruefung beim Start, manueller Check in Einstellungen
- **Offline-faehig**: Laeuft komplett lokal, kein Internet noetig (Schriftarten gebundelt)
- **SQLite** mit Foreign-Key-Enforcement (PRAGMA)
- **Bulk-Queries** fuer TV-Modus und performance-kritische Pfade
- **Kryptografische Zufallszahlen**: `crypto.getRandomValues` fuer faire Auslosungen
- **pnpm** Paketmanager
- **GitHub Actions CI/CD** fuer plattformuebergreifende Builds
- **ExcelJS** fuer Excel-Import/Export (ersetzt verwundbares xlsx/SheetJS)
- **Eingeschraenkter Dateisystem-Zugriff**: Nur $APPDATA, $DOWNLOAD, $DESKTOP, $DOCUMENT zugaenglich
- **i18n-Pruefskript**: `pnpm run check:i18n` prueft dass jeder Uebersetzungsschluessel in `types.ts` in `de.ts` und `en.ts` existiert und meldet fehlende/ueberzaehlige/ungenutzte Keys — Teil der Release-Checkliste

## Tech Stack

| Komponente | Technologie |
|---|---|
| Desktop-Framework | [Tauri 2](https://tauri.app/) (Rust) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS 4 |
| Datenbank | SQLite (tauri-plugin-sql) |
| Build-Tool | Vite |
| Excel | ExcelJS |
| Schriftarten | Inter, Nunito, Roboto, Poppins, Montserrat (gebundelt) |
| Paketmanager | pnpm |

## Voraussetzungen

Fuer die Entwicklung:

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/) (stable)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) mit C++ Workload (Windows)

Fuer die Nutzung der fertigen App:

- Windows 10/11 (x64) oder macOS (Intel / Apple Silicon)
- WebView2 Runtime (auf Windows 10/11 vorinstalliert)

## Entwicklung

```bash
# Abhaengigkeiten installieren
pnpm install

# Entwicklungsserver starten (oeffnet Desktop-Fenster)
pnpm tauri dev

# Release-Build erstellen
pnpm tauri build
```

Der erste Build dauert einige Minuten, da Rust alle Dependencies kompilieren muss. Nachfolgende Builds sind deutlich schneller.

## Build-Ausgabe

Nach `pnpm tauri build` befinden sich die Installer unter:

```
src-tauri/target/release/bundle/
├── nsis/  → BOSS_x64-setup.exe
└── msi/   → BOSS_x64_en-US.msi
```

## Projektstruktur

```
src/
├── components/     # bracket, courts, layout, match, players, print,
│                   #   standings, tournament, ui (die gemeinsamen Bausteine:
│                   #   Modal, Icon, ConfirmDialog, OverflowMenu, States)
├── lib/            # alles, was keine Komponente ist
│   ├── db.ts       #   SQLite-Zugriff, beide Backends
│   ├── draw.ts     #   Auslosung je Turnierformat
│   ├── scoring.ts  #   Ergebnisprüfung und Tabellenstände
│   ├── i18n/       #   en.ts, de.ts, types.ts, labels.ts, format.ts
│   └── …           #   Sessions, Live-Veröffentlichung, Konflikte, Design
├── pages/          # ein Verzeichnis je Route; TournamentView ist selbst ein
│                   #   Verzeichnis (index.tsx plus components/ und lib/)
└── test/           # SQLite-Backend für Tests, Migrationstests

src-tauri/          # Rust: Datenbankpfad, Backup, Wiederherstellung
scripts/            # i18n-, Kontrast- und Emoji-Prüfungen (laufen in der CI)
wordpress-plugin/   # Begleit-Plugin für Live-Ergebnisse
```

Die Begründungen zur heutigen Struktur stehen in
[REVIEW-BACKLOG.md](REVIEW-BACKLOG.md).

## Lizenz

MIT
