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
import { isScoreValid } from "./scoring";

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
