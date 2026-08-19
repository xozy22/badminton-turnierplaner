// src/pages/TournamentView/components/MatchCard.tsx
//
// Full match-card with team labels, court badge/timer, score-entry inputs,
// status indicators and reset/announce buttons. Drag source for the court
// queue (when isActive + match has no court + multi-court tournament).
//
// Pure presentation: all data flows in via props, all mutations via the
// onScoreChange/onScoreBlur/onCourtChange/onAnnounce/onReset callbacks.
// Originally lived inline in TournamentView.tsx — extracted as part of
// the v2.7.5 directory split.

import React, { useRef } from "react";
import Icon from "../../../components/ui/Icon";
import type { ConflictPlayer } from "../../../lib/courtConflicts";
import { CourtTimer } from "../../../components/courts/CourtTimer";
import RestIndicator from "../../../components/players/RestIndicator";
import { getMaxScore, isScoreValid, isSetComplete } from "../../../lib/scoring";
import type { Match, GameSet } from "../../../lib/types";
import type { ThemeColors } from "../../../lib/theme";
import { useT } from "../../../lib/I18nContext";
import { fill } from "../../../lib/i18n/format";

export default function MatchCard({
  match,
  sets,
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
  allMatches,
  minRestMinutes,
}: {
  match: Match;
  sets: GameSet[];
  setsToWin: number;
  pointsPerSet: number;
  cap: number | null;
  courts: number;
  occupiedCourts: Set<number>;
  conflictedMatches?: Map<number, ConflictPlayer[]>;
  playerName: (id: number | null) => string;
  onScoreChange: (
    matchId: number,
    setNumber: number,
    team: 1 | 2,
    value: number,
  ) => void;
  onScoreBlur: (
    matchId: number,
    setNumber: number,
    team: 1 | 2,
  ) => void;
  /**
   * Called only on Enter — runs Auto-Fill + Winner-Detection. Tab/Click
   * fire onScoreBlur (Auto-Fill only) so the user can navigate through
   * sets with auto-fill suggestions without accidentally completing
   * the match.
   */
  onScoreCommit: (
    matchId: number,
    setNumber: number,
    team: 1 | 2,
  ) => Promise<void>;
  onCourtChange: (matchId: number, court: number | null) => void;
  onAnnounce?: (court: number, team1: string, team2: string) => void;
  onReset: (matchId: number) => void;
  isActive: boolean;
  theme: ThemeColors;
  allMatches: Match[];
  minRestMinutes: number;
}) {
  const { t } = useT();
  const maxSets = setsToWin * 2 - 1;
  const maxScore = getMaxScore(pointsPerSet, cap);

  // Tracks which input got the *user-initiated* focus most recently. Used by
  // onFocus to decide whether to auto-select the current value. Without this
  // guard, React re-renders during rapid typing can re-fire the focus event
  // and re-select the in-progress digits — causing typing "12" quickly to
  // produce only "2" because the next keystroke replaces the (re-)selected
  // "1". Refs are intentionally per-input identity so the comparison is
  // stable across re-renders without needing local state.
  const focusedInputRef = useRef<HTMLInputElement | null>(null);
  const handleScoreFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (focusedInputRef.current === e.target) return;
    focusedInputRef.current = e.target;
    e.target.select();
  };
  const releaseFocusedRef = (e: React.FocusEvent<HTMLInputElement>) => {
    if (focusedInputRef.current === e.target) {
      focusedInputRef.current = null;
    }
  };
  const team1Label = match.team1_p2
    ? `${playerName(match.team1_p1)} / ${playerName(match.team1_p2)}`
    : playerName(match.team1_p1);
  const team2Label = match.team2_p2
    ? `${playerName(match.team2_p1)} / ${playerName(match.team2_p2)}`
    : playerName(match.team2_p1);

  // JSX renderer that inlines RestIndicator after each player name. Only renders
  // clocks when the tournament is active AND has rest time configured AND the
  // match itself isn't completed yet (a completed match has no scheduling value).
  const showRestIcons =
    isActive && minRestMinutes > 0 && match.status !== "completed";
  const renderTeam = (p1: number | null, p2: number | null) =>
    p1 === null ? (
      <span className="italic opacity-70">{t.common_bye}</span>
    ) : (
    <>
      <span>{playerName(p1)}</span>
      {showRestIcons && (
        <RestIndicator
          playerId={p1}
          matches={allMatches}
          minRestMinutes={minRestMinutes}
          excludeMatchId={match.id}
        />
      )}
      {p2 != null && (
        <>
          <span className="mx-1 text-muted">/</span>
          <span>{playerName(p2)}</span>
          {showRestIcons && (
            <RestIndicator
              playerId={p2}
              matches={allMatches}
              minRestMinutes={minRestMinutes}
              excludeMatchId={match.id}
            />
          )}
        </>
      )}
    </>
  );

  // Count sets won for display
  let team1SetsWon = 0;
  let team2SetsWon = 0;
  for (const s of sets) {
    if (isSetComplete(s, pointsPerSet, cap)) {
      if (s.team1_score > s.team2_score) team1SetsWon++;
      else team2SetsWon++;
    }
  }

  const borderColor =
    match.status === "completed"
      ? theme.completedBorder
      : team1SetsWon > 0 || team2SetsWon > 0
      ? "border-l-amber-400"
      : "border-l-gray-200";

  const isDraggable = isActive && !match.court && match.status !== "completed" && courts > 1;
  // notStarted: only if match was NEVER assigned to a court (no court_assigned_at history)
  // Matches being edited (reopened) had a court before, so they should remain editable
  const notStarted = courts > 1 && !match.court && !match.court_assigned_at;
  const inputsDisabled = !isActive || match.status === "completed" || notStarted;

  return (
    <div
      data-match-id={match.id}
      draggable={isDraggable}
      onDragStart={(e) => {
        if (isDraggable) {
          e.dataTransfer.setData("matchId", String(match.id));
          e.dataTransfer.effectAllowed = "move";
        }
      }}
      className={`${theme.cardBg} rounded-lg shadow-sm border ${theme.cardBorder} border-l-4 ${borderColor} p-5 mb-3 transition-all duration-200 ${
        match.status === "completed" ? "opacity-80" : ""
      } ${isDraggable ? "cursor-grab active:cursor-grabbing hover:shadow-sm" : ""}`}
    >
      {/* Teams + Court */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3 text-sm">
          {/* Court Badge + Timer */}
          {courts > 1 && (
            <>
              {isActive && match.status !== "completed" ? (
                <select
                  value={match.court ?? ""}
                  onChange={(e) =>
                    onCourtChange(match.id, e.target.value ? Number(e.target.value) : null)
                  }
                  className="text-xs font-bold bg-warning-subtle text-warning-text border border-warning rounded-sm px-2 py-1 outline-none cursor-pointer hover:bg-warning-subtle transition-colors"
                  title={t.court_choose_court}
                >
                  <option value="">{t.tournament_view_court_question}</option>
                  {(() => {
                    const matchHasConflict = conflictedMatches?.has(match.id) ?? false;
                    return Array.from({ length: courts }, (_, i) => i + 1).map((c) => {
                      const busy = occupiedCourts.has(c) && match.court !== c;
                      const blocked = matchHasConflict && match.court !== c;
                      return (
                        <option key={c} value={c} disabled={busy || blocked}>
                          {t.common_field} {c}
                          {busy ? ` (${t.common_occupied})` : blocked ? ` (${t.match_player_busy_short})` : ""}
                        </option>
                      );
                    });
                  })()}
                </select>
              ) : match.court ? (
                <span className="text-xs font-bold bg-warning-subtle text-warning-text border border-warning px-2.5 py-1 rounded-sm">
                  {t.common_field} {match.court}
                </span>
              ) : null}
              {match.court && (
                <CourtTimer
                  assignedAt={match.court_assigned_at}
                  completed={match.status === "completed"}
                />
              )}
            </>
          )}
          <div>
            <span
              className={`font-semibold ${
                match.winner_team === 1 ? "text-emerald-600" : theme.textPrimary
              }`}
            >
              {renderTeam(match.team1_p1, match.team1_p2)}
            </span>
            <span className="text-gray-300 mx-3 font-light">{t.common_vs}</span>
            <span
              className={`font-semibold ${
                match.winner_team === 2 ? "text-emerald-600" : theme.textPrimary
              }`}
            >
              {renderTeam(match.team2_p1, match.team2_p2)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(team1SetsWon > 0 || team2SetsWon > 0) && (
            <span className={`text-sm font-bold font-mono ${theme.cardBg} ${theme.textPrimary} border ${theme.cardBorder} px-2.5 py-1 rounded-sm`}>
              {team1SetsWon}:{team2SetsWon}
            </span>
          )}
          {match.status === "completed" && (
            <span className={`text-xs font-medium ${theme.activeBadgeBg} ${theme.activeBadgeText} px-2.5 py-1 rounded-full`}>
              {t.tournament_view_match_completed}
            </span>
          )}
          {isActive && match.status === "completed" && (
            <button
              onClick={() => onReset(match.id)}
              className="text-xs text-warning-text hover:text-warning-text font-medium transition-colors"
              title={t.tournament_view_edit_results}
            >
              {t.tournament_view_edit_results}
            </button>
          )}
          {/* Announce to TV */}
          {isActive && match.court && match.status !== "completed" && onAnnounce && (
            <button
              onClick={() => onAnnounce(match.court!, team1Label, team2Label)}
              className="text-xs text-muted hover:text-warning-text font-medium transition-colors"
              title={t.tournament_view_announce_title}
            >
              <span aria-hidden="true"><Icon name="megaphone" /></span>
            </button>
          )}
        </div>
      </div>

      {/* Not started hint */}
      {notStarted && (
        <div className="text-xs text-warning-text bg-warning-subtle border border-warning rounded-sm px-3 py-1.5 mb-3 inline-block">
          <Icon name="hourglass" /> {t.tournament_view_assign_court_first}
        </div>
      )}

      {/* Sets */}
      <div className="flex gap-5">
        {Array.from({ length: maxSets }, (_, i) => i + 1).map((setNum) => {
          const setData = sets.find((s) => s.set_number === setNum);
          const score1 = setData?.team1_score ?? 0;
          const score2 = setData?.team2_score ?? 0;

          const validation =
            score1 > 0 || score2 > 0
              ? isScoreValid(score1, score2, pointsPerSet, cap)
              : { valid: true };

          const complete = setData
            ? isSetComplete(setData, pointsPerSet, cap)
            : false;

          const handleScoreKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, setNum: number, team: 1 | 2) => {
            const isEnter = e.key === "Enter";
            const isTab = e.key === "Tab" && !e.shiftKey;
            if (!isEnter && !isTab) return;

            e.preventDefault();
            const target = e.target as HTMLInputElement;

            // Find next input: team1→team2 same set, team2→team1 next set.
            // Falls through to first input of next MatchCard when no more
            // sets are available in this card.
            const goNext = () => {
              const card = target.closest("[data-match-id]");
              if (!card) return;
              let nextTeam: 1 | 2;
              let nextSet: number;
              if (team === 1) {
                nextTeam = 2; nextSet = setNum;
              } else {
                nextTeam = 1; nextSet = setNum + 1;
              }
              const next = card.querySelector(`[data-score="${nextSet}-${nextTeam}"]`) as HTMLInputElement | null;
              if (next && !next.disabled) {
                setTimeout(() => { next.focus(); next.select(); }, 50);
              } else {
                const allCards = document.querySelectorAll("[data-match-id]");
                const cardArr = Array.from(allCards);
                const idx = cardArr.indexOf(card);
                if (idx >= 0 && idx < cardArr.length - 1) {
                  const nextCard = cardArr[idx + 1];
                  const firstInput = nextCard.querySelector('input[type="number"]:not(:disabled)') as HTMLInputElement | null;
                  if (firstInput) setTimeout(() => { firstInput.focus(); firstInput.select(); }, 50);
                }
              }
            };

            if (isEnter) {
              // Enter = explicit "confirm". Run Auto-Fill + Winner-Detection
              // BEFORE the focus moves. The subsequent native blur (via
              // goNext) triggers handleScoreBlur in the parent, which
              // does Auto-Fill (idempotent) + loadAll for state refresh.
              void onScoreCommit(match.id, setNum, team).then(() => {
                target.blur();
                goNext();
              });
            } else {
              // Tab = navigate without confirm. Manual blur (→ Auto-Fill
              // via handleScoreBlur, NO winner detection) then goNext.
              target.blur();
              goNext();
            }
          };

          return (
            <div key={setNum} className="text-center">
              <div className="text-2xs font-medium text-muted mb-1.5 uppercase tracking-wide">
                {t.common_set} {setNum}
                {complete && (
                  <span className="text-emerald-500 ml-1"><Icon name="check" /></span>
                )}
              </div>
              <div className="flex gap-1.5 items-center">
                <input
                  type="number"
                  min={0}
                  max={maxScore}
                  data-score={`${setNum}-1`}
                  value={setData?.team1_score ?? ""}
                  onChange={(e) =>
                    onScoreChange(
                      match.id,
                      setNum,
                      1,
                      Number(e.target.value) || 0,
                    )
                  }
                  onBlur={(e) => { releaseFocusedRef(e); onScoreBlur(match.id, setNum, 1); }}
                  onFocus={handleScoreFocus}
                  onKeyDown={(e) => handleScoreKeyDown(e, setNum, 1)}
                  disabled={inputsDisabled}
                  aria-label={fill(t.score_input_label, { set: setNum, team: team1Label })}
                  aria-invalid={!validation.valid}
                  className={`w-14 h-10 border-2 rounded-md text-center text-base font-mono font-bold ${theme.inputBg} ${theme.inputText} disabled:opacity-60 outline-none transition-all ${
                    !validation.valid
                      ? "border-danger bg-danger-subtle text-danger-text"
                      : complete && score1 > score2
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : `${theme.inputBorder} ${theme.focusBorder} focus:ring-2 ${theme.focusRing}`
                  }`}
                />
                <span className="font-bold text-muted" aria-hidden="true">:</span>
                <input
                  type="number"
                  min={0}
                  max={maxScore}
                  data-score={`${setNum}-2`}
                  value={setData?.team2_score ?? ""}
                  onChange={(e) =>
                    onScoreChange(
                      match.id,
                      setNum,
                      2,
                      Number(e.target.value) || 0,
                    )
                  }
                  onBlur={(e) => { releaseFocusedRef(e); onScoreBlur(match.id, setNum, 2); }}
                  onFocus={handleScoreFocus}
                  onKeyDown={(e) => handleScoreKeyDown(e, setNum, 2)}
                  disabled={inputsDisabled}
                  aria-label={fill(t.score_input_label, { set: setNum, team: team2Label })}
                  aria-invalid={!validation.valid}
                  className={`w-14 h-10 border-2 rounded-md text-center text-base font-mono font-bold ${theme.inputBg} ${theme.inputText} disabled:opacity-60 outline-none transition-all ${
                    !validation.valid
                      ? "border-danger bg-danger-subtle text-danger-text"
                      : complete && score2 > score1
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : `${theme.inputBorder} ${theme.focusBorder} focus:ring-2 ${theme.focusRing}`
                  }`}
                />
              </div>
              {!validation.valid && (
                <div className="text-2xs text-danger-text mt-1 max-w-[130px]">
                  {validation.error && fill(t[validation.error], validation.params)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
