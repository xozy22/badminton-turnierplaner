import type { ThemeColors } from "../../lib/theme";
import Icon from "../ui/Icon";
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
  /**
   * Places one to three get a medal, the rest their number.
   *
   * The medal is decoration on top of the position, which the number beside
   * it already states, so it carries no spoken name of its own. Gold, silver
   * and bronze are tinted through the colour — one shape serves all three.
   */
  const rankMedal = (i: number) => {
    const tint = ["text-[#c9a227]", "text-[#8a8f98]", "text-[#a1642f]"][i];
    if (!tint) return `${i + 1}`;
    return (
      <span className={`inline-flex items-center gap-1 ${tint}`}>
        <Icon name="medal" size={14} />
        <span className={theme.textSecondary}>{i + 1}</span>
      </span>
    );
  };

  return (
    <div>
      {/* Normal Standings */}
      <div className={`${theme.cardBg} rounded-lg shadow-sm border ${theme.cardBorder} overflow-hidden`}>
        <div className={`px-5 py-3 border-b ${theme.cardBorder} ${theme.headerGradient}`}>
          <span className={`font-semibold text-sm ${theme.standingsHeaderText}`}>
            <Icon name="chart" /> {t.standings_title}
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
