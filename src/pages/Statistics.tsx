import { useEffect, useState, useCallback } from "react";
import { formatOptions, modeOptions } from "../lib/i18n/labels";
import { LoadingState } from "../components/ui/States";
import Icon from "../components/ui/Icon";
import { getTournaments, getPlayers, getAllMatchesWithTournament, getAllSetsFlat } from "../lib/db";
import { calculateTournamentStats, calculateMatchStats, calculateCourtStats, calculatePlayerDemographics, calculatePlayerRankings } from "../lib/stats";
import type { TournamentStats, MatchStats, CourtStats, DemoStats, PlayerRankingEntry } from "../lib/stats";
import type { Tournament, Player, Match, GameSet } from "../lib/types";
import { playerDisplayName } from "../lib/types";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/I18nContext";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { PRINT_COLORS, loadThemeId } from "../lib/theme";

export default function Statistics() {
  const { theme } = useTheme();
  const { t } = useT();
  useDocumentTitle(t.nav_statistics);

  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [allMatches, setAllMatches] = useState<(Match & { tournament_id: number; tournament_name: string })[]>([]);
  const [allSetsMap, setAllSetsMap] = useState<Map<number, GameSet[]>>(new Map());

  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);

  const [tournamentStats, setTournamentStats] = useState<TournamentStats | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);
  const [courtStats, setCourtStats] = useState<CourtStats | null>(null);
  const [demoStats, setDemoStats] = useState<DemoStats | null>(null);
  const [rankings, setRankings] = useState<PlayerRankingEntry[]>([]);

  const accentColor = PRINT_COLORS[loadThemeId()].accent;

  useEffect(() => {
    Promise.all([
      getTournaments(),
      getPlayers(),
      getAllMatchesWithTournament(),
      getAllSetsFlat(),
    ]).then(([ts, ps, ms, sets]) => {
      setTournaments(ts);
      setPlayers(ps);
      setAllMatches(ms);

      const map = new Map<number, GameSet[]>();
      for (const s of sets) {
        const arr = map.get(s.match_id);
        if (arr) arr.push(s);
        else map.set(s.match_id, [s]);
      }
      setAllSetsMap(map);
      setLoading(false);
    });
  }, []);

  const recalculate = useCallback((tournamentId: number | null) => {
    const filteredMatches = tournamentId !== null
      ? allMatches.filter(m => m.tournament_id === tournamentId)
      : allMatches;

    const filteredSetsMap = new Map<number, GameSet[]>();
    for (const m of filteredMatches) {
      const sets = allSetsMap.get(m.id);
      if (sets) filteredSetsMap.set(m.id, sets);
    }

    setTournamentStats(calculateTournamentStats(
      tournamentId !== null ? tournaments.filter(tr => tr.id === tournamentId) : tournaments
    ));
    setMatchStats(calculateMatchStats(filteredMatches, filteredSetsMap));
    setCourtStats(calculateCourtStats(filteredMatches));
    setDemoStats(calculatePlayerDemographics(players));
    setRankings(calculatePlayerRankings(filteredMatches, filteredSetsMap, players));
  }, [allMatches, allSetsMap, tournaments, players]);

  useEffect(() => {
    if (!loading) recalculate(selectedTournamentId);
  }, [loading, selectedTournamentId, recalculate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingState rows={4} />
      </div>
    );
  }

  const hasData = tournaments.length > 0 || players.length > 0;

  if (!hasData) {
    return (
      <div>
        <div className="mb-8">
          <h1 className={`text-3xl font-extrabold ${theme.textPrimary} tracking-tight`}>
            {t.stats_title} <Icon name="chart" />
          </h1>
          <p className={`${theme.textSecondary} mt-1`}>{t.stats_subtitle}</p>
        </div>
        <div className={`${theme.cardBg} border ${theme.cardBorder} rounded-lg p-10 text-center`}>
          <div className="text-5xl mb-4"><Icon name="inbox" /></div>
          <p className={`${theme.textSecondary} text-lg`}>{t.stats_no_data}</p>
        </div>
      </div>
    );
  }

  const formatDuration = (minutes: number | null): string => {
    if (minutes === null || minutes === undefined) return "—";
    if (minutes < 60) return t.stats_minutes.replace("{n}", String(Math.round(minutes)));
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  };

  const modeLabels = Object.fromEntries(modeOptions(t)) as Record<string, string>;
  const fmtLabels: Record<string, string> = Object.fromEntries(formatOptions(t));

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className={`text-3xl font-extrabold ${theme.textPrimary} tracking-tight`}>
            {t.stats_title} <Icon name="chart" />
          </h1>
          <p className={`${theme.textSecondary} mt-1`}>{t.stats_subtitle}</p>
        </div>
        {tournaments.length > 0 && (
          <div>
            <label className={`block text-xs ${theme.textMuted} mb-1`}>{t.stats_filter_tournament}</label>
            <select
              value={selectedTournamentId ?? ""}
              onChange={e => setSelectedTournamentId(e.target.value === "" ? null : Number(e.target.value))}
              className={`${theme.inputBg} ${theme.inputBorder} ${theme.inputText} border rounded-md px-4 py-2 text-sm min-w-[250px]`}
            >
              <option value="">{t.stats_all_tournaments}</option>
              {tournaments.map(tr => (
                <option key={tr.id} value={tr.id}>{tr.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Section 1: Tournament Overview */}
      {tournamentStats && (
        <section className="mb-8">
          <h2 className={`text-lg font-bold ${theme.textPrimary} mb-4`}>
            {t.stats_tournaments_overview}
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: t.status_draft, value: tournamentStats.byStatus.draft, bg: theme.statCard3 },
              { label: t.status_active, value: tournamentStats.byStatus.active, bg: theme.statCard2 },
              { label: t.status_completed, value: tournamentStats.byStatus.completed, bg: theme.statCard1 },
              { label: t.status_archived, value: tournamentStats.byStatus.archived, bg: `${theme.cardBg} border ${theme.cardBorder}` },
            ].map((card) => (
              <div
                key={card.label}
                className={`${card.bg} rounded-lg shadow-lg p-4 ${card.bg.includes("bg-gradient") ? "text-white" : theme.textPrimary}`}
              >
                <div className="text-3xl font-extrabold">{card.value}</div>
                <div className={`text-sm font-medium mt-0.5 ${card.bg.includes("bg-gradient") ? "text-white/70" : theme.textSecondary}`}>
                  {card.label}
                </div>
              </div>
            ))}
          </div>

          {/* By Format */}
          {tournamentStats.byFormat.length > 0 && (
            <div className={`${theme.cardBg} border ${theme.cardBorder} rounded-lg p-5 mb-4`}>
              <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-3`}>{t.stats_by_format}</h3>
              {tournamentStats.byFormat.map(({ format, count }) => {
                const maxCount = Math.max(...tournamentStats.byFormat.map((f) => f.count));
                const percent = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={format} className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs w-32 truncate ${theme.textSecondary}`}>{fmtLabels[format] ?? format}</span>
                    <div className={`flex-1 h-5 rounded-full overflow-hidden ${theme.inputBg}`}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: accentColor }} />
                    </div>
                    <span className={`text-xs w-6 text-right font-medium ${theme.textPrimary}`}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* By Mode */}
          {tournamentStats.byMode.length > 0 && (
            <div className={`${theme.cardBg} border ${theme.cardBorder} rounded-lg p-5`}>
              <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-3`}>{t.stats_by_mode}</h3>
              {tournamentStats.byMode.map(({ mode, count }) => {
                const maxCount = Math.max(...tournamentStats.byMode.map((m) => m.count));
                const percent = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={mode} className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs w-32 truncate ${theme.textSecondary}`}>{modeLabels[mode] ?? mode}</span>
                    <div className={`flex-1 h-5 rounded-full overflow-hidden ${theme.inputBg}`}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: accentColor }} />
                    </div>
                    <span className={`text-xs w-6 text-right font-medium ${theme.textPrimary}`}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Section 2: Match Statistics */}
      {matchStats && matchStats.totalCompleted > 0 && (
        <section className="mb-8">
          <h2 className={`text-lg font-bold ${theme.textPrimary} mb-4`}>
            {t.stats_match_statistics}
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {[
              { label: t.stats_total_matches, value: String(matchStats.totalCompleted) },
              { label: t.stats_avg_duration, value: matchStats.avgDurationMinutes !== null ? formatDuration(matchStats.avgDurationMinutes) : t.stats_no_duration_data },
              { label: t.stats_longest_match, value: matchStats.longestMatch ? formatDuration(matchStats.longestMatch.durationMinutes) : "—" },
              { label: t.stats_shortest_match, value: matchStats.shortestMatch ? formatDuration(matchStats.shortestMatch.durationMinutes) : "—" },
              { label: t.stats_avg_points_per_set, value: matchStats.avgPointsPerSet > 0 ? matchStats.avgPointsPerSet.toFixed(1) : "—" },
              { label: t.stats_closest_match, value: matchStats.closestMatch ? t.stats_points_diff.replace("{n}", String(matchStats.closestMatch.delta)) : "—" },
            ].map((card) => (
              <div key={card.label} className={`${theme.cardBg} border ${theme.cardBorder} rounded-lg p-4`}>
                <div className={`text-2xl font-extrabold ${theme.textPrimary}`}>{card.value}</div>
                <div className={`text-xs font-medium mt-0.5 ${theme.textSecondary}`}>{card.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <div className={`flex-1 ${theme.cardBg} border ${theme.cardBorder} rounded-md p-3 text-center`}>
              <span className={`text-xl font-bold ${theme.textPrimary}`}>{matchStats.totalSets}</span>
              <span className={`text-xs ${theme.textSecondary} ml-2`}>{t.stats_total_sets}</span>
            </div>
            <div className={`flex-1 ${theme.cardBg} border ${theme.cardBorder} rounded-md p-3 text-center`}>
              <span className={`text-xl font-bold ${theme.textPrimary}`}>{matchStats.totalPoints}</span>
              <span className={`text-xs ${theme.textSecondary} ml-2`}>{t.stats_total_points}</span>
            </div>
          </div>
        </section>
      )}

      {/* Section 3: Court Utilization */}
      {courtStats && courtStats.totalCourtsUsed > 0 && (
        <section className="mb-8">
          <h2 className={`text-lg font-bold ${theme.textPrimary} mb-4`}>
            {t.stats_court_utilization}
          </h2>

          <div className="flex gap-3 mb-4">
            <div className={`${theme.statCard1} rounded-lg shadow-lg p-4 text-white flex-1`}>
              <div className="text-3xl font-extrabold">{courtStats.totalCourtsUsed}</div>
              <div className="text-white/70 text-sm font-medium mt-0.5">{t.stats_courts_used}</div>
            </div>
            <div className={`${theme.statCard2} rounded-lg shadow-lg p-4 text-white flex-1`}>
              <div className="text-3xl font-extrabold">{courtStats.avgMatchesPerCourt.toFixed(1)}</div>
              <div className="text-white/70 text-sm font-medium mt-0.5">{t.stats_avg_matches_per_court}</div>
            </div>
          </div>

          {courtStats.matchesPerCourt.length > 0 && (
            <div className={`${theme.cardBg} border ${theme.cardBorder} rounded-lg p-5`}>
              <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-3`}>{t.stats_matches_per_court}</h3>
              {courtStats.matchesPerCourt.map(({ court, count }) => {
                const maxCount = Math.max(...courtStats.matchesPerCourt.map((c) => c.count));
                const percent = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={court} className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs w-20 truncate ${theme.textSecondary}`}>Court {court}</span>
                    <div className={`flex-1 h-5 rounded-full overflow-hidden ${theme.inputBg}`}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: accentColor }} />
                    </div>
                    <span className={`text-xs w-8 text-right font-medium ${theme.textPrimary}`}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Section 4: Player Demographics */}
      {demoStats && players.length > 0 && (
        <section className="mb-8">
          <h2 className={`text-lg font-bold ${theme.textPrimary} mb-4`}>
            {t.stats_player_demographics}
          </h2>

          {/* Gender split bar */}
          <div className={`${theme.cardBg} border ${theme.cardBorder} rounded-lg p-5 mb-4`}>
            <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-3`}>
              {t.stats_gender_split} — {t.stats_players_total.replace("{count}", String(demoStats.totalPlayers))}
            </h3>
            <div className="flex h-8 rounded-full overflow-hidden">
              {demoStats.genderSplit.male > 0 && (
                <div
                  className="h-full flex items-center justify-center text-xs font-bold text-white transition-all duration-500"
                  style={{ width: `${(demoStats.genderSplit.male / demoStats.totalPlayers * 100)}%`, background: "#22c55e", minWidth: "40px" }}
                >
                  <span aria-hidden="true">♂</span> {Math.round(demoStats.genderSplit.male / demoStats.totalPlayers * 100)}%
                </div>
              )}
              {demoStats.genderSplit.female > 0 && (
                <div
                  className="h-full flex items-center justify-center text-xs font-bold text-white transition-all duration-500"
                  style={{ width: `${(demoStats.genderSplit.female / demoStats.totalPlayers * 100)}%`, background: "#f43f5e", minWidth: "40px" }}
                >
                  <span aria-hidden="true">♀</span> {Math.round(demoStats.genderSplit.female / demoStats.totalPlayers * 100)}%
                </div>
              )}
            </div>
            <div className={`flex justify-between mt-2 text-xs ${theme.textMuted}`}>
              <span>{demoStats.genderSplit.male} {t.common_gender_male}</span>
              <span>{demoStats.genderSplit.female} {t.common_gender_female}</span>
            </div>
          </div>

          {/* Age distribution */}
          {demoStats.ageGroups.some(g => g.count > 0) && (
            <div className={`${theme.cardBg} border ${theme.cardBorder} rounded-lg p-5 mb-4`}>
              <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-3`}>{t.stats_age_distribution}</h3>
              {demoStats.ageGroups.filter(g => g.count > 0).map(({ label, count }) => {
                const maxCount = Math.max(...demoStats.ageGroups.map((a) => a.count));
                const percent = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={label} className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs w-16 ${theme.textSecondary}`}>{label}</span>
                    <div className={`flex-1 h-5 rounded-full overflow-hidden ${theme.inputBg}`}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: accentColor }} />
                    </div>
                    <span className={`text-xs w-6 text-right font-medium ${theme.textPrimary}`}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Top clubs */}
          {demoStats.topClubs.length > 0 && (
            <div className={`${theme.cardBg} border ${theme.cardBorder} rounded-lg p-5`}>
              <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-3`}>{t.stats_top_clubs}</h3>
              {demoStats.topClubs.map(({ club, count }) => {
                const maxCount = Math.max(...demoStats.topClubs.map((c) => c.count));
                const percent = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={club} className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs w-32 truncate ${theme.textSecondary}`}>{club}</span>
                    <div className={`flex-1 h-5 rounded-full overflow-hidden ${theme.inputBg}`}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: accentColor }} />
                    </div>
                    <span className={`text-xs w-6 text-right font-medium ${theme.textPrimary}`}>{count}</span>
                  </div>
                );
              })}
              {demoStats.noClub > 0 && (
                <div className={`mt-3 text-xs ${theme.textMuted}`}>
                  {demoStats.noClub} {t.stats_no_club}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Section 5: Player Rankings */}
      {rankings.length > 0 && (
        <section className="mb-8">
          <h2 className={`text-lg font-bold ${theme.textPrimary} mb-4`}>
            {t.stats_player_rankings}
          </h2>

          <div className={`${theme.cardBg} border ${theme.cardBorder} rounded-lg overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${theme.headerGradient} text-xs`}>
                    <th scope="col" className={`text-left px-4 py-3 font-medium ${theme.textSecondary}`}>{t.stats_rank}</th>
                    <th scope="col" className={`text-left px-4 py-3 font-medium ${theme.textSecondary}`}>{t.stats_player}</th>
                    <th scope="col" className={`text-center px-4 py-3 font-medium ${theme.textSecondary}`}>{t.stats_matches_played}</th>
                    <th scope="col" className={`text-center px-4 py-3 font-medium ${theme.textSecondary}`}>{t.common_wins_abbr}</th>
                    <th scope="col" className={`text-center px-4 py-3 font-medium ${theme.textSecondary}`}>{t.common_losses_abbr}</th>
                    <th scope="col" className={`text-center px-4 py-3 font-medium ${theme.textSecondary}`}>{t.stats_win_rate}</th>
                    <th scope="col" className={`text-center px-4 py-3 font-medium ${theme.textSecondary}`}>{t.stats_points_avg}</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.slice(0, 15).map((entry, idx) => {
                    const winRateColor = entry.winRate > 60 ? "text-success-text" : entry.winRate >= 40 ? "text-yellow-500" : "text-danger-text";
                    return (
                      <tr key={entry.player.id} className={`border-t ${theme.cardBorder} ${idx < 3 ? theme.headerGradient : ""}`}>
                        <td className={`px-4 py-2.5 font-bold ${theme.textSecondary}`}>
                          {idx < 3 ? <Icon name="medal" className={["text-warning-text", "text-muted", "text-danger-text"][idx]} /> : idx + 1}
                        </td>
                        <td className={`px-4 py-2.5 font-medium ${theme.textPrimary}`}>{playerDisplayName(entry.player)}</td>
                        <td className={`px-4 py-2.5 text-center ${theme.textSecondary}`}>{entry.totalMatches}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-success-text">{entry.wins}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-danger-text">{entry.losses}</td>
                        <td className={`px-4 py-2.5 text-center font-bold ${winRateColor}`}>{entry.winRate.toFixed(0)}%</td>
                        <td className={`px-4 py-2.5 text-center ${theme.textSecondary}`}>{entry.avgPointsPerMatch.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
