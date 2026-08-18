import { describe, it, expect, beforeEach } from "vitest";
import { getPlayerRestStatus, getRestingPlayers } from "./restTime";
import { makeMatch, resetIds } from "../test/factories";
import type { Match } from "./types";

beforeEach(resetIds);

const NOW = Date.parse("2026-01-01T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

/** `completedMatch([1, null, 2], 5)` = singles, player 1 beat 2, five minutes ago. */
function completedMatch(
  playerIds: (number | null)[],
  finishedMinutesAgo: number,
  overrides: Partial<Match> = {},
): Match {
  const [p1, p2 = null, p3 = 0, p4 = null] = playerIds;
  return makeMatch({
    team1_p1: p1 ?? 0,
    team1_p2: p2,
    team2_p1: p3 ?? 0,
    team2_p2: p4,
    status: "completed",
    winner_team: 1,
    completed_at: minutesAgo(finishedMinutesAgo),
    ...overrides,
  });
}

describe("getPlayerRestStatus", () => {
  it("reports resting with the remaining minutes rounded up", () => {
    const matches = [completedMatch([1, null, 2], 5)];
    const status = getPlayerRestStatus(1, matches, 15, NOW);

    expect(status.isResting).toBe(true);
    expect(status.minutesLeft).toBe(10);
    expect(status.lastCompletedAt).toBe(minutesAgo(5));
  });

  it("reports not resting once the interval has elapsed", () => {
    const matches = [completedMatch([1, null, 2], 20)];
    expect(getPlayerRestStatus(1, matches, 15, NOW).isResting).toBe(false);
  });

  it("treats the exact boundary as rested", () => {
    const matches = [completedMatch([1, null, 2], 15)];
    expect(getPlayerRestStatus(1, matches, 15, NOW).isResting).toBe(false);
  });

  it("never reports less than one minute while still resting", () => {
    const matches = [completedMatch([1, null, 2], 14.99)];
    expect(getPlayerRestStatus(1, matches, 15, NOW).minutesLeft).toBe(1);
  });

  it("is disabled when the rest time is zero", () => {
    const matches = [completedMatch([1, null, 2], 1)];
    expect(getPlayerRestStatus(1, matches, 0, NOW).isResting).toBe(false);
  });

  it("ignores unfinished matches", () => {
    const matches = [completedMatch([1, null, 2], 1, { status: "active", completed_at: null })];
    expect(getPlayerRestStatus(1, matches, 15, NOW).isResting).toBe(false);
  });

  it("uses the most recent match when several exist", () => {
    const matches = [completedMatch([1, null, 2], 40), completedMatch([1, null, 3], 3)];
    expect(getPlayerRestStatus(1, matches, 15, NOW).minutesLeft).toBe(12);
  });

  it("can exclude a match — the one being rescheduled", () => {
    const recent = completedMatch([1, null, 2], 3);
    expect(getPlayerRestStatus(1, [recent], 15, NOW, recent.id).isResting).toBe(false);
  });

  it("handles doubles partners on both sides", () => {
    const matches = [completedMatch([1, 2, 3, 4], 5)];
    for (const pid of [1, 2, 3, 4]) {
      expect(getPlayerRestStatus(pid, matches, 15, NOW).isResting).toBe(true);
    }
  });

  it("returns a safe default for missing or placeholder player ids", () => {
    const matches = [completedMatch([1, null, 2], 1)];
    expect(getPlayerRestStatus(null, matches, 15, NOW).isResting).toBe(false);
    expect(getPlayerRestStatus(undefined, matches, 15, NOW).isResting).toBe(false);
    expect(getPlayerRestStatus(0, matches, 15, NOW).isResting).toBe(false);
  });
});

describe("getRestingPlayers", () => {
  it("returns only the players who are still resting", () => {
    const matches = [completedMatch([1, null, 2], 5), completedMatch([3, null, 4], 45)];
    const map = getRestingPlayers(matches, 15, NOW);

    expect([...map.keys()].sort()).toEqual([1, 2]);
    expect(map.get(1)!.minutesLeft).toBe(10);
  });

  it("agrees with the single-player variant", () => {
    const matches = [completedMatch([1, 2, 3, 4], 7), completedMatch([5, null, 6], 30)];
    const map = getRestingPlayers(matches, 20, NOW);

    for (const pid of [1, 2, 3, 4, 5, 6]) {
      const single = getPlayerRestStatus(pid, matches, 20, NOW);
      expect(map.has(pid)).toBe(single.isResting);
      if (single.isResting) expect(map.get(pid)!.minutesLeft).toBe(single.minutesLeft);
    }
  });

  it("is empty when the feature is disabled", () => {
    const matches = [completedMatch([1, null, 2], 1)];
    expect(getRestingPlayers(matches, 0, NOW).size).toBe(0);
  });

  it("honours the excluded match", () => {
    const recent = completedMatch([1, null, 2], 2);
    expect(getRestingPlayers([recent], 15, NOW, recent.id).size).toBe(0);
  });
});
