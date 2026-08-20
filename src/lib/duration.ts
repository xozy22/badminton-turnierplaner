// src/lib/duration.ts
//
// How long a match takes here, and therefore how long an evening will.
//
// The question before every club night is "we have the hall until ten,
// we are eleven and have three courts -- which format fits?". BOSS has
// been in a position to answer it all along: every match records when it
// went on court and when it finished, and the statistics page has been
// showing the average for as long as it has existed. Nobody ever used it
// to plan with (FEATURE-BACKLOG.md H8).
//
// What makes this worth more than a rule of thumb is that the number
// comes from this hall, with these players, at their pace.

import { dbDateToMillis } from "./datetime";
import type { Match } from "./types";

/** Below this many measured matches, the median is not worth trusting. */
export const MIN_SAMPLE = 5;

/**
 * A match longer than this was not played that long. Two ways that
 * happens, and both are somebody's afternoon rather than a rally:
 *
 * - the result was entered late, so the match sat open in between;
 * - the match was reopened to fix a typo and closed again, which writes
 *   a fresh `completed_at` while `started_at` still holds the original
 *   start.
 *
 * The second is the reason for taking the median rather than the mean:
 * a correction an hour later stays under this ceiling and would still
 * drag an average up. It cannot move a middle value.
 */
const IMPLAUSIBLE_MINUTES = 180;

export interface DurationBasis {
  /** Minutes per match. */
  minutes: number;
  /** How many measured matches it came from. Zero means it is a guess. */
  sampleSize: number;
  /** True when there was not enough history and the fallback was used. */
  estimated: boolean;
}

/**
 * Minutes each completed match took, from going on court to finishing.
 *
 * Byes are skipped -- they are completed the moment they are created and
 * would otherwise contribute a stream of zeroes.
 */
export function matchDurations(matches: Match[]): number[] {
  const out: number[] = [];
  for (const m of matches) {
    if (m.status !== "completed") continue;
    if (m.team2_p1 === null) continue;
    if (!m.started_at || !m.completed_at) continue;
    const start = dbDateToMillis(m.started_at);
    const end = dbDateToMillis(m.completed_at);
    if (start === null || end === null) continue;
    const minutes = (end - start) / 60000;
    if (minutes <= 0 || minutes > IMPLAUSIBLE_MINUTES) continue;
    out.push(minutes);
  }
  return out;
}

/**
 * The middle value, not the average.
 *
 * One match left open over lunch drags an average up by minutes per
 * match; the median shrugs it off. The implausible-length filter above
 * catches the worst of it, but a forty-minute outlier is plausible and
 * still not typical.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * A rough guess for a club with no history yet.
 *
 * Roughly forty seconds a rally point, which is where a 21-point set
 * lands near a quarter of an hour -- close enough for a first evening,
 * and replaced by measurement as soon as there is any.
 */
export function fallbackMinutes(pointsPerSet: number, setsToWin: number): number {
  const perSet = Math.max(4, pointsPerSet * 0.7);
  // Not every match goes the distance: a best-of-three usually ends in
  // two, so the maximum number of sets overstates it.
  const typicalSets = setsToWin === 1 ? 1 : setsToWin + 0.4;
  return Math.round(perSet * typicalSets);
}

/**
 * How long one match takes, measured where possible.
 *
 * `history` should be every completed match available -- across
 * tournaments, because a club plays at the pace it plays, and one evening
 * is rarely enough to measure.
 */
export function matchDuration(
  history: Match[],
  scoring: { pointsPerSet: number; setsToWin: number },
): DurationBasis {
  const durations = matchDurations(history);
  if (durations.length < MIN_SAMPLE) {
    return {
      minutes: fallbackMinutes(scoring.pointsPerSet, scoring.setsToWin),
      sampleSize: durations.length,
      estimated: true,
    };
  }
  return {
    minutes: Math.round(median(durations)),
    sampleSize: durations.length,
    estimated: false,
  };
}

export interface ScheduleForecast {
  matches: number;
  /** Total minutes, with the courts running in parallel. */
  minutes: number;
  basis: DurationBasis;
}

/**
 * How long the whole thing runs.
 *
 * Matches share the courts, so the wall-clock time is the number of
 * rounds a court has to get through. `ceil` rather than a plain division:
 * three matches on two courts take two slots, not one and a half -- the
 * second court stands empty for the last one, and the evening still ends
 * when that match ends.
 */
export function forecastSchedule(
  matchCount: number,
  courts: number,
  basis: DurationBasis,
): ScheduleForecast {
  const usableCourts = Math.max(1, courts);
  const slots = Math.ceil(matchCount / usableCourts);
  return {
    matches: matchCount,
    minutes: slots * basis.minutes,
    basis,
  };
}
