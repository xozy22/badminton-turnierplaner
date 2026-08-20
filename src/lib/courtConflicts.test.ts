import { describe, it, expect, beforeEach } from "vitest";
import { getRunningPlayerCourts, getMatchConflicts } from "./courtConflicts";
import { makeMatch, resetIds } from "../test/factories";

beforeEach(resetIds);

describe("getRunningPlayerCourts", () => {
  it("indexes every player on a court", () => {
    const onCourt = makeMatch({ court: 2, status: "active", team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 });
    const map = getRunningPlayerCourts([onCourt]);

    expect([...map.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(map.get(1)).toEqual({ court: 2, matchId: onCourt.id });
  });

  it("counts pending matches that already hold a court", () => {
    const pending = makeMatch({ court: 1, status: "pending" });
    expect(getRunningPlayerCourts([pending]).size).toBe(2);
  });

  it("ignores matches without a court", () => {
    expect(getRunningPlayerCourts([makeMatch({ court: null })]).size).toBe(0);
  });

  it("ignores completed matches", () => {
    expect(getRunningPlayerCourts([makeMatch({ court: 1, status: "completed" })]).size).toBe(0);
  });

  it("skips null and placeholder player slots", () => {
    const singles = makeMatch({ court: 1, status: "active", team1_p1: 1, team1_p2: null, team2_p1: 2, team2_p2: 0 });
    expect([...getRunningPlayerCourts([singles]).keys()].sort()).toEqual([1, 2]);
  });

  it("keeps the first claim when a player appears twice", () => {
    const first = makeMatch({ court: 1, status: "active", team1_p1: 1 });
    const second = makeMatch({ court: 5, status: "active", team1_p1: 1 });
    const map = getRunningPlayerCourts([first, second]);
    expect(map.get(1)).toEqual({ court: 1, matchId: first.id });
  });
});

describe("getMatchConflicts", () => {
  it("reports nothing when no player is busy", () => {
    const running = getRunningPlayerCourts([makeMatch({ court: 1, status: "active", team1_p1: 5, team2_p1: 6 })]);
    const candidate = makeMatch({ team1_p1: 1, team2_p1: 2 });
    expect(getMatchConflicts(candidate, running)).toEqual([]);
  });

  it("reports the player, their court and the blocking match", () => {
    const busy = makeMatch({ court: 3, status: "active", team1_p1: 1, team2_p1: 9 });
    const running = getRunningPlayerCourts([busy]);
    const candidate = makeMatch({ team1_p1: 1, team2_p1: 2 });

    expect(getMatchConflicts(candidate, running)).toEqual([
      { playerId: 1, court: 3, conflictingMatchId: busy.id },
    ]);
  });

  it("reports every conflicting player of a doubles match", () => {
    const busyA = makeMatch({ court: 1, status: "active", team1_p1: 1, team2_p1: 9 });
    const busyB = makeMatch({ court: 2, status: "active", team1_p1: 4, team2_p1: 8 });
    const running = getRunningPlayerCourts([busyA, busyB]);
    const candidate = makeMatch({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 });

    expect(getMatchConflicts(candidate, running).map((c) => c.playerId).sort()).toEqual([1, 4]);
  });

  it("does not flag a match against itself when moving courts", () => {
    const assigned = makeMatch({ court: 1, status: "active", team1_p1: 1, team2_p1: 2 });
    const running = getRunningPlayerCourts([assigned]);
    expect(getMatchConflicts(assigned, running)).toEqual([]);
  });

  it("skips null and placeholder slots", () => {
    const busy = makeMatch({ court: 1, status: "active", team1_p1: 7, team2_p1: 8 });
    const running = getRunningPlayerCourts([busy]);
    const candidate = makeMatch({ team1_p1: 1, team1_p2: null, team2_p1: 2, team2_p2: 0 });
    expect(getMatchConflicts(candidate, running)).toEqual([]);
  });
});
