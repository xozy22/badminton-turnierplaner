// src/pages/TournamentView/components/modals/PlayerConflictModal.tsx
//
// HARD-block dialog when the TD tries to assign a match while at least
// one of its players is currently active on another court. No bypass —
// two simultaneous matches with the same player physically can't both
// finish, so the conflict must be resolved (other match completes or
// gets unassigned) before the assignment is allowed.

import type { ThemeColors } from "../../../../lib/theme";
import { useT } from "../../../../lib/I18nContext";

export interface PlayerConflict {
  matchId: number;
  players: { id: number; name: string; court: number }[];
}

export default function PlayerConflictModal({
  conflict,
  theme,
  onClose,
}: {
  conflict: PlayerConflict | null;
  theme: ThemeColors;
  onClose: () => void;
}) {
  const { t } = useT();
  if (!conflict) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${theme.cardBg} rounded-2xl shadow-xl border ${theme.cardBorder} max-w-md w-full p-6`}>
        <div className="flex items-start gap-3 mb-4">
          <div className="text-2xl">🚫</div>
          <div className="flex-1">
            <h3 className={`text-lg font-bold ${theme.textPrimary}`}>{t.player_conflict_title}</h3>
            <p className={`text-sm ${theme.textMuted} mt-1`}>{t.player_conflict_body}</p>
          </div>
        </div>
        <ul className="mb-5 space-y-1.5 pl-1">
          {conflict.players.map((p) => (
            <li key={p.id} className={`text-sm ${theme.textPrimary} flex items-start gap-2`}>
              <span className="text-danger-text">•</span>
              <span>
                {t.player_conflict_row
                  .replace("{player}", p.name)
                  .replace("{court}", String(p.court))}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-danger hover:bg-danger text-white text-sm font-medium transition-colors"
          >
            {t.common_close}
          </button>
        </div>
      </div>
    </div>
  );
}
