// src/lib/formats/estimate.ts
//
// How many matches a format will produce, before any of them exist.
//
// The question before every club night is "we have the hall until ten,
// we are eleven people and three courts -- which format fits?". It was
// answered from experience and often wrongly (FEATURE-BACKLOG.md H8).
//
// This is the first half of the answer: the match count. The second half
// is how long a match takes, and BOSS has been measuring that all along
// from `started_at` and `completed_at` -- see lib/duration.ts.
//
// The counts live with the format engines rather than in a switch here,
// for the same reason the display properties do (REVIEW-BACKLOG.md D2): a
// new format must not need edits in a second file. What lives here are
// the shared helpers and the shape of the answer.

/** What a format needs to know to count its matches. */
export interface EstimateSetup {
  /** How many people are entered. */
  playerCount: number;
  mode: "singles" | "doubles" | "mixed";
  /** Groups for the group stage; 0 when the format has none. */
  numGroups: number;
  /** How many advance from each group. */
  qualifyPerGroup: number;
  /** Planned rounds for Swiss, Monrad and the rotating formats. */
  plannedRounds: number;
  /** Whether a third-place match is played. */
  thirdPlace: boolean;
  /** Courts available, which caps some formats per round. */
  courts: number;
}

/**
 * The estimate.
 *
 * `matches` is null for a format that has no end of its own -- King of
 * the Court runs until somebody says stop, and pretending otherwise
 * would be worse than saying nothing.
 */
export interface MatchEstimate {
  matches: number | null;
  /**
   * True when the count depends on results rather than on the setup
   * alone, so the interface can say "about" rather than a flat number.
   * A knockout is exact; a group stage feeding a bracket is not, because
   * byes in the bracket depend on how many qualify.
   */
  approximate: boolean;
}

/** An exact count. */
export function exactly(matches: number): MatchEstimate {
  return { matches, approximate: false };
}

/** A count that depends on how the play goes. */
export function about(matches: number): MatchEstimate {
  return { matches, approximate: true };
}

/** For a format that does not end on its own. */
export const openEnded: MatchEstimate = { matches: null, approximate: false };

/**
 * Entrants: people in singles, pairs in doubles and mixed.
 *
 * An odd player in a doubles tournament cannot be half a pair, so they
 * sit out -- which is what the draw does too.
 */
export function entrantCount(setup: EstimateSetup): number {
  return setup.mode === "singles"
    ? setup.playerCount
    : Math.floor(setup.playerCount / 2);
}

/** Everybody plays everybody: n over 2. */
export function roundRobinMatches(entrants: number): number {
  return entrants < 2 ? 0 : (entrants * (entrants - 1)) / 2;
}

/**
 * A single-elimination bracket: everybody but the winner loses exactly
 * once, so the count is one less than the field.
 *
 * Byes are deliberately not counted. The bracket is filled to the next
 * power of two and the empty slots are stored as completed bye matches --
 * so a field of five produces seven match rows but only four played
 * matches. This estimate answers "how long will this take", and a bye
 * takes no time at all.
 */
export function knockoutMatches(entrants: number): number {
  return entrants < 2 ? 0 : entrants - 1;
}

/**
 * Double elimination: everybody but the winner has to lose twice, so
 * roughly twice the field. The grand final is played once or twice
 * depending on who wins it, which is why this is never exact.
 */
export function doubleEliminationMatches(entrants: number): number {
  return entrants < 2 ? 0 : 2 * entrants - 2;
}

/**
 * A format that draws a fixed number of rounds, each seating as many
 * players as the courts and the field allow.
 *
 * `perMatch` is 2 for singles and 4 for doubles: whoever does not fit
 * sits the round out.
 *
 * `courts` caps the round only where the format itself caps it. Swiss,
 * Monrad and random doubles pair everybody and let the matches queue for
 * a court; Waterfall draws only as many as there are courts. Pass 0 for
 * the first kind.
 */
export function roundBasedMatches(
  playerCount: number,
  rounds: number,
  perMatch: 2 | 4,
  courts: number,
): number {
  const seatable = Math.floor(playerCount / perMatch);
  const perRound = courts > 0 ? Math.min(seatable, courts) : seatable;
  return Math.max(0, perRound) * Math.max(0, rounds);
}
