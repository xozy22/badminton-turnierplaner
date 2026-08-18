import { describe, it, expect } from "vitest";
import {
  nextDoubleEliminationRounds,
  bronzeCandidates,
  type BracketMatchState,
  type Participant,
} from "./doubleElimination";

const p = (id: number): Participant => ({ p1: id, p2: null });

function match(
  phase: BracketMatchState["phase"],
  roundNumber: number,
  team1: number,
  team2: number | null,
  winner: 1 | 2 | null = null,
): BracketMatchState {
  return {
    phase,
    roundNumber,
    team1: p(team1),
    team2: team2 === null ? null : p(team2),
    winner: team2 === null ? 1 : winner,
  };
}

/** All rounds creatable right now, split by bracket. */
const byPhase = (matches: BracketMatchState[]) => {
  const rounds = nextDoubleEliminationRounds(matches);
  return {
    all: rounds,
    winners: rounds.find((r) => r.phase === "winners"),
    losers: rounds.find((r) => r.phase === "losers"),
    grandFinal: rounds.find((r) => r.phase === "grand_final"),
  };
};

/** Flattens a round into "a vs b" strings for readable assertions. */
const asPairs = (
  round: { pairings: { team1: Participant; team2: Participant | null }[] } | undefined,
) => round?.pairings.map((x) => `${x.team1.p1} vs ${x.team2 ? x.team2.p1 : "bye"}`) ?? [];

describe("nextDoubleEliminationRounds", () => {
  it("creates nothing while the opening round is still running", () => {
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, null), // open
    ];
    expect(nextDoubleEliminationRounds(matches)).toEqual([]);
  });

  it("creates the next winners round and the opening losers round together", () => {
    // Both are due at the same time, and in a hall they run in parallel.
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
      match("winners", 1, 5, 6, 1),
      match("winners", 1, 7, 8, 1),
    ];
    const { winners, losers } = byPhase(matches);

    expect(asPairs(winners)).toEqual(["1 vs 3", "5 vs 7"]);
    expect(asPairs(losers)).toEqual(["2 vs 4", "6 vs 8"]);
  });

  // --- The defect this module replaces ------------------------------------
  it("pairs losers-bracket survivors against the newly dropped players", () => {
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
      match("winners", 1, 5, 6, 1),
      match("winners", 1, 7, 8, 1),
      // Opening losers round: the four round-1 dropouts.
      match("losers", 2, 2, 4, 1),
      match("losers", 2, 6, 8, 1),
      // Winners round 2 drops 3 and 7.
      match("winners", 3, 1, 3, 1),
      match("winners", 3, 5, 7, 1),
    ];

    const { losers } = byPhase(matches);
    // Survivors 2 and 6 meet the fresh dropouts — not each other.
    expect(asPairs(losers)).toEqual(["2 vs 3", "6 vs 7"]);
  });

  it("feeds the losers bracket one winners round at a time", () => {
    // Dropouts from two different winners rounds are waiting. Throwing them
    // in together would put a quarter-final loser against a first-round
    // loser two stages too early.
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
      match("winners", 2, 1, 3, 1),
    ];
    const { losers } = byPhase(matches);
    expect(asPairs(losers)).toEqual(["2 vs 4"]); // 3 waits for the next round
  });

  it("plays a major round when no dropouts are waiting", () => {
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
      match("winners", 1, 5, 6, 1),
      match("winners", 1, 7, 8, 1),
      match("winners", 2, 1, 3, 1),
      match("winners", 2, 5, 7, 1),
      match("winners", 3, 1, 5, 1), // winners champion decided
      match("losers", 2, 2, 4, 1),
      match("losers", 2, 6, 8, 1),
      match("losers", 3, 2, 3, 1), // survivors already met the round-2 dropouts
      match("losers", 3, 6, 7, 1),
      // Minor round against the round-3 dropout: 6 had the bye there.
      match("losers", 4, 2, 5, 1),
      match("losers", 4, 6, null),
    ];

    const { losers, grandFinal } = byPhase(matches);
    // 2 and 6 are the remaining losers-bracket players — a major round.
    expect(asPairs(losers)).toEqual(["2 vs 6"]);
    expect(grandFinal).toBeUndefined();
  });

  it("creates the grand final when both brackets have one player left", () => {
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
      match("winners", 2, 1, 3, 1), // 1 is the winners champion
      match("losers", 2, 2, 4, 1),
      match("losers", 3, 2, 3, 1), // 2 is the losers champion
    ];

    const { grandFinal } = byPhase(matches);
    expect(asPairs(grandFinal)).toEqual(["1 vs 2"]);
    expect(grandFinal?.isBracketReset).toBeUndefined();
  });

  it("replays the final when the losers champion wins it", () => {
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
      match("winners", 2, 1, 3, 1),
      match("losers", 2, 2, 4, 1),
      match("losers", 3, 2, 3, 1),
      match("grand_final", 4, 1, 2, 2), // the losers champion wins
    ];

    const { grandFinal } = byPhase(matches);
    expect(grandFinal?.isBracketReset).toBe(true);
    expect(asPairs(grandFinal)).toEqual(["1 vs 2"]);
  });

  it("ends the tournament when the winners champion takes the final", () => {
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
      match("winners", 2, 1, 3, 1),
      match("losers", 2, 2, 4, 1),
      match("losers", 3, 2, 3, 1),
      match("grand_final", 4, 1, 2, 1),
    ];
    expect(nextDoubleEliminationRounds(matches)).toEqual([]);
  });

  it("ends after a bracket reset", () => {
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
      match("winners", 2, 1, 3, 1),
      match("losers", 2, 2, 4, 1),
      match("losers", 3, 2, 3, 1),
      match("grand_final", 4, 1, 2, 2),
      match("grand_final", 5, 1, 2, 2),
    ];
    expect(nextDoubleEliminationRounds(matches)).toEqual([]);
  });

  it("carries a bye through the winners bracket", () => {
    const matches = [
      match("winners", 1, 1, null), // bye
      match("winners", 1, 2, 3, 1),
    ];
    const { winners } = byPhase(matches);
    expect(asPairs(winners)).toEqual(["1 vs 2"]);
  });

  it("gives an odd losers field a bye instead of dropping a player", () => {
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
      match("winners", 1, 5, 6, 1),
    ];
    const { losers } = byPhase(matches);
    // Three dropouts: two play, one advances on a bye.
    expect(asPairs(losers)).toEqual(["2 vs 4", "6 vs bye"]);
  });

  it("nobody is eliminated by a single defeat", () => {
    // Every first-round loser has to reappear in the losers bracket.
    const matches = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
    ];
    const { losers } = byPhase(matches);
    const inLosers = losers?.pairings.flatMap((x) => [x.team1.p1, x.team2?.p1]) ?? [];
    expect(inLosers).toContain(2);
    expect(inLosers).toContain(4);
  });

  it("runs a full eight-player tournament to a single champion", () => {
    // Plays the whole bracket out, always letting the lower id win, and
    // checks the shape: everyone loses twice before leaving, one champion.
    const matches: BracketMatchState[] = [
      match("winners", 1, 1, 2, 1),
      match("winners", 1, 3, 4, 1),
      match("winners", 1, 5, 6, 1),
      match("winners", 1, 7, 8, 1),
    ];
    let roundNumber = 2;
    const defeats = new Map<number, number>();
    const recordDefeat = (id: number) => defeats.set(id, (defeats.get(id) ?? 0) + 1);
    recordDefeat(2);
    recordDefeat(4);
    recordDefeat(6);
    recordDefeat(8);

    for (let guard = 0; guard < 20; guard++) {
      const rounds = nextDoubleEliminationRounds(matches);
      if (rounds.length === 0) break;

      for (const round of rounds) {
        for (const pairing of round.pairings) {
          const a = pairing.team1.p1;
          const b = pairing.team2?.p1 ?? null;
          const winner = b === null ? 1 : a < b ? 1 : 2;
          if (b !== null) recordDefeat(winner === 1 ? b : a);
          matches.push({
            phase: round.phase,
            roundNumber,
            team1: pairing.team1,
            team2: pairing.team2,
            winner: b === null ? 1 : (winner as 1 | 2),
          });
        }
        roundNumber++;
      }
    }

    // Player 1 wins everything; everyone else has exactly two defeats.
    expect(defeats.get(1) ?? 0).toBeLessThanOrEqual(1);
    for (const id of [2, 3, 4, 5, 6, 7, 8]) {
      expect(defeats.get(id), `player ${id}`).toBe(2);
    }
  });
});

describe("bronzeCandidates", () => {
  it("is empty before a losers semi-final exists", () => {
    expect(bronzeCandidates([match("losers", 2, 2, 4, 1)])).toEqual([]);
  });

  it("returns the losers of the round before the losers final", () => {
    const matches = [
      match("losers", 2, 2, 4, 1),
      match("losers", 2, 6, 8, 1),
      match("losers", 3, 2, 6, 1),
    ];
    expect(bronzeCandidates(matches).map((x) => x.p1)).toEqual([4, 8]);
  });
});
