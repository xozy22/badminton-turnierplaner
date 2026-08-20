// src/lib/livePublish.test.ts
//
// The endpoint rule, exercised against the shapes people actually type.

import { describe, it, expect } from "vitest";
import {
  abbreviateSurname,
  buildSnapshot,
  checkEndpoint,
  type PrivacyLevel,
} from "./livePublish";
import type { GameSet, Match, Player, Round, Tournament } from "./types";

describe("checkEndpoint", () => {
  it("accepts an https endpoint", () => {
    expect(checkEndpoint("https://verein.de/wp-json/boss/v1/push")).toEqual({ ok: true });
  });

  it("accepts surrounding whitespace — pasting a URL usually brings some", () => {
    expect(checkEndpoint("  https://verein.de/wp-json/boss/v1/push\n")).toEqual({ ok: true });
  });

  it("rejects http, which would send the secret in the clear", () => {
    expect(checkEndpoint("http://verein.de/wp-json/boss/v1/push")).toEqual({
      ok: false,
      reason: "insecure",
    });
  });

  it("rejects http on localhost too — the rule has no convenience exception", () => {
    expect(checkEndpoint("http://localhost:8080/wp-json/boss/v1/push")).toEqual({
      ok: false,
      reason: "insecure",
    });
  });

  it("rejects a scheme that is neither", () => {
    // file: and data: parse fine as URLs, so the check has to look at the
    // protocol rather than merely at whether parsing succeeded.
    expect(checkEndpoint("file:///etc/passwd")).toEqual({ ok: false, reason: "insecure" });
    expect(checkEndpoint("javascript:alert(1)")).toEqual({ ok: false, reason: "insecure" });
  });

  it("rejects a bare host without a scheme", () => {
    expect(checkEndpoint("verein.de/wp-json/boss/v1/push")).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("reports an empty field as empty, not as malformed", () => {
    // The form uses this to stay quiet until there is something to judge.
    expect(checkEndpoint("")).toEqual({ ok: false, reason: "empty" });
    expect(checkEndpoint("   ")).toEqual({ ok: false, reason: "empty" });
  });
});

describe("abbreviateSurname", () => {
  it("reduces a surname to its initial", () => {
    expect(abbreviateSurname("Mustermann")).toBe("M.");
  });

  it("keeps both halves of a double-barrelled name", () => {
    // Dropping half of someone's name reads as a bug to the person who
    // owns it, so both initials survive.
    expect(abbreviateSurname("Müller-Lüdenscheidt")).toBe("M.-L.");
  });

  it("uppercases a lowercase particle", () => {
    expect(abbreviateSurname("van Dijk")).toBe("V.");
  });

  it("survives an empty surname", () => {
    // Players may be entered with a first name only.
    expect(abbreviateSurname("")).toBe("");
    expect(abbreviateSurname("   ")).toBe("");
  });
});

describe("buildSnapshot — what actually leaves the app", () => {
  const player = (id: number, first: string, last: string): Player => ({
    id,
    first_name: first,
    last_name: last,
    gender: "m",
    birth_date: "1998-04-12",
    club: "OSC Blau-Gelb",
    created_at: "2026-01-01T00:00:00Z",
  });

  const players = [player(1, "Max", "Mustermann"), player(2, "Erik", "Beispiel")];

  const tournament = {
    id: 7,
    name: "Vereinsmeisterschaft",
    mode: "singles",
    format: "round_robin",
    status: "running",
    num_groups: 0,
    created_at: "2026-01-01T00:00:00Z",
  } as unknown as Tournament;

  const rounds = [
    { id: 1, tournament_id: 7, round_number: 1, phase: "main", group_number: null },
  ] as unknown as Round[];

  const matches = [
    {
      id: 1, round_id: 1, tournament_id: 7,
      team1_p1: 1, team1_p2: null, team2_p1: 2, team2_p2: null,
      status: "done", court: 1, winner_team: 1,
    },
  ] as unknown as Match[];

  const sets = [
    { id: 1, match_id: 1, set_number: 1, team1_score: 21, team2_score: 15 },
  ] as unknown as GameSet[];

  const build = (privacyLevel?: PrivacyLevel) =>
    buildSnapshot(tournament, players, rounds, matches, sets, "1.0.0", { privacyLevel });

  it("never publishes the birth date", () => {
    // It did. The players map was filtered, but the standings tables
    // carried the whole Player row — birth date and gender included — to a
    // public website, contradicting the promise in the module header.
    for (const level of ["full", "abbreviated", "abbreviated_no_club"] as const) {
      expect(JSON.stringify(build(level))).not.toContain("1998-04-12");
    }
  });

  it("never publishes gender or internal timestamps", () => {
    const json = JSON.stringify(build("full"));
    expect(json).not.toContain('"gender"');
    expect(json).not.toContain('"created_at"');
  });

  it("publishes full names by default, so existing sites keep their display", () => {
    const snap = buildSnapshot(tournament, players, rounds, matches, sets, "1.0.0");
    expect(snap.players[1]).toEqual({
      id: 1, first_name: "Max", last_name: "Mustermann", club: "OSC Blau-Gelb",
    });
  });

  it("abbreviates in the standings too, not only in the players map", () => {
    // The two paths are filtered separately, which is exactly how the
    // original leak happened.
    const snap = build("abbreviated");
    expect(snap.players[1].last_name).toBe("M.");
    const first = snap.standings[0] as { player: { last_name: string; club: string | null } };
    expect(first.player.last_name).toBe("M.");
    expect(first.player.club).toBe("OSC Blau-Gelb");
  });

  it("drops the club at the strictest level", () => {
    const snap = build("abbreviated_no_club");
    expect(snap.players[1].club).toBeNull();
    const first = snap.standings[0] as { player: { club: string | null } };
    expect(first.player.club).toBeNull();
    expect(JSON.stringify(snap)).not.toContain("OSC Blau-Gelb");
  });
});
