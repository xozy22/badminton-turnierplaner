// src/lib/duration.test.ts
//
// The number that turns a match count into an evening. It is read off
// real timestamps, so the interesting cases are the dirty ones: a match
// somebody forgot to close, a bye, a club with no history yet.

import { describe, it, expect } from "vitest";
import {
  matchDurations,
  median,
  matchDuration,
  fallbackMinutes,
  forecastSchedule,
  MIN_SAMPLE,
} from "./duration";
import { makeMatch, resetIds } from "../test/factories";
import { beforeEach } from "vitest";
import type { Match } from "./types";

beforeEach(resetIds);

/** A completed match that took `minutes`. */
const played = (minutes: number, overrides: Partial<Match> = {}): Match =>
  makeMatch({
    status: "completed",
    winner_team: 1,
    started_at: "2026-08-19T18:00:00.000Z",
    completed_at: new Date(Date.UTC(2026, 7, 19, 18, minutes, 0)).toISOString(),
    ...overrides,
  });

describe("matchDurations", () => {
  it("measures from going on court to finishing", () => {
    expect(matchDurations([played(25)])).toEqual([25]);
  });

  it("skips byes", () => {
    // A bye is completed the moment it is created, so it would contribute
    // a zero and drag every estimate down.
    expect(matchDurations([played(25, { team2_p1: null })])).toEqual([]);
  });

  it("skips a match that is still running", () => {
    expect(matchDurations([played(25, { status: "active", completed_at: null })])).toEqual([]);
  });

  it("skips a match with no start time", () => {
    // Nothing was ever assigned a court, so there is nothing to measure.
    expect(matchDurations([played(25, { started_at: null })])).toEqual([]);
  });

  it("throws out an implausible length", () => {
    // Somebody forgot to enter the result and it sat open until the next
    // session. Four hours is not a badminton match.
    expect(matchDurations([played(25), played(400)])).toEqual([25]);
  });

  it("throws out a negative length", () => {
    const backwards = played(25, {
      started_at: "2026-08-19T19:00:00.000Z",
      completed_at: "2026-08-19T18:00:00.000Z",
    });
    expect(matchDurations([backwards])).toEqual([]);
  });
});

describe("median", () => {
  it("takes the middle of an odd count", () => {
    expect(median([10, 20, 90])).toBe(20);
  });

  it("averages the middle two of an even count", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("is unmoved by one long match", () => {
    // The whole reason it is not an average: one outlier would move a
    // mean by minutes per match, and every estimate with it.
    const normal = [20, 21, 22, 23, 24];
    expect(median(normal)).toBe(22);
    expect(median([...normal, 170])).toBe(22.5);
  });

  it("returns zero for nothing", () => {
    expect(median([])).toBe(0);
  });
});

describe("matchDuration", () => {
  const scoring = { pointsPerSet: 21, setsToWin: 2 };

  it("measures once there is enough history", () => {
    const history = Array.from({ length: MIN_SAMPLE }, () => played(30));
    const basis = matchDuration(history, scoring);
    expect(basis).toMatchObject({ minutes: 30, sampleSize: MIN_SAMPLE, estimated: false });
  });

  it("falls back below the sample threshold", () => {
    // Four measured matches are not a pace. Saying so is better than
    // presenting a number built on four.
    const history = Array.from({ length: MIN_SAMPLE - 1 }, () => played(30));
    const basis = matchDuration(history, scoring);
    expect(basis.estimated).toBe(true);
    expect(basis.sampleSize).toBe(MIN_SAMPLE - 1);
  });

  it("falls back with no history at all", () => {
    const basis = matchDuration([], scoring);
    expect(basis.estimated).toBe(true);
    expect(basis.minutes).toBeGreaterThan(0);
  });
});

describe("fallbackMinutes", () => {
  it("gives a best-of-three to 21 something like half an hour", () => {
    const minutes = fallbackMinutes(21, 2);
    expect(minutes).toBeGreaterThanOrEqual(25);
    expect(minutes).toBeLessThanOrEqual(45);
  });

  it("makes a single set to 11 much shorter", () => {
    expect(fallbackMinutes(11, 1)).toBeLessThan(fallbackMinutes(21, 2));
  });

  it("never returns zero, whatever the scoring", () => {
    // A tournament could be configured oddly; a zero here would claim an
    // evening takes no time.
    expect(fallbackMinutes(0, 1)).toBeGreaterThan(0);
  });
});

describe("forecastSchedule", () => {
  const basis = { minutes: 20, sampleSize: 40, estimated: false };

  it("runs the courts in parallel", () => {
    expect(forecastSchedule(6, 3, basis).minutes).toBe(40);
  });

  it("rounds a part-full slot up", () => {
    // Three matches on two courts take two slots. The second court stands
    // empty for the last one, and the evening ends when it ends.
    expect(forecastSchedule(3, 2, basis).minutes).toBe(40);
  });

  it("treats no courts as one", () => {
    // Nothing is ever played on zero courts, and dividing by it would
    // report an infinite evening.
    expect(forecastSchedule(4, 0, basis).minutes).toBe(80);
  });

  it("reports no time for nothing to play", () => {
    expect(forecastSchedule(0, 2, basis).minutes).toBe(0);
  });
});
