# Funktionen — was BOSS noch fehlt

Verglichen mit dem **BTP** (Badminton Tournament Planner), der Software, mit
der die Landesverbände ihre Turniere fahren. Grundlage ist das
[BTP-Handbuch des BLV NRW](https://www.badminton.nrw/fileadmin/Dateien/Anleitungen/Anleit_BTP_Handbuch.pdf)
(Miles Eggers, Version 2016.01, 29 Seiten), gelesen im August 2026.

Die Liste ist keine Abschrift. Die beiden Programme lösen unterschiedliche
Aufgaben, und an mehreren Stellen ist BOSS voraus. Wo eine BTP-Funktion hier
keinen Sinn ergibt, steht das dabei — mitsamt Begründung.

---

## Der Unterschied in einem Satz

**Der BTP plant Verbandsturniere.** Ein Ranglistenturnier mit fünf
Konkurrenzen, sechs Feldern, Zeitraster über zwei Tage, Meldegebühren und
Anbindung an die Verbandsrangliste. Der Zeitplan steht vor dem ersten
Ballwechsel fest.

**BOSS führt Vereinsturniere durch.** Der Turnierleiter steht mit dem Laptop
am Hallenrand, schiebt Spiele auf Felder und trägt Ergebnisse ein, während
gespielt wird. Der Ablauf entsteht während des Turniers.

Das erklärt beide Funktionslisten. Es erklärt auch, warum ein Teil des BTP
hier nicht fehlt, sondern nicht hingehört.

---

## Was BOSS kann und der BTP nicht

Damit die Liste unten nicht wie ein Rückstand aussieht:

| | |
|---|---|
| **Sessions** | Mehrere Turniere gleichzeitig in einer Halle, mit geteiltem Feldpool, Konflikterkennung über Turniergrenzen und gemeinsamem Dashboard. Der BTP kennt ein Turnier je Datei. |
| **TV-Modus** | Vollbildanzeige für Beamer oder Fernseher: laufende Spiele, Warteschlange, Ergebnisse. |
| **Live-Ergebnisse** | Veröffentlichung auf die **eigene** Vereinsseite über ein WordPress-Plugin, mit wählbarer Anonymisierungsstufe. Der BTP veröffentlicht auf tournamentsoftware.com. |
| **Formate für den Vereinsabend** | King of the Court, Waterfall, wechselnde Partner, Monrad — kennt der BTP nicht, weil sie in Verbandsturnieren nicht vorkommen. |
| **Ruhezeit** | Warnung, wenn jemand zu kurz nach dem letzten Spiel wieder eingeteilt wird. Über Turniergrenzen hinweg. |
| **Urkunden** | Als PDF, direkt aus der Tabelle. |
| **Barrierefreiheit** | Tastaturbedienung, Kontrast nach WCAG AA, sechs Farbschemata, zwei Sprachen. |

---

## A · Zeitplanung — die größte Lücke

Der BTP widmet ihr den Großteil seines Handbuchs. BOSS hat davon **nichts**:
kein Datum am Turnier, keine Uhrzeiten, kein Ansetzen.

Für den Vereinsabend ist das richtig so — man spielt, bis man fertig ist. Für
alles, was länger als einen Abend dauert, fehlt es.

### A1 — Spieltag und Uhrzeit am Turnier ✔ erledigt (2026-08-19)
**Nutzen:** hoch · **Aufwand:** S

Ein Turnier hat heute nur `created_at`, also wann es *angelegt* wurde. Wann
gespielt wird, steht nirgends. Ohne das gibt es keinen Zeitplan, keinen
sinnvollen Ausdruck und keine Auskunft, wann jemand antreten muss.

Kleinster nützlicher Schritt: ein Spieldatum und eine Startzeit. Alles Weitere
in diesem Abschnitt baut darauf auf.

**Umgesetzt.** Migration 19 ergänzt `tournaments.play_date` und
`tournaments.start_time`, beide optional. Bestehende Turniere behalten NULL —
aus `created_at` ein Spieldatum zu raten wäre für jedes im Voraus geplante
Turnier falsch. Der Assistent fragt beides ab, der Ausdruck zeigt das Datum
ausgeschrieben.

**Abweichung vom Vorschlag:** Der Zeitplan kommt als benanntes Options-Objekt
in `createTournament`/`updateTournament`, nicht als vierzehnter und
fünfzehnter Stellungsparameter. Und ein fehlender Schlüssel bedeutet dort
„Spalte nicht anfassen" statt „leeren" — der Assistent speichert im
Sekundentakt automatisch ohne Zeitplan, und der Einstellungsdialog im
laufenden Turnier gibt nie einen mit. Das unbedingte Schreiben löschte das
gerade eingetippte Datum nach etwa einer Sekunde wieder.

### A2 — Mehrtägige Turniere
**Nutzen:** mittel · **Aufwand:** M · *BTP: Reiter „Tage"*

Samstag und Sonntag in einem Turnier. Runden gehören einem Tag zu, Tabellen
und Ergebnisse laufen durch.

### A3 — Zeitraster erzeugen
**Nutzen:** mittel · **Aufwand:** M · *BTP: Reiter „Zeiten"*

Der BTP erzeugt aus Startzeit und Intervall die Rundenzeiten — „Samstag ab
13:00 Uhr, alle 30 Minuten, zwölf Zeiten". Für ein Turnier mit festem
Zeitplan ist das die Grundlage; ohne Zeiten gibt es nichts anzusetzen.

### A4 — Spiele ansetzen
**Nutzen:** mittel · **Aufwand:** L · *BTP: „Automatisch ansetzen", „Runde ansetzen", „Spiel einzeln ansetzen"*

Drei Wege im BTP: automatisch, rundenweise, einzeln. Dazu Optionen wie „Byes
weiterschieben" und „maximal acht Spiele pro Tag und Konkurrenz".

**Vorbehalt:** Das Handbuch rät beim automatischen Ansetzen selbst zur
Vorsicht — für Ranglistenturniere sei es „nicht optimal", weil die Spielfolge
nicht den Vorgaben entspreche. Wenn BOSS das je bekommt, dann als Vorschlag,
den der Turnierleiter überschreibt, nicht als Automatik, die er hinterher
korrigieren muss.

### A5 — Pausenzeiten beim Planen
**Nutzen:** niedrig · **Aufwand:** S · *BTP: Reiter „Auslosungen"*

Mindestpause zwischen zwei Spielen desselben Teilnehmers, beim Ansetzen
berücksichtigt. **BOSS hat den Kern bereits** — die Ruhezeit-Warnung —, nur
reaktiv beim Zuweisen statt vorausschauend beim Planen.

---

## B · Mehrere Konkurrenzen in einem Turnier

### B1 — Disziplinen statt ein Modus je Turnier
**Nutzen:** hoch · **Aufwand:** L · *BTP: Reiter „Konkurrenzen"*

Der BTP führt HE A, HE B, DE, HD, DD und GD in **einer** Turnierdatei, jede
mit eigener Auslosung und eigener Meldegebühr. In BOSS ist ein Turnier genau
eine Disziplin in genau einem Modus.

**Sessions kommen dem nahe** und lösen den wichtigsten Teil bereits: Mehrere
Turniere teilen sich Halle, Felder und Konflikterkennung. Was fehlt, ist die
gemeinsame Klammer — eine Meldung, ein Startgeld, ein Ausdruck, ein Sieger je
Konkurrenz.

Ehrliche Einschätzung: der größte Einzelposten dieser Liste und ein Eingriff
ins Datenmodell. Er lohnt nur, wenn BOSS Turniere mit mehreren Disziplinen
ausrichten soll. Für den Vereinsabend leisten Sessions dasselbe mit weit
weniger Umbau.

---

## C · Auslosung

### C1 — Setzgruppen statt fester Ränge ✔ erledigt (2026-08-19)
**Nutzen:** hoch · **Aufwand:** S · *BTP: Setzplatz „1/2", „5/8", „9/16"*

BOSS vergibt feste Setzränge: 1, 2, 3, 4. Der BTP kennt **Gruppen** — zwei
Teilnehmer teilen sich „Setzplatz 1/2", vier teilen sich „5/8", und innerhalb
der Gruppe wird gelost.

Das entspricht der Turnierordnung: Wer auf der Rangliste dicht beieinander
liegt, soll keinen Vorteil aus einer willkürlichen Reihenfolge ziehen.

**Der kleinste Schritt mit der größten Wirkung in dieser Liste.** Die
Bracket-Setzung ist seit der letzten Prüfung korrekt; darauf lässt sich das
unmittelbar aufsetzen.

**Umgesetzt.** Die Gruppen ergeben sich aus der Turnierordnung und brauchen
keine Schemaänderung: 1, 2, 3/4, 5/8, 9/16. Die Setzliste sagt weiterhin, wer
gesetzt ist und wie stark; die Auslosung liest sie in Gruppen und lost
innerhalb einer Gruppe neu — im K.-o.-Baum wie in der Gruppenphase. Der
Assistent zeigt „3/4" statt „3" und „4", sonst wäre die Änderung unsichtbar.

**Abweichung vom Vorschlag:** Kein Setzplatz „1/2". Ohne Ranglisten-Anbindung
(F3, nicht empfohlen) kennt BOSS keine Ranglistenpunkte — der Turnierleiter
legt die Reihenfolge selbst fest und hat damit zwischen 1 und 2 bereits
entschieden. Erst ab 3/4 gibt es etwas zu losen.

**Was dabei auffiel:** Unter Gruppenlosung sind die richtige Setzung und der
alte A3-Fehler nicht mehr an den Rängen zu unterscheiden — beide Anordnungen
verteilen die Gruppen gleich über die Viertel. Die Tests aus A3 prüfen jetzt
die *Gruppenfolge der Spiele* statt der Rangfolge: Dort steht Setz 2 in der
Fehlversion im vierten statt im dritten Spiel. Nachgemessen; der Schutz gegen
A3 bleibt bestehen.

### C2 — Vereinstrennung in der ersten Runde ✔ erledigt (2026-08-19)
**Nutzen:** hoch · **Aufwand:** S · *BTP: Option im Auslosungsassistenten*

Möglichst keine Vereinskameraden in Runde eins. Steht so in der
Turnierordnung und ist bei Vereinsturnieren mit mehreren Gastvereinen genauso
erwünscht.

BOSS kennt den Verein je Spieler bereits — die Angabe liegt ungenutzt herum.

Das Handbuch ist dabei ehrlich: Die Trennung gelingt nicht immer, weil sie mit
den Setzplätzen in Konflikt geraten kann. Also bestmöglich trennen, nicht
erzwingen.

**Umgesetzt.** Die Auslosung entsteht wie bisher und wird danach verbessert:
Es werden nur ungesetzte Teilnehmer getauscht, und nur, wenn der Tausch die
Zahl der Vereinsbegegnungen senkt. Damit terminiert das Verfahren immer — die
Zahl ist ganzzahlig und fällt bei jedem Schritt —, die Setzplätze bleiben
unberührt, und unter gleich guten Auslosungen bleibt die Wahl zufällig.

Gilt für den K.-o.-Baum und für die Gruppenaufteilung. Bei der Gruppenphase
ist es dieselbe Frage: Vereinskameraden gehören in verschiedene Gruppen.

**Abweichung vom Vorschlag:** Kein Schalter im Assistenten. Die Trennung
kostet nichts, wo sie nicht greift — bei einem reinen Vereinsturnier oder
ohne erfasste Vereine ändert sie die Auslosung nicht —, und ein Schalter, den
niemand ausschaltet, ist Ballast.

Ein fehlender Verein zählt als *kein* Verein, nicht als gemeinsamer. Die
Gegenprobe steht im Test: Ohne die Trennung trifft eine Zufallsauslosung bei
vier gegen vier in 22,6 % der Fälle die perfekte Trennung — der Test über
zwanzig Läufe würde also ohne den Code praktisch nie bestehen.

### C3 — Qualifikation vor dem Hauptfeld
**Nutzen:** niedrig · **Aufwand:** L · *BTP: „Qualifikations-Gruppensystem mit Hauptfeld"*

Ein Qualifikationsfeld, dessen Sieger ins Hauptfeld nachrücken. Für
Vereinsturniere selten; die Gruppenphase leistet Ähnliches.

### C4 — Auslosung ansehen, bevor sie gilt ✔ erledigt (2026-08-19)
**Nutzen:** mittel · **Aufwand:** S · *BTP: „Die Auslosung wird zur Kontrolle angezeigt"*

Der BTP zeigt das Ergebnis **vor** dem Speichern und lässt es verwerfen. BOSS
lost aus und schreibt sofort.

Rückgängig geht über die Rundenrücknahme — aber „ansehen und verwerfen" ist
etwas anderes als „speichern und zurücknehmen", besonders wenn zwanzig
Menschen zusehen.

**Umgesetzt.** Zwischen Auslosung und Schreiben steht jetzt ein Dialog mit
allen Paarungen, den Freilosen und den Aussetzenden. Drei Wege hinaus:
übernehmen, neu auslosen, verwerfen. Bis zum Übernehmen ist nichts
geschrieben — in der laufenden Anwendung nachgemessen: Nach „neu auslosen"
und „verwerfen" stand das Turnier weiterhin auf `draft` mit null Runden.

Gilt auch für Folgerunden. Beim K.-o.-Baum ist das eine Bestätigung — die
Sieger bestimmen die Paarungen —, beim Schweizer System, bei Monrad und bei
zufälligen Doppeln wird jede Runde neu gelost, und genau die will man vorher
sehen.

**Abweichung vom Vorschlag:** „Neu auslosen" erscheint nur, wenn ein zweiter
Versuch etwas anderes ergeben könnte. Das wird nicht am Format abgelesen,
sondern gemessen: Der Plan wird zweimal gebaut und verglichen
(`formats/planIdentity.ts`). Das ist von der Konstruktion her richtig — eine
K.-o.-Runde aus den Siegern ist festgelegt, eine Schweizer Runde nicht, und
ein Feld aus zwei Teilnehmern hat nur eine mögliche Auslosung, was auch immer
das Format sonst täte.

---

## D · Ergebnisse und Spielbetrieb

### D1 — Mehr Ergebnis-Status ✔ erledigt (2026-08-19)
**Nutzen:** hoch · **Aufwand:** S · *BTP: „Retired", „Disqualifiziert", „Kein Spiel", „Walkover"*

BOSS kennt Aufgabe und Walkover. Es fehlen:

- **Disqualifiziert** — braucht eine eigene Kennzeichnung, weil sie anders
  begründet ist als eine Verletzung und in Berichten getrennt erscheinen muss.
- **Kein Spiel** — beide Seiten nicht angetreten. Das Handbuch nennt diesen
  Status ausdrücklich als Voraussetzung dafür, dass ein Turnier überhaupt als
  beendet gilt: nicht ausgetragene Spiele müssen so gekennzeichnet werden,
  sonst zeigt der BTP keine Sieger an.

**Dieselbe Sackgasse hat BOSS heute auch.** Ein Spiel ohne Ergebnis blockiert
den Abschluss, und es gibt keinen Weg, es als „fand nicht statt" abzulegen.

**Umgesetzt.** Migration 20 ergänzt `matches.outcome` mit vier Werten —
`walkover`, `retired`, `disqualified`, `no_match`. Alle vier setzen weiterhin
`walkover = 1`, was sie aus jeder Satz- und Punktbilanz heraushält; `outcome`
sagt nur, welcher Fall vorliegt. Bestehende Walkover-Zeilen bekommen in der
Migration den Wert, der bisher die einzige Bedeutung des Flags war.

Auf jeder offenen Spielkarte steht jetzt „Nicht gespielt" und öffnet einen
Dialog mit den vier Gründen; nur `no_match` verzichtet auf die Seitenwahl.
Abgeschlossene Spiele tragen den Grund als Abzeichen statt des allgemeinen
„Abgeschlossen", und die Kurzliste zeigt ihn statt eines leeren „0:0 ()".
Der CSV-Export unterscheidet die vier Fälle ebenfalls.

**Abweichung vom Vorschlag:** Ein `no_match` im K.-o.-Baum war die eigentliche
Arbeit. `winnersOfRound` ließ ein Spiel ohne Sieger einfach weg — dadurch
rückte jeder spätere Sieger einen Platz nach vorn und die beiden Hälften des
Baums spielten gegeneinander. Der leere Platz bleibt jetzt erhalten, und der
Nachbar rückt mit einem Freilos vor, das sofort als abgeschlossen angelegt
wird. Sonst wäre die Sackgasse nur eine Runde weiter gewandert.

### D2 — Eingabe nur der Verliererpunkte
**Nutzen:** mittel · **Aufwand:** S · *BTP: „Dabei reicht die Angabe der Verliererpunkte aus"*

Im BTP tippt man `15` und bekommt `21:15`. BOSS hat die Auto-Vervollständigung
bereits — allerdings andersherum: Man tippt den Gewinnerwert, der Verlierer
wird ergänzt.

Für jemanden, der zwanzig 21:x-Ergebnisse abtippt, ist die BTP-Richtung
schneller: Die 21 ist die Regel, die andere Zahl die eigentliche Information.

Zu prüfen, nicht blind zu übernehmen — bei Verlängerungsergebnissen (24:22)
ist die heutige Richtung im Vorteil. Vielleicht ist es eine Einstellung.

### D3 — Schiedsrichterzettel ✔ erledigt (2026-08-19)
**Nutzen:** mittel · **Aufwand:** S · *BTP: acht „Spielkarten" auf ein DIN-A4-Blatt*

Kleine Zettel mit Paarung, Feld und Zeit, acht pro Blatt, auf Wunsch auch leer
zum Selbstausfüllen. BOSS hat eine Druckansicht mit fünf Modi — dieser fehlt.

Für Vereinsturniere gut brauchbar: Der Zettel geht mit aufs Feld und kommt
ausgefüllt zurück.

**Umgesetzt.** Zwei neue Druckarten: „Schiedsrichterzettel" mit den Paarungen
und „Leere Zettel" zum Selbstausfüllen, beide acht je Blatt in zwei Spalten.
Jeder Zettel trägt Turniername, Runde, Feld und Zeit, dann je Seite so viele
Kästchen, wie das Turnier Sätze kennt, und unten Sieger und Unterschrift.

Was schon feststeht, ist gedruckt; was von Hand kommt, ist ein Kästchen oder
eine Linie — das ist der ganze Zweck eines Zettels, der ausgefüllt zurückkommt.

**Abweichung vom Vorschlag:** Der Turnierkopf entfällt bei diesen beiden
Arten. Er hätte eine Zeile von acht Zetteln gekostet; der Turniername steht
stattdessen klein auf jedem einzelnen, wo er ohnehin hingehört.

Gedruckt werden nur Spiele, die noch anstehen — ein Zettel für ein
entschiedenes Spiel wandert direkt in den Papierkorb. Freilose bekommen
keinen: Es gibt niemanden, dem man ihn geben könnte.

---

## E · Meldungen und Geld

### E1 — Nachrücker ✔ erledigt (2026-08-19)
**Nutzen:** mittel · **Aufwand:** S · *BTP: „Starterfeld C und D"*

Eine Warteliste. Sagt jemand ab, rückt der Nächste nach. Heute muss man den
Ersatz von Hand hinzufügen und weiß hinterher nicht mehr, wer in welcher
Reihenfolge gewartet hat.

**Umgesetzt.** Migration 21 gibt `tournament_players` einen Meldestatus —
`entered`, `waiting`, `withdrawn` — und eine Warteposition. Die Verwaltung
zeigt beides; ein Knopf lässt den Ersten nachrücken und nennt seinen Namen.

Die Warteposition wird beim Einreihen vergeben, nicht vom Aufrufer, damit
zwei kurz hintereinander Eingereihte nicht dieselbe Nummer bekommen. Angezeigt
wird die laufende Position, nicht die gespeicherte: Nach einem Nachrücken hat
die gespeicherte Reihe Lücken, und „3." ohne eine 2 liest sich wie ein
Fehler.

### E2 — Abmeldungen behalten ✔ erledigt (2026-08-19)
**Nutzen:** mittel · **Aufwand:** S

Der BTP behält abgemeldete Teilnehmer in der Liste, weil sie für die
Gebührenabrechnung gebraucht werden. BOSS entfernt sie und vergisst sie.

Spieler archiviert BOSS bereits — hier geht es um dieselbe Idee eine Ebene
tiefer, auf Turnierebene.

**Umgesetzt.** „Abmelden" behält die Zeile und trägt den Zeitpunkt ein;
„entfernen" löscht weiterhin, weil eine Fehleingabe kein Abmeldevorgang ist.
Beide stehen nebeneinander in der Teilnehmerzeile.

**Die kritische Stelle war `getTournamentPlayers`** — die Funktion, die die
Auslosung speist. Vorher gab es nichts zu filtern, weil eine Abmeldung die
Zeile löschte. Jetzt filtert sie auf `entry_status = 'entered'`; ohne das
stünden Abgemeldete und Wartende im Turnierbaum.

### E3 — Gebühr bei Meldung statt bei Teilnahme ✔ erledigt (2026-08-19)
**Nutzen:** niedrig · **Aufwand:** S · *BTP: Reiter „Meldegebühren"*

Ob das Startgeld schon mit der Meldung fällig wird oder erst beim Antreten.
Ändert, wer in der Abrechnung auftaucht.

**Umgesetzt** als `tournaments.fee_due`, umschaltbar in der Verwaltung — dort,
wo auch die Abmeldungen stehen, auf die es sich auswirkt. In der laufenden
Anwendung nachgemessen: fünf Teilnehmer und ein Abgemeldeter ergaben 25 €
offen bei „beim Antreten" und 30 € bei „bei der Meldung".

### E4 — Weitere Posten ✔ erledigt (2026-08-19)
**Nutzen:** niedrig · **Aufwand:** S · *BTP: „Extra Items"*

Nachmeldegebühr, Ballverkauf, Hallenbeitrag. BOSS kennt nur Startgeld für
Einzel und Doppel.

**Umgesetzt.** Eine eigene Tabelle `tournament_fee_items`: eine Zeile je
Posten, mit Bezeichnung, Betrag, bezahlt-Kennzeichen und wahlweise einem
Spieler. Eine Zeile je Posten und nicht ein Feld je Art, weil jemand zweimal
dasselbe schulden kann und ein Betrag kein Schalter ist. Ohne Spieler gehört
der Posten dem Turnier — ein Hallenbeitrag schuldet niemand einzeln.

**Dabei herausgezogen:** Die Summe stand als fünfzigzeilige Funktion mitten im
JSX der Verwaltung. Das ging, solange es eine Regel gab; mit dreien — wann
fällig, wer abgemeldet, was sonst offen — gehört sie in `lib/fees.ts`, wo sie
zwölf Tests hat. Der Startgeld-Export nennt jetzt auch den Meldestatus und
führt die Posten als eigene Zeilen.

---

## F · Stammdaten und Ausgabe

### F1 — Turnier-Stammdaten
**Nutzen:** mittel · **Aufwand:** S · *BTP: Reiter „Info" und „Adresse"*

Ausrichtender Verein, Hallenanschrift, Telefonnummer, Turnierleitung,
Auslosungsdatum. Gehört auf jeden Ausdruck und jede Urkunde.

BOSS hat die Sportstätte mitsamt Adresse — was fehlt, sind Turnierleitung und
Ansprechpartner.

### F2 — Einstellbare Tabellenkriterien
**Nutzen:** niedrig · **Aufwand:** M · *BTP: Reiter „Gruppensystem"*

Der BTP lässt die Reihenfolge der Kriterien einstellen. Die NRW-Turnierordnung
verlangt: Spiele gewonnen, Satzdifferenz, Punktedifferenz.

**BOSS rechnet feiner** — mit direktem Vergleich zwischen Punktgleichen, was
die meisten Turnierordnungen ebenfalls vorsehen. Die Regel steht allerdings
fest im Code.

Einstellbar zu machen lohnt erst, wenn jemand tatsächlich eine andere Ordnung
braucht.

### F3 — Anbindung an die Verbandsrangliste
**Nutzen:** niedrig · **Aufwand:** L · *BTP: `ranking`, `rating`, `points`, Bax-Wert, SpielerID, ClubID*

Der BTP importiert Ranglisten und meldet Ergebnisse zurück. Das ist der Kern
seiner Existenz — und für ein Vereinsprogramm ohne Verbandsanbindung
gegenstandslos.

**Nicht übernehmen**, außer BOSS soll eines Tages Ranglistenturniere fahren.
Dann allerdings ist es Pflicht und nicht Kür.

---

## Empfehlung

Wenn nur drei Punkte umgesetzt werden:

1. **C1 Setzgruppen** und **C2 Vereinstrennung** ✔ — kleiner Aufwand,
   unmittelbar fairere Turniere, und die nötigen Daten liegen längst vor.
2. **D1 Ergebnis-Status** ✔ — „Kein Spiel" behebt eine Sackgasse, die BOSS
   heute genauso hat, wie das Handbuch sie für den BTP beschreibt.
3. **A1 Spieltag** ✔ — eine Zeile im Datenmodell, und der Ausdruck weiß
   endlich, wann gespielt wurde.

Danach wird es teurer: **D3 Schiedsrichterzettel** und **E1 Nachrücker** sind
je ein überschaubarer Tag. **A2–A4 Zeitplanung** und **B1 Konkurrenzen** sind
eigene Vorhaben mit Eingriff ins Datenmodell.

**Nicht empfohlen:** F3 (Ranglisten-Anbindung) und C3 (Qualifikationsfeld),
solange BOSS Vereinsturniere ausrichtet und keine Ranglistenturniere.
