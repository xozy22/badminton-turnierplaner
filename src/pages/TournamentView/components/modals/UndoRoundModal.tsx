// src/pages/TournamentView/components/modals/UndoRoundModal.tsx
//
// Rich-preview confirm dialog for the "Letzte Runde rückgängig" action.
// Shows exactly what will be deleted (round label, match count, completed
// count, set entries, matches still on courts) before the user commits.
// Confirm button switches from amber to rose-red when result data is
// about to be lost, raising the visual stakes appropriately.
//
// The actual undo target is computed in TournamentView via getUndoTarget;
// this modal is purely presentational over that pre-built data.

import type { Round, TournamentPhase } from "../../../../lib/types";
import type { ThemeColors } from "../../../../lib/theme";
import { useT } from "../../../../lib/I18nContext";

export interface UndoTarget {
  rounds: Round[];
  label: string;
  matchCount: number;
  completedCount: number;
  activeOnCourtCount: number;
  setCount: number;
  resetStatusToDraft: boolean;
  isGroupKoBackToGroup: boolean;
  postUndoPhase?: TournamentPhase | null;
}

export default function UndoRoundModal({
  open,
  target,
  theme,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  target: UndoTarget | null;
  theme: ThemeColors;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  if (!open || !target) return null;

  const dangerous = target.completedCount > 0 || target.activeOnCourtCount > 0;
  const phaseHint = target.resetStatusToDraft
    ? t.tournament_view_undo_phase_to_draft
    : target.isGroupKoBackToGroup
    ? t.tournament_view_undo_phase_to_group
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${theme.cardBg} rounded-2xl shadow-2xl p-6 max-w-md w-full border ${theme.cardBorder}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="text-3xl">↩️</div>
          <h3 className={`font-bold text-lg ${theme.textPrimary}`}>
            {t.tournament_view_undo_round_title}
          </h3>
        </div>

        <p className={`text-sm ${theme.textSecondary} mb-3`}>
          {t.tournament_view_undo_target_label}
        </p>

        <div className={`rounded-xl border-2 ${dangerous ? "border-warning bg-warning-subtle/50 dark:bg-warning-subtle" : `${theme.cardBorder} ${theme.cardBg}`} p-4 mb-4`}>
          <div className={`font-semibold ${theme.textPrimary} mb-2`}>{target.label}</div>
          <ul className={`text-sm space-y-1 ${theme.textSecondary}`}>
            <li>• {t.tournament_view_undo_match_count.replace("{n}", String(target.matchCount))}</li>
            {target.completedCount > 0 && (
              <li className="text-warning-text dark:text-warning-text font-medium">
                • {t.tournament_view_undo_completed_count.replace("{n}", String(target.completedCount))} <span aria-hidden="true">⚠</span>
              </li>
            )}
            {target.setCount > 0 && (
              <li>• {t.tournament_view_undo_set_count.replace("{n}", String(target.setCount))}</li>
            )}
            {target.activeOnCourtCount > 0 && (
              <li className="text-warning-text dark:text-warning-text font-medium">
                • {t.tournament_view_undo_active_count.replace("{n}", String(target.activeOnCourtCount))} <span aria-hidden="true">⚠</span>
              </li>
            )}
          </ul>
        </div>

        {phaseHint && (
          <p className={`text-xs ${theme.textMuted} mb-4 flex items-start gap-1.5`}>
            <span>ⓘ</span><span>{phaseHint}</span>
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className={`px-4 py-2 rounded-xl text-sm ${theme.textSecondary} border ${theme.cardBorder} hover:opacity-80`}
          >
            {t.common_cancel}
          </button>
          <button
            onClick={onConfirm}
            className={`${
              dangerous
                ? "bg-danger hover:bg-danger"
                : "bg-warning hover:bg-warning"
            } text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors`}
          >
            {t.tournament_view_undo_confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
