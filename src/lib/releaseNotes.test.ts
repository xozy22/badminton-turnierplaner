// src/lib/releaseNotes.test.ts
//
// The generated release notes, and the markdown subset that renders them.
//
// Both are new surface between a file in the repository and something the
// user reads, which is exactly the kind of path where a mistake is quiet:
// a heading that stops matching, an entry that vanishes, a version that
// has no notes at all.

import { describe, it, expect } from "vitest";
import { RELEASE_NOTES, APP_VERSION } from "./releaseNotes.generated";
import { noteFor } from "./releaseNotes";

describe("generated release notes", () => {
  it("has an entry for the version being built", () => {
    // Without this a release ships showing the previous version's notes,
    // which is worse than showing none.
    const versions = RELEASE_NOTES.map((n) => n.version);
    expect(versions, `no notes for ${APP_VERSION}`).toContain(APP_VERSION);
  });

  it("runs newest first", () => {
    const rank = (v: string) => v.split(".").map(Number);
    for (let i = 1; i < RELEASE_NOTES.length; i++) {
      const a = rank(RELEASE_NOTES[i - 1].version);
      const b = rank(RELEASE_NOTES[i].version);
      const newer =
        a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
      expect(
        newer,
        `${RELEASE_NOTES[i - 1].version} should sort above ${RELEASE_NOTES[i].version}`,
      ).toBe(true);
    }
  });

  it("carries no empty entry", () => {
    // An entry whose body did not survive the parser would render as a
    // version number with nothing under it.
    for (const note of RELEASE_NOTES) {
      expect(note.de.trim().length, `${note.version} has no German text`).toBeGreaterThan(0);
    }
  });

  it("does not show the [Unreleased] section", () => {
    // Nobody runs an unreleased build.
    expect(RELEASE_NOTES.map((n) => n.version)).not.toContain("Unreleased");
  });

  it("carries no emoji", () => {
    // Notes rendered inside the application are interface, and the
    // interface has none -- see scripts/check-emoji.mjs. The older
    // changelog entries do, so the generator strips them.
    const emoji =
      /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|\u{FE0F}|\u{20E3}/u;
    for (const note of RELEASE_NOTES) {
      expect(emoji.test(note.de), `${note.version} (de)`).toBe(false);
      if (note.en) expect(emoji.test(note.en), `${note.version} (en)`).toBe(false);
    }
  });

  it("leaves no gap where an emoji was removed", () => {
    // The first pass produced a quotation mark followed by the space
    // the emoji used to occupy.
    for (const note of RELEASE_NOTES) {
      expect(note.de, note.version).not.toMatch(/["„([] /);
    }
  });

  it("gives every entry a date", () => {
    // All eighteen have a GitHub release. A missing date would mean the
    // heading lost its date or the release was never published.
    for (const note of RELEASE_NOTES) {
      expect(note.date, `${note.version} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("noteFor", () => {
  const note = {
    version: "2.10.0",
    date: "2026-08-19",
    title: null,
    de: "Deutscher Text",
    en: "English text",
  };

  it("gives a German reader the original", () => {
    expect(noteFor(note, "de")).toEqual({ text: "Deutscher Text", translated: true });
  });

  it("gives an English reader the translation", () => {
    expect(noteFor(note, "en")).toEqual({ text: "English text", translated: true });
  });

  it("falls back to German and says so", () => {
    // Everything before 2.10.0. Showing the German text unannounced would
    // read as a bug; showing an empty panel would lose the record.
    expect(noteFor({ ...note, en: null }, "en")).toEqual({
      text: "Deutscher Text",
      translated: false,
    });
  });

  it("never marks German as a fallback for a German reader", () => {
    // The flag drives a notice saying "only the German text exists". A
    // German reader must not be told their own language is a substitute.
    expect(noteFor({ ...note, en: null }, "de").translated).toBe(true);
  });
});
