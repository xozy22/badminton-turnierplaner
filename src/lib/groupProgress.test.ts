// src/lib/groupProgress.test.ts
//
// Per-group progress: how far each group has got, and which group is
// furthest behind.
//
// The second part decides the order of the unassigned-match queue, so a
// mistake here does not look like a bug -- it looks like the tournament
// director making odd choices about what to put on court next.

import { describe, it, expect } from "vitest";
import {
  getGroupProgress,
  getRemainingByGroup,
  getRoundToGroupMap,
} from "./groupProgress";
import { makeMatch, resetIds } from "../test/factories";
import { beforeEach } from "vitest";
import type { Match, Round } from "./types";

beforeEach(resetIds);

const round = (id: number, number: number, group: number | null, phase = "group"): Round => ({
  id,
  tournament_id: 1,
  round_number: number,
  phase: phase as Round["phase"],
  group_number: group,
});

/** `n` matches in a round, the first `done` of them completed. */
const matches = (n: number, done: number): Match[] =>
  Array.from({ length: n }, (_, i) =>
    makeMatch({
      status: i < done ? "completed" : "pending",
      winner_team: i < done ? 1 : null,
    }),
  );

describe("getGroupProgress", () => {
  it("counts completed against total per group", () => {
    const rounds = [round(1, 1, 1), round(2, 1, 2)];
    const byRound = new Map([
      [1, matches(3, 2)],
      [2, matches(3, 0)],
    ]);

    const progress = getGroupProgress(rounds, byRound);

    expect(progress).toHaveLength(2);
    expect(progress[0]).toMatchObject({ group: 1, completed: 2, total: 3, remaining: 1 });
    expect(progress[1]).toMatchObject({ group: 2, completed: 0, total: 3, remaining: 3 });
  });

  it("sorts by group number", () => {
    const rounds = [round(1, 1, 3), round(2, 1, 1), round(3, 1, 2)];
    const byRound = new Map([[1, matches(1, 0)], [2, matches(1, 0)], [3, matches(1, 0)]]);

    expect(getGroupProgress(rounds, byRound).map((p) => p.group)).toEqual([1, 2, 3]);
  });

  it("ignores rounds outside the group phase", () => {
    // The knockout rounds of a group_ko tournament share the same list.
    const rounds = [round(1, 1, 1), round(2, 2, null, "ko")];
    const byRound = new Map([[1, matches(2, 1)], [2, matches(4, 0)]]);

    const progress = getGroupProgress(rounds, byRound);
    expect(progress).toHaveLength(1);
    expect(progress[0].total).toBe(2);
  });

  it("marks a round complete only when every match is", () => {
    const rounds = [round(1, 1, 1), round(2, 2, 1), round(3, 3, 1)];
    const byRound = new Map([
      [1, matches(2, 2)],
      [2, matches(2, 1)],
      [3, matches(2, 0)],
    ]);

    const [group] = getGroupProgress(rounds, byRound);
    expect(group.rounds.map((r) => [r.isComplete, r.isPartial])).toEqual([
      [true, false],
      [false, true],
      [false, false],
    ]);
  });

  it("numbers the rounds within the group, not across the tournament", () => {
    // Group 2's rounds are 4, 5, 6 of the tournament but 1, 2, 3 of the
    // group -- which is what the progress pills show.
    const rounds = [round(10, 4, 2), round(11, 5, 2), round(12, 6, 2)];
    const byRound = new Map([[10, matches(1, 0)], [11, matches(1, 0)], [12, matches(1, 0)]]);

    const [group] = getGroupProgress(rounds, byRound);
    expect(group.rounds.map((r) => r.label)).toEqual(["1", "2", "3"]);
  });

  it("treats an empty round as neither complete nor partial", () => {
    // A round with nothing in it is not finished; it never started.
    const rounds = [round(1, 1, 1)];
    const [group] = getGroupProgress(rounds, new Map([[1, []]]));
    expect(group.rounds[0]).toMatchObject({ isComplete: false, isPartial: false });
  });

  it("returns nothing when there is no group phase", () => {
    expect(getGroupProgress([round(1, 1, null, "ko")], new Map())).toEqual([]);
  });
});

describe("getRemainingByGroup", () => {
  it("maps each group to its outstanding matches", () => {
    // This is the queue's priority: the group with most left goes first,
    // so the groups finish around the same time.
    const rounds = [round(1, 1, 1), round(2, 1, 2)];
    const byRound = new Map([
      [1, matches(4, 3)],
      [2, matches(4, 1)],
    ]);

    const remaining = getRemainingByGroup(rounds, byRound);
    expect(remaining.get(1)).toBe(1);
    expect(remaining.get(2)).toBe(3);
  });
});

describe("getRoundToGroupMap", () => {
  it("maps rounds to their group", () => {
    const map = getRoundToGroupMap([round(1, 1, 1), round(2, 1, 2)]);
    expect(map.get(1)).toBe(1);
    expect(map.get(2)).toBe(2);
  });

  it("leaves out rounds that belong to no group", () => {
    const map = getRoundToGroupMap([round(1, 1, null, "ko")]);
    expect(map.size).toBe(0);
  });
});
