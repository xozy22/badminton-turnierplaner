// src/lib/formats/types.ts
//
// One interface per tournament format, instead of the same nine-way
// if/else chain repeated in five places.
//
// TournamentView used to branch on `tournament.format` when starting a
// tournament, when drawing the next round, when deciding whether a round
// *can* be drawn, for the round counter and for the phase label. Adding a
// format meant finding all of them — which is exactly how Monrad ended up
// as a copy of Swiss and King of the Court never rotated its queue
// (REVIEW-BACKLOG.md D2).
//
// An engine is pure: it receives the current state and returns what should
// be written. Persisting is the caller's job, which keeps the engines
// testable without a database.

import type {
  Tournament,
  TournamentFormat,
  Player,
  Round,
  Match,
  GameSet,
} from "../types";
import type { RoundSpec } from "../db";

/**
 * Per-format state that does not fit the match tables — currently only the
 * King-of-the-Court queue and which rounds hold a grand final. Loaded and
 * saved by the caller (app_settings), passed through here.
 */
export interface FormatState {
  kotcQueue?: number[];
  grandFinalRoundIds?: number[];
}

/** Everything an engine may look at. Read-only from the engine's side. */
export interface FormatContext {
  tournament: Tournament;
  /** Participants still in the tournament (retired players removed). */
  players: Player[];
  rounds: Round[];
  matchesByRound: Map<number, Match[]>;
  setsByMatch: Map<number, GameSet[]>;
  allMatches: Match[];
  /** Seed order (best first), from the persisted seed_rank column. */
  seedOrder: number[];
  /** Fixed teams for doubles/mixed formats. */
  teams: [number, number][];
  /**
   * Court to put a new match on: 1 when the venue has a single court (no
   * drag and drop needed), otherwise null so the director assigns it.
   */
  courtForNewMatch: number | null;
  formatState: FormatState;
}

/** What an engine wants written. */
export interface FormatPlan {
  rounds: RoundSpec[];
  /** New tournament phase, when this step changes it. */
  phase?: string | null;
  /** New tournament status, e.g. "active" when starting. */
  status?: string;
  /** Players sitting this round out, so the UI can name them. */
  byePlayers?: number[];
  /** Format state to persist together with the schedule. */
  stateUpdates?: FormatState;
  /** Whether the view should switch to the last created round. */
  activateLastRound?: boolean;
}

/**
 * What a format needs shown, as opposed to how it plays.
 *
 * The view used to answer these by testing `tournament.format` — fourteen
 * times, for the bracket, the Buchholz column, the group progress bar and
 * the King-of-the-Court queue. Adding a format meant finding all of them
 * again, in a different file (REVIEW-BACKLOG.md D2).
 */
export interface FormatDisplay {
  /** Draws a bracket rather than a table of rounds. */
  hasBracket: boolean;
  /** Runs a group phase before anything else. */
  hasGroupPhase: boolean;
  /** Standings carry a Buchholz column. */
  usesBuchholz: boolean;
  /** Players wait in a queue rather than being drawn into rounds. */
  usesQueue: boolean;
  /** Pairings change every round, so fixed teams make no sense. */
  reshufflesPartners: boolean;
}

export interface FormatEngine {
  id: TournamentFormat;
  /**
   * Whether the format uses fixed pairings that are formed up front.
   * Round-robin doubles and knockout do; random doubles does not.
   */
  usesFixedTeams: boolean;
  /** How the format wants to be shown. See {@link FormatDisplay}. */
  display: FormatDisplay;
  /** The opening schedule. `null` when the setup cannot produce one. */
  start(ctx: FormatContext): FormatPlan | null;
  /** Whether {@link advance} would produce anything right now. */
  canAdvance(ctx: FormatContext): boolean;
  /** The next round(s). `null` when there is nothing to create. */
  advance(ctx: FormatContext): FormatPlan | null;
  /**
   * Optional progress label, e.g. "Round 3 of 5". Returns null for formats
   * whose length is not known in advance.
   */
  progress?(ctx: FormatContext): { current: number; total: number } | null;
}

/** Rounds of a phase, oldest first. */
export function roundsOfPhase(ctx: FormatContext, phase: string | null): Round[] {
  return ctx.rounds.filter((r) => r.phase === phase);
}

/** True when every match of the round is decided (byes count as decided). */
export function roundComplete(ctx: FormatContext, roundId: number): boolean {
  const matches = ctx.matchesByRound.get(roundId) ?? [];
  return matches.length > 0 && matches.every((m) => m.status === "completed");
}

/** The last round of a phase, or null. */
export function lastRoundOfPhase(ctx: FormatContext, phase: string | null): Round | null {
  const rounds = roundsOfPhase(ctx, phase);
  return rounds.length > 0 ? rounds[rounds.length - 1] : null;
}

/** Next round number: rounds are numbered continuously across phases. */
export function nextRoundNumber(ctx: FormatContext): number {
  return ctx.rounds.length + 1;
}

/** Winners of a round; a bye advances its player. */
export function winnersOfRound(ctx: FormatContext, roundId: number): {
  p1: number;
  p2: number | null;
}[] {
  const winners: { p1: number; p2: number | null }[] = [];
  for (const m of ctx.matchesByRound.get(roundId) ?? []) {
    if (!m.winner_team) continue;
    if (m.team2_p1 === null || m.winner_team === 1) {
      winners.push({ p1: m.team1_p1, p2: m.team1_p2 });
    } else {
      winners.push({ p1: m.team2_p1, p2: m.team2_p2 });
    }
  }
  return winners;
}

/** Losers of a round; byes have none. */
export function losersOfRound(ctx: FormatContext, roundId: number): {
  p1: number;
  p2: number | null;
}[] {
  const losers: { p1: number; p2: number | null }[] = [];
  for (const m of ctx.matchesByRound.get(roundId) ?? []) {
    if (!m.winner_team || m.team2_p1 === null) continue;
    if (m.winner_team === 1) {
      losers.push({ p1: m.team2_p1, p2: m.team2_p2 });
    } else {
      losers.push({ p1: m.team1_p1, p2: m.team1_p2 });
    }
  }
  return losers;
}

/** How many matches each player has played, for fair rest rotation. */
export function matchCounts(matches: Match[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const m of matches) {
    for (const pid of [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2]) {
      if (pid === null) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
  }
  return counts;
}

/** How often each player has had a bye. */
export function byeCounts(matches: Match[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const m of matches) {
    if (m.team2_p1 !== null) continue;
    for (const pid of [m.team1_p1, m.team1_p2]) {
      if (pid === null) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
  }
  return counts;
}
