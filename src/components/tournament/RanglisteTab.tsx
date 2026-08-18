import type { ThemeColors } from "../../lib/theme";
import type {
  Tournament,
  Player,
  StandingEntry,
} from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";

interface RanglisteTabProps {
  /** Angenommen, aber nicht gebraucht - haelt die Aufrufe der Tabs symmetrisch. */
  tournament?: Tournament;
  players?: Player[];
  standings: StandingEntry[];
  theme: ThemeColors;
}

export default function RanglisteTab({ standings, theme }: RanglisteTabProps) {
  const { t } = useT();
  // Buchholz only exists for Swiss/Monrad tables — the column appears with it.
  const showBuchholz = standings.some((s) => s.buchholz !== undefined);
  const rankMedal = (i: number) => {
    if (i === 0) return "\u{1F947}";
    if (i === 1) return "\u{1F948}";
    if (i === 2) return "\u{1F949}";
    return `${i + 1}`;
  };

  return (
    <div>
      {/* Normal Standings */}
      <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} overflow-hidden`}>
        <div className={`px-5 py-3 border-b ${theme.cardBorder} ${theme.headerGradient}`}>
          <span className={`font-semibold text-sm ${theme.standingsHeaderText}`}>
            {"\u{1F4CA}"} {t.standings_title}
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className={`border-b ${theme.cardBorder}`}>
              <th scope="col" className={`px-3 py-2.5 text-left ${theme.textSecondary} font-medium`}>#</th>
              <th scope="col" className={`px-3 py-2.5 text-left ${theme.textSecondary} font-medium`}>{t.standings_player}</th>
              <th scope="col" className={`px-3 py-2.5 text-center ${theme.textSecondary} font-medium`}>{t.standings_wins}</th>
              <th scope="col" className={`px-3 py-2.5 text-center ${theme.textSecondary} font-medium`}>{t.standings_losses}</th>
              <th scope="col" className={`px-3 py-2.5 text-center ${theme.textSecondary} font-medium`}>{t.standings_sets_header}</th>
              <th scope="col" className={`px-3 py-2.5 text-center ${theme.textSecondary} font-medium`}>{t.standings_points}</th>
              {showBuchholz && (
                <th scope="col" className={`px-3 py-2.5 text-center ${theme.textSecondary} font-medium`} title={t.standings_buchholz_hint}>
                  {t.standings_buchholz}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr
                key={s.player.id}
                className={`border-b ${theme.cardBorder} last:border-0 ${
                  i < 3 && s.wins > 0 ? "bg-warning/10" : ""
                }`}
              >
                <td className={`px-3 py-2.5 text-center text-sm ${theme.textSecondary}`}>
                  {rankMedal(i)}
                </td>
                <td className={`px-3 py-2.5 font-medium ${theme.textPrimary}`}>
                  {playerDisplayName(s.player)}
                </td>
                <td className={`px-3 py-2.5 text-center font-bold ${theme.activeBadgeText}`}>
                  {s.wins}
                </td>
                <td className="px-3 py-2.5 text-center text-danger-text">
                  {s.losses}
                </td>
                <td className={`px-3 py-2.5 text-center font-mono ${theme.textSecondary}`}>
                  {s.setsWon}:{s.setsLost}
                </td>
                <td className={`px-3 py-2.5 text-center font-mono ${theme.textSecondary}`}>
                  {s.pointsWon}:{s.pointsLost}
                </td>
                {showBuchholz && (
                  <td className={`px-3 py-2.5 text-center font-mono ${theme.textSecondary}`}>
                    {s.buchholz ?? 0}
                  </td>
                )}
              </tr>
            ))}
            {standings.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className={`px-3 py-6 text-center ${theme.textMuted}`}
                >
                  {t.standings_no_results}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
