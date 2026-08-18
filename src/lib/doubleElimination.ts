// src/lib/doubleElimination.ts
//
// Double elimination: winners bracket, losers bracket, grand final.
//
// The previous implementation built the losers bracket by taking the
// dropouts of one winners round and pairing them among themselves — its own
// comment said "For simplicity". That produces parallel, unconnected losers
// strands: players who won in the losers bracket were never matched against
// the newly dropped players, so the bracket never converged on a single
// losers champion, and the grand final was detected by fragile length
// checks (REVIEW-BACKLOG.md B4).
//
// The real structure alternates two kinds of losers rounds:
//
//   minor — losers-bracket survivors vs. the players who just dropped out
//           of the winners bracket
//   major — the winners of a minor round play each other
//
// This module derives the current state from the stored matches and says
// what has to be created next. It holds no database access and no React, so
// every rule below is directly testable.

export interface Participant {
  p1: number;
  p2: number | null;
}

export interface BracketMatchState {
  /** Which bracket the match belongs to. */
  phase: "winners" | "losers" | "grand_final";
  /** Round number within the tournament, ascending. */
  roundNumber: number;
  team1: Participant;
  /** null marks a bye: team1 advances. */
  team2: Participant | null;
  /** 1 or 2 once decided, null while the match is open. */
  winner: 1 | 2 | null;
}

export interface NextRound {
  phase: "winners" | "losers" | "grand_final";
  pairings: { team1: Participant; team2: Participant | null }[];
  /** Set when the grand final needs a rerun because the LB champion won. */
  isBracketReset?: boolean;
}

const same = (a: Participant, b: Participant): boolean =>
  a.p1 === b.p1 && (a.p2 ?? null) === (b.p2 ?? null);

const contains = (list: Participant[], p: Participant): boolean =>
  list.some((x) => same(x, p));

function winnerOf(m: BracketMatchState): Participant | null {
  if (m.team2 === null) return m.team1; // bye
  if (!m.winner) return null;
  return m.winner === 1 ? m.team1 : m.team2;
}

function loserOf(m: BracketMatchState): Participant | null {
  if (m.team2 === null) return null; // a bye has no loser
  if (!m.winner) return null;
  return m.winner === 1 ? m.team2 : m.team1;
}

/** Groups matches into rounds, keeping the round order. */
function roundsOf(matches: BracketMatchState[], phase: BracketMatchState["phase"]) {
  const byRound = new Map<number, BracketMatchState[]>();
  for (const m of matches) {
    if (m.phase !== phase) continue;
    const bucket = byRound.get(m.roundNumber);
    if (bucket) bucket.push(m);
    else byRound.set(m.roundNumber, [m]);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, ms]) => ({ roundNumber, matches: ms }));
}

const isComplete = (ms: BracketMatchState[]) =>
  ms.length > 0 && ms.every((m) => m.team2 === null || m.winner !== null);

/** Pairs a list top-to-bottom: 1v2, 3v4, … A leftover entry gets a bye. */
function pairUp(list: Participant[]): { team1: Participant; team2: Participant | null }[] {
  const pairings: { team1: Participant; team2: Participant | null }[] = [];
  for (let i = 0; i < list.length; i += 2) {
    pairings.push({ team1: list[i], team2: list[i + 1] ?? null });
  }
  return pairings;
}

/**
 * Works out which rounds can be created right now, from the matches played
 * so far. Returns an empty list when nothing can be created — either an
 * open round has to be finished first, or the tournament is decided.
 *
 * More than one round can come back: after a winners round is played, the
 * next winners round and a losers round are usually both due, and in a real
 * hall they run in parallel.
 *
 * The losers bracket is fed one winners round at a time. Dropping every
 * waiting player in at once would let a player who lost in the quarter
 * final meet one who lost in the first round two stages too early.
 */
export function nextDoubleEliminationRounds(matches: BracketMatchState[]): NextRound[] {
  const winnersRounds = roundsOf(matches, "winners");
  const losersRounds = roundsOf(matches, "losers");
  const grandFinals = roundsOf(matches, "grand_final");

  if (winnersRounds.length === 0) return [];

  const lastWinners = winnersRounds[winnersRounds.length - 1];
  const lastLosers = losersRounds[losersRounds.length - 1] ?? null;

  const winnersReady = isComplete(lastWinners.matches);
  const losersReady = lastLosers === null || isComplete(lastLosers.matches);

  // --- Grand final ---------------------------------------------------------
  if (grandFinals.length > 0) {
    const lastGf = grandFinals[grandFinals.length - 1];
    if (!isComplete(lastGf.matches)) return [];

    // The winners-bracket champion enters the final unbeaten. If the losers
    // champion wins it, both have one defeat and the final is replayed —
    // the bracket reset. It happens at most once.
    if (grandFinals.length === 1 && lastGf.matches.length === 1) {
      const gf = lastGf.matches[0];
      if (gf.winner === 2 && gf.team2) {
        return [{
          phase: "grand_final",
          isBracketReset: true,
          pairings: [{ team1: gf.team1, team2: gf.team2 }],
        }];
      }
    }
    return []; // tournament decided
  }

  const result: NextRound[] = [];

  // Everyone who has already appeared in the losers bracket.
  const seenInLosers: Participant[] = [];
  for (const round of losersRounds) {
    for (const m of round.matches) {
      seenInLosers.push(m.team1);
      if (m.team2) seenInLosers.push(m.team2);
    }
  }

  // Dropouts grouped by the winners round they fell out of, oldest first.
  // Only complete winners rounds feed the losers bracket.
  const pendingFeeds: Participant[][] = [];
  for (const round of winnersRounds) {
    if (!isComplete(round.matches)) continue;
    const dropouts = round.matches
      .map(loserOf)
      .filter((x): x is Participant => x !== null)
      .filter((x) => !contains(seenInLosers, x));
    if (dropouts.length > 0) pendingFeeds.push(dropouts);
  }

  const winnersSurvivors = winnersReady
    ? lastWinners.matches.map(winnerOf).filter((x): x is Participant => x !== null)
    : [];
  const losersSurvivors =
    lastLosers && losersReady
      ? lastLosers.matches.map(winnerOf).filter((x): x is Participant => x !== null)
      : [];

  // --- Winners bracket -----------------------------------------------------
  if (winnersReady && winnersSurvivors.length > 1) {
    result.push({ phase: "winners", pairings: pairUp(winnersSurvivors) });
  }

  // --- Losers bracket ------------------------------------------------------
  if (losersReady) {
    const feed = pendingFeeds[0] ?? [];

    if (losersRounds.length === 0) {
      // Opening losers round: the first winners round's dropouts only.
      if (feed.length > 1) {
        result.push({ phase: "losers", pairings: pairUp(feed) });
      } else if (feed.length === 1 && winnersSurvivors.length <= 1) {
        // Small bracket: a single dropout goes straight through.
        result.push({ phase: "losers", pairings: [{ team1: feed[0], team2: null }] });
      }
    } else if (losersSurvivors.length > 0 && feed.length > 0) {
      // Minor round: survivors meet the players who just dropped out.
      const pairings: { team1: Participant; team2: Participant | null }[] = [];
      const count = Math.max(losersSurvivors.length, feed.length);
      for (let i = 0; i < count; i++) {
        const survivor = losersSurvivors[i];
        const dropout = feed[i];
        if (survivor && dropout) pairings.push({ team1: survivor, team2: dropout });
        else if (survivor) pairings.push({ team1: survivor, team2: null });
        else if (dropout) pairings.push({ team1: dropout, team2: null });
      }
      result.push({ phase: "losers", pairings });
    } else if (losersSurvivors.length > 1 && feed.length === 0) {
      // Major round: the survivors play among themselves.
      result.push({ phase: "losers", pairings: pairUp(losersSurvivors) });
    }
  }

  // --- Grand final ---------------------------------------------------------
  if (
    result.length === 0 &&
    winnersReady &&
    losersReady &&
    winnersSurvivors.length === 1 &&
    losersSurvivors.length === 1 &&
    pendingFeeds.length === 0
  ) {
    result.push({
      phase: "grand_final",
      pairings: [{ team1: winnersSurvivors[0], team2: losersSurvivors[0] }],
    });
  }

  return result;
}

/**
 * Semi-final losers of the losers bracket, for the optional third-place
 * match: the player who loses the last losers round finishes third, so a
 * separate bronze match is only meaningful in the round before that.
 */
export function bronzeCandidates(matches: BracketMatchState[]): Participant[] {
  const losersRounds = roundsOf(matches, "losers");
  if (losersRounds.length < 2) return [];

  const semi = losersRounds[losersRounds.length - 2];
  return semi.matches.map(loserOf).filter((p): p is Participant => p !== null);
}
