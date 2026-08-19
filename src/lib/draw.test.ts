import { describe, it, expect, beforeEach } from "vitest";
import {
  shufflePlayers,
  generateRoundRobinSingles,
  generateRoundRobinDoubles,
  generateRandomDoublesRound,
  generateMixedDoublesRound,
  generateEliminationBracket,
  generateEliminationBracketDoubles,
  generateSwissFirstRound,
  generateSwissRound,
  pickByePlayer,
  generateMonradRound,
  generateKingOfCourtMatch,
  advanceKingOfCourtQueue,
  generateWaterfallRound,
  advanceWaterfall,
  splitIntoGroups,
  splitTeamsIntoGroups,
  formFixedDoubleTeams,
  formFixedMixedTeams,
  recommendedSwissRounds,
  getPreviousPairings,
  getPreviousPairingCounts,
  seedGroups,
} from "./draw";
import { makePlayer, makePlayers, makeMixedPlayers, makeMatch, resetIds } from "../test/factories";
import type { Player, StandingEntry } from "./types";

beforeEach(resetIds);

/** "1-2" style key, order independent — mirrors the internal pairingKey. */
function key(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

/** Which seeding group a seed index belongs to (0 = seed 1, 1 = seed 2, …). */
function groupIndexOf(count: number): Map<number, number> {
  const m = new Map<number, number>();
  seedGroups(count).forEach((group, gi) => {
    for (const i of group) m.set(i, gi);
  });
  return m;
}

/** Builds a standings list in the given order (only ids matter for pairing). */
function standingsOf(players: Player[]): StandingEntry[] {
  return players.map((p) => ({
    player: p,
    wins: 0,
    losses: 0,
    setsWon: 0,
    setsLost: 0,
    pointsWon: 0,
    pointsLost: 0,
  }));
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

describe("shufflePlayers", () => {
  it("keeps every element exactly once", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shufflePlayers(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it("does not mutate its input", () => {
    const input = [1, 2, 3, 4];
    shufflePlayers(input);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  it("actually permutes over repeated calls", () => {
    const input = Array.from({ length: 12 }, (_, i) => i + 1);
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add(shufflePlayers(input).join(","));
    expect(seen.size).toBeGreaterThan(1);
  });

  // B14: `random % n` favours the lower values; rejection sampling does not.
  it("distributes positions evenly", () => {
    const size = 5;
    const runs = 20_000;
    const input = Array.from({ length: size }, (_, i) => i);
    // counts[value][position] — every cell should land near runs / size.
    const counts = Array.from({ length: size }, () => new Array(size).fill(0));

    for (let i = 0; i < runs; i++) {
      shufflePlayers(input).forEach((value, position) => {
        counts[value][position]++;
      });
    }

    const expected = runs / size;
    const tolerance = expected * 0.15;
    for (let value = 0; value < size; value++) {
      for (let position = 0; position < size; position++) {
        expect(
          Math.abs(counts[value][position] - expected),
          `value ${value} at position ${position}: ${counts[value][position]} vs ~${expected}`,
        ).toBeLessThan(tolerance);
      }
    }
  });
});

describe("generateRoundRobinSingles", () => {
  it("pairs everyone exactly once with an even field", () => {
    const players = makePlayers(6);
    const rounds = generateRoundRobinSingles(players);

    expect(rounds).toHaveLength(5); // n - 1
    const pairings = rounds.flat().map((m) => key(m.team1_p1, m.team2_p1));
    expect(pairings).toHaveLength(15); // n * (n-1) / 2
    expect(new Set(pairings).size).toBe(15);
  });

  it("gives every player exactly one bye with an odd field", () => {
    const players = makePlayers(5);
    const rounds = generateRoundRobinSingles(players);

    expect(rounds).toHaveLength(5); // (n+1) - 1
    const appearances = new Map<number, number>();
    for (const round of rounds) {
      expect(round).toHaveLength(2); // one player sits out each round
      for (const m of round) {
        appearances.set(m.team1_p1, (appearances.get(m.team1_p1) ?? 0) + 1);
        appearances.set(m.team2_p1, (appearances.get(m.team2_p1) ?? 0) + 1);
      }
    }
    for (const p of players) {
      expect(appearances.get(p.id)).toBe(4); // plays everyone but itself
    }
  });

  it("never pairs a player with themselves", () => {
    const rounds = generateRoundRobinSingles(makePlayers(8));
    for (const m of rounds.flat()) {
      expect(m.team1_p1).not.toBe(m.team2_p1);
    }
  });

  it("lets nobody play twice in the same round", () => {
    const rounds = generateRoundRobinSingles(makePlayers(8));
    for (const round of rounds) {
      const ids = round.flatMap((m) => [m.team1_p1, m.team2_p1]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("generateRoundRobinDoubles", () => {
  it("pairs every team exactly once", () => {
    const teams: [number, number][] = [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ];
    const rounds = generateRoundRobinDoubles(teams);

    expect(rounds).toHaveLength(3);
    const matchups = rounds.flat().map((m) => key(m.team1_p1, m.team2_p1));
    expect(new Set(matchups).size).toBe(6);
  });

  it("keeps team members together", () => {
    const teams: [number, number][] = [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ];
    for (const m of generateRoundRobinDoubles(teams).flat()) {
      expect(m.team1_p2).toBe(m.team1_p1 + 1);
      expect(m.team2_p2).toBe(m.team2_p1 + 1);
    }
  });
});

describe("generateEliminationBracket", () => {
  it("produces a full first round for a power-of-two field", () => {
    const matches = generateEliminationBracket(makePlayers(8));
    expect(matches).toHaveLength(4);

    const ids = matches.flatMap((m) => [m.team1_p1, m.team2_p1]);
    expect(new Set(ids).size).toBe(8);
    expect(matches.every((m) => m.team2_p1 !== null)).toBe(true);
  });

  it("keeps the top two seeds in opposite halves and every seed in its own quarter", () => {
    const players = makePlayers(8);
    const seeds = [players[0].id, players[1].id, players[2].id, players[3].id];
    const matches = generateEliminationBracket(players, seeds);

    const matchIndexOf = (playerId: number) =>
      matches.findIndex((m) => m.team1_p1 === playerId || m.team2_p1 === playerId);
    const halfOf = (playerId: number) =>
      matchIndexOf(playerId) < matches.length / 2 ? "top" : "bottom";

    // Seeds 1 and 2 can only meet in the final.
    expect(halfOf(seeds[0])).not.toBe(halfOf(seeds[1]));
    // Seeds 3 and 4 are split across the halves too, so each half holds
    // exactly one of them. Which of them joins seed 1 is a convention
    // choice, so the test does not pin it down.
    expect(halfOf(seeds[2])).not.toBe(halfOf(seeds[3]));
    // With four seeds in an eight-slot bracket, no two share a first-round
    // match — i.e. every seed sits in its own quarter.
    expect(new Set(seeds.map(matchIndexOf)).size).toBe(4);
  });

  it("never pairs two seeds against each other in round one", () => {
    const players = makePlayers(16);
    const seeds = players.slice(0, 4).map((p) => p.id);
    const matches = generateEliminationBracket(players, seeds);

    for (const m of matches) {
      const seedCount = [m.team1_p1, m.team2_p1].filter((id) => id !== null && seeds.includes(id)).length;
      expect(seedCount).toBeLessThanOrEqual(1);
    }
  });

  it("includes every player exactly once", () => {
    const players = makePlayers(8);
    const ids = generateEliminationBracket(players).flatMap((m) =>
      [m.team1_p1, m.team2_p1].filter((id): id is number => id !== null),
    );
    expect(ids).toHaveLength(8);
    for (const p of players) expect(ids).toContain(p.id);
  });

  // --- A2: byes, see REVIEW-BACKLOG.md ---------------------------------
  it("resolves a non-power-of-two field to a power of two after round one", () => {
    for (const size of [3, 5, 6, 7, 11, 13]) {
      const players = makePlayers(size);
      const matches = generateEliminationBracket(players);
      const byes = matches.filter((m) => m.team2_p1 === null);
      const played = matches.filter((m) => m.team2_p1 !== null);
      const advancing = matches.length; // every entry produces one winner

      expect(isPowerOfTwo(advancing), `${size} players → ${advancing} advancing`).toBe(true);
      expect(byes.length + played.length * 2).toBe(size);
    }
  });

  it("gives every participant a place in the bracket, byes included", () => {
    for (const size of [3, 5, 6, 7, 11]) {
      const players = makePlayers(size);
      const ids = generateEliminationBracket(players).flatMap((m) =>
        [m.team1_p1, m.team2_p1].filter((id): id is number => id !== null),
      );
      expect(new Set(ids).size, `${size} players`).toBe(size);
    }
  });

  it("gives the byes to the top seeds", () => {
    const players = makePlayers(6);
    const seeds = [players[0].id, players[1].id];
    const matches = generateEliminationBracket(players, seeds);

    const byePlayers = matches.filter((m) => m.team2_p1 === null).map((m) => m.team1_p1);
    expect(byePlayers.sort()).toEqual([...seeds].sort());
  });

  it("needs no byes when the field is already a power of two", () => {
    for (const size of [2, 4, 8, 16]) {
      const matches = generateEliminationBracket(makePlayers(size));
      expect(matches.every((m) => m.team2_p1 !== null), `${size} players`).toBe(true);
    }
  });
});

describe("generateEliminationBracketDoubles", () => {
  const teamsOf = (count: number): [number, number][] =>
    Array.from({ length: count }, (_, i) => [i * 2 + 1, i * 2 + 2] as [number, number]);

  it("produces a full first round for a power-of-two field", () => {
    const matches = generateEliminationBracketDoubles(teamsOf(4));
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.team2_p1 !== null)).toBe(true);
  });

  it("keeps both players of a team together", () => {
    for (const m of generateEliminationBracketDoubles(teamsOf(4))) {
      expect(m.team1_p2).toBe(m.team1_p1 + 1);
      if (m.team2_p1 !== null) expect(m.team2_p2).toBe(m.team2_p1 + 1);
    }
  });

  // --- A2 / A3 ----------------------------------------------------------
  it("carries an odd team through as a bye instead of dropping it", () => {
    const teams = teamsOf(3);
    const matches = generateEliminationBracketDoubles(teams);

    expect(matches).toHaveLength(2); // 1 match + 1 bye
    expect(matches.filter((m) => m.team2_p1 === null)).toHaveLength(1);

    const present = new Set(
      matches.flatMap((m) => [m.team1_p1, m.team2_p1].filter((id): id is number => id !== null)),
    );
    for (const t of teams) expect(present.has(t[0])).toBe(true);
  });

  it("honours the seeding order", () => {
    const teams = teamsOf(4);
    const seedTeams: [number, number][] = [teams[0], teams[1]];
    const matches = generateEliminationBracketDoubles(teams, seedTeams);

    const halfOf = (teamStart: number) => {
      const idx = matches.findIndex((m) => m.team1_p1 === teamStart || m.team2_p1 === teamStart);
      return idx < matches.length / 2 ? "top" : "bottom";
    };
    expect(halfOf(seedTeams[0][0])).not.toBe(halfOf(seedTeams[1][0]));
  });

  it("gives the byes to the seeded teams", () => {
    const teams = teamsOf(3);
    const matches = generateEliminationBracketDoubles(teams, [teams[2]]);
    const byes = matches.filter((m) => m.team2_p1 === null);
    expect(byes).toHaveLength(1);
    expect(byes[0].team1_p1).toBe(teams[2][0]);
  });

  it("ignores seed entries for teams that are not in the field", () => {
    const teams = teamsOf(4);
    const matches = generateEliminationBracketDoubles(teams, [[99, 98]]);
    expect(matches).toHaveLength(2);
  });
});

describe("generateRandomDoublesRound", () => {
  it("builds four-player matches and drops the remainder to byes", () => {
    const players = makePlayers(10);
    const { matches } = generateRandomDoublesRound(players, new Set());

    expect(matches).toHaveLength(2); // 8 of 10 players, 2 sit out
    const ids = matches.flatMap((m) => [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2]);
    expect(new Set(ids).size).toBe(8);
  });

  it("returns no matches when fewer than four players are available", () => {
    const { matches, byePlayers } = generateRandomDoublesRound(makePlayers(3), new Set());
    expect(matches).toEqual([]);
    expect(byePlayers).toHaveLength(3);
  });

  it("avoids repeating a partnership when it can", () => {
    const players = makePlayers(8);
    const previous = new Set([key(players[0].id, players[1].id)]);
    const { matches } = generateRandomDoublesRound(players, previous);

    const partnerships = matches.flatMap((m) => [
      key(m.team1_p1, m.team1_p2),
      key(m.team2_p1, m.team2_p2),
    ]);
    expect(partnerships).not.toContain(key(players[0].id, players[1].id));
  });

  it("prefers players with fewer matches when picking who sits out", () => {
    const players = makePlayers(9);
    const busy = players[0];
    const matchCounts = new Map(players.map((p) => [p.id, p.id === busy.id ? 5 : 0]));

    const { matches, byePlayers } = generateRandomDoublesRound(players, new Set(), matchCounts);
    const playing = new Set(matches.flatMap((m) => [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2]));
    expect(playing.has(busy.id)).toBe(false);
    expect(byePlayers).toContain(busy.id);
  });

  // B10: all three possible sit-outs are reported, not just the first.
  it("reports every player who sits out", () => {
    const players = makePlayers(11); // 8 play, 3 sit out
    const { matches, byePlayers } = generateRandomDoublesRound(players, new Set());
    const playing = new Set(matches.flatMap((m) => [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2]));
    const actuallySittingOut = players.filter((p) => !playing.has(p.id)).map((p) => p.id);

    expect(byePlayers).toHaveLength(3);
    expect([...byePlayers].sort()).toEqual(actuallySittingOut.sort());
  });

  it("keeps sit-outs balanced across rounds", () => {
    const players = makePlayers(9); // one player rests per round
    const matchCounts = new Map(players.map((p) => [p.id, 0]));
    const restCount = new Map(players.map((p) => [p.id, 0]));

    for (let round = 0; round < 9; round++) {
      const { matches, byePlayers } = generateRandomDoublesRound(players, new Set(), matchCounts);
      for (const m of matches) {
        for (const pid of [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2]) {
          matchCounts.set(pid, (matchCounts.get(pid) ?? 0) + 1);
        }
      }
      for (const pid of byePlayers) restCount.set(pid, (restCount.get(pid) ?? 0) + 1);
    }

    const rests = [...restCount.values()];
    expect(Math.max(...rests) - Math.min(...rests)).toBeLessThanOrEqual(1);
  });
});

describe("generateMixedDoublesRound", () => {
  it("pairs one man with one woman per team", () => {
    const players = makeMixedPlayers(4, 4);
    const byId = new Map(players.map((p) => [p.id, p]));
    const { matches } = generateMixedDoublesRound(players, new Set());

    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      for (const [a, b] of [
        [m.team1_p1, m.team1_p2],
        [m.team2_p1, m.team2_p2],
      ]) {
        expect(byId.get(a)!.gender).toBe("m");
        expect(byId.get(b)!.gender).toBe("f");
      }
    }
  });

  it("returns no matches when one gender is missing", () => {
    const { matches, byePlayers } = generateMixedDoublesRound(makePlayers(8, "m"), new Set());
    expect(matches).toEqual([]);
    expect(byePlayers).toHaveLength(8);
  });

  it("uses an even number of teams so every team has an opponent", () => {
    const { matches, byePlayers } = generateMixedDoublesRound(makeMixedPlayers(3, 3), new Set());
    expect(matches).toHaveLength(1); // 2 of 3 possible pairs
    expect(byePlayers).toHaveLength(2); // one man and one woman sit out
  });

  // B10: mixed now uses the same fairness inputs as the doubles draw.
  it("sits out whoever has played the most", () => {
    const players = makeMixedPlayers(3, 3);
    const busyMan = players[0];
    const busyWoman = players[3];
    const matchCounts = new Map(players.map((p) => [p.id, 0]));
    matchCounts.set(busyMan.id, 7);
    matchCounts.set(busyWoman.id, 7);

    const { byePlayers } = generateMixedDoublesRound(players, new Set(), matchCounts);
    expect([...byePlayers].sort()).toEqual([busyMan.id, busyWoman.id].sort());
  });

  it("avoids repeating a partnership when it can", () => {
    const players = makeMixedPlayers(4, 4);
    const previous = new Set([key(players[0].id, players[4].id)]);
    const { matches } = generateMixedDoublesRound(players, previous);

    const partnerships = matches.flatMap((m) => [
      key(m.team1_p1, m.team1_p2),
      key(m.team2_p1, m.team2_p2),
    ]);
    expect(partnerships).not.toContain(key(players[0].id, players[4].id));
  });
});

describe("Swiss system", () => {
  it("recommends at least three rounds and scales with log2", () => {
    expect(recommendedSwissRounds(4)).toBe(3);
    expect(recommendedSwissRounds(16)).toBe(4);
    expect(recommendedSwissRounds(64)).toBe(6);
  });

  it("pairs everyone in the first round with an even field", () => {
    const matches = generateSwissFirstRound(makePlayers(8));
    expect(matches).toHaveLength(4);
    expect(new Set(matches.flatMap((m) => [m.team1_p1, m.team2_p1])).size).toBe(8);
  });

  it("leaves exactly one player out with an odd field", () => {
    const matches = generateSwissFirstRound(makePlayers(7));
    expect(matches).toHaveLength(3);
  });

  it("avoids a rematch when an alternative exists", () => {
    const players = makePlayers(4);
    const previous = new Set([key(players[0].id, players[1].id)]);
    const matches = generateSwissRound(standingsOf(players), previous);

    const pairs = matches.map((m) => key(m.team1_p1, m.team2_p1));
    expect(pairs).not.toContain(key(players[0].id, players[1].id));
    expect(matches).toHaveLength(2);
  });

  it("pairs by rank when no rematch is in the way", () => {
    const players = makePlayers(4);
    const matches = generateSwissRound(standingsOf(players), new Set());
    expect(matches[0]).toMatchObject({ team1_p1: players[0].id, team2_p1: players[1].id });
    expect(matches[1]).toMatchObject({ team1_p1: players[2].id, team2_p1: players[3].id });
  });

  it("pairs every player, falling back to a rematch only if it must", () => {
    // Everyone has played everyone: a repeat is unavoidable, but nobody
    // may be left without a match.
    const players = makePlayers(4);
    const ids = players.map((p) => p.id);
    const previous = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) previous.add(key(ids[i], ids[j]));
    }

    const matches = generateSwissRound(standingsOf(players), previous);
    const paired = matches.flatMap((m) => [m.team1_p1, m.team2_p1]);
    expect(paired).toHaveLength(4);
    expect(new Set(paired).size).toBe(4);
  });

  // B2: backtracking finds pairings the greedy walk used to miss.
  it("finds a rematch-free pairing when one exists", () => {
    // Players 3, 4, 5 have met each other, and 3 has also met 6. A
    // rematch-free round exists: 1v3, 2v4, 5v6.
    const players = makePlayers(6);
    const [, , p3, p4, p5, p6] = players.map((p) => p.id);
    const previous = new Set([key(p3, p4), key(p3, p5), key(p3, p6), key(p4, p5)]);

    const matches = generateSwissRound(standingsOf(players), previous);
    const pairs = matches.map((m) => key(m.team1_p1, m.team2_p1));
    const rematches = pairs.filter((k) => previous.has(k));

    expect(matches).toHaveLength(3);
    expect(rematches, `rematches: ${rematches.join(", ")}`).toHaveLength(0);
  });

  it("solves a tightly constrained history", () => {
    // 8 players, three rounds already played in a strict ladder pattern.
    const players = makePlayers(8);
    const ids = players.map((p) => p.id);
    const previous = new Set<string>();
    for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7]]) {
      previous.add(key(ids[a], ids[b]));
    }

    const matches = generateSwissRound(standingsOf(players), previous);
    const pairs = matches.map((m) => key(m.team1_p1, m.team2_p1));
    expect(matches).toHaveLength(4);
    expect(pairs.filter((k) => previous.has(k))).toHaveLength(0);
  });

  describe("bye handling", () => {
    it("picks nobody when the field is even", () => {
      expect(pickByePlayer(standingsOf(makePlayers(6)), new Map())).toBeNull();
    });

    it("picks the lowest-ranked player who has not had a bye", () => {
      const players = makePlayers(5);
      const ids = players.map((p) => p.id);
      // The last player already sat out once, so the fourth is next.
      const byes = new Map([[ids[4], 1]]);
      expect(pickByePlayer(standingsOf(players), byes)).toBe(ids[3]);
    });

    it("spreads the bye across the field over several rounds", () => {
      const players = makePlayers(5);
      const byes = new Map<number, number>();

      for (let round = 0; round < 5; round++) {
        const chosen = pickByePlayer(standingsOf(players), byes);
        expect(chosen).not.toBeNull();
        byes.set(chosen!, (byes.get(chosen!) ?? 0) + 1);
      }

      // Five rounds, five players: everyone sat out exactly once.
      expect([...byes.values()].sort()).toEqual([1, 1, 1, 1, 1]);
    });

    it("excludes the bye player from the pairing", () => {
      const players = makePlayers(5);
      const bye = players[4].id;
      const matches = generateSwissRound(standingsOf(players), new Set(), bye);

      const playing = matches.flatMap((m) => [m.team1_p1, m.team2_p1]);
      expect(matches).toHaveLength(2);
      expect(playing).not.toContain(bye);
      expect(new Set(playing).size).toBe(4);
    });
  });
});

describe("Monrad system", () => {
  it("pairs strictly by rank on a fresh table", () => {
    const players = makePlayers(6);
    const matches = generateMonradRound(standingsOf(players));
    expect(matches).toEqual([
      { team1_p1: players[0].id, team2_p1: players[1].id },
      { team1_p1: players[2].id, team2_p1: players[3].id },
      { team1_p1: players[4].id, team2_p1: players[5].id },
    ]);
  });

  it("drops the lowest-ranked player with an odd field", () => {
    const players = makePlayers(5);
    const matches = generateMonradRound(standingsOf(players));
    expect(matches).toHaveLength(2);
    const playing = matches.flatMap((m) => [m.team1_p1, m.team2_p1]);
    expect(playing).not.toContain(players[4].id);
  });

  it("excludes a designated bye player", () => {
    const players = makePlayers(5);
    const bye = players[2].id;
    const matches = generateMonradRound(standingsOf(players), new Set(), bye);
    expect(matches.flatMap((m) => [m.team1_p1, m.team2_p1])).not.toContain(bye);
  });

  // B3: an unchanged table used to reproduce the identical round forever.
  it("does not repeat a matchup that already happened", () => {
    const players = makePlayers(4);
    const first = generateMonradRound(standingsOf(players));
    const history = new Set(first.map((m) => key(m.team1_p1, m.team2_p1)));

    const second = generateMonradRound(standingsOf(players), history);
    const secondKeys = second.map((m) => key(m.team1_p1, m.team2_p1));

    expect(second).toHaveLength(2);
    expect(secondKeys.some((k) => history.has(k))).toBe(false);
  });
});

describe("King of the Court", () => {
  it("takes the first two from the queue", () => {
    const result = generateKingOfCourtMatch([7, 3, 9, 1]);
    expect(result.team1_p1).toBe(7);
    expect(result.team2_p1).toBe(3);
    expect(result.remainingQueue).toEqual([9, 1]);
  });

  it("refuses to build a match from fewer than two players", () => {
    expect(() => generateKingOfCourtMatch([5])).toThrow();
  });

  // B5: the queue is the state of the format and has to rotate properly.
  describe("queue rotation", () => {
    it("keeps the winner in front and sends the loser to the back", () => {
      expect(advanceKingOfCourtQueue([1, 2, 3, 4], 1, 2)).toEqual([1, 3, 4, 2]);
    });

    it("promotes the challenger when they win", () => {
      expect(advanceKingOfCourtQueue([1, 2, 3, 4], 2, 1)).toEqual([2, 3, 4, 1]);
    });

    it("gives everyone a turn instead of recycling the same challenger", () => {
      // The old implementation rebuilt the queue from the sorted player
      // list every round, so player 2 challenged forever and 5..6 never
      // played at all.
      let queue = [1, 2, 3, 4, 5, 6];
      const appearances = new Map<number, number>(queue.map((id) => [id, 0]));

      for (let round = 0; round < 6; round++) {
        const { team1_p1, team2_p1 } = generateKingOfCourtMatch(queue);
        appearances.set(team1_p1, (appearances.get(team1_p1) ?? 0) + 1);
        appearances.set(team2_p1, (appearances.get(team2_p1) ?? 0) + 1);
        // Challenger always wins, so the court keeps changing hands.
        queue = advanceKingOfCourtQueue(queue, team2_p1, team1_p1);
      }

      expect([...appearances.values()].every((n) => n > 0)).toBe(true);
    });

    it("drops players who left and appends ones who joined", () => {
      const active = new Set([1, 3, 4, 9]);
      const next = advanceKingOfCourtQueue([1, 2, 3, 4], 1, 2, active);
      expect(next).not.toContain(2);
      expect(next).toContain(9);
      expect(next[0]).toBe(1);
    });
  });
});

describe("Waterfall", () => {
  it("assigns pairs to ascending court numbers", () => {
    const { matches } = generateWaterfallRound([1, 2, 3, 4, 5, 6]);
    expect(matches).toEqual([
      { court: 1, team1_p1: 1, team2_p1: 2 },
      { court: 2, team1_p1: 3, team2_p1: 4 },
      { court: 3, team1_p1: 5, team2_p1: 6 },
    ]);
  });

  // B6: the hall does not grow with the number of players.
  it("never uses more courts than the venue has", () => {
    const { matches, byePlayers } = generateWaterfallRound([1, 2, 3, 4, 5, 6, 7, 8], 2);
    expect(matches).toHaveLength(2);
    // With no rest history, the bottom of the ladder sits out.
    expect([...byePlayers].sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
  });

  it("reports the odd player instead of dropping them", () => {
    const { matches, byePlayers } = generateWaterfallRound([1, 2, 3, 4, 5]);
    expect(matches).toHaveLength(2);
    expect(byePlayers).toEqual([5]);
  });

  it("keeps every player exactly once when advancing", () => {
    const assignments = [1, 2, 3, 4, 5, 6];
    const results = [
      { court: 1, winner: 1, loser: 2 },
      { court: 2, winner: 3, loser: 4 },
      { court: 3, winner: 5, loser: 6 },
    ];
    const next = advanceWaterfall(assignments, results);

    expect(next).toHaveLength(6);
    expect([...next].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("moves winners up and losers down", () => {
    const results = [
      { court: 1, winner: 1, loser: 2 },
      { court: 2, winner: 3, loser: 4 },
    ];
    const next = advanceWaterfall([1, 2, 3, 4], results);
    // Court 1 keeps its winner and receives the court-2 winner.
    expect(next.slice(0, 2)).toEqual([1, 3]);
    // Court 2 collects both losers.
    expect(next.slice(2, 4)).toEqual([2, 4]);
  });

  it("returns the assignments unchanged when there are no results", () => {
    expect(advanceWaterfall([1, 2, 3, 4], [])).toEqual([1, 2, 3, 4]);
  });

  // B6: a player who sat out keeps their ladder position.
  it("leaves resting players where they were on the ladder", () => {
    const assignments = [1, 2, 3, 4, 5];
    const results = [
      { court: 1, winner: 1, loser: 2 },
      { court: 2, winner: 3, loser: 4 },
    ];
    const next = advanceWaterfall(assignments, results);

    expect(next).toHaveLength(5);
    expect(new Set(next).size).toBe(5);
    expect(next[4]).toBe(5); // did not play, did not move
  });

  it("does not sit the same player out twice in a row", () => {
    let assignments = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const courts = 4;
    const restCount = new Map<number, number>();

    for (let round = 0; round < 6; round++) {
      const { matches, byePlayers } = generateWaterfallRound(assignments, courts, restCount);
      for (const pid of byePlayers) restCount.set(pid, (restCount.get(pid) ?? 0) + 1);

      // Court 1 wins every time; enough to exercise the rotation.
      const results = matches.map((m) => ({
        court: m.court,
        winner: m.team1_p1,
        loser: m.team2_p1,
      }));
      assignments = advanceWaterfall(assignments, results);
    }

    const rests = [...restCount.values()];
    expect(Math.max(...rests)).toBeLessThanOrEqual(2);
  });
});

describe("splitIntoGroups", () => {
  it("distributes players evenly without seeds", () => {
    const groups = splitIntoGroups(makePlayers(8), 2);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(4);
    expect(groups[1]).toHaveLength(4);
  });

  it("uses snake distribution for the seeding groups", () => {
    // Seeds 1 and 2 open groups 1 and 2. Seeds 3 and 4 share a seeding
    // group, so which of them opens group 3 is drawn (FEATURE-BACKLOG.md
    // C1) -- but they go to different groups either way.
    const players = makePlayers(8);
    const seeds = players.slice(0, 4).map((p) => p.id);
    for (let run = 0; run < 20; run++) {
      const groups = splitIntoGroups(players, 4, seeds);
      expect(groups[0][0].id, `run ${run}`).toBe(seeds[0]);
      expect(groups[1][0].id, `run ${run}`).toBe(seeds[1]);
      expect(
        [groups[2][0].id, groups[3][0].id].sort(),
        `run ${run}`,
      ).toEqual([seeds[2], seeds[3]].sort());
    }
  });

  it("reverses direction on the second seeding pass", () => {
    // 4 groups + 8 seeds → the second pass runs backwards, so the strongest
    // group gets the weakest partner. Stated in seeding groups: every group
    // holds one entry from 1/2/3/4 and one from 5/8.
    const players = makePlayers(8);
    const seeds = players.slice(0, 8).map((p) => p.id);
    const gi = groupIndexOf(8);
    const seedIndexOf = new Map(seeds.map((id, i) => [id, i]));

    for (let run = 0; run < 20; run++) {
      const groups = splitIntoGroups(players, 4, seeds);
      for (const [g, members] of groups.entries()) {
        expect(members, `run ${run} group ${g}`).toHaveLength(2);
        const gs = members.map((p) => gi.get(seedIndexOf.get(p.id)!)!);
        // One from the top three groups, one from 5/8 (group index 3).
        expect(gs.filter((x) => x === 3).length, `run ${run} group ${g}`).toBe(1);
      }
      // Seed 1 and seed 2 still lead groups 1 and 2.
      expect(groups[0][0].id, `run ${run}`).toBe(seeds[0]);
      expect(groups[1][0].id, `run ${run}`).toBe(seeds[1]);
    }
  });

  it("places every player exactly once", () => {
    const players = makePlayers(11);
    const groups = splitIntoGroups(players, 3);
    const ids = groups.flat().map((p) => p.id);
    expect(ids).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
  });
});

describe("splitTeamsIntoGroups", () => {
  const teamsOf = (count: number): [number, number][] =>
    Array.from({ length: count }, (_, i) => [i * 2 + 1, i * 2 + 2] as [number, number]);

  it("distributes teams round-robin across groups when unseeded", () => {
    const groups = splitTeamsIntoGroups(teamsOf(4), 2);
    expect(groups[0]).toEqual([
      [1, 2],
      [5, 6],
    ]);
    expect(groups[1]).toEqual([
      [3, 4],
      [7, 8],
    ]);
  });

  // B9: seeded teams are spread snake-style, like seeded singles players.
  it("puts the top seeded teams in different groups", () => {
    const teams = teamsOf(8);
    const seeds = [teams[0], teams[1], teams[2], teams[3]];
    for (let run = 0; run < 20; run++) {
      const groups = splitTeamsIntoGroups(teams, 4, seeds);
      expect(groups[0][0], `run ${run}`).toEqual(seeds[0]);
      expect(groups[1][0], `run ${run}`).toEqual(seeds[1]);
      // Seeds 3 and 4 share a seeding group, so which of them opens group
      // 3 is drawn -- but they never share a group (FEATURE-BACKLOG.md C1).
      expect(
        [groups[2][0], groups[3][0]].map((t) => t[0]).sort(),
        `run ${run}`,
      ).toEqual([seeds[2][0], seeds[3][0]].sort());
    }
  });

  it("reverses direction on the second seeding pass", () => {
    // Same statement as for singles, in seeding groups: each group holds
    // one team from the top three seeding groups and one from 5/8.
    const teams = teamsOf(8);
    const gi = groupIndexOf(8);
    const indexOf = new Map(teams.map((t, i) => [t[0], i]));

    for (let run = 0; run < 20; run++) {
      const groups = splitTeamsIntoGroups(teams, 4, teams);
      for (const [g, members] of groups.entries()) {
        expect(members, `run ${run} group ${g}`).toHaveLength(2);
        const gs = members.map((t) => gi.get(indexOf.get(t[0])!)!);
        expect(gs.filter((x) => x === 3).length, `run ${run} group ${g}`).toBe(1);
      }
      expect(groups[0][0], `run ${run}`).toEqual(teams[0]);
      expect(groups[1][0], `run ${run}`).toEqual(teams[1]);
    }
  });

  it("places every team exactly once", () => {
    const teams = teamsOf(7);
    const groups = splitTeamsIntoGroups(teams, 3, [teams[0], teams[1]]);
    const flat = groups.flat();
    expect(flat).toHaveLength(7);
    expect(new Set(flat.map((t) => t[0])).size).toBe(7);
  });
});

describe("team formation", () => {
  it("pairs players into doubles teams", () => {
    const teams = formFixedDoubleTeams(makePlayers(8));
    expect(teams).toHaveLength(4);
    const ids = teams.flat();
    expect(new Set(ids).size).toBe(8);
  });

  it("drops the odd player out — the caller must guard against this", () => {
    // Documents current behaviour: with 7 players one is silently left out.
    // See REVIEW-BACKLOG.md B13 (missing per-format validation).
    const teams = formFixedDoubleTeams(makePlayers(7));
    expect(teams).toHaveLength(3);
    expect(teams.flat()).toHaveLength(6);
  });

  it("builds mixed teams from one man and one woman", () => {
    const players = makeMixedPlayers(3, 5);
    const byId = new Map(players.map((p) => [p.id, p]));
    const teams = formFixedMixedTeams(players);

    expect(teams).toHaveLength(3); // limited by the smaller gender group
    for (const [m, f] of teams) {
      expect(byId.get(m)!.gender).toBe("m");
      expect(byId.get(f)!.gender).toBe("f");
    }
  });
});

describe("pairing history", () => {
  it("collects partnerships from played matches", () => {
    const matches = [
      makeMatch({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 }),
      makeMatch({ team1_p1: 1, team1_p2: 3, team2_p1: 2, team2_p2: 4 }),
    ];
    const pairings = getPreviousPairings(matches);
    expect(pairings.has(key(1, 2))).toBe(true);
    expect(pairings.has(key(1, 3))).toBe(true);
    expect(pairings.has(key(1, 4))).toBe(false);
  });

  it("counts repeated partnerships", () => {
    const matches = [
      makeMatch({ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 }),
      makeMatch({ team1_p1: 1, team1_p2: 2, team2_p1: 5, team2_p2: 6 }),
    ];
    const counts = getPreviousPairingCounts(matches);
    expect(counts.get(key(1, 2))).toBe(2);
    expect(counts.get(key(3, 4))).toBe(1);
  });

  it("ignores singles matches", () => {
    const pairings = getPreviousPairings([makeMatch({ team1_p1: 1, team2_p1: 2 })]);
    expect(pairings.size).toBe(0);
  });
});

describe("bracket seeding — the standard pairings", () => {
  /** Reads the bracket back as seed numbers, e.g. "1-8". */
  const pairings = (count: number): string[] => {
    const players = makePlayers(count);
    const seedOf = new Map(players.map((p, i) => [p.id, i + 1]));
    const label = (id: number | null) => (id === null ? "bye" : String(seedOf.get(id)));
    return generateEliminationBracket(players, players.map((p) => p.id)).map(
      (m) => `${label(m.team1_p1)}-${label(m.team2_p1)}`,
    );
  };

  /**
   * The same read-back, but in seeding groups: "A" is seed 1, "B" seed 2,
   * "C" seeds 3/4, "D" seeds 5/8, and so on. Which member of a group ends
   * up where is drawn by lot (FEATURE-BACKLOG.md C1), so the group is the
   * finest statement the bracket still makes.
   */
  const groupPairings = (count: number): string[] => {
    const letterOf = new Map<number, string>();
    seedGroups(count).forEach((group, gi) => {
      for (const i of group) letterOf.set(i + 1, String.fromCharCode(65 + gi));
    });
    return pairings(count).map((row) =>
      row
        .split("-")
        .map((x) => (x === "bye" ? "bye" : letterOf.get(Number(x))!))
        .join("-"),
    );
  };

  it("walks the seeding groups down the bracket in the standard order", () => {
    // The seeding order was applied inverted, which produced 1-5 7-3 4-8 6-2
    // for eight: seed 2 stood in the last match instead of the third, so
    // two group winners could meet in the quarterfinal while two runners-up
    // met in the other half (REVIEW-BACKLOG.md A3).
    //
    // Stated in ranks this no longer holds -- 1 draws somebody from 5/8,
    // not seed 8 specifically. Stated in groups it does, and it is what
    // the error broke.
    expect(groupPairings(4)).toEqual(["A-C", "B-C"]);
    expect(groupPairings(8)).toEqual(["A-D", "C-D", "B-D", "C-D"]);
  });

  it("holds at sixteen, where the error was largest", () => {
    expect(groupPairings(16)).toEqual([
      "A-E", "D-E", "C-E", "D-E",
      "B-E", "D-E", "C-E", "D-E",
    ]);
  });

  it("actually draws lots inside a seeding group", () => {
    // Without this the change is invisible: the groups would be right and
    // the order inside them still fixed.
    const seen = new Set<string>();
    for (let run = 0; run < 40; run++) seen.add(pairings(8).join(" "));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("keeps the top two seeds apart until the final at every size", () => {
    for (const size of [4, 8, 16, 32]) {
      const rows = pairings(size);
      const halfOf = (seed: string) => {
        const i = rows.findIndex((r) => r.split("-").includes(seed));
        return i < rows.length / 2 ? "top" : "bottom";
      };
      expect(halfOf("1"), `size ${size}`).not.toBe(halfOf("2"));
    }
  });

  it("gives the byes to the top seeding groups", () => {
    // Five players in an eight slot bracket: three sit out round one. Seeds
    // 1 and 2 always, and one of the 3/4 pair -- which one is drawn.
    expect(groupPairings(5)).toEqual(["A-bye", "C-D", "B-bye", "C-bye"]);
  });

  it("never leaves a better seeding group playing while a worse one sits out", () => {
    for (const count of [3, 5, 6, 7, 9, 11, 13]) {
      const groupOf = new Map<number, number>();
      seedGroups(count).forEach((group, gi) => {
        for (const i of group) groupOf.set(i + 1, gi);
      });
      const rows = pairings(count);
      const byeGroups: number[] = [];
      const playingGroups: number[] = [];
      for (const row of rows) {
        const [a, b] = row.split("-");
        if (b === "bye") byeGroups.push(groupOf.get(Number(a))!);
        else {
          playingGroups.push(groupOf.get(Number(a))!, groupOf.get(Number(b))!);
        }
      }
      // Every group that got a bye ranks at least as high as every group
      // that had to play. Within one group it may go either way.
      const worstBye = Math.max(...byeGroups);
      const bestPlaying = Math.min(...playingGroups);
      expect(worstBye, `${count} players`).toBeLessThanOrEqual(bestPlaying);
    }
  });
});

describe("club separation (FEATURE-BACKLOG.md C2)", () => {
  const withClub = (club: string | null) => makePlayer({ club });

  /** Pairs of the first round that put two players of one club together. */
  const clashesIn = (bracket: { team1_p1: number; team2_p1: number | null }[], clubById: Map<number, string | null>) =>
    bracket.filter(
      (m) =>
        m.team2_p1 !== null &&
        clubById.get(m.team1_p1) != null &&
        clubById.get(m.team1_p1) === clubById.get(m.team2_p1),
    ).length;

  it("keeps club-mates out of the first round when the field allows it", () => {
    // Four from each club into an eight-slot bracket: a perfect separation
    // exists, so the draw has to find it. Repeated, because the draw is
    // random and a single run could pass by luck.
    for (let run = 0; run < 20; run++) {
      const players = [
        ...Array.from({ length: 4 }, () => withClub("TV Rot")),
        ...Array.from({ length: 4 }, () => withClub("SC Blau")),
      ];
      const clubById = new Map(players.map((p) => [p.id, p.club]));
      const bracket = generateEliminationBracket(players);
      expect(clashesIn(bracket, clubById), `run ${run}`).toBe(0);
    }
  });

  it("separates as far as it can when a club is over-represented", () => {
    // Six from one club and two from another cannot be separated fully:
    // four first-round matches, and six players of one club must meet each
    // other at least twice. The point is that it does not give up.
    for (let run = 0; run < 10; run++) {
      const players = [
        ...Array.from({ length: 6 }, () => withClub("TV Rot")),
        ...Array.from({ length: 2 }, () => withClub("SC Blau")),
      ];
      const clubById = new Map(players.map((p) => [p.id, p.club]));
      expect(clashesIn(generateEliminationBracket(players), clubById), `run ${run}`).toBe(2);
    }
  });

  it("does not hang when everyone shares a club", () => {
    const players = Array.from({ length: 8 }, () => withClub("TV Rot"));
    const bracket = generateEliminationBracket(players);
    expect(bracket).toHaveLength(4);
  });

  it("treats a missing club as no club, not as a shared one", () => {
    // Null is absence of information. Reading it as "same club" would
    // scatter players for no reason and could displace a real separation.
    const players = Array.from({ length: 8 }, () => withClub(null));
    const clubById = new Map(players.map((p) => [p.id, p.club]));
    expect(clashesIn(generateEliminationBracket(players), clubById)).toBe(0);
  });

  it("leaves the seeded positions where the seeding put them", () => {
    // The regulation asks for separation, but not at the price of the
    // seeding: the top two seeds still stand at opposite ends.
    const players = [
      ...Array.from({ length: 4 }, () => withClub("TV Rot")),
      ...Array.from({ length: 4 }, () => withClub("SC Blau")),
    ];
    const seeds = [players[0].id, players[4].id, players[1].id, players[5].id];
    for (let run = 0; run < 20; run++) {
      const bracket = generateEliminationBracket(players, seeds);
      const matchOf = (id: number) =>
        bracket.findIndex((m) => m.team1_p1 === id || m.team2_p1 === id);

      // Seed 1 opens the bracket, seed 2 stands in the other half, and no
      // two seeds share a first-round match.
      expect(bracket[0].team1_p1, `run ${run}`).toBe(seeds[0]);
      expect(matchOf(seeds[1]), `run ${run}`).toBeGreaterThanOrEqual(bracket.length / 2);
      expect(new Set(seeds.map(matchOf)).size, `run ${run}`).toBe(seeds.length);
    }
  });

  it("spreads club-mates across the groups", () => {
    for (let run = 0; run < 20; run++) {
      const players = [
        ...Array.from({ length: 4 }, () => withClub("TV Rot")),
        ...Array.from({ length: 4 }, () => withClub("SC Blau")),
      ];
      const groups = splitIntoGroups(players, 4);
      for (const g of groups) {
        const clubs = g.map((p) => p.club);
        expect(new Set(clubs).size, `run ${run}`).toBe(clubs.length);
      }
    }
  });
});
