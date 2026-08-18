// Test factories — minimal builders for the domain objects the pure logic
// modules operate on. Keep these dumb: every field has a boring default and
// every test overrides only what it actually cares about.

import type { Player, Match, GameSet, Gender, MatchStatus } from "../lib/types";

let nextPlayerId = 1;
let nextMatchId = 1;
let nextSetId = 1;

/** Resets the id counters so ids stay small and readable per test file. */
export function resetIds(): void {
  nextPlayerId = 1;
  nextMatchId = 1;
  nextSetId = 1;
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  const id = overrides.id ?? nextPlayerId++;
  return {
    id,
    first_name: `Player${id}`,
    last_name: "",
    gender: "m",
    birth_date: null,
    club: null,
    created_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

/** `makePlayers(4)` → four male players with ids 1..4. */
export function makePlayers(count: number, gender: Gender = "m"): Player[] {
  return Array.from({ length: count }, () => makePlayer({ gender }));
}

/** `makePlayers` variant with an explicit gender split (m first, then f). */
export function makeMixedPlayers(males: number, females: number): Player[] {
  return [...makePlayers(males, "m"), ...makePlayers(females, "f")];
}

export function makeMatch(overrides: Partial<Match> = {}): Match {
  const id = overrides.id ?? nextMatchId++;
  return {
    id,
    round_id: 1,
    court: null,
    court_assigned_at: null,
    team1_p1: 1,
    team1_p2: null,
    team2_p1: 2,
    team2_p2: null,
    winner_team: null,
    status: "pending" as MatchStatus,
    walkover: 0,
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

/**
 * Completed singles match helper: `makeCompleted(1, 2, [[21, 15], [21, 18]])`
 * = player 1 beat player 2 in two sets. Returns the match plus its sets so a
 * test can feed both into the standings calculator.
 */
export function makeCompleted(
  winnerId: number,
  loserId: number,
  setScores: [number, number][],
  overrides: Partial<Match> = {},
): { match: Match; sets: GameSet[] } {
  const match = makeMatch({
    team1_p1: winnerId,
    team2_p1: loserId,
    winner_team: 1,
    status: "completed",
    completed_at: "2026-01-01T12:00:00.000Z",
    ...overrides,
  });
  const sets = setScores.map(([a, b], i) =>
    makeSet({ match_id: match.id, set_number: i + 1, team1_score: a, team2_score: b }),
  );
  return { match, sets };
}

export function makeSet(overrides: Partial<GameSet> = {}): GameSet {
  return {
    id: overrides.id ?? nextSetId++,
    match_id: 1,
    set_number: 1,
    team1_score: 0,
    team2_score: 0,
    ...overrides,
  };
}

/** Groups a flat set list into the Map<matchId, GameSet[]> the calculators expect. */
export function setsByMatch(sets: GameSet[]): Map<number, GameSet[]> {
  const map = new Map<number, GameSet[]>();
  for (const s of sets) {
    const arr = map.get(s.match_id);
    if (arr) arr.push(s);
    else map.set(s.match_id, [s]);
  }
  return map;
}

/**
 * Every scoring mode the app offers, as a table for parameterised tests.
 * Mirrors SCORING_MODES in lib/scoring.ts — kept separate on purpose so a
 * silent change there shows up as a failing test rather than as a test that
 * changes its own expectations.
 */
export const SCORING_TABLE = [
  { id: "11_hard", pointsPerSet: 11, cap: null },
  { id: "11_ext", pointsPerSet: 11, cap: 20 },
  { id: "15_hard", pointsPerSet: 15, cap: null },
  { id: "15_ext", pointsPerSet: 15, cap: 25 },
  { id: "21_ext", pointsPerSet: 21, cap: 30 },
] as const;
