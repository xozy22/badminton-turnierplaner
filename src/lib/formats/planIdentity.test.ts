// src/lib/formats/planIdentity.test.ts

import { describe, it, expect } from "vitest";
import { planFingerprint, couldDrawDiffer } from "./planIdentity";
import type { FormatPlan } from "./types";

const plan = (matches: [number, number][]): FormatPlan => ({
  rounds: [
    {
      roundNumber: 1,
      matches: matches.map(([a, b]) => ({ team1_p1: a, team2_p1: b })),
    },
  ],
});

describe("planFingerprint", () => {
  it("gives the same plan the same fingerprint", () => {
    expect(planFingerprint(plan([[1, 2], [3, 4]]))).toBe(
      planFingerprint(plan([[1, 2], [3, 4]])),
    );
  });

  it("separates different pairings", () => {
    expect(couldDrawDiffer(plan([[1, 2], [3, 4]]), plan([[1, 3], [2, 4]]))).toBe(true);
  });

  it("treats a swapped pairing as a different draw", () => {
    // Which side a participant stands on decides which half of the bracket
    // they land in. It is not the same draw written down differently.
    expect(couldDrawDiffer(plan([[1, 2]]), plan([[2, 1]]))).toBe(true);
  });

  it("separates different match order", () => {
    // The order is the order of the courts and of the bracket slots.
    expect(couldDrawDiffer(plan([[1, 2], [3, 4]]), plan([[3, 4], [1, 2]]))).toBe(true);
  });

  it("separates a group number from a round number", () => {
    const a: FormatPlan = { rounds: [{ roundNumber: 1, groupNumber: 1, matches: [] }] };
    const b: FormatPlan = { rounds: [{ roundNumber: 1, groupNumber: 2, matches: [] }] };
    expect(couldDrawDiffer(a, b)).toBe(true);
  });

  it("sees a doubles partner change", () => {
    const a: FormatPlan = {
      rounds: [{ roundNumber: 1, matches: [{ team1_p1: 1, team1_p2: 2, team2_p1: 3, team2_p2: 4 }] }],
    };
    const b: FormatPlan = {
      rounds: [{ roundNumber: 1, matches: [{ team1_p1: 1, team1_p2: 3, team2_p1: 2, team2_p2: 4 }] }],
    };
    expect(couldDrawDiffer(a, b)).toBe(true);
  });

  it("does not confuse a bye with an opponent", () => {
    const bye: FormatPlan = {
      rounds: [{ roundNumber: 1, matches: [{ team1_p1: 1, team2_p1: null }] }],
    };
    const played: FormatPlan = {
      rounds: [{ roundNumber: 1, matches: [{ team1_p1: 1, team2_p1: 2 }] }],
    };
    expect(couldDrawDiffer(bye, played)).toBe(true);
  });
});
