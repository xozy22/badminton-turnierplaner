// src/lib/formats/simpleFormats.ts
//
// The formats whose whole schedule is either drawn up front (round robin)
// or produced one round at a time from the current standings (random
// doubles, Swiss, Monrad, King of the Court, Waterfall).
//
// Knockout formats live in their own files because they carry bracket
// structure; these do not.

import type { FormatEngine, FormatContext, FormatPlan } from "./types";
import { entrantCount, exactly, openEnded, roundBasedMatches, roundRobinMatches } from "./estimate";
import {
  roundComplete,
  roundsOfPhase,
  nextRoundNumber,
  matchCounts,
  byeCounts,
} from "./types";
import type { MatchSpec } from "../db";
import {
  generateRoundRobinSingles,
  generateRoundRobinDoubles,
  generateRandomDoublesRound,
  generateMixedDoublesRound,
  generateSwissFirstRound,
  generateSwissFirstRoundDoubles,
  generateSwissRound,
  generateSwissRoundDoubles,
  generateMonradRound,
  generateMonradRoundDoubles,
  pickByePlayer,
  generateKingOfCourtMatch,
  advanceKingOfCourtQueue,
  generateWaterfallRound,
  advanceWaterfall,
  getPreviousPairings,
  getPreviousPairingCounts,
  shufflePlayers,
} from "../draw";
import { calculateStandings, calculateTeamStandings , scoringOf} from "../scoring";

/** Matchup history for Swiss and Monrad, in the shape the draw expects. */
function matchupHistory(ctx: FormatContext, matches: { team1_p1: number; team1_p2: number | null; team2_p1: number | null; team2_p2: number | null }[]): Set<string> {
  const history = new Set<string>();
  const singles = ctx.tournament.mode === "singles";
  for (const m of matches) {
    if (m.team2_p1 === null) continue; // bye
    if (singles) {
      const ids = [m.team1_p1, m.team2_p1].sort((a, b) => a - b);
      history.add(`${ids[0]}-${ids[1]}`);
    } else {
      const t1 = [m.team1_p1, m.team1_p2!].sort((a, b) => a - b).join("-");
      const t2 = [m.team2_p1, m.team2_p2!].sort((a, b) => a - b).join("-");
      const parts = [t1, t2].sort();
      history.add(`${parts[0]}-${parts[1]}`);
    }
  }
  return history;
}

/** All matches of a phase plus their sets, for standings calculations. */
function phaseData(ctx: FormatContext, phase: string | null) {
  const matches = [];
  const sets = new Map<number, ReturnType<typeof Array.prototype.slice>>();
  for (const round of roundsOfPhase(ctx, phase)) {
    const roundMatches = ctx.matchesByRound.get(round.id) ?? [];
    matches.push(...roundMatches);
    for (const m of roundMatches) sets.set(m.id, ctx.setsByMatch.get(m.id) ?? []);
  }
  return { matches, sets: sets as Map<number, never> };
}

// ---------------------------------------------------------------- Round robin

export const roundRobinEngine: FormatEngine = {
  id: "round_robin",
  // The whole schedule exists from the start, so this is exact.
  estimate: (setup) => exactly(roundRobinMatches(entrantCount(setup))),

  display: {
    hasBracket: false,
    hasGroupPhase: false,
    usesBuchholz: false,
    usesQueue: false,
    reshufflesPartners: false,
    usesGrandFinal: false,
  },
  usesFixedTeams: true,

  start(ctx) {
    const court = ctx.courtForNewMatch;
    const rounds =
      ctx.tournament.mode === "singles"
        ? generateRoundRobinSingles(ctx.players).map((round, i) => ({
            roundNumber: i + 1,
            matches: round.map((m) => ({ team1_p1: m.team1_p1, team2_p1: m.team2_p1, court })),
          }))
        : generateRoundRobinDoubles(ctx.teams).map((round, i) => ({
            roundNumber: i + 1,
            matches: round.map((m) => ({ ...m, court })),
          }));

    return rounds.length > 0 ? { rounds, status: "active" } : null;
  },

  // The whole schedule exists from the start; doubles may draw an extra
  // round when partners were formed on the fly.
  canAdvance: () => false,
  advance: () => null,
};

// ------------------------------------------------------------ Random doubles

export const randomDoublesEngine: FormatEngine = {
  id: "random_doubles",
  // No round count is asked for anywhere -- the wizard only offers one
  // for Swiss, Monrad and Waterfall, and this engine never stops on its
  // own. A number here would be invented.
  estimate: () => openEnded,

  display: {
    hasBracket: false,
    hasGroupPhase: false,
    usesBuchholz: false,
    usesQueue: false,
    reshufflesPartners: true,
    usesGrandFinal: false,
  },
  usesFixedTeams: false,

  start(ctx) {
    // The opening round is drawn exactly like every later one.
    const plan = this.advance(ctx);
    return plan ? { ...plan, status: "active" } : null;
  },

  canAdvance(ctx) {
    if (ctx.tournament.status !== "active") return false;
    if (ctx.rounds.length === 0) return true;
    const last = ctx.rounds[ctx.rounds.length - 1];
    const matches = ctx.matchesByRound.get(last.id) ?? [];
    // A new round may be drawn as soon as the current one is under way.
    return matches.some((m) => m.status === "completed");
  },

  advance(ctx) {
    const previous = getPreviousPairings(ctx.allMatches);
    const pairingCounts = getPreviousPairingCounts(ctx.allMatches);
    const counts = matchCounts(ctx.allMatches);

    const drawn =
      ctx.tournament.mode === "mixed"
        ? generateMixedDoublesRound(ctx.players, previous, counts, pairingCounts)
        : generateRandomDoublesRound(ctx.players, previous, counts, pairingCounts);

    if (drawn.matches.length === 0) return null;

    return {
      rounds: [
        {
          roundNumber: nextRoundNumber(ctx),
          matches: drawn.matches.map((m) => ({ ...m, court: ctx.courtForNewMatch })),
        },
      ],
      byePlayers: drawn.byePlayers,
    };
  },
};

// -------------------------------------------------------------------- Swiss

/** Shared by Swiss and Monrad: both keep their rounds in phase "swiss". */
function swissLikeAdvance(ctx: FormatContext, strictRanking: boolean): FormatPlan | null {
  const { matches, sets } = phaseData(ctx, "swiss");
  const history = matchupHistory(ctx, matches);
  const court = ctx.courtForNewMatch;

  if (ctx.tournament.mode === "singles") {
    const standings = calculateStandings(ctx.players, matches, sets, {
      byesCountAsWins: true,
      withBuchholz: !strictRanking,
    });
    const byePlayer = pickByePlayer(standings, byeCounts(matches));
    const drawn = strictRanking
      ? generateMonradRound(standings, history, byePlayer)
      : generateSwissRound(standings, history, byePlayer);
    if (drawn.length === 0) return null;

    const roundMatches: MatchSpec[] = drawn.map((m) => ({
      team1_p1: m.team1_p1,
      team2_p1: m.team2_p1,
      court,
    }));
    if (byePlayer != null) {
      roundMatches.push({ team1_p1: byePlayer, team2_p1: null, completed: true });
    }

    return {
      rounds: [{ roundNumber: nextRoundNumber(ctx), phase: "swiss", matches: roundMatches }],
    };
  }

  const standings = calculateTeamStandings(ctx.players, matches, sets, {
    scoring: scoringOf(ctx.tournament),
  });
  const drawn = strictRanking
    ? generateMonradRoundDoubles(standings, history)
    : generateSwissRoundDoubles(standings, history);
  if (drawn.length === 0) return null;

  return {
    rounds: [
      {
        roundNumber: nextRoundNumber(ctx),
        phase: "swiss",
        matches: drawn.map((m) => ({ ...m, court })),
      },
    ],
  };
}

function swissLikeStart(ctx: FormatContext): FormatPlan | null {
  const court = ctx.courtForNewMatch;
  const matches =
    ctx.tournament.mode === "singles"
      ? generateSwissFirstRound(ctx.players).map((m) => ({
          team1_p1: m.team1_p1,
          team2_p1: m.team2_p1,
          court,
        }))
      : generateSwissFirstRoundDoubles(ctx.teams).map((m) => ({ ...m, court }));

  if (matches.length === 0) return null;
  return {
    rounds: [{ roundNumber: 1, phase: "swiss", matches }],
    phase: "swiss",
    status: "active",
  };
}

function swissLikeCanAdvance(ctx: FormatContext): boolean {
  if (ctx.tournament.status !== "active") return false;
  const rounds = roundsOfPhase(ctx, "swiss");
  if (rounds.length === 0) return false;
  const planned = ctx.tournament.planned_rounds || 5;
  if (rounds.length >= planned) return false;
  return roundComplete(ctx, rounds[rounds.length - 1].id);
}

function swissLikeProgress(ctx: FormatContext) {
  const rounds = roundsOfPhase(ctx, "swiss");
  if (rounds.length === 0) return null;
  return { current: rounds.length, total: ctx.tournament.planned_rounds || 5 };
}

export const swissEngine: FormatEngine = {
  id: "swiss",
  // Everybody is paired every round; an odd player gets a bye, which is
  // not a match anyone plays.
  estimate: (setup) =>
    exactly(roundBasedMatches(setup.playerCount, setup.plannedRounds, 2, 0)),

  display: {
    hasBracket: false,
    hasGroupPhase: false,
    usesBuchholz: true,
    usesQueue: false,
    reshufflesPartners: false,
    usesGrandFinal: false,
  },
  usesFixedTeams: true,
  start: swissLikeStart,
  canAdvance: swissLikeCanAdvance,
  advance: (ctx) => swissLikeAdvance(ctx, false),
  progress: swissLikeProgress,
};

export const monradEngine: FormatEngine = {
  id: "monrad",
  // Same shape as Swiss: the pairing rule differs, the count does not.
  estimate: (setup) =>
    exactly(roundBasedMatches(setup.playerCount, setup.plannedRounds, 2, 0)),

  display: {
    hasBracket: false,
    hasGroupPhase: false,
    usesBuchholz: true,
    usesQueue: false,
    reshufflesPartners: false,
    usesGrandFinal: false,
  },
  usesFixedTeams: true,
  start: swissLikeStart,
  canAdvance: swissLikeCanAdvance,
  advance: (ctx) => swissLikeAdvance(ctx, true),
  progress: swissLikeProgress,
};

// ------------------------------------------------------- King of the Court

export const kingOfCourtEngine: FormatEngine = {
  id: "king_of_court",
  // One match at a time, drawn from a queue, for as long as people want
  // to keep playing. There is no number to give.
  estimate: () => openEnded,

  display: {
    hasBracket: false,
    hasGroupPhase: false,
    usesBuchholz: false,
    usesQueue: true,
    reshufflesPartners: true,
    usesGrandFinal: false,
  },
  usesFixedTeams: false,

  start(ctx) {
    const queue = shufflePlayers(ctx.players.map((p) => p.id));
    if (queue.length < 2) return null;
    const { team1_p1, team2_p1 } = generateKingOfCourtMatch(queue);

    return {
      rounds: [
        {
          roundNumber: 1,
          matches: [{ team1_p1, team2_p1, court: ctx.courtForNewMatch }],
        },
      ],
      status: "active",
      // The drawn order is the queue for the rest of the tournament.
      stateUpdates: { kotcQueue: queue },
    };
  },

  canAdvance(ctx) {
    if (ctx.tournament.status !== "active" || ctx.rounds.length === 0) return false;
    const last = ctx.rounds[ctx.rounds.length - 1];
    return roundComplete(ctx, last.id);
  },

  advance(ctx) {
    const decided = ctx.allMatches
      .filter((m) => m.status === "completed" && m.winner_team && m.team2_p1 !== null)
      .sort((a, b) => b.id - a.id);
    if (decided.length === 0) return null;

    const last = decided[0];
    const winner = last.winner_team === 1 ? last.team1_p1 : last.team2_p1!;
    const loser = last.winner_team === 1 ? last.team2_p1! : last.team1_p1;
    const active = new Set(ctx.players.map((p) => p.id));

    // The stored queue is the source of truth; tournaments started before
    // it was persisted fall back to the current roster once.
    const stored = ctx.formatState.kotcQueue ?? [];
    const base =
      stored.length > 0
        ? stored
        : [winner, ...[...active].filter((id) => id !== winner && id !== loser), loser];

    const queue = advanceKingOfCourtQueue(base, winner, loser, active);
    if (queue.length < 2) return null;

    const { team1_p1, team2_p1 } = generateKingOfCourtMatch(queue);
    return {
      rounds: [
        {
          roundNumber: nextRoundNumber(ctx),
          matches: [{ team1_p1, team2_p1, court: ctx.courtForNewMatch }],
        },
      ],
      stateUpdates: { kotcQueue: queue },
    };
  },
};

// ---------------------------------------------------------------- Waterfall

/** Rebuilds the ladder from the last round, newcomers appended. */
function waterfallLadder(ctx: FormatContext): number[] {
  const last = ctx.rounds[ctx.rounds.length - 1];
  if (!last) return ctx.players.map((p) => p.id);

  const matches = [...(ctx.matchesByRound.get(last.id) ?? [])].sort(
    (a, b) => (a.court || 0) - (b.court || 0),
  );

  const ladder: number[] = [];
  for (const m of matches) {
    ladder.push(m.team1_p1);
    if (m.team2_p1 !== null) ladder.push(m.team2_p1);
  }
  const known = new Set(ladder);
  for (const p of ctx.players) {
    if (!known.has(p.id)) ladder.push(p.id);
  }
  return ladder;
}

/** How often each player has sat out so far. */
function waterfallRestCounts(ctx: FormatContext): Map<number, number> {
  const counts = new Map<number, number>();
  for (const round of ctx.rounds) {
    const matches = ctx.matchesByRound.get(round.id) ?? [];
    if (matches.length === 0) continue;
    const played = new Set<number>();
    for (const m of matches) {
      played.add(m.team1_p1);
      if (m.team2_p1 !== null) played.add(m.team2_p1);
    }
    for (const p of ctx.players) {
      if (!played.has(p.id)) counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
    }
  }
  return counts;
}

export const waterfallEngine: FormatEngine = {
  id: "waterfall",
  // Unlike Swiss, this one draws only as many matches as there are
  // courts -- the rest of the ladder sits the round out.
  estimate: (setup) =>
    exactly(
      roundBasedMatches(setup.playerCount, setup.plannedRounds, 2, setup.courts),
    ),

  display: {
    hasBracket: false,
    hasGroupPhase: false,
    usesBuchholz: false,
    usesQueue: false,
    reshufflesPartners: true,
    usesGrandFinal: false,
  },
  usesFixedTeams: false,

  start(ctx) {
    const ladder = shufflePlayers(ctx.players.map((p) => p.id));
    const drawn = generateWaterfallRound(ladder, ctx.tournament.courts || 1);
    if (drawn.matches.length === 0) return null;

    return {
      rounds: [
        {
          roundNumber: 1,
          matches: drawn.matches.map((m) => ({
            team1_p1: m.team1_p1,
            team2_p1: m.team2_p1,
            court: m.court,
          })),
        },
      ],
      status: "active",
      byePlayers: drawn.byePlayers,
    };
  },

  canAdvance(ctx) {
    if (ctx.tournament.status !== "active" || ctx.rounds.length === 0) return false;
    const planned = ctx.tournament.planned_rounds || 5;
    if (ctx.rounds.length >= planned) return false;
    return roundComplete(ctx, ctx.rounds[ctx.rounds.length - 1].id);
  },

  advance(ctx) {
    const last = ctx.rounds[ctx.rounds.length - 1];
    if (!last) return null;

    const results: { court: number; winner: number; loser: number }[] = [];
    for (const m of ctx.matchesByRound.get(last.id) ?? []) {
      if (!m.winner_team || !m.court || m.team2_p1 === null) continue;
      results.push({
        court: m.court,
        winner: m.winner_team === 1 ? m.team1_p1 : m.team2_p1,
        loser: m.winner_team === 1 ? m.team2_p1 : m.team1_p1,
      });
    }
    if (results.length === 0) return null;

    const ladder = advanceWaterfall(waterfallLadder(ctx), results);
    const drawn = generateWaterfallRound(
      ladder,
      ctx.tournament.courts || 1,
      waterfallRestCounts(ctx),
    );
    if (drawn.matches.length === 0) return null;

    return {
      rounds: [
        {
          roundNumber: nextRoundNumber(ctx),
          matches: drawn.matches.map((m) => ({
            team1_p1: m.team1_p1,
            team2_p1: m.team2_p1,
            court: m.court,
          })),
        },
      ],
      byePlayers: drawn.byePlayers,
    };
  },

  progress(ctx) {
    if (ctx.rounds.length === 0) return null;
    return { current: ctx.rounds.length, total: ctx.tournament.planned_rounds || 5 };
  },
};
