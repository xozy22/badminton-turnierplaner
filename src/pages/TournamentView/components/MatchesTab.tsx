// src/pages/TournamentView/components/MatchesTab.tsx
//
// The screen a tournament director looks at all evening: the court grid,
// the queue of matches waiting for one, the score inputs, and the finished
// matches below.
//
// The match handlers and the derived court values arrive as two objects
// rather than fifteen loose props — the same move that made the header and
// the dialog block extractable (REVIEW-BACKLOG.md D1).

import Icon from "../../../components/ui/Icon";
import CourtOverview from "../../../components/courts/CourtOverview";
import MatchCard from "./MatchCard";
import CompletedMatchesSection from "./CompletedMatchesSection";
import GroupProgressBar from "../../../components/tournament/GroupProgressBar";
import { parseHallConfig } from "../../../lib/types";
import { useT } from "../../../lib/I18nContext";
import { useToast } from "../../../lib/ToastContext";
import { useTheme } from "../../../lib/ThemeContext";
import type { useMatchActions } from "../lib/useMatchActions";
import type { useCourtDerivations } from "../lib/useCourtDerivations";
import type { getEffectiveScoring } from "../lib/effectiveScoring";
import type { GameSet, Match, Round, Tournament } from "../../../lib/types";

interface Props {
  tournament: Tournament;
  rounds: Round[];
  allMatches: Match[];
  matchesByRound: Map<number, Match[]>;
  setsByMatch: Map<number, GameSet[]>;
  activeRound: number | null;
  setActiveRound: (id: number | null) => void;
  showAllGroups: boolean;
  setShowAllGroups: (show: boolean) => void;
  viewTab: string;
  editingMatchIds: Set<number>;
  recentlyCompleted: Set<number>;
  effectiveScoring: ReturnType<typeof getEffectiveScoring>;
  sessionVenueHalls: string | null;
  isGroupKo: boolean;
  isDoubleElimination: boolean;
  koRounds: Round[];
  groupRounds: Round[];
  winnersRounds: Round[];
  losersRounds: Round[];
  actions: ReturnType<typeof useMatchActions>;
  derived: ReturnType<typeof useCourtDerivations>;
  playerName: (id: number | null) => string;
}

export default function MatchesTab({
  tournament,
  rounds,
  allMatches,
  matchesByRound,
  setsByMatch,
  activeRound,
  setActiveRound,
  showAllGroups,
  setShowAllGroups,
  viewTab,
  editingMatchIds,
  recentlyCompleted,
  effectiveScoring,
  sessionVenueHalls,
  isGroupKo,
  isDoubleElimination,
  koRounds,
  groupRounds,
  winnersRounds,
  losersRounds,
  actions,
  derived,
  playerName,
}: Props) {
  const { t } = useT();
  const { theme } = useTheme();
  const { showSuccess } = useToast();

  /** True when every match of a round is decided. */
  const allRoundMatchesCompleted = (roundId: number): boolean => {
    const matches = matchesByRound.get(roundId) || [];
    return matches.length > 0 && matches.every((m) => m.status === "completed");
  };

  return (
    <>
  {/* Tab: Spiele */}
  {viewTab === "spiele" && (
    <div>
      {/* Per-group progress with embedded round-status pills.
          Visible whenever there are group rounds — during the
          active group phase (live) AND afterwards (history). */}
      {derived.groupProgress.length > 0 && (
        <GroupProgressBar progress={derived.groupProgress} />
      )}

      {rounds.length > 0 && (
        <div className="mb-4 space-y-2">
          {/* Per-group round status is now embedded inside the
              GroupProgressBar above (round pills next to the bar)
              — no separate read-only G1/G2/G3 rows here. */}
          {/* KO rounds */}
          {koRounds.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-bold text-phase-text uppercase tracking-wide w-8">KO</span>
              {koRounds.map((r) => {
                const colorClass = activeRound === r.id
                  ? "bg-phase text-white shadow-sm"
                  : `${theme.cardBg} text-phase-text hover:bg-phase/10 border border-phase/30 hover:border-phase`;
                return (
                  <button
                    key={r.id}
                    onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${colorClass}`}
                  >
                    R{koRounds.indexOf(r) + 1}
                    {allRoundMatchesCompleted(r.id) && <span className="ml-1.5"><Icon name="check" /></span>}
                  </button>
                );
              })}
            </div>
          )}
          {/* Double Elimination rounds (winners + losers) */}
          {isDoubleElimination && (
            <>
              {winnersRounds.length > 0 && (
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-xs font-bold text-success-text uppercase tracking-wide w-8">W</span>
                  {winnersRounds.map((r, idx) => {
                    const colorClass = activeRound === r.id
                      ? "bg-success text-success-fg shadow-sm"
                      : `${theme.cardBg} text-success-text hover:bg-success-subtle border border-success hover:border-success`;
                    return (
                      <button
                        key={r.id}
                        onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${colorClass}`}
                      >
                        R{idx + 1}
                        {allRoundMatchesCompleted(r.id) && <span className="ml-1.5"><Icon name="check" /></span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {losersRounds.length > 0 && (
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-xs font-bold text-danger-text uppercase tracking-wide w-8">L</span>
                  {losersRounds.map((r, idx) => {
                    const colorClass = activeRound === r.id
                      ? "bg-danger text-danger-fg shadow-sm"
                      : `${theme.cardBg} text-danger-text hover:bg-danger/10 border border-danger hover:border-danger`;
                    return (
                      <button
                        key={r.id}
                        onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${colorClass}`}
                      >
                        R{idx + 1}
                        {allRoundMatchesCompleted(r.id) && <span className="ml-1.5"><Icon name="check" /></span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {/* Normal rounds (non group_ko, non double_elimination).
              third_place rounds are excluded here and rendered as a
              dedicated bronze button below so they don't read as a
              generic "Runde N" alongside the Final. */}
          {!isGroupKo && !isDoubleElimination && (
            <div className="flex gap-2 flex-wrap">
          {rounds.filter((r) => r.phase !== "third_place").map((r) => {
            const label = t.tournament_view_round_label.replace("{n}", String(r.round_number));
            const colorClass = activeRound === r.id
              ? `${theme.roundActiveBg} ${theme.roundActiveText} shadow-sm`
              : `${theme.cardBg} ${theme.textSecondary} hover:opacity-80 border ${theme.cardBorder} ${theme.cardHoverBorder}`;

            return (
              <button
                key={r.id}
                onClick={() => { setActiveRound(r.id); setShowAllGroups(false); }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${colorClass}`}
              >
                  {label}
                  {allRoundMatchesCompleted(r.id) && (
                    <span className="ml-1.5"><Icon name="check" /></span>
                  )}
                </button>
            );
          })}
            </div>
          )}
          {/* Dedicated bronze playoff button (any KO format) */}
          {derived.thirdPlaceRound && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="w-8 text-[#a1642f]" aria-hidden="true">
                <Icon name="medal" size={14} />
              </span>
              <button
                onClick={() => { setActiveRound(derived.thirdPlaceRound!.id); setShowAllGroups(false); }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeRound === derived.thirdPlaceRound!.id
                    ? "bg-warning text-warning-fg shadow-sm"
                    : `${theme.cardBg} text-warning-text hover:bg-warning-subtle border border-warning hover:border-warning`
                }`}
              >
                {t.bracket_third_place_short}
                {allRoundMatchesCompleted(derived.thirdPlaceRound!.id) && (
                  <span className="ml-1.5"><Icon name="check" /></span>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Court Overview */}
      {rounds.length > 0 && (activeRound || showAllGroups) && tournament.status === "active" && (
        <CourtOverview
          courts={Math.max(tournament.courts || 1, 1)}
          matches={allMatches}
          // During an active group phase the unassigned-queue ALWAYS spans
          // every group's pending matches — even when the user has clicked
          // a single-round button — so the smart-queue can promote the
          // lagging group's matches above the others. Without this, the
          // queue would only ever show the round you're currently viewing
          // and the smart-sort would have nothing to reorder.
          activeRoundMatches={(derived.isGroupPhaseActive || showAllGroups)
            ? groupRounds.flatMap((r) => matchesByRound.get(r.id) || [])
            : activeRound ? matchesByRound.get(activeRound) : undefined}
          futureRoundQueues={derived.futureRoundQueues}
          playerName={playerName}
          hallConfig={
            // For sessioned tournaments at a venue, the venue's hall_config
            // is the canonical source of truth. The tournament's local
            // hall_config (which may be a stale copy) is bypassed so all
            // sibling tournaments share one consistent court grid.
            (tournament.session_id != null && sessionVenueHalls)
              ? parseHallConfig(sessionVenueHalls)
              : (tournament.hall_config ? parseHallConfig(tournament.hall_config) : undefined)
          }
          minRestMinutes={tournament.min_rest_minutes}
          tournamentStatus={tournament.status}
          conflictedMatches={derived.conflictedMatches}
          remainingByGroup={derived.remainingByGroup}
          roundToGroup={derived.roundToGroup}
          onDrop={(matchId, court) => actions.handleCourtChange(matchId, court)}
          onUnassign={(matchId) => {
            // Right-click → "Return match to queue". Same code path
            // as the MatchCard dropdown's empty option (court=null
            // → updateMatchCourt clears the field → loadAll).
            actions.handleCourtChange(matchId, null);
            showSuccess(t.court_context_menu_unassign_done);
          }}
          onMatchClick={(matchId) => {
            const match = allMatches.find((m) => m.id === matchId);
            if (!match) return;
            // When the next round has already been drawn, the target match
            // may live in a round tab that isn't currently rendered. Switch
            // to that tab first so the DOM node exists when we try to scroll.
            const renderedInCurrentTab = showAllGroups
              ? groupRounds.some((r) => r.id === match.round_id)
              : match.round_id === activeRound;
            if (!renderedInCurrentTab) {
              setActiveRound(match.round_id);
              setShowAllGroups(false);
            }
            const scrollAndFocus = () => {
              const el = document.querySelector(`[data-match-id="${matchId}"]`);
              if (!el) return;
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("ring-2", "ring-warning");
              setTimeout(() => el.classList.remove("ring-2", "ring-warning"), 2000);
              setTimeout(() => {
                const input = el.querySelector('input[type="number"]:not(:disabled)') as HTMLInputElement | null;
                if (input) input.focus();
              }, 400);
            };
            if (renderedInCurrentTab) {
              scrollAndFocus();
            } else {
              // Defer until React has committed the round switch and the
              // MatchCard for this id is mounted.
              setTimeout(scrollAndFocus, 100);
            }
          }}
        />
      )}

      {rounds.length > 0 && (
        <div>
          {/* Matches - sorted: on court → open → completed */}
          {(activeRound || showAllGroups) &&
            (() => {
              const raw = showAllGroups
                ? groupRounds.flatMap((r) => matchesByRound.get(r.id) || [])
                : matchesByRound.get(activeRound!) || [];
              // Recently completed matches stay in their original section for 3s
              const isRecent = (m: Match) => recentlyCompleted.has(m.id);
              const isEditing = (m: Match) => editingMatchIds.has(m.id);
              const onCourt = raw.filter((m) =>
                ((m.court && m.status !== "completed") || (isRecent(m) && m.court)) && !isEditing(m)
              );
              const completed = raw.filter((m) =>
                (m.status === "completed" && !isRecent(m)) || isEditing(m)
              );
              return (
                <>
                  {onCourt.length > 0 && (
                    <div className={`text-xs font-bold ${theme.textMuted} uppercase tracking-wider mb-2`}>
                      {t.tournament_view_on_court.replace("{count}", String(onCourt.length))}
                    </div>
                  )}
                  {onCourt.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      sets={setsByMatch.get(match.id) || []}
                      setsToWin={effectiveScoring.setsToWin}
                      pointsPerSet={effectiveScoring.pointsPerSet}
                      cap={effectiveScoring.cap}
                      courts={tournament.courts || 1}
                      occupiedCourts={derived.globalOccupiedCourts}
                      conflictedMatches={derived.conflictedMatches}
                      playerName={playerName}
                      onScoreChange={actions.handleScoreChange}
                      onScoreBlur={actions.handleScoreBlur}
                      onScoreCommit={actions.handleScoreCommit}
                      onCourtChange={actions.handleCourtChange}
                      onAnnounce={actions.handleAnnounce}
                      onReset={actions.handleReopenMatch}
                      isActive={tournament.status === "active"}
                      theme={theme}
                      allMatches={allMatches}
                      minRestMinutes={tournament.min_rest_minutes}
                    />
                  ))}

                  {completed.length > 0 && (
                    <CompletedMatchesSection
                      matches={completed}
                      setsByMatch={setsByMatch}
                      setsToWin={effectiveScoring.setsToWin}
                      pointsPerSet={effectiveScoring.pointsPerSet}
                      cap={effectiveScoring.cap}
                      courts={tournament.courts || 1}
                      occupiedCourts={derived.globalOccupiedCourts}
                      conflictedMatches={derived.conflictedMatches}
                      playerName={playerName}
                      onScoreChange={actions.handleScoreChange}
                      onScoreBlur={actions.handleScoreBlur}
                      onScoreCommit={actions.handleScoreCommit}
                      onCourtChange={actions.handleCourtChange}
                      onAnnounce={actions.handleAnnounce}
                      onReset={actions.handleReopenMatch}
                      isActive={tournament.status === "active"}
                      theme={theme}
                      hasOtherMatches={onCourt.length > 0}
                      editingMatchIds={editingMatchIds}
                      allMatches={allMatches}
                      minRestMinutes={tournament.min_rest_minutes}
                      roundToGroup={derived.roundToGroup}
                    />
                  )}
                </>
              );
            })()}
        </div>
      )}
    </div>
  )}

    </>
  );
}
