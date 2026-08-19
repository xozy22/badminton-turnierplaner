// src/lib/sessionContext.test.ts
//
// The cross-tournament view: which courts are taken and who is on them,
// across every tournament sharing a venue.
//
// This is where a mistake is physical rather than cosmetic — two matches
// on one court, or one player called to two courts at once. It was the
// only part of the session feature without tests (REVIEW-BACKLOG.md).

import { describe, it, expect } from "vitest";
import { getSessionCourtOccupancy, getSessionPlayerCourts } from "./sessionContext";
import type { SessionMatch } from "./sessionContext";

let nextId = 1;

function m(overrides: Partial<SessionMatch> = {}): SessionMatch {
  return {
    id: nextId++,
    round_id: 1,
    tournament_id: 1,
    tournament_name: "Turnier A",
    tournament_format: "round_robin",
    team1_p1: 1,
    team1_p2: null,
    team2_p1: 2,
    team2_p2: null,
    winner_team: null,
    status: "pending",
    court: null,
    court_assigned_at: null,
    walkover: 0,
    created_at: "2026-01-01T10:00:00Z",
    completed_at: null,
    ...overrides,
  } as unknown as SessionMatch;
}

describe("getSessionCourtOccupancy", () => {
  it("reports the match holding each court", () => {
    const matches = [
      m({ court: 1, status: "active" }),
      m({ court: 2, status: "pending", tournament_id: 2, tournament_name: "Turnier B" }),
    ];
    const occ = getSessionCourtOccupancy(matches);
    expect([...occ.keys()].sort()).toEqual([1, 2]);
    expect(occ.get(2)!.tournament_name).toBe("Turnier B");
  });

  it("frees a court when the match on it is finished", () => {
    const occ = getSessionCourtOccupancy([m({ court: 1, status: "completed" })]);
    expect(occ.size).toBe(0);
  });

  it("ignores matches waiting for a court", () => {
    expect(getSessionCourtOccupancy([m({ court: null })]).size).toBe(0);
  });

  it("sees a court as taken across tournament boundaries", () => {
    // The whole point: tournament B must not be told court 1 is free just
    // because none of its own matches is on it.
    const occ = getSessionCourtOccupancy([
      m({ court: 1, status: "active", tournament_id: 1, tournament_name: "A" }),
    ]);
    expect(occ.get(1)!.tournament_id).toBe(1);
  });

  it("on a double booking, the later assignment holds the court", () => {
    // Should not happen — but if two tournaments both claim court 1, the
    // dashboard has to name one, and the most recent claim is the one the
    // players acted on.
    const early = m({ court: 1, status: "active", court_assigned_at: "2026-01-01T10:00:00Z" });
    const late = m({
      court: 1,
      status: "active",
      court_assigned_at: "2026-01-01T11:00:00Z",
      tournament_id: 2,
      tournament_name: "B",
    });
    expect(getSessionCourtOccupancy([early, late]).get(1)!.tournament_id).toBe(2);
    // Order of the input must not change the answer.
    expect(getSessionCourtOccupancy([late, early]).get(1)!.tournament_id).toBe(2);
  });
});

describe("getSessionPlayerCourts", () => {
  it("locates a player by the court they are on", () => {
    const map = getSessionPlayerCourts([m({ court: 3, status: "active" })]);
    expect(map.get(1)).toMatchObject({ court: 3, tournamentId: 1 });
    expect(map.get(2)).toMatchObject({ court: 3 });
  });

  it("locates all four players of a doubles match", () => {
    const map = getSessionPlayerCourts([
      m({ court: 1, status: "active", team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 }),
    ]);
    expect([...map.keys()].sort()).toEqual([1, 2, 3, 4]);
  });

  it("finds a player who is playing in the other tournament", () => {
    // The reason this map exists: someone entered in both tournaments of a
    // session cannot be called to a court in one while playing in the other.
    const map = getSessionPlayerCourts([
      m({
        court: 2,
        status: "active",
        tournament_id: 7,
        tournament_name: "Turnier B",
        team1_p1: 42,
        team2_p1: 43,
      }),
    ]);
    expect(map.get(42)).toMatchObject({ court: 2, tournamentId: 7, tournamentName: "Turnier B" });
  });

  it("forgets a player once their match is finished", () => {
    expect(getSessionPlayerCourts([m({ court: 1, status: "completed" })]).size).toBe(0);
  });

  it("ignores players in matches that have no court yet", () => {
    expect(getSessionPlayerCourts([m({ court: null, status: "pending" })]).size).toBe(0);
  });

  it("skips empty and placeholder slots", () => {
    // Singles leaves p2 null; legacy rows use 0 for a BYE.
    const map = getSessionPlayerCourts([
      m({ court: 1, status: "active", team1_p1: 5, team1_p2: null, team2_p1: 0, team2_p2: null }),
    ]);
    expect([...map.keys()]).toEqual([5]);
  });

  it("keeps the first location when a player somehow appears twice", () => {
    const map = getSessionPlayerCourts([
      m({ court: 1, status: "active", team1_p1: 9, team2_p1: 10 }),
      m({ court: 2, status: "active", team1_p1: 9, team2_p1: 11 }),
    ]);
    expect(map.get(9)!.court).toBe(1);
  });
});
