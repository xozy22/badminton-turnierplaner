import { useState } from "react";
import type { ThemeColors } from "../../lib/theme";
import type {
  Tournament,
  Player,
  Match,
  GameSet,
  Round,
} from "../../lib/types";
import {
  calculateStandings,
  calculateTeamStandings,
  isSetComplete,
} from "../../lib/scoring";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import SeedBadge from "../players/SeedBadge";

interface GruppenTabProps {
  tournament: Tournament;
  players: Player[];
  theme: ThemeColors;
  /**
   * All tournament rounds. Used to slice each group's match list into
   * per-round sub-tables when the user drills into a single group.
   */
  rounds: Round[];
  getGroupData: (groupNum: number) => {
    gMatches: Match[];
    gSets: Map<number, GameSet[]>;
    pIds: Set<number>;
  };
  /**
   * Optional map<playerId, seedRank> for rendering Setzplatz badges next to
   * seeded player names. Empty map / undefined = no badges (e.g. tournaments
   * created without a seed list).
   */
  seedRankByPlayer?: Map<number, number>;
}

export default function GruppenTab({
  tournament,
  players,
  theme,
  rounds,
  getGroupData,
  seedRankByPlayer,
}: GruppenTabProps) {
  const { t } = useT();
  const numGroups = tournament.num_groups || 2;
  const [activeGroup, setActiveGroup] = useState<number | "all">("all");

  const groupNums = Array.from({ length: numGroups }, (_, g) => g + 1);
  const visibleGroups = activeGroup === "all" ? groupNums : [activeGroup];

  // Per-group match list — rendered below the standings table when the
  // user has drilled into a specific group. Segmented into one mini
  // table per round (Runde 1 / Runde 2 / …) so the group page reads as
  // a complete report: standings → match log structured by round.
  const renderGroupMatchList = (
    groupNum: number,
    gMatches: Match[],
    gSets: Map<number, GameSet[]>,
  ) => {
    if (gMatches.length === 0) return null;
    const isDoublesGroup = tournament.mode !== "singles";
    const ppSet = tournament.points_per_set;
    const cap = tournament.cap;

    // Group rounds belonging to this group, sorted by round_number — the
    // natural play order within the group.
    const groupRounds = rounds
      .filter((r) => r.phase === "group" && r.group_number === groupNum)
      .sort((a, b) => a.round_number - b.round_number);

    // Bucket matches by round_id for fast per-round rendering.
    const matchesByRound = new Map<number, Match[]>();
    for (const m of gMatches) {
      const arr = matchesByRound.get(m.round_id) ?? [];
      arr.push(m);
      matchesByRound.set(m.round_id, arr);
    }
    // Defensive fallback: any match without a matching round (shouldn't
    // happen in practice) goes into a single "other" bucket so it stays
    // visible.
    const orphanMatches: Match[] = [];
    for (const m of gMatches) {
      if (!groupRounds.some((r) => r.id === m.round_id)) orphanMatches.push(m);
    }

    const teamLabel = (m: Match, team: 1 | 2): string => {
      const p1Id = team === 1 ? m.team1_p1 : m.team2_p1;
      const p2Id = team === 1 ? m.team1_p2 : m.team2_p2;
      const p1 = players.find((p) => p.id === p1Id);
      const p1Name = p1 ? playerDisplayName(p1) : `#${p1Id}`;
      if (!isDoublesGroup || p2Id == null) return p1Name;
      const p2 = players.find((p) => p.id === p2Id);
      const p2Name = p2 ? playerDisplayName(p2) : `#${p2Id}`;
      return `${p1Name} / ${p2Name}`;
    };

    const renderMatchRow = (m: Match) => {
      const sets = gSets.get(m.id) ?? [];
      const completedSets = sets.filter((s) => isSetComplete(s, ppSet, cap));
      const t1Sets = completedSets.filter((s) => s.team1_score > s.team2_score).length;
      const t2Sets = completedSets.filter((s) => s.team2_score > s.team1_score).length;
      const setDetail = completedSets
        .sort((a, b) => a.set_number - b.set_number)
        .map((s) => `${s.team1_score}:${s.team2_score}`)
        .join(", ");

      const isCompleted = m.status === "completed" && m.winner_team !== null;
      const isActive = m.status === "active";

      const t1Class = isCompleted && m.winner_team === 1
        ? `font-bold ${theme.textPrimary}`
        : isCompleted ? theme.textMuted : theme.textPrimary;
      const t2Class = isCompleted && m.winner_team === 2
        ? `font-bold ${theme.textPrimary}`
        : isCompleted ? theme.textMuted : theme.textPrimary;

      return (
        <tr key={m.id} className={`border-b ${theme.cardBorder} last:border-0`}>
          <td className={`px-3 py-2 text-right ${t1Class} truncate`}>
            {teamLabel(m, 1)}
          </td>
          <td className={`px-2 py-2 text-center font-mono whitespace-nowrap ${theme.textSecondary}`}>
            {isCompleted ? (
              <span className="font-bold">{t1Sets}:{t2Sets}</span>
            ) : isActive ? (
              <span className="text-warning-text text-[10px] font-semibold uppercase tracking-wide">
                {t.groups_match_in_progress}
              </span>
            ) : (
              <span className={theme.textMuted}>{t.common_vs}</span>
            )}
          </td>
          <td className={`px-3 py-2 text-left ${t2Class} truncate`}>
            {teamLabel(m, 2)}
          </td>
          <td className={`px-3 py-2 text-right font-mono text-[11px] ${theme.textMuted} whitespace-nowrap`}>
            {setDetail || (m.status === "pending" ? t.groups_match_not_played : "")}
          </td>
        </tr>
      );
    };

    return (
      <div
        key={`matches-${groupNum}`}
        className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} overflow-hidden mt-3`}
      >
        <div className={`px-5 py-2.5 border-b ${theme.cardBorder} ${theme.headerGradient}`}>
          <span className={`font-semibold text-sm ${theme.standingsHeaderText}`}>
            {t.groups_matches_title}
          </span>
          <span className={`text-xs ${theme.textMuted} ml-2`}>
            {t.groups_matches_count.replace("{count}", String(gMatches.length))}
          </span>
        </div>
        <div className="divide-y divide-transparent">
          {groupRounds.map((r, idx) => {
            const roundMatches = matchesByRound.get(r.id) ?? [];
            if (roundMatches.length === 0) return null;
            return (
              <div key={r.id}>
                <div className={`flex items-center gap-2 px-5 py-1.5 ${theme.cardBg} border-t ${theme.cardBorder} ${idx === 0 ? "border-t-0" : ""}`}>
                  <span className={`text-[11px] font-bold uppercase tracking-wide text-phase-text`}>
                    {t.tournament_view_round_label.replace("{n}", String(idx + 1))}
                  </span>
                  <span className={`text-[10px] font-mono ${theme.textMuted}`}>
                    {t.groups_matches_count.replace("{count}", String(roundMatches.length))}
                  </span>
                </div>
                {/* table-fixed + explicit colgroup so every round renders
                    with identical column widths — without this each round
                    auto-sizes its own table and team names appear shifted
                    between rounds depending on their length. */}
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col />
                    <col className="w-20" />
                    <col />
                    <col className="w-32" />
                  </colgroup>
                  <tbody>
                    {roundMatches.map(renderMatchRow)}
                  </tbody>
                </table>
              </div>
            );
          })}
          {orphanMatches.length > 0 && (
            <table className="w-full text-xs table-fixed border-t border-dashed">
              <colgroup>
                <col />
                <col className="w-20" />
                <col />
                <col className="w-32" />
              </colgroup>
              <tbody>{orphanMatches.map(renderMatchRow)}</tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (groupNum: number) => {
    const { gMatches, gSets, pIds } = getGroupData(groupNum);
    const gPlayers = players.filter((p) => pIds.has(p.id));
    const qualifyCount = tournament.qualify_per_group || 2;
    const isDoublesGroup = tournament.mode !== "singles";
    // Match list only when drilled into a single group — would clutter the
    // "Alle"-overview with N standings + N match logs.
    const showMatchList = activeGroup !== "all";

    if (isDoublesGroup) {
      const teamStandings = calculateTeamStandings(gPlayers, gMatches, gSets);
      return (
        <div key={groupNum}>
        <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} overflow-hidden`}>
          <div className={`px-5 py-2.5 border-b ${theme.cardBorder} ${theme.headerGradient}`}>
            <span className={`font-semibold text-sm ${theme.standingsHeaderText}`}>
              {t.groups_group.replace("{n}", String(groupNum))}
            </span>
            <span className={`text-xs ${theme.textMuted} ml-2`}>
              {t.groups_teams_count.replace("{count}", String(teamStandings.length)).replace("{qualify}", String(qualifyCount))}
            </span>
          </div>
          <table className="w-full text-xs table-fixed">
            <colgroup>
              <col className="w-12" />
              <col />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-20" />
            </colgroup>
            <thead>
              <tr className={`border-b ${theme.cardBorder}`}>
                <th className={`px-3 py-2 text-left ${theme.textSecondary} font-medium`}>#</th>
                <th className={`px-3 py-2 text-left ${theme.textSecondary} font-medium`}>{t.groups_team}</th>
                <th className={`px-3 py-2 text-center ${theme.textSecondary} font-medium`}>{t.common_wins_abbr}</th>
                <th className={`px-3 py-2 text-center ${theme.textSecondary} font-medium`}>{t.common_losses_abbr}</th>
                <th className={`px-3 py-2 text-center ${theme.textSecondary} font-medium`}>{t.common_points_abbr}</th>
              </tr>
            </thead>
            <tbody>
              {teamStandings.map((ts, i) => (
                <tr
                  key={ts.teamKey}
                  className={`border-b ${theme.cardBorder} last:border-0 ${
                    i < qualifyCount ? `${theme.selectedBg}` : ""
                  }`}
                >
                  <td className={`px-3 py-2 ${theme.textMuted} font-mono`}>{i + 1}</td>
                  <td className={`px-3 py-2 font-medium ${theme.textPrimary} truncate`}>
                    {playerDisplayName(ts.player1)}
                    <SeedBadge rank={seedRankByPlayer?.get(ts.player1.id)} />
                    {" / "}
                    {playerDisplayName(ts.player2)}
                    <SeedBadge rank={seedRankByPlayer?.get(ts.player2.id)} />
                    {i < qualifyCount && (
                      <span className="ml-1 text-[9px] text-emerald-500 font-bold">Q</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-center font-bold ${theme.activeBadgeText}`}>{ts.wins}</td>
                  <td className="px-3 py-2 text-center text-danger-text">{ts.losses}</td>
                  <td className={`px-3 py-2 text-center font-mono ${theme.textSecondary}`}>
                    {ts.pointsWon}:{ts.pointsLost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showMatchList && renderGroupMatchList(groupNum, gMatches, gSets)}
        </div>
      );
    }

    const gStandings = calculateStandings(gPlayers, gMatches, gSets);
    return (
      <div key={groupNum}>
      <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} overflow-hidden`}>
        <div className={`px-5 py-2.5 border-b ${theme.cardBorder} ${theme.headerGradient}`}>
          <span className={`font-semibold text-sm ${theme.standingsHeaderText}`}>
            {t.groups_group.replace("{n}", String(groupNum))}
          </span>
          <span className={`text-xs ${theme.textMuted} ml-2`}>
            {t.groups_players_count.replace("{count}", String(gPlayers.length)).replace("{qualify}", String(qualifyCount))}
          </span>
        </div>
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col className="w-12" />
            <col />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-20" />
          </colgroup>
          <thead>
            <tr className={`border-b ${theme.cardBorder}`}>
              <th className={`px-3 py-2 text-left ${theme.textSecondary} font-medium`}>#</th>
              <th className={`px-3 py-2 text-left ${theme.textSecondary} font-medium`}>{t.groups_player}</th>
              <th className={`px-3 py-2 text-center ${theme.textSecondary} font-medium`}>{t.common_wins_abbr}</th>
              <th className={`px-3 py-2 text-center ${theme.textSecondary} font-medium`}>{t.common_losses_abbr}</th>
              <th className={`px-3 py-2 text-center ${theme.textSecondary} font-medium`}>{t.common_points_abbr}</th>
            </tr>
          </thead>
          <tbody>
            {gStandings.map((s, i) => (
              <tr
                key={s.player.id}
                className={`border-b ${theme.cardBorder} last:border-0 ${
                  i < qualifyCount ? `${theme.selectedBg}` : ""
                }`}
              >
                <td className={`px-3 py-2 ${theme.textMuted} font-mono`}>{i + 1}</td>
                <td className={`px-3 py-2 font-medium ${theme.textPrimary} truncate`}>
                  {playerDisplayName(s.player)}
                  <SeedBadge rank={seedRankByPlayer?.get(s.player.id)} />
                  {i < qualifyCount && (
                    <span className="ml-1 text-[9px] text-emerald-500 font-bold">Q</span>
                  )}
                </td>
                <td className={`px-3 py-2 text-center font-bold ${theme.activeBadgeText}`}>{s.wins}</td>
                <td className="px-3 py-2 text-center text-danger-text">{s.losses}</td>
                <td className={`px-3 py-2 text-center font-mono ${theme.textSecondary}`}>
                  {s.pointsWon}:{s.pointsLost}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showMatchList && renderGroupMatchList(groupNum, gMatches, gSets)}
      </div>
    );
  };

  return (
    <div>
      {/* Group Selector */}
      {numGroups > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setActiveGroup("all")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeGroup === "all"
                ? `${theme.roundActiveBg} ${theme.roundActiveText} shadow-md`
                : `${theme.cardBg} ${theme.textSecondary} hover:opacity-80 border ${theme.cardBorder} ${theme.cardHoverBorder}`
            }`}
          >
            {t.groups_all}
          </button>
          {groupNums.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeGroup === g
                  ? `${theme.roundActiveBg} ${theme.roundActiveText} shadow-md`
                  : `${theme.cardBg} ${theme.textSecondary} hover:opacity-80 border ${theme.cardBorder} ${theme.cardHoverBorder}`
              }`}
            >
              {t.groups_group.replace("{n}", String(g))}
            </button>
          ))}
        </div>
      )}

      {/* Group Tables */}
      <div className="space-y-4">
        {visibleGroups.map(renderGroup)}
      </div>
    </div>
  );
}
