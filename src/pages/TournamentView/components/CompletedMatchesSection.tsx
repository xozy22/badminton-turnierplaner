// src/pages/TournamentView/components/CompletedMatchesSection.tsx
//
// Collapsible "Beendet (N)" block under the active matches list. Default
// closed; opens to reveal a compact one-row-per-match table. During the
// group phase of a `group_ko` tournament the rows are segmented per group;
// for other formats it's a single flat list. Matches that are currently
// being edited (re-opened) always render as full <MatchCard>, regardless
// of the open/closed toggle, so the user doesn't lose their input UI.
//
// Originally lived inline at the bottom of TournamentView.tsx — extracted
// as part of the v2.7.5 directory split.

import { useState } from "react";
import type { ThemeColors } from "../../../lib/theme";
import type { ConflictPlayer } from "../../../lib/courtConflicts";
import { isSetComplete } from "../../../lib/scoring";
import type { Match, GameSet } from "../../../lib/types";
import { useT } from "../../../lib/I18nContext";
import MatchCard from "./MatchCard";

export default function CompletedMatchesSection({
  matches,
  setsByMatch,
  setsToWin,
  pointsPerSet,
  cap,
  courts,
  occupiedCourts,
  conflictedMatches,
  playerName,
  onScoreChange,
  onScoreBlur,
  onScoreCommit,
  onCourtChange,
  onAnnounce,
  onReset,
  isActive,
  theme,
  hasOtherMatches,
  editingMatchIds,
  allMatches,
  minRestMinutes,
  roundToGroup,
}: {
  matches: Match[];
  setsByMatch: Map<number, GameSet[]>;
  setsToWin: number;
  pointsPerSet: number;
  cap: number | null;
  courts: number;
  occupiedCourts: Set<number>;
  conflictedMatches?: Map<number, ConflictPlayer[]>;
  playerName: (id: number | null) => string;
  onScoreChange: (matchId: number, setNumber: number, team: 1 | 2, value: number) => void;
  onScoreBlur: (matchId: number, setNumber: number, team: 1 | 2) => void;
  onScoreCommit: (matchId: number, setNumber: number, team: 1 | 2) => Promise<void>;
  onCourtChange: (matchId: number, court: number | null) => void;
  onAnnounce: (court: number, team1: string, team2: string) => void;
  onReset: (matchId: number) => void;
  isActive: boolean;
  theme: ThemeColors;
  hasOtherMatches: boolean;
  editingMatchIds: Set<number>;
  allMatches: Match[];
  minRestMinutes: number;
  /**
   * When provided (group_ko in active group phase), completed matches are
   * segmented into per-group sections — same structuring approach as the
   * unassigned queue. Falls back to a single flat section otherwise (KO,
   * round_robin, etc.).
   */
  roundToGroup?: Map<number, number>;
}) {
  const { t } = useT();
  // The toggle simply shows/hides the completed-match list. Default is
  // collapsed so the page emphasises running/waiting matches by default —
  // completed ones are reference/history. Editing matches stay visible
  // either way (the user is mid-edit and would lose the input UI).
  const [isOpen, setIsOpen] = useState(false);

  const teamLabel = (m: Match) => {
    const t1 = m.team1_p2
      ? `${playerName(m.team1_p1)} / ${playerName(m.team1_p2)}`
      : playerName(m.team1_p1);
    const t2 = m.team2_p2
      ? `${playerName(m.team2_p1)} / ${playerName(m.team2_p2)}`
      : playerName(m.team2_p1);
    return { t1, t2 };
  };

  return (
    <div className={hasOtherMatches ? "mt-4" : ""}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`text-xs font-bold ${theme.textMuted} uppercase tracking-wider mb-2 flex items-center gap-2 hover:opacity-80 transition-opacity`}
      >
        <span className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
          ▾
        </span>
        {t.tournament_view_completed_matches.replace("{count}", String(matches.length))}
      </button>

      {/* Editing matches: always show as full MatchCard */}
      {matches.filter((m) => editingMatchIds.has(m.id)).map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          sets={setsByMatch.get(match.id) || []}
          setsToWin={setsToWin}
          pointsPerSet={pointsPerSet}
          cap={cap}
          courts={courts}
          occupiedCourts={occupiedCourts}
          conflictedMatches={conflictedMatches}
          playerName={playerName}
          onScoreChange={onScoreChange}
          onScoreBlur={onScoreBlur}
          onScoreCommit={onScoreCommit}
          onCourtChange={onCourtChange}
          onAnnounce={onAnnounce}
          onReset={onReset}
          isActive={isActive}
          theme={theme}
          allMatches={allMatches}
          minRestMinutes={minRestMinutes}
        />
      ))}

      {/* Non-editing matches — only rendered when the section is open.
          Editing matches above always show regardless of the toggle. */}
      {isOpen && (() => {
        const nonEditing = matches.filter((m) => !editingMatchIds.has(m.id));
        if (nonEditing.length === 0) return null;

        // Build per-group buckets when group context is available. Sorted
        // ascending by group_number so the section order matches the
        // standings table in GruppenTab. Returns null when there's nothing
        // to group (KO matches, non-group_ko formats) — render path falls
        // back to a single flat section.
        const buildGroups = (): { group: number; matches: Match[] }[] | null => {
          if (!roundToGroup) return null;
          const byGroup = new Map<number, Match[]>();
          for (const m of nonEditing) {
            const g = roundToGroup.get(m.round_id);
            if (g == null) continue;
            const arr = byGroup.get(g) ?? [];
            arr.push(m);
            byGroup.set(g, arr);
          }
          if (byGroup.size === 0) return null;
          return Array.from(byGroup.entries())
            .map(([group, ms]) => ({ group, matches: ms }))
            .sort((a, b) => a.group - b.group);
        };

        const groups = buildGroups();

        // One compact one-line row per match — used inside both flat and
        // grouped rendering paths.
        const renderCompactRow = (m: Match, i: number, n: number) => {
          const { t1, t2 } = teamLabel(m);
          const sets = setsByMatch.get(m.id) || [];
          let s1 = 0, s2 = 0;
          for (const s of sets) {
            if (isSetComplete(s, pointsPerSet, cap)) {
              if (s.team1_score > s.team2_score) s1++;
              else s2++;
            }
          }
          return (
            <div
              key={m.id}
              className={`flex items-center justify-between px-4 py-2 text-sm ${
                i > 0 && i < n ? `border-t ${theme.cardBorder}` : ""
              }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={`font-medium truncate ${
                  m.winner_team === 1 ? theme.activeBadgeText : theme.textSecondary
                }`}>
                  {t1}
                </span>
                <span className={`${theme.textMuted} text-xs shrink-0`}>{t.common_vs}</span>
                <span className={`font-medium truncate ${
                  m.winner_team === 2 ? theme.activeBadgeText : theme.textSecondary
                }`}>
                  {t2}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span className={`font-mono font-bold text-sm ${theme.textPrimary}`}>
                  {s1}:{s2}
                </span>
                <span className={`font-mono text-xs ${theme.textMuted}`}>
                  ({sets.filter(s => s.team1_score > 0 || s.team2_score > 0).map(s => `${s.team1_score}:${s.team2_score}`).join(", ")})
                </span>
                {isActive && (
                  <button
                    onClick={() => onReset(m.id)}
                    className="text-xs text-amber-500 hover:text-amber-700 transition-colors"
                  >
                    {t.tournament_view_edit_results}
                  </button>
                )}
              </div>
            </div>
          );
        };

        const groupHeader = (group: number, count: number) => (
          <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide mb-1 mt-2 first:mt-0 text-violet-600`}>
            <span>{t.group_progress_label.replace("{n}", String(group))}</span>
            <span className={`font-mono font-normal ${theme.textMuted}`}>
              {t.groups_matches_count.replace("{count}", String(count))}
            </span>
          </div>
        );

        if (groups) {
          return (
            <div className="space-y-2">
              {groups.map(({ group, matches: gm }) => (
                <div key={group}>
                  {groupHeader(group, gm.length)}
                  <div className={`${theme.cardBg} rounded-2xl border ${theme.cardBorder} overflow-hidden`}>
                    {gm.map((m, i) => renderCompactRow(m, i, gm.length))}
                  </div>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div className={`${theme.cardBg} rounded-2xl border ${theme.cardBorder} overflow-hidden`}>
            {nonEditing.map((m, i) => renderCompactRow(m, i, nonEditing.length))}
          </div>
        );
      })()}
    </div>
  );
}
