// src/lib/formats/planIdentity.ts
//
// Whether two draws came out the same.
//
// The draw preview offers "draw again" -- but only where drawing again
// could produce something else (FEATURE-BACKLOG.md C4). Rather than
// asking each format whether it shuffles, the caller builds the plan
// twice and compares. That is right by construction: a knockout round
// filled from the winners is decided, a Swiss round is not, and a field
// of two has only one possible draw whatever the format does.

import type { FormatPlan } from "./types";

/**
 * A stable string for what the plan actually schedules.
 *
 * Pairings are compared as they stand, not as sets: who is home and who
 * is away decides which half of the bracket somebody lands in, so a
 * swapped pairing is a different draw, not the same one written down
 * differently.
 */
export function planFingerprint(plan: FormatPlan): string {
  return plan.rounds
    .map((round) => {
      const head = `${round.roundNumber}/${round.phase ?? ""}/${round.groupNumber ?? ""}`;
      const matches = round.matches
        .map((m) =>
          [m.team1_p1, m.team1_p2 ?? "", m.team2_p1 ?? "", m.team2_p2 ?? ""].join(":"),
        )
        .join("|");
      return `${head}#${matches}`;
    })
    .join("§");
}

/**
 * True when a second attempt could differ from the first.
 *
 * Two identical results are not proof -- a random draw can repeat itself
 * -- but for the field sizes involved that is rare enough, and the cost
 * of being wrong is only a missing button on a draw that had one option
 * anyway.
 */
export function couldDrawDiffer(a: FormatPlan, b: FormatPlan): boolean {
  return planFingerprint(a) !== planFingerprint(b);
}
