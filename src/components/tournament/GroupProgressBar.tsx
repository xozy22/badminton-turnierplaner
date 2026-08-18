// src/components/tournament/GroupProgressBar.tsx
//
// Per-group progress bar shown above the match queue during the group
// phase of a `group_ko` tournament — and also as a history reference
// once the KO phase has started. One compact card per group with:
//   - <completed>/<total> with a colored fill bar
//   - ⚠ icon when the group lags behind the median (smart-queue
//     auto-prioritizes those matches)
//   - Read-only round pills ([1✓][2✓][3]) showing per-round completion
//     state inside the same card — replaces the separate "G1/G2/G3"
//     button rows below the round selector
//
// Pure presentation — all data comes pre-aggregated via getGroupProgress
// from src/lib/groupProgress.ts.

import { useT } from "../../lib/I18nContext";
import Icon from "../../components/ui/Icon";
import { useTheme } from "../../lib/ThemeContext";
import type { GroupProgress, GroupRoundProgress } from "../../lib/groupProgress";

interface Props {
  progress: GroupProgress[];
}

export default function GroupProgressBar({ progress }: Props) {
  const { t } = useT();
  const { theme } = useTheme();
  if (progress.length === 0) return null;

  // "Behind median" detection: a group is flagged when its completed
  // match count is at least 2 below the median (avoids spamming the
  // warning when groups are essentially in sync). With 1 group, the
  // median equals that group's count → never flagged. ✓
  const completedCounts = progress
    .map((p) => p.completed)
    .sort((a, b) => a - b);
  const median = completedCounts[Math.floor(completedCounts.length / 2)];
  const isBehind = (p: GroupProgress) =>
    p.remaining > 0 && median - p.completed >= 2;

  const renderRoundPill = (rp: GroupRoundProgress) => {
    let pillClass: string;
    if (rp.isComplete) {
      pillClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
    } else if (rp.isPartial) {
      pillClass = "bg-warning-subtle text-warning-text border-warning";
    } else {
      pillClass = `${theme.cardBg} ${theme.textMuted} ${theme.cardBorder}`;
    }
    return (
      <span
        key={rp.roundId}
        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border select-none ${pillClass}`}
      >
        {rp.label}
        {rp.isComplete && <span className="ml-0.5">✓</span>}
      </span>
    );
  };

  return (
    <div className={`${theme.cardBg} rounded-2xl border ${theme.cardBorder} p-3 mb-3`}>
      <div className={`text-[11px] font-semibold ${theme.textSecondary} uppercase tracking-wide mb-2`}>
        {t.group_progress_title}
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(progress.length, 4)}, 1fr)` }}
      >
        {progress.map((p) => {
          const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
          const behind = isBehind(p);
          const done = p.remaining === 0 && p.total > 0;
          return (
            <div key={p.group} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-bold ${behind ? "text-danger-text" : theme.textPrimary}`}>
                  {t.group_progress_label.replace("{n}", String(p.group))}
                  {behind && (
                    <span
                      className="ml-1"
                      title={t.group_progress_behind_tooltip}
                      aria-label={t.group_progress_behind_tooltip}
                    >
                      <Icon name="alert" />
                    </span>
                  )}
                  {done && <span className="ml-1 text-emerald-600">✓</span>}
                </span>
                <span className={`text-[11px] font-mono ${theme.textMuted}`}>
                  {p.completed}/{p.total}
                </span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden ${theme.cardBg} border ${theme.cardBorder}`}>
                <div
                  className={`h-full transition-all ${
                    done
                      ? "bg-emerald-500"
                      : behind
                      ? "bg-rose-400"
                      : "bg-phase"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {p.rounds.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {p.rounds.map(renderRoundPill)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
