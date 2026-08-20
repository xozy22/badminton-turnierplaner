// src/lib/scoringRules.test.ts
//
// The scoring rules, checked exhaustively against an independent statement
// of them rather than case by case.
//
// Written after 21:20 was found to be accepted: every branch past the
// normal-win case is guarded by `high > pointsPerSet`, so the target
// against target-1 fell through all of them to the closing "valid". Hand
// picked examples had missed it for the same reason a reader would — it is
// the one combination nobody thinks to try.
//
// Comparing every combination against a second, differently written rule
// finds that kind of hole without anyone having to guess where it is.

import { describe, it, expect } from "vitest";
import {
  autoFillOpponentScore,
  isScoreValid,
  isSetComplete,
  isSetPlayable,
  playedSets,
} from "./scoring";
import type { GameSet } from "./types";

/**
 * The rule, stated independently of the implementation.
 *
 * A badminton set ends when a side reaches the target with at least two
 * clear points, or — past the target — leads by exactly two, or reaches
 * the cap with one. Anything else is not a final score.
 */
function legalByRule(a: number, b: number, target: number, cap: number | null): boolean {
  if (a < 0 || b < 0) return false;
  const high = Math.max(a, b);
  const low = Math.min(a, b);

  // Still being typed: nobody has reached the target, so there is nothing
  // to object to yet. The field must not flash red mid-entry.
  if (high < target) return true;

  if (high === low) return false;

  if (cap === null) {
    // Hard cap: first to the target, any margin.
    return high === target && low < target;
  }
  if (high > cap) return false;
  if (high === cap) return low === cap - 1 || low === cap - 2;
  if (high === target) return low <= target - 2;
  if (high > target) return high - low === 2 && low >= target - 1;
  return false;
}

describe("probe: every score combination against the rule", () => {
  const modes: [number, number | null][] = [
    [21, 30], [15, 25], [11, 20], [15, null], [11, null],
  ];

  for (const [target, cap] of modes) {
    it(`agrees with the rule for ${target}${cap ? ` ext ${cap}` : " hard"}`, () => {
      const max = (cap ?? target) + 2;
      const disagreements: string[] = [];
      for (let a = 0; a <= max; a++) {
        for (let b = 0; b <= max; b++) {
          if (a === 0 && b === 0) continue; // "nothing entered yet"
          const impl = isScoreValid(a, b, target, cap).valid;
          const rule = legalByRule(a, b, target, cap);
          if (impl !== rule) {
            disagreements.push(`${a}:${b} impl=${impl} rule=${rule}`);
          }
        }
      }
      expect(disagreements, disagreements.slice(0, 12).join(", ")).toEqual([]);
    });
  }
});

/**
 * isSetComplete is the question that matters: is this a finished set?
 *
 * isSetWon on its own answers "did this side win" and deliberately does
 * not re-check legality — 22:0 returns true there, and isScoreValid is
 * what rejects it. Testing them separately means testing isSetWon against
 * a rule it does not claim to implement; the pair is what the interface
 * asks.
 */
function completeByRule(a: number, b: number, target: number, cap: number | null): boolean {
  if (a === 0 && b === 0) return false;
  if (a < 0 || b < 0) return false;
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  if (high === low) return false;
  if (cap === null) return high === target && low < target;
  if (high > cap) return false;
  if (high === cap) return low === cap - 1 || low === cap - 2;
  if (high === target) return low <= target - 2;
  if (high > target) return high - low === 2 && low >= target - 1;
  return false;
}

describe("isSetComplete agrees with the rule", () => {
  const modes: [number, number | null][] = [
    [21, 30], [15, 25], [11, 20], [15, null], [11, null],
  ];

  for (const [target, cap] of modes) {
    it(`${target}${cap ? ` ext ${cap}` : " hard"}`, () => {
      const max = (cap ?? target) + 2;
      const bad: string[] = [];
      for (let a = 0; a <= max; a++) {
        for (let b = 0; b <= max; b++) {
          const impl = isSetComplete(
            { id: 1, match_id: 1, set_number: 1, team1_score: a, team2_score: b } as GameSet,
            target,
            cap,
          );
          const rule = completeByRule(a, b, target, cap);
          if (impl !== rule) bad.push(`${a}:${b} impl=${impl} rule=${rule}`);
        }
      }
      expect(bad, bad.slice(0, 10).join(", ")).toEqual([]);
    });
  }
});

describe("auto-fill only ever proposes a legal result", () => {
  const modes: [number, number | null][] = [
    [21, 30], [15, 25], [11, 20], [15, null], [11, null],
  ];

  for (const [target, cap] of modes) {
    it(`${target}${cap ? ` ext ${cap}` : " hard"}`, () => {
      const bad: string[] = [];
      for (let entered = 0; entered <= (cap ?? target); entered++) {
        for (const fresh of [true, false]) {
          const other = autoFillOpponentScore(entered, target, cap, fresh);
          if (other === null) continue;
          if (!isScoreValid(entered, other, target, cap).valid) {
            bad.push(`${entered} -> ${other} (fresh=${fresh})`);
          }
        }
      }
      expect(bad, bad.slice(0, 10).join(", ")).toEqual([]);
    });
  }

  it("suggests the extension score at deuce, not the impossible one", () => {
    // Typing 20 in a 21-to-30 set means the opponent got to 22, because
    // 21:20 cannot end a set.
    expect(autoFillOpponentScore(20, 21, 30, true)).toBe(22);
    expect(autoFillOpponentScore(14, 15, 25, true)).toBe(16);
    expect(autoFillOpponentScore(10, 11, 20, true)).toBe(12);
  });
});

describe("sets that could never have been played", () => {
  const set = (n: number, a: number, b: number): GameSet => ({
    id: n,
    match_id: 1,
    set_number: n,
    team1_score: a,
    team2_score: b,
  });

  describe("isSetPlayable", () => {
    it("allows the first set of anything", () => {
      expect(isSetPlayable(1, [], 2, 21, 30)).toBe(true);
    });

    it("allows the second when the first is decided", () => {
      expect(isSetPlayable(2, [set(1, 21, 10)], 2, 21, 30)).toBe(true);
    });

    it("allows the third at one set all", () => {
      expect(isSetPlayable(3, [set(1, 21, 10), set(2, 15, 21)], 2, 21, 30)).toBe(true);
    });

    it("refuses the third at two sets to none", () => {
      // The reported fault: 21:10, 21:15 and then a third set went in.
      expect(isSetPlayable(3, [set(1, 21, 10), set(2, 21, 15)], 2, 21, 30)).toBe(false);
    });

    it("frees the third again when the second is corrected", () => {
      // Somebody fixes a mistyped second set. The third has to come back,
      // or the correction leaves the match unfinishable.
      const corrected = [set(1, 21, 10), set(2, 15, 21)];
      expect(isSetPlayable(3, corrected, 2, 21, 30)).toBe(true);
    });

    it("ignores an unfinished earlier set", () => {
      // 21:10 and 5:3 is not one set all; the third is still out of reach,
      // but so is any decision, so the second stays open.
      expect(isSetPlayable(2, [set(1, 21, 10)], 2, 21, 30)).toBe(true);
      expect(isSetPlayable(3, [set(1, 21, 10), set(2, 5, 3)], 2, 21, 30)).toBe(true);
    });

    it("ends a best-of-one after the first set", () => {
      expect(isSetPlayable(2, [set(1, 21, 10)], 1, 21, 30)).toBe(false);
    });

    it("allows five sets in a best-of-five", () => {
      const sets = [set(1, 21, 10), set(2, 10, 21), set(3, 21, 12), set(4, 12, 21)];
      expect(isSetPlayable(5, sets, 3, 21, 30)).toBe(true);
    });
  });

  describe("playedSets", () => {
    it("keeps the set that decided the match", () => {
      const sets = [set(1, 21, 10), set(2, 21, 15)];
      expect(playedSets(sets, 2, 21, 30)).toHaveLength(2);
    });

    it("drops what came after the decision", () => {
      // Otherwise the extra set counts towards the set and point ratios
      // that decide ties in a group.
      const sets = [set(1, 21, 10), set(2, 21, 15), set(3, 22, 20)];
      const kept = playedSets(sets, 2, 21, 30);
      expect(kept.map((x) => x.set_number)).toEqual([1, 2]);
    });

    it("keeps all three of a genuine decider", () => {
      const sets = [set(1, 21, 10), set(2, 15, 21), set(3, 21, 18)];
      expect(playedSets(sets, 2, 21, 30)).toHaveLength(3);
    });

    it("reads them in order, whatever order they arrive in", () => {
      // The database returns rows in whatever order it likes.
      const sets = [set(3, 22, 20), set(1, 21, 10), set(2, 21, 15)];
      expect(playedSets(sets, 2, 21, 30).map((x) => x.set_number)).toEqual([1, 2]);
    });

    it("keeps an unfinished set", () => {
      // A match still being played has nothing to trim.
      const sets = [set(1, 21, 10), set(2, 5, 3)];
      expect(playedSets(sets, 2, 21, 30)).toHaveLength(2);
    });

    it("leaves an empty match empty", () => {
      expect(playedSets([], 2, 21, 30)).toEqual([]);
    });
  });
});
