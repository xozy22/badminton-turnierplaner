// src/test/umlautCheck.test.ts
//
// The rule that decides whether "ss" or "ue" in a German string is a slip.
//
// It used to be a list of the words that are legitimately spelled that
// way, and German has so many that the list grew with almost every new
// sentence -- "Quelle", "erfassten", "lassen", "gemessen" each stopped a
// build once. The list is gone; two rules replace it, and this is where
// they are held to both halves of the job: catching the real slips, and
// staying quiet on correct German.

import { describe, it, expect } from "vitest";
import { findAsciiUmlauts } from "../../scripts/check-i18n-keys.mjs";

/**
 * A stand-in for de.ts: the surrounding vocabulary is what the rule
 * calibrates against, so it has to be there.
 */
const GERMAN_FILE = `
  const de = {
    a: "für alle Spieler",
    b: "zurück zur Übersicht",
    c: "die nächste Runde",
    d: "größer als",
    e: "die Spielstärke",
    f: "schließen",
    g: "draußen",
  };
`;

/** Runs the check over the vocabulary plus one line under test. */
const check = (line: string) =>
  [...findAsciiUmlauts(`${GERMAN_FILE}\nconst x = { t: "${line}" };`).keys()];

describe("ASCII stand-ins that must be caught", () => {
  it.each([
    ["Fuer alle", "Fuer"],
    ["Zurueck zur Liste", "Zurueck"],
    ["Naechste Runde", "Naechste"],
    ["Die Spielstaerke", "Spielstaerke"],
  ])("%s", (line, expected) => {
    // These are caught because the file spells the same word properly
    // somewhere else -- the rule calibrates against its own vocabulary.
    expect(check(line)).toContain(expected);
  });

  it.each([
    ["Schliessen", "Schliessen"],
    ["Groesse der Halle", "Groesse"],
    ["Draussen spielen", "Draussen"],
    ["Strassenname", "Strassenname"],
    ["Ein Spass", "Spass"],
    ["Weisses Trikot", "Weisses"],
  ])("%s", (line, expected) => {
    // These are caught by the closed list: since the 1996 reform "ss"
    // only follows a short vowel, so these stems are never right.
    expect(check(line)).toContain(expected);
  });
});

describe("correct German that must stay quiet", () => {
  it.each([
    "Quelle der Daten",
    "Alle erfassten Spieler",
    "Nachrücken lassen",
    "gemessen an 10 Spielen",
    "Aktuelle Runde",
    "Neue Adresse",
    "Zuerst das Ergebnis",
    "Ein Ausschnitt der Liste",
    "Die Zusammenfassung",
    "Individuelle Dauer",
    "Manuelle Eingabe",
    "Der Abschluss",
    "Das Geheimnis",
    "Stattdessen passenden Gegner",
    "Das Betriebssystem",
    "Dass es klappt",
    "Es muss sein",
    "Verlassen Sie sich darauf",
    "Die Ergebnisse",
    "Voraussetzung dafür",
  ])("%s", (line) => {
    expect(check(line)).toEqual([]);
  });

  it("leaves the English the interface keeps", () => {
    for (const word of ["Session", "Venue", "Progress", "Message"]) {
      expect(check(word), word).toEqual([]);
    }
  });

  it("leaves a word that already carries an umlaut", () => {
    // "müssen" has a real double s, and so does "größer".
    expect(check("müssen wir größer")).toEqual([]);
  });
});

describe("the rule's own limits", () => {
  it("lets a slip through when the file never spells it properly", () => {
    // Honest about what it cannot do: with no correct spelling anywhere
    // to compare against, and no entry in the closed list, "Buehne" looks
    // like any other word. The old list had the same blind spot, plus a
    // false alarm on every new sentence.
    expect(check("Die Buehne")).toEqual([]);
  });

  it("does not guess at words where both spellings are real", () => {
    // "Masse" and "Maße" are different words, as are "Busse" and "Buße".
    // Guessing which was meant is how false alarms start.
    expect(check("Die Masse der Spieler")).toEqual([]);
  });
});
