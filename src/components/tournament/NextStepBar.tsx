// src/components/tournament/NextStepBar.tsx
//
// Says in one sentence what the tournament director should do next.
//
// Until now that had to be inferred from which button happened to be
// visible — workable when you have time, less so with a hall waiting
// (REVIEW-BACKLOG.md F9).

import { useT } from "../../lib/I18nContext";
import { fill } from "../../lib/i18n/format";

export interface NextStepInfo {
  status: string;
  /** Rounds that exist so far. */
  roundCount: number;
  /** Rounds the format will produce in total, when that is known ahead. */
  plannedRounds: number | null;
  openMatches: number;
  matchesWithoutCourt: number;
  freeCourts: number;
  canAdvance: boolean;
  /** Label of the advance action, so the sentence names the same words. */
  advanceLabel: string;
}

/**
 * Picks the one thing that is most useful to do next.
 *
 * The order is the order of a running tournament: get results in, get
 * matches onto free courts, move to the next round, finish. Whatever comes
 * first in that list and applies is what the bar says.
 */
function describe(info: NextStepInfo, t: ReturnType<typeof useT>["t"]): {
  text: string;
  tone: "accent" | "warning" | "muted";
} {
  if (info.status === "draft") {
    return { text: t.next_step_start, tone: "accent" };
  }
  if (info.status === "completed" || info.status === "archived") {
    return { text: t.next_step_done, tone: "muted" };
  }

  if (info.matchesWithoutCourt > 0 && info.freeCourts > 0) {
    return {
      text: fill(t.next_step_assign_court, {
        matches: info.matchesWithoutCourt,
        courts: info.freeCourts,
      }),
      tone: "accent",
    };
  }
  if (info.openMatches > 0) {
    return {
      text: fill(t.next_step_enter_results, { count: info.openMatches }),
      tone: "warning",
    };
  }
  if (info.canAdvance) {
    return { text: fill(t.next_step_advance, { action: info.advanceLabel }), tone: "accent" };
  }
  return { text: t.next_step_finish, tone: "accent" };
}

export default function NextStepBar(info: NextStepInfo) {
  const { t } = useT();
  const { text, tone } = describe(info, t);

  const tones = {
    accent: "border-accent-border bg-accent-subtle text-accent-subtle-fg",
    warning: "border-warning bg-warning-subtle text-warning-text",
    muted: "border-line bg-surface-sunken text-secondary",
  } as const;

  const progress =
    info.plannedRounds && info.plannedRounds > 0
      ? fill(t.next_step_round_of, { current: info.roundCount, total: info.plannedRounds })
      : fill(t.next_step_round, { current: info.roundCount });

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-sm ${tones[tone]}`}
      // Polite: the sentence changes as the tournament progresses, and a
      // screen reader should hear it without being interrupted mid-task.
      aria-live="polite"
    >
      {info.roundCount > 0 && (
        <>
          <span className="text-xs font-medium opacity-80">{progress}</span>
          {/* Separate nodes rather than one string: the gap does the spacing
              visually, and a reader gets two phrases instead of a run-on. */}
          <span className="text-xs opacity-40" aria-hidden="true">
            ·
          </span>
        </>
      )}
      <span className="font-medium">
        <span className="opacity-70">{t.next_step_label}: </span>
        {text}
      </span>
    </div>
  );
}
