// src/lib/stats.test.ts
//
// The statistics page's arithmetic.
//
// It had no tests at all, which stopped mattering the moment match
// durations started coming from a stored value rather than two
// timestamps: the page and the schedule forecast now share that
// decision, and nothing was checking this side of it.

import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateTournamentStats,
  calculateMatchStats,
  calculateCourtStats,
  calculatePlayerDemographics,
  calculatePlayerRankings,
} from "./stats";
import { makePlayer, makeMatch, resetIds } from "../test/factories";
import type { GameSet, Match, Tournament } from "./types";

beforeEach(resetIds);

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1,
    name: "T",
    mode: "singles",
    format: "round_robin",
    sets_to_win: 2,
    points_per_set: 21,
    cap: 30,
    ko_points_per_set: null,
    ko_sets_to_win: null,
    ko_cap: null,
    courts: 2,
    num_groups: 0,
    qualify_per_group: 0,
    current_phase: null,
    entry_fee_single: 0,
    entry_fee_double: 0,
    team_config: null,
    hall_config: null,
    venue_id: 1,
    min_rest_minutes: 0,
    enable_third_place: 0,
    session_id: null,
    planned_rounds: null,
    play_date: null,
    start_time: null,
    fee_due: "participation",
    created_at: "2026-08-01T10:00:00.000Z",
    status: "completed",
    ...overrides,
  };
}

/** A finished match that took `minutes`, recorded the settled way. */
function played(minutes: number, overrides: Partial<Match> = {}): Match {
  return makeMatch({
    status: "completed",
    winner_team: 1,
    court: 1,
    started_at: "2026-08-19T18:00:00.000Z",
    completed_at: "2026-08-19T18:30:00.000Z",
    duration_seconds: minutes * 60,
    ...overrides,
  });
}

const setsOf = (matchId: number, scores: [number, number][]): Map<number, GameSet[]> =>
  new Map([
    [
      matchId,
      scores.map(([a, b], i) => ({
        id: i + 1,
        match_id: matchId,
        set_number: i + 1,
        team1_score: a,
        team2_score: b,
      })),
    ],
  ]);

describe("calculateTournamentStats", () => {
  it("counts by status, format and mode", () => {
    const stats = calculateTournamentStats([
      tournament({ status: "active", format: "round_robin", mode: "singles" }),
      tournament({ status: "active", format: "elimination", mode: "doubles" }),
      tournament({ status: "draft", format: "round_robin", mode: "singles" }),
    ]);

    expect(stats.total).toBe(3);
    expect(stats.byStatus).toEqual({ draft: 1, active: 2, completed: 0, archived: 0 });
    expect(stats.byFormat[0]).toEqual({ format: "round_robin", count: 2 });
    expect(stats.byMode[0]).toEqual({ mode: "singles", count: 2 });
  });

  it("sorts formats by how often they are used", () => {
    const stats = calculateTournamentStats([
      tournament({ format: "swiss" }),
      tournament({ format: "elimination" }),
      tournament({ format: "elimination" }),
    ]);
    expect(stats.byFormat.map((f) => f.format)).toEqual(["elimination", "swiss"]);
  });

  it("handles an empty list", () => {
    const stats = calculateTournamentStats([]);
    expect(stats.total).toBe(0);
    expect(stats.byFormat).toEqual([]);
  });
});

describe("calculateMatchStats", () => {
  it("counts only finished matches", () => {
    const stats = calculateMatchStats(
      [played(20), makeMatch({ status: "active" })],
      new Map(),
    );
    expect(stats.totalCompleted).toBe(1);
  });

  it("averages the durations", () => {
    const stats = calculateMatchStats([played(20), played(30)], new Map());
    expect(stats.avgDurationMinutes).toBe(25);
  });

  it("uses the settled duration over the timestamps", () => {
    // The match below claims thirty minutes between its timestamps and
    // twelve in duration_seconds -- which is what a correction hours
    // later looks like. The stored value is the one that was played.
    const stats = calculateMatchStats([played(12)], new Map());
    expect(stats.avgDurationMinutes).toBe(12);
  });

  it("falls back to the timestamps for older matches", () => {
    const legacy = played(0, { duration_seconds: null });
    const stats = calculateMatchStats([legacy], new Map());
    expect(stats.avgDurationMinutes).toBe(30);
  });

  it("names the longest and shortest", () => {
    const short = played(15);
    const long = played(45);
    const stats = calculateMatchStats([short, long], new Map());
    expect(stats.longestMatch).toMatchObject({ matchId: long.id, durationMinutes: 45 });
    expect(stats.shortestMatch).toMatchObject({ matchId: short.id, durationMinutes: 15 });
  });

  it("reports no duration when nothing was measured", () => {
    const stats = calculateMatchStats(
      [played(0, { duration_seconds: null, started_at: null })],
      new Map(),
    );
    expect(stats.avgDurationMinutes).toBeNull();
    expect(stats.longestMatch).toBeNull();
  });

  it("adds up sets and points", () => {
    const m = played(20);
    const stats = calculateMatchStats([m], setsOf(m.id, [[21, 15], [21, 18]]));
    expect(stats.totalSets).toBe(2);
    expect(stats.totalPoints).toBe(21 + 15 + 21 + 18);
    expect(stats.avgPointsPerSet).toBeCloseTo(37.5, 1);
  });

  it("finds the closest match by point difference", () => {
    const wide = played(20);
    const close = played(20);
    const sets = new Map([
      ...setsOf(wide.id, [[21, 5]]),
      ...setsOf(close.id, [[22, 20]]),
    ]);
    const stats = calculateMatchStats([wide, close], sets);
    expect(stats.closestMatch).toMatchObject({ matchId: close.id, delta: 2 });
  });

  it("survives a match with no sets at all", () => {
    // A walkover: finished, but nothing was played.
    const stats = calculateMatchStats([played(20, { walkover: 1 })], new Map());
    expect(stats.totalSets).toBe(0);
    expect(stats.avgPointsPerSet).toBe(0);
  });
});

describe("calculateCourtStats", () => {
  it("counts matches per court", () => {
    const stats = calculateCourtStats([
      played(20, { court: 1 }),
      played(20, { court: 1 }),
      played(20, { court: 2 }),
    ]);
    expect(stats.totalCourtsUsed).toBe(2);
    expect(stats.matchesPerCourt).toEqual([
      { court: 1, count: 2 },
      { court: 2, count: 1 },
    ]);
    expect(stats.avgMatchesPerCourt).toBeCloseTo(1.5, 1);
  });

  it("averages the duration per court", () => {
    const stats = calculateCourtStats([
      played(20, { court: 1 }),
      played(40, { court: 1 }),
    ]);
    expect(stats.avgDurationPerCourt).toEqual([{ court: 1, avgMinutes: 30 }]);
  });

  it("ignores matches that never had a court", () => {
    const stats = calculateCourtStats([played(20, { court: null })]);
    expect(stats.totalCourtsUsed).toBe(0);
    expect(stats.avgMatchesPerCourt).toBe(0);
  });
});

describe("calculatePlayerDemographics", () => {
  it("splits by gender", () => {
    const stats = calculatePlayerDemographics([
      makePlayer({ gender: "m" }),
      makePlayer({ gender: "m" }),
      makePlayer({ gender: "f" }),
    ]);
    expect(stats.totalPlayers).toBe(3);
    expect(stats.genderSplit).toEqual({ male: 2, female: 1 });
  });

  it("counts players without a club separately", () => {
    const stats = calculatePlayerDemographics([
      makePlayer({ club: "TSV" }),
      makePlayer({ club: null }),
      makePlayer({ club: "" }),
    ]);
    expect(stats.noClub).toBe(2);
    expect(stats.topClubs).toEqual([{ club: "TSV", count: 1 }]);
  });

  it("puts players into age groups by birth date", () => {
    const stats = calculatePlayerDemographics([
      makePlayer({ birth_date: "2015-01-01" }),
      makePlayer({ birth_date: "2000-01-01" }),
    ]);
    const total = stats.ageGroups.reduce((n, g) => n + g.count, 0);
    expect(total).toBe(2);
  });

  it("handles nobody at all", () => {
    const stats = calculatePlayerDemographics([]);
    expect(stats.totalPlayers).toBe(0);
    expect(stats.topClubs).toEqual([]);
  });
});

describe("calculatePlayerRankings", () => {
  it("counts wins and losses per player", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const m = played(20, { team1_p1: a.id, team2_p1: b.id, winner_team: 1 });

    const table = calculatePlayerRankings([m], setsOf(m.id, [[21, 15]]), [a, b]);

    expect(table[0]).toMatchObject({ wins: 1, losses: 0, totalMatches: 1, winRate: 100 });
    expect(table[1]).toMatchObject({ wins: 0, losses: 1, winRate: 0 });
  });

  it("adds up points from both sides of a set", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const m = played(20, { team1_p1: a.id, team2_p1: b.id, winner_team: 1 });

    const table = calculatePlayerRankings([m], setsOf(m.id, [[21, 15]]), [a, b]);

    expect(table[0].totalPointsWon).toBe(21);
    expect(table[0].totalPointsLost).toBe(15);
    expect(table[1].totalPointsWon).toBe(15);
  });

  it("counts both partners of a doubles pair", () => {
    const [a, b, c, d] = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    const m = played(20, {
      team1_p1: a.id, team1_p2: b.id,
      team2_p1: c.id, team2_p2: d.id,
      winner_team: 1,
    });

    const table = calculatePlayerRankings([m], setsOf(m.id, [[21, 15]]), [a, b, c, d]);
    const winners = table.filter((e) => e.wins === 1).map((e) => e.player.id);
    expect(winners.sort()).toEqual([a.id, b.id].sort());
  });

  it("leaves out matches with no winner", () => {
    // A match closed as "no match": nobody played, nobody won.
    const [a, b] = [makePlayer(), makePlayer()];
    const m = played(20, {
      team1_p1: a.id, team2_p1: b.id,
      winner_team: null, outcome: "no_match",
    });

    const table = calculatePlayerRankings([m], new Map(), [a, b]);
    expect(table.every((e) => e.totalMatches === 0)).toBe(true);
  });

  it("ranks the better record first", () => {
    const [a, b, c] = [makePlayer(), makePlayer(), makePlayer()];
    const wins = [
      played(20, { team1_p1: a.id, team2_p1: b.id, winner_team: 1 }),
      played(20, { team1_p1: a.id, team2_p1: c.id, winner_team: 1 }),
      played(20, { team1_p1: b.id, team2_p1: c.id, winner_team: 1 }),
    ];

    const table = calculatePlayerRankings(wins, new Map(), [a, b, c]);
    expect(table[0].player.id).toBe(a.id);
  });
});
