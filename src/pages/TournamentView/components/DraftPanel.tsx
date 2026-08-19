// src/pages/TournamentView/components/DraftPanel.tsx
//
// What a tournament shows before it has been drawn: how many participants
// are registered, and the button that starts it.
//
// Only ever visible while the status is "draft" and no round exists, which
// is why it sat in the way of everything else in index.tsx
// (REVIEW-BACKLOG.md D1).

import { formatLabel, modeLabel } from "../../../lib/i18n/labels";
import { useT } from "../../../lib/I18nContext";
import { useTheme } from "../../../lib/ThemeContext";
import { playerDisplayName } from "../../../lib/types";
import type { Player, Round, Tournament } from "../../../lib/types";

interface Props {
  tournament: Tournament;
  players: Player[];
  rounds: Round[];
}

export default function DraftPanel({ tournament, players, rounds }: Props) {
  const { t } = useT();
  const { theme } = useTheme();

  return (
    <>
  {/* Round Tabs - above everything */}
  {rounds.length === 0 && tournament.status === "draft" && (
    <div className={`${theme.cardBg} rounded-lg shadow-sm border ${theme.cardBorder} p-8 mb-6`}>
      <div className="text-center mb-6">
            <div className={`text-lg font-semibold ${theme.textPrimary}`}>
          {t.tournament_view_not_started}
        </div>
        <div className={`text-sm ${theme.textMuted} mt-1`}>
          {t.tournament_view_not_started_hint}
        </div>
      </div>

      {/* Tournament Summary */}
      <div className={`${theme.inputBg} rounded-md p-5 border ${theme.inputBorder}`}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.tournament_mode}</span>
            <div className={`font-medium ${theme.textPrimary} mt-0.5`}>
              {modeLabel(t, tournament.mode)}
            </div>
          </div>
          <div>
            <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.tournament_format}</span>
            <div className={`font-medium ${theme.textPrimary} mt-0.5`}>
              {formatLabel(t, tournament.format)}
            </div>
          </div>
          <div>
            <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.tournament_sets_to_win}</span>
            <div className={`font-medium ${theme.textPrimary} mt-0.5`}>{t.tournaments_best_of.replace("{count}", String(tournament.sets_to_win * 2 - 1))}</div>
          </div>
          <div>
            <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.tournament_points_per_set}</span>
            <div className={`font-medium ${theme.textPrimary} mt-0.5`}>{tournament.points_per_set}</div>
          </div>
          <div>
            <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.common_courts}</span>
            <div className={`font-medium ${theme.textPrimary} mt-0.5`}>{tournament.courts}</div>
          </div>
          <div>
            <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.stats_player}</span>
            <div className={`font-medium ${theme.textPrimary} mt-0.5`}>{players.length}</div>
          </div>
        </div>
        {players.length > 0 && (
          <div className="mt-4 pt-3 border-t border-line-strong dark:border-line-strong">
            <span className={`${theme.textMuted} text-xs uppercase tracking-wide`}>{t.management_participants.replace("{count}", String(players.length))}</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {players.map(p => (
                <span key={p.id} className={`text-xs px-2 py-0.5 rounded-full ${
                  p.gender === "m" ? "bg-info-subtle text-info-text" : "bg-pink-100 text-pink-700"
                }`}>
                  {playerDisplayName(p)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )}

    </>
  );
}
