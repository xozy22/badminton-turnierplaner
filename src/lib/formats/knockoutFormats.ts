// src/lib/formats/knockoutFormats.ts
//
// The formats that carry bracket structure: single elimination, group stage
// plus knockout, and double elimination.

import type { FormatEngine, FormatContext, FormatPlan } from "./types";
import { about, doubleEliminationMatches, entrantCount, exactly, knockoutMatches, roundRobinMatches } from "./estimate";
import {
  roundsOfPhase,
  roundComplete,
  lastRoundOfPhase,
  nextRoundNumber,
  winnersOfRound,
} from "./types";
import type { MatchSpec, RoundSpec } from "../db";
import type { BracketMatch } from "../draw";
import {
  generateEliminationBracket,
  generateEliminationBracketDoubles,
  generateRoundRobinSingles,
  generateRoundRobinDoubles,
  splitIntoGroups,
  splitTeamsIntoGroups,
  type ClubLookup,
} from "../draw";
import {
  calculateStandings,
  calculateTeamStandings,
  rankAcrossGroups,
  limitStandingsToTopN,
  limitTeamStandingsToTopN,
  scoringOf,
} from "../scoring";
import {
  nextDoubleEliminationRounds,
  bronzeCandidates,
  type BracketMatchState,
} from "../doubleElimination";

/** A bracket entry becomes a match spec; byes are stored as decided. */
export function bracketToSpec(m: BracketMatch, court: number | null): MatchSpec {
  return {
    team1_p1: m.team1_p1,
    team1_p2: m.team1_p2,
    team2_p1: m.team2_p1,
    team2_p2: m.team2_p2,
    // A bye occupies no court and is complete on creation.
    court: m.team2_p1 === null ? null : court,
    completed: m.team2_p1 === null,
  };
}

/** Teams in seed order, derived from the players' seed ranks. */
export function seedTeamsFrom(
  teams: [number, number][],
  seedOrder: number[],
): [number, number][] {
  const rankOf = new Map<number, number>();
  seedOrder.forEach((playerId, i) => rankOf.set(playerId, i));

  return teams
    .map((team) => {
      const ranks = team.map((id) => rankOf.get(id)).filter((r): r is number => r !== undefined);
      return { team, rank: ranks.length > 0 ? Math.min(...ranks) : Infinity };
    })
    .filter((entry) => entry.rank !== Infinity)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.team);
}

/**
 * Which club a player belongs to, for the draw. Singles reads it from the
 * player list directly; doubles needs this because it only carries ids
 * (FEATURE-BACKLOG.md C2).
 */
function clubLookup(ctx: FormatContext): ClubLookup {
  const byId = new Map(ctx.players.map((p) => [p.id, p.club]));
  return (id) => byId.get(id) ?? null;
}

/** The opening bracket for a knockout, singles or doubles. */
function openingBracket(ctx: FormatContext): BracketMatch[] {
  return ctx.tournament.mode === "singles"
    ? generateEliminationBracket(ctx.players, ctx.seedOrder)
    : generateEliminationBracketDoubles(
        ctx.teams,
        seedTeamsFrom(ctx.teams, ctx.seedOrder),
        clubLookup(ctx),
      );
}

// ------------------------------------------------------- Single elimination

/**
 * Builds the follow-up knockout round from the winners, plus the bronze
 * match when the semi-finals just finished and the option is enabled.
 */
function knockoutAdvance(
  ctx: FormatContext,
  koRounds: { id: number; round_number: number }[],
  phase: string | null,
): FormatPlan | null {
  const last = koRounds[koRounds.length - 1];
  if (!last) return null;

  const lastMatches = ctx.matchesByRound.get(last.id) ?? [];
  if (lastMatches.length <= 1) return null; // the final was the last match

  const winners = winnersOfRound(ctx, last.id);
  // Empty slots do not count towards "is there anyone left to play".
  if (winners.filter((w) => w !== null).length < 2) return null;

  const court = ctx.courtForNewMatch;
  const schedule: RoundSpec[] = [];
  let roundNumber = nextRoundNumber(ctx);

  // Semi-final to final: create the bronze match alongside, so the bracket
  // view never sees a final without its third-place match.
  const isSemiFinal = lastMatches.length === 2;
  if (isSemiFinal && ctx.tournament.enable_third_place === 1) {
    const sfLosers: { p1: number; p2: number | null }[] = [];
    for (const m of lastMatches) {
      if (!m.winner_team || m.team2_p1 === null) continue;
      sfLosers.push(
        m.winner_team === 1
          ? { p1: m.team2_p1, p2: m.team2_p2 }
          : { p1: m.team1_p1, p2: m.team1_p2 },
      );
    }
    if (sfLosers.length === 2) {
      schedule.push({
        roundNumber: roundNumber++,
        phase: "third_place",
        matches: [
          {
            team1_p1: sfLosers[0].p1,
            team1_p2: sfLosers[0].p2,
            team2_p1: sfLosers[1].p1,
            team2_p2: sfLosers[1].p2,
            court,
          },
        ],
      });
    }
  }

  const matches: MatchSpec[] = [];
  for (let i = 0; i + 1 < winners.length; i += 2) {
    const top = winners[i];
    const bottom = winners[i + 1];
    // Both slots empty: nobody came out of either match, so there is no
    // match to play here either. The slot stays empty one round further up.
    if (!top && !bottom) continue;
    // One slot empty: the other side advances on a bye, stored as a match
    // with no opponent -- the same shape a bye has had since v14.
    const present = top ?? bottom!;
    const other = top ? bottom : null;
    matches.push({
      team1_p1: present.p1,
      team1_p2: present.p2,
      team2_p1: other ? other.p1 : null,
      team2_p2: other ? other.p2 : null,
      court,
      // A bye is decided the moment it is created; leaving it pending
      // would move the dead end one round up instead of removing it.
      completed: !other,
    });
  }
  schedule.push({ roundNumber, phase, matches });

  return { rounds: schedule, activateLastRound: true };
}

export const eliminationEngine: FormatEngine = {
  id: "elimination",
  // Everybody but the winner loses once. The third-place match is one
  // more, when it is played at all.
  estimate: (setup) => {
    const entrants = entrantCount(setup);
    const bronze = setup.thirdPlace && entrants >= 4 ? 1 : 0;
    return exactly(knockoutMatches(entrants) + bronze);
  },

  display: {
    hasBracket: true,
    hasGroupPhase: false,
    usesBuchholz: false,
    usesQueue: false,
    reshufflesPartners: false,
    usesGrandFinal: false,
  },
  usesFixedTeams: true,

  start(ctx) {
    const bracket = openingBracket(ctx);
    if (bracket.length === 0) return null;
    return {
      rounds: [
        {
          roundNumber: 1,
          matches: bracket.map((m) => bracketToSpec(m, ctx.courtForNewMatch)),
        },
      ],
      status: "active",
    };
  },

  canAdvance(ctx) {
    if (ctx.tournament.status !== "active") return false;
    const koRounds = ctx.rounds.filter((r) => r.phase !== "third_place");
    const last = koRounds[koRounds.length - 1];
    if (!last) return false;
    const matches = ctx.matchesByRound.get(last.id) ?? [];
    return matches.length > 1 && roundComplete(ctx, last.id);
  },

  advance(ctx) {
    const koRounds = ctx.rounds.filter((r) => r.phase !== "third_place");
    return knockoutAdvance(ctx, koRounds, null);
  },
};

// ------------------------------------------------------- Group stage + KO

/**
 * How many participants qualify in total, and how many per group.
 *
 * `qualify_per_group` means two things depending on its value: since v2.6
 * a power of two >= 4 is the *total* KO field size, while anything else is
 * the older per-group count. The name kept the old meaning.
 *
 * Exported because the group table and the printed sheet need the same
 * answer. They used to take the raw number as "per group", so a KO field of
 * eight across two groups highlighted eight rows per group instead of four
 * (REVIEW-BACKLOG.md J6).
 */
export function knockoutSizes(tournament: {
  num_groups: number;
  qualify_per_group: number;
}): { koSize: number; perGroup: number } {
  const numGroups = tournament.num_groups || 2;
  const raw = tournament.qualify_per_group || 2;
  const koSize = raw >= 4 && (raw & (raw - 1)) === 0 ? raw : raw * numGroups;
  return { koSize, perGroup: Math.floor(koSize / numGroups) };
}

function knockoutSize(ctx: FormatContext): { koSize: number; perGroup: number } {
  return knockoutSizes(ctx.tournament);
}

/** Matches and sets of one group. */
function groupData(ctx: FormatContext, groupNumber: number) {
  const rounds = ctx.rounds.filter((r) => r.phase === "group" && r.group_number === groupNumber);
  const matches = [];
  const sets = new Map<number, never>();
  const playerIds = new Set<number>();

  for (const round of rounds) {
    for (const m of ctx.matchesByRound.get(round.id) ?? []) {
      matches.push(m);
      sets.set(m.id, (ctx.setsByMatch.get(m.id) ?? []) as never);
      playerIds.add(m.team1_p1);
      if (m.team1_p2) playerIds.add(m.team1_p2);
      if (m.team2_p1) playerIds.add(m.team2_p1);
      if (m.team2_p2) playerIds.add(m.team2_p2);
    }
  }
  return { matches, sets, playerIds };
}

/** Builds the KO bracket from the finished group tables. */
export function buildKnockoutFromGroups(ctx: FormatContext): MatchSpec[] {
  const numGroups = ctx.tournament.num_groups || 2;
  const { koSize, perGroup } = knockoutSize(ctx);
  const court = ctx.courtForNewMatch;
  const isDoubles = ctx.tournament.mode !== "singles";

  const nextPowerOfTwo = (n: number) => {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  };

  if (isDoubles) {
    const tables = [];
    for (let g = 1; g <= numGroups; g++) {
      const data = groupData(ctx, g);
      const players = ctx.players.filter((p) => data.playerIds.has(p.id));
      tables.push({
        data,
        players,
        standings: calculateTeamStandings(players, data.matches, data.sets, {
          scoring: scoringOf(ctx.tournament),
        }),
      });
    }

    const smallest = Math.min(...tables.map((t) => t.standings.length));
    const qualified: [number, number][] = [];
    const runnersUp: {
      team: [number, number];
      wins: number;
      setsWon: number;
      setsLost: number;
      pointsWon: number;
      pointsLost: number;
    }[] = [];

    for (const table of tables) {
      const comparable = limitTeamStandingsToTopN(
        table.standings, table.players, table.data.matches, table.data.sets, smallest,
      );
      const byKey = new Map(comparable.map((e) => [e.teamKey, e]));

      table.standings.forEach((entry, index) => {
        if (index < perGroup) {
          qualified.push([entry.player1.id, entry.player2.id]);
        } else {
          const c = byKey.get(entry.teamKey) ?? entry;
          runnersUp.push({
            team: [entry.player1.id, entry.player2.id],
            wins: c.wins, setsWon: c.setsWon, setsLost: c.setsLost,
            pointsWon: c.pointsWon, pointsLost: c.pointsLost,
          });
        }
      });
    }

    const target = koSize > qualified.length ? koSize : nextPowerOfTwo(qualified.length);
    if (qualified.length < target && runnersUp.length > 0) {
      const ranked = rankAcrossGroups(runnersUp, (r) => r.team[0]);
      for (let i = 0; i < Math.min(target - qualified.length, ranked.length); i++) {
        qualified.push(ranked[i].team);
      }
    }
    if (qualified.length < 2) return [];

    // Qualifiers enter group by group — A1, A2, B1, B2, … — and that
    // order is the seeding order.
    //
    // Not sorted by rank (all winners, then all runners-up) on purpose:
    // with the group-wise order, A1 and A2 land in opposite halves and
    // can only meet again in the final. Ranked order would put them in
    // the same half, where a rematch could happen in the semi. Keeping
    // group opponents apart is worth more here than a strictly ordered
    // seeding, and every winner still draws a runner-up in round one.
    return generateEliminationBracketDoubles(qualified, qualified).map((m) => bracketToSpec(m, court));
  }

  const tables = [];
  for (let g = 1; g <= numGroups; g++) {
    const data = groupData(ctx, g);
    const players = ctx.players.filter((p) => data.playerIds.has(p.id));
    tables.push({
      data,
      standings: calculateStandings(players, data.matches, data.sets, {
        scoring: scoringOf(ctx.tournament),
      }),
    });
  }

  const smallest = Math.min(...tables.map((t) => t.standings.length));
  const qualified: number[] = [];
  const runnersUp: {
    playerId: number;
    wins: number;
    setsWon: number;
    setsLost: number;
    pointsWon: number;
    pointsLost: number;
  }[] = [];

  for (const table of tables) {
    const comparable = limitStandingsToTopN(
      table.standings, table.data.matches, table.data.sets, smallest,
    );
    const byId = new Map(comparable.map((e) => [e.player.id, e]));

    table.standings.forEach((entry, index) => {
      if (index < perGroup) {
        qualified.push(entry.player.id);
      } else {
        const c = byId.get(entry.player.id) ?? entry;
        runnersUp.push({
          playerId: entry.player.id,
          wins: c.wins, setsWon: c.setsWon, setsLost: c.setsLost,
          pointsWon: c.pointsWon, pointsLost: c.pointsLost,
        });
      }
    });
  }

  const target = koSize > qualified.length ? koSize : nextPowerOfTwo(qualified.length);
  if (qualified.length < target && runnersUp.length > 0) {
    const ranked = rankAcrossGroups(runnersUp, (r) => r.playerId);
    for (let i = 0; i < Math.min(target - qualified.length, ranked.length); i++) {
      qualified.push(ranked[i].playerId);
    }
  }
  if (qualified.length < 2) return [];

  const players = qualified
    .map((id) => ctx.players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  return generateEliminationBracket(players, qualified).map((m) => bracketToSpec(m, court));
}

export const groupKoEngine: FormatEngine = {
  id: "group_ko",
  // Group stage plus the bracket the qualifiers play. Approximate: the
  // groups rarely divide evenly, so the last group is a player short and
  // its round robin is smaller.
  estimate: (setup) => {
    const entrants = entrantCount(setup);
    const groups = Math.max(1, setup.numGroups);
    const perGroup = Math.floor(entrants / groups);
    const remainder = entrants % groups;
    const groupMatches =
      roundRobinMatches(perGroup) * (groups - remainder) +
      roundRobinMatches(perGroup + 1) * remainder;

    // Through knockoutSizes, because qualify_per_group means two things:
    // a power of two >= 4 is the whole KO field, anything else is the
    // per-group count. Reading it as "per group" here would have put
    // eight into a bracket meant for four.
    const { koSize } = knockoutSizes({
      num_groups: setup.numGroups,
      qualify_per_group: setup.qualifyPerGroup,
    });
    const qualifiers = Math.min(entrants, koSize);
    const bronze = setup.thirdPlace && qualifiers >= 4 ? 1 : 0;
    return about(groupMatches + knockoutMatches(qualifiers) + bronze);
  },

  display: {
    hasBracket: true,
    hasGroupPhase: true,
    usesBuchholz: false,
    usesQueue: false,
    reshufflesPartners: false,
    usesGrandFinal: false,
  },
  usesFixedTeams: true,

  start(ctx) {
    const numGroups = ctx.tournament.num_groups || 2;
    const court = ctx.courtForNewMatch;
    const schedule: RoundSpec[] = [];
    let roundNumber = 1;

    if (ctx.tournament.mode === "singles") {
      const groups = splitIntoGroups(ctx.players, numGroups, ctx.seedOrder);
      groups.forEach((group, index) => {
        if (group.length < 2) return;
        for (const round of generateRoundRobinSingles(group)) {
          schedule.push({
            roundNumber: roundNumber++,
            phase: "group",
            groupNumber: index + 1,
            matches: round.map((m) => ({ team1_p1: m.team1_p1, team2_p1: m.team2_p1, court })),
          });
        }
      });
    } else {
      const groups = splitTeamsIntoGroups(
        ctx.teams,
        numGroups,
        seedTeamsFrom(ctx.teams, ctx.seedOrder),
        clubLookup(ctx),
      );
      groups.forEach((group, index) => {
        if (group.length < 2) return;
        for (const round of generateRoundRobinDoubles(group)) {
          schedule.push({
            roundNumber: roundNumber++,
            phase: "group",
            groupNumber: index + 1,
            matches: round.map((m) => ({ ...m, court })),
          });
        }
      });
    }

    if (schedule.length === 0) return null;
    return { rounds: schedule, phase: "group", status: "active" };
  },

  canAdvance(ctx) {
    if (ctx.tournament.status !== "active") return false;

    const koRounds = roundsOfPhase(ctx, "ko");
    if (koRounds.length > 0) {
      const last = koRounds[koRounds.length - 1];
      const matches = ctx.matchesByRound.get(last.id) ?? [];
      return matches.length > 1 && roundComplete(ctx, last.id);
    }

    // Still in the group phase: the KO can start once every group is done.
    const groupRounds = roundsOfPhase(ctx, "group");
    return (
      ctx.tournament.current_phase === "group" &&
      groupRounds.length > 0 &&
      groupRounds.every((r) => roundComplete(ctx, r.id))
    );
  },

  advance(ctx) {
    const koRounds = roundsOfPhase(ctx, "ko");
    if (koRounds.length > 0) {
      return knockoutAdvance(ctx, koRounds, "ko");
    }

    const matches = buildKnockoutFromGroups(ctx);
    if (matches.length === 0) return null;
    return {
      rounds: [{ roundNumber: nextRoundNumber(ctx), phase: "ko", matches }],
      phase: "ko",
      activateLastRound: true,
    };
  },
};

// ------------------------------------------------------- Double elimination

/** Translates the stored rounds into the bracket module's view of them. */
export function doubleEliminationState(ctx: FormatContext): BracketMatchState[] {
  const grandFinalRounds = new Set(ctx.formatState.grandFinalRoundIds ?? []);
  const state: BracketMatchState[] = [];

  for (const round of ctx.rounds) {
    if (round.phase !== "winners" && round.phase !== "losers") continue;
    for (const m of ctx.matchesByRound.get(round.id) ?? []) {
      state.push({
        phase:
          round.phase === "winners" && grandFinalRounds.has(round.id)
            ? "grand_final"
            : round.phase,
        roundNumber: round.round_number,
        team1: { p1: m.team1_p1, p2: m.team1_p2 },
        team2: m.team2_p1 === null ? null : { p1: m.team2_p1, p2: m.team2_p2 },
        winner: m.winner_team,
      });
    }
  }
  return state;
}

export const doubleEliminationEngine: FormatEngine = {
  id: "double_elimination",
  // Everybody but the winner has to lose twice. The grand final is
  // played once or twice depending on who wins it, so this is never
  // exact.
  estimate: (setup) => about(doubleEliminationMatches(entrantCount(setup))),

  display: {
    hasBracket: true,
    hasGroupPhase: false,
    usesBuchholz: false,
    usesQueue: false,
    reshufflesPartners: false,
    usesGrandFinal: true,
  },
  usesFixedTeams: true,

  start(ctx) {
    const bracket = openingBracket(ctx);
    if (bracket.length === 0) return null;
    return {
      rounds: [
        {
          roundNumber: 1,
          phase: "winners",
          matches: bracket.map((m) => bracketToSpec(m, ctx.courtForNewMatch)),
        },
      ],
      phase: "winners",
      status: "active",
    };
  },

  canAdvance(ctx) {
    if (ctx.tournament.status !== "active" || ctx.rounds.length === 0) return false;
    return nextDoubleEliminationRounds(doubleEliminationState(ctx)).length > 0;
  },

  advance(ctx) {
    const state = doubleEliminationState(ctx);
    const next = nextDoubleEliminationRounds(state);
    if (next.length === 0) return null;

    const court = ctx.courtForNewMatch;
    const schedule: RoundSpec[] = [];
    let roundNumber = nextRoundNumber(ctx);

    // Bronze match: the losers of the round before the losers final, once,
    // alongside the grand final.
    const hasBronze = ctx.rounds.some((r) => r.phase === "third_place");
    const wantsBronze =
      ctx.tournament.enable_third_place === 1 &&
      !hasBronze &&
      next.some((r) => r.phase === "grand_final" && !r.isBracketReset);

    if (wantsBronze) {
      const candidates = bronzeCandidates(state);
      if (candidates.length === 2) {
        schedule.push({
          roundNumber: roundNumber++,
          phase: "third_place",
          matches: [
            {
              team1_p1: candidates[0].p1,
              team1_p2: candidates[0].p2,
              team2_p1: candidates[1].p1,
              team2_p2: candidates[1].p2,
              court,
            },
          ],
        });
      }
    }

    for (const round of next) {
      // The grand final is stored as a winners round: keeping the phase
      // avoids a schema change for a single match. The flag tells the
      // caller which of the created rounds to remember.
      const phase = round.phase === "grand_final" ? "winners" : round.phase;
      schedule.push({
        roundNumber: roundNumber++,
        phase,
        isGrandFinal: round.phase === "grand_final",
        matches: round.pairings.map((pairing) => ({
          team1_p1: pairing.team1.p1,
          team1_p2: pairing.team1.p2,
          team2_p1: pairing.team2?.p1 ?? null,
          team2_p2: pairing.team2?.p2 ?? null,
          court: pairing.team2 === null ? null : court,
          completed: pairing.team2 === null,
        })),
      });
    }

    return { rounds: schedule };
  },
};

export { lastRoundOfPhase };
