# -*- coding: utf-8 -*-
"""ASCII stand-ins in the release notes, corrected on the way into the
changelog. Each pair is a whole word or an unambiguous stem, never a bare
"ue" -- that would turn "neue" into "neü"."""
import io
import re

PAIRS = [
    # nouns
    (u"Sportstaette", u"Sportstätte"), (u"Sportstaetten", u"Sportstätten"),
    (u"Saetze", u"Sätze"), (u"Menue", u"Menü"), (u"Menues", u"Menüs"),
    (u"Gruenden", u"Gründen"), (u"Verknuepfungen", u"Verknüpfungen"),
    (u"Rueckgaengig", u"Rückgängig"), (u"Veroeffentlichung", u"Veröffentlichung"),
    (u"Loeschen", u"Löschen"), (u"Ueberweisung", u"Überweisung"),
    (u"Erklaerungs", u"Erklärungs"), (u"Aenderung", u"Änderung"),
    (u"Schwellenwerte", u"Schwellenwerte"),
    # verbs and adjectives
    (u"zurueck", u"zurück"), (u"oeffnet", u"öffnet"), (u"oeffnen", u"öffnen"),
    (u"geoeffnete", u"geöffnete"), (u"schliesst", u"schließt"),
    (u"ausserhalb", u"außerhalb"), (u"ueberlaufen", u"überlaufen"),
    (u"uebernommen", u"übernommen"), (u"uebergreifend", u"übergreifend"),
    (u"bestaetigt", u"bestätigt"), (u"verfuegbar", u"verfügbar"),
    (u"wuerden", u"würden"), (u"fuer", u"für"), (u"ueber", u"über"),
    (u"erklaert", u"erklärt"), (u"gehoeren", u"gehören"),
    (u"vollstaendig", u"vollständig"), (u"zusaetzlich", u"zusätzlich"),
    (u"vorwaerts", u"vorwärts"), (u"naechsten", u"nächsten"),
    (u"unveraendert", u"unverändert"), (u"abwaehlen", u"abwählen"),
    (u"scheinbar-funktionsfaehigen", u"scheinbar funktionsfähigen"),
    (u"abhaken", u"abhaken"), (u"laeuft", u"läuft"), (u"waehlen", u"wählen"),
    (u"auswaehlen", u"auswählen"), (u"ausgewaehlt", u"ausgewählt"),
    (u"noetig", u"nötig"), (u"koennen", u"können"), (u"loesen", u"lösen"),
    (u"prueft", u"prüft"), (u"ausschliesslich", u"ausschließlich"),
    (u"Turnieruebersicht", u"Turnierübersicht"), (u"entschlackt", u"entschlackt"),
    (u"weiss", u"weiß"), (u"Loesch", u"Lösch"), (u"loesch", u"lösch"),
    (u"geloescht", u"gelöscht"), (u"hinterliess", u"hinterließ"),
    (u"schlug", u"schlug"), (u"regulaeren", u"regulären"),
    (u"passte", u"passte"), (u"identisch", u"identisch"),
    (u"faellt", u"fällt"), (u"waere", u"wäre"),
]

path = "README.md.versions"
s = io.open(path, encoding="utf-8").read()
for old, new in PAIRS:
    # Word-ish boundary: the stems above are unambiguous inside compounds
    # (Sportstaetten-Page), so a plain replace is right here.
    s = s.replace(old, new)
io.open(path, "w", encoding="utf-8", newline="").write(s)

leftovers = sorted(set(
    w for w in re.findall(r"[A-Za-zÄÖÜäöüß]+", s)
    if re.search(r"ae|oe|ue|ss", w, re.I) and not re.search(r"[ÄÖÜäöüß]", w)
))
print("possible leftovers (%d):" % len(leftovers))
print("  " + " ".join(leftovers))
