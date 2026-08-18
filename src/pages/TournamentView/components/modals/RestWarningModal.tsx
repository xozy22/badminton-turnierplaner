// src/pages/TournamentView/components/modals/RestWarningModal.tsx
//
// Rendered when the TD tries to assign a match to a court but at least
// one player hasn't rested long enough since their last completed match
// (tournament.min_rest_minutes). Soft warning with bypass — user can
// click "Trotzdem zuweisen" to override; that's expected for tight
// schedules where the TD knows what they're doing.

import type { ThemeColors } from "../../../../lib/theme";
import { useT } from "../../../../lib/I18nContext";

export interface RestWarning {
  matchId: number;
  court: number;
  players: { id: number; name: string; minutesLeft: number }[];
}

export default function RestWarningModal({
  warning,
  theme,
  onCancel,
  onConfirm,
}: {
  warning: RestWarning | null;
  theme: ThemeColors;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  if (!warning) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${theme.cardBg} rounded-2xl shadow-xl border ${theme.cardBorder} max-w-md w-full p-6`}>
        <div className="flex items-start gap-3 mb-4">
          <div className="text-2xl">⏱️</div>
          <div className="flex-1">
            <h3 className={`text-lg font-bold ${theme.textPrimary}`}>{t.rest_warning_title}</h3>
            <p className={`text-sm ${theme.textMuted} mt-1`}>{t.rest_warning_body}</p>
          </div>
        </div>
        <ul className="mb-5 space-y-1.5 pl-1">
          {warning.players.map((p) => (
            <li key={p.id} className={`text-sm ${theme.textPrimary} flex items-start gap-2`}>
              <span className="text-warning-text">•</span>
              <span>
                {t.rest_warning_player_row
                  .replace("{player}", p.name)
                  .replace("{minutes}", String(p.minutesLeft))}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className={`px-4 py-2 rounded-xl border ${theme.cardBorder} ${theme.textPrimary} text-sm font-medium hover:opacity-80 transition-opacity`}
          >
            {t.rest_warning_cancel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-warning hover:bg-warning text-white text-sm font-medium transition-colors"
          >
            {t.rest_warning_confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
