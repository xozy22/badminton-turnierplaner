import React, { useEffect, useState, useMemo } from "react";
import Icon, { type IconName } from "../../components/ui/Icon";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import NextStepBar from "../../components/tournament/NextStepBar";
import { LoadingState, NotFoundState } from "../../components/ui/States";
import { useTheme } from "../../lib/ThemeContext";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import { useToast } from "../../lib/ToastContext";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { getEffectiveScoring } from "./lib/effectiveScoring";
import { engineFor } from "../../lib/formats";
import { useSessionContext } from "../../lib/sessionContext";
import SessionBar from "./components/SessionBar";
import TournamentHeader from "./components/TournamentHeader";
import MatchesTab from "./components/MatchesTab";
import DraftPanel from "./components/DraftPanel";
import SecondaryTabs from "./components/SecondaryTabs";
import TournamentModals from "./components/TournamentModals";
import { useLiveControls } from "./lib/useLiveControls";
import { useMatchActions } from "./lib/useMatchActions";
import { useRosterActions } from "./lib/useRosterActions";
import { useCourtDerivations } from "./lib/useCourtDerivations";
import { useFormatControl } from "./lib/useFormatControl";
import { useTournamentActions } from "./lib/useTournamentActions";
import { useUndoRound } from "./lib/useUndoRound";
import { useTournamentDialogs } from "./lib/useTournamentDialogs";
import {
  useTournamentData,
} from "./lib/useTournamentData";


export default function TournamentView() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showSuccess } = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // What the wizard may hand over when navigating here. Seeds are only a
  // fallback these days — the draw reads them from the database (A4).
  const navState = (location.state ?? null) as {
    seeds?: number[];
    teams?: [number, number][];
    savedSuccess?: boolean;
  } | null;
  const navSeeds = navState?.seeds;
  const navTeamsFromState = navState?.teams;
  const navSavedSuccess = !!navState?.savedSuccess;
  const tournamentId = Number(id);

  // Everything the view loads, in one hook (REVIEW-BACKLOG.md D1).
  const {
    tournament,
    loadFailed,
    players,
    setPlayers,
    allPlayers,
    rounds,
    matchesByRound,
    setsByMatch,
    setSetsByMatch,
    standings,
    allMatches,
    retiredPlayerIds,
    paymentData,
    setPaymentData,
    activeRound,
    setActiveRound,
    showAllGroups,
    setShowAllGroups,
    sessionMeta,
    grandFinalRoundIds,
    setGrandFinalRoundIds,
    kotcQueue,
    setKotcQueue,
    sessionVenueHalls,
    loadAll,
    refreshScores,
  } = useTournamentData(tournamentId);

  // Which dialog is open (REVIEW-BACKLOG.md D1).
  const dialogs = useTournamentDialogs();
  const {
    showAddPlayer,
    setShowAddPlayer,
    setRetireTarget,
  } = dialogs;

  // The shared confirm dialog, used by the hooks below.
  const [confirmDialog, askConfirm] = useConfirm();
  useDocumentTitle(tournament?.name ?? t.nav_tournaments);
  const navTeams = useMemo(() => {
    if (navTeamsFromState && navTeamsFromState.length > 0) return navTeamsFromState;
    if (tournament?.team_config) {
      try { return JSON.parse(tournament.team_config) as [number, number][]; } catch (err) { console.error("TournamentView: failed to parse team_config JSON:", err); }
    }
    return undefined;
  }, [navTeamsFromState, tournament]);
  const [collapsedClubs, setCollapsedClubs] = useState<Set<string>>(new Set());
  const [viewTab, setViewTab] = useState<"spiele" | "gruppen" | "bracket" | "rangliste" | "verwaltung">("spiele");
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<number>>(new Set());
  const [editingMatchIds, setEditingMatchIds] = useState<Set<number>>(new Set());


  // ---- Multi-tournament-workspace integration ----
  // When tournament.session_id is set, we participate in a session with
  // shared court pool + cross-tournament conflict detection. The hook
  // returns EMPTY for null session_id, so we can wire it unconditionally.
  const sessionCtx = useSessionContext(tournament?.session_id ?? null);

  // Phase-aware scoring: derive effective scoring based on the active round's phase
  const activeRoundPhase = rounds.find((r) => r.id === activeRound)?.phase ?? null;
  const effectiveScoring = tournament
    ? getEffectiveScoring(tournament, activeRoundPhase)
    : { pointsPerSet: 21, setsToWin: 2, cap: 30 };


  // Show save-success toast when arriving from edit wizard; clear nav state so refresh doesn't re-trigger.
  const savedSuccessShownRef = React.useRef(false);
  useEffect(() => {
    if (!navSavedSuccess || savedSuccessShownRef.current) return;
    savedSuccessShownRef.current = true;
    window.history.replaceState({}, document.title);
    showSuccess(t.edit_tournament_saved);
  }, [navSavedSuccess, showSuccess, t.edit_tournament_saved]);

  const playerName = (playerId: number | null): string => {
    if (playerId === null || playerId === undefined) return "-";
    const p = players.find((p) => p.id === playerId);
    return p ? playerDisplayName(p) : "?";
  };

  /**
   * Seed order for draws, taken from the persisted `seed_rank` column.
   *
   * The wizard writes seeds via setTournamentSeeds, so they survive a
   * reload, a restart, or starting the tournament days later. The router
   * state (`navSeeds`) used to be the only source, which silently dropped
   * the seeding whenever the tournament was not started straight out of
   * the wizard (REVIEW-BACKLOG.md A4) — it now only fills in before the
   * first load of `paymentData` has arrived.
   */
  const seedOrder = useMemo(() => {
    const persisted = paymentData
      .filter((pd) => pd.seed_rank != null && pd.seed_rank > 0)
      .sort((a, b) => (a.seed_rank ?? 0) - (b.seed_rank ?? 0))
      .map((pd) => pd.player.id);
    return persisted.length > 0 ? persisted : navSeeds ?? [];
  }, [paymentData, navSeeds]);

  /**
   * Everything the format engines need to decide what comes next. Built
   * fresh on every render from the loaded state — cheap, and it keeps the
   * engines free of React and database concerns (REVIEW-BACKLOG.md D2).
   */
  const allRoundMatchesCompleted = (roundId: number): boolean => {
    const matches = matchesByRound.get(roundId) || [];
    return matches.length > 0 && matches.every((m) => m.status === "completed");
  };

  // Starting the tournament and drawing the next round
  // (REVIEW-BACKLOG.md D1).
  const {
    buildFormatContext,
    handleAttendanceConfirm,
    advanceFormat,
  } = useFormatControl({
    tournamentId,
    tournament,
    players,
    setPlayers,
    rounds,
    matchesByRound,
    setsByMatch,
    allMatches,
    retiredPlayerIds,
    seedOrder,
    navTeams,
    kotcQueue,
    setKotcQueue,
    grandFinalRoundIds,
    setGrandFinalRoundIds,
    setActiveRound,
    dialogs,
    playerName,
    allRoundMatchesCompleted,
    loadAll,
  });



  // onChange: Nur den eingegebenen Wert speichern, KEIN Auto-Fill
  // Who is in the tournament, and who dropped out (REVIEW-BACKLOG.md D1).
  const {
    handleAddPlayer,
    handleRemovePlayer,
    confirmRemovePlayer,
    handlePlayerRetire,
    handlePlayerUnretire,
  } = useRosterActions({
    tournamentId,
    tournament,
    players,
    matchesByRound,
    navTeams,
    dialogs,
    askConfirm,
    loadAll,
  });





  // Live publishing: opt-in, pause, push now, stop (REVIEW-BACKLOG.md D1).
  const {
    liveActive,
    livePaused,
    liveBusy,
    liveStatusNow,
    livePushStatus,
    handleEnableLive,
    handleTogglePause,
    handlePushNow,
    handleUnpublish,
  } = useLiveControls({ tournamentId, askConfirm });


  // Taking back the last round (REVIEW-BACKLOG.md D1).
  const { undoTarget, performUndo } = useUndoRound({
    tournamentId,
    tournament,
    rounds,
    matchesByRound,
    setsByMatch,
    dialogs,
    loadAll,
  });

  // Complete, reopen, archive, export, TV display.
  const {
    openTvWindow,
    handleCompleteTournament,
    handleReopenTournament,
    handleExport,
    handleArchive,
  } = useTournamentActions({
    tournamentId,
    tournament,
    players,
    rounds,
    allMatches,
    setsByMatch,
    standings,
    paymentData,
    dialogs,
    loadAll,
  });


  /**
   * Matches, sets and participants of one group — for the group tables in
   * the UI. The draw itself no longer needs this; the group_ko engine has
   * its own copy of the logic (REVIEW-BACKLOG.md D2).
   */
  // What the court view works out from the match list (REVIEW-BACKLOG.md D1).
  const derived = useCourtDerivations({
    tournament,
    rounds,
    allMatches,
    matchesByRound,
    setsByMatch,
    paymentData,
    activeRound,
    showAllGroups,
    sessionCtx,
  });

  // Entering a score, assigning a court, reopening (REVIEW-BACKLOG.md D1).
  const matchActions = useMatchActions({
    tournamentId,
    tournament,
    allMatches,
    setsByMatch,
    setSetsByMatch,
    effectiveScoring,
    dialogs,
    editingMatchIds,
    setEditingMatchIds,
    setRecentlyCompleted,
    runningPlayerCourts: derived.runningPlayerCourts,
    // Courts held by sibling tournaments, so a drag onto one is refused
    // rather than producing two matches on the same court.
    occupiedCourts: sessionCtx.courtOccupancy,
    sessionMatches: sessionCtx.matches,
    playerName,
    refreshScores,
  });

  // One question, one answer — the engine decides whether anything can be
  // drawn right now. Nine per-format flags used to do this by hand.
  const formatContext = buildFormatContext();
  const engine = tournament ? engineFor(tournament.format) : null;
  const canAdvanceFormat = !!(engine && formatContext && engine.canAdvance(formatContext));
  const formatProgress =
    engine?.progress && formatContext ? engine.progress(formatContext) : null;

  // Group phase still needs its own button because starting the KO opens a
  // modal for the (optional) different KO scoring first.
  const isGroupKo = !!tournament && engineFor(tournament.format).display.hasGroupPhase;
  const koRounds = rounds.filter((r) => r.phase === "ko");
  const canStartKo = isGroupKo && canAdvanceFormat && koRounds.length === 0;
  const canAdvanceOther = canAdvanceFormat && !canStartKo;

  /**
   * Icon and text of the single advance button, per format.
   *
   * Kept apart rather than glued into one string: the text also feeds
   * NextStepBar, which is an aria-live region. While the emoji was part of
   * the string, a screen reader announced "Next step: repeat-arrow next
   * Swiss round".
   */
  const advanceButton: { icon: IconName; label: string } = (() => {
    switch (tournament?.format) {
      case "elimination":
      case "group_ko":
        return { icon: "arrowRight", label: t.tournament_view_next_ko_round };
      case "double_elimination":
        return { icon: "arrowRight", label: t.tournament_view_advance_bracket };
      case "swiss":
        return { icon: "refresh", label: t.tournament_view_next_swiss_round };
      case "monrad":
        return { icon: "refresh", label: t.tournament_view_next_monrad_round };
      case "king_of_court":
        return { icon: "target", label: t.tournament_view_next_kotc_match };
      case "waterfall":
        return { icon: "refresh", label: t.tournament_view_next_waterfall_round };
      default:
        return { icon: "dice", label: t.tournament_view_next_round };
    }
  })();
  const advanceButtonStyle = engine?.display.hasBracket
    ? "bg-phase hover:bg-phase"
    : "bg-warning hover:bg-warning";

  // These two stay as format checks on purpose: they choose between two
  // different bracket components (single vs. double elimination), which is
  // a real difference between two formats rather than a property both could
  // declare. `display.hasBracket` says a bracket exists; which one it is
  // remains the view's business.
  const isElimination = tournament?.format === "elimination";
  const isDoubleElimination = tournament?.format === "double_elimination";
  const winnersRounds = rounds.filter((r) => r.phase === "winners");
  const losersRounds = rounds.filter((r) => r.phase === "losers");
  const groupRounds = rounds.filter((r) => r.phase === "group");
  const koRoundsForBracket = isElimination
    ? rounds.filter((r) => r.phase !== "third_place")
    : koRounds;

  // Pruefe ob noch offene Spiele existieren (ueber alle Runden)
  const hasOpenMatches = (() => {
    for (const [, matches] of matchesByRound) {
      if (matches.some((m) => m.status !== "completed")) return true;
    }
    return false;
  })();

  // Session pill + switcher data — must be computed before any early
  // return so the hook count stays stable between the loading-state render
  // and the loaded render (otherwise: hooks-order violation → white screen).
  const sessionSiblings = useMemo(() => {
    if (!tournament?.session_id) return [];
    return sessionCtx.tournaments.filter((tt) => tt.id !== tournament.id);
  }, [sessionCtx.tournaments, tournament]);

  // A tournament that never arrives is not the same as one still loading:
  // the id may be stale, and the view used to say "loading" forever
  // (REVIEW-BACKLOG.md F7).
  if (!tournament) {
    return (
      <div className="p-6">
        {loadFailed ? (
          <NotFoundState
            title={t.tournament_not_found}
            backTo="/tournaments"
            backLabel={t.nav_tournaments}
          />
        ) : (
          <LoadingState rows={4} />
        )}
      </div>
    );
  }




  return (
    <div>
      <SessionBar
        tournament={tournament}
        sessionMeta={sessionMeta}
        sessionSiblings={sessionSiblings}
        sessionTournamentCount={sessionCtx.tournaments.length}
      />

      <TournamentHeader
        tournament={tournament}
        tournamentId={tournamentId}
        rounds={rounds}
        dialogs={dialogs}
        live={{
          liveActive,
          livePaused,
          liveBusy,
          liveStatusNow,
          livePushStatus,
          handleEnableLive,
          handleTogglePause,
          handlePushNow,
        }}
        engine={engine}
        formatProgress={formatProgress}
        advanceButton={advanceButton}
        advanceButtonStyle={advanceButtonStyle}
        canAdvanceOther={canAdvanceOther}
        canStartKo={canStartKo}
        isGroupKo={isGroupKo}
        isDoubleElimination={isDoubleElimination}
        hasOpenMatches={hasOpenMatches}
        undoTarget={undoTarget}
        onAdvanceFormat={advanceFormat}
        onCompleteTournament={handleCompleteTournament}
        onOpenTvWindow={openTvWindow}
        onArchive={handleArchive}
        onExport={handleExport}
        onNavigate={navigate}
      />

      <TournamentModals
        dialogs={dialogs}
        tournament={tournament}
        players={players}
        rounds={rounds}
        matchesByRound={matchesByRound}
        setsByMatch={setsByMatch}
        standings={standings}
        activeRound={activeRound}
        theme={theme}
        undoTarget={undoTarget}
        confirmDialog={confirmDialog}
        onAdvanceFormat={advanceFormat}
        onLoadAll={loadAll}
        onCourtChange={matchActions.handleCourtChange}
        onRemovePlayerConfirm={confirmRemovePlayer}
        onPlayerRetire={handlePlayerRetire}
        onAttendanceConfirm={handleAttendanceConfirm}
        onReopenTournament={handleReopenTournament}
        onUnpublish={handleUnpublish}
        onPerformUndo={performUndo}
        onNavigate={navigate}
      />

      <DraftPanel
        tournament={tournament}
        players={players}
        rounds={rounds}
      />

      {/* One sentence naming what to do next (REVIEW-BACKLOG.md F9). */}
      <NextStepBar
        status={tournament.status}
        roundCount={rounds.length}
        plannedRounds={tournament.planned_rounds}
        openMatches={allMatches.filter((m) => m.status !== "completed" && m.court !== null).length}
        matchesWithoutCourt={
          allMatches.filter((m) => m.status !== "completed" && m.court === null && m.team2_p1 !== null).length
        }
        freeCourts={Math.max(
          (tournament.courts || 1) -
            allMatches.filter((m) => m.status !== "completed" && m.court !== null).length,
          0,
        )}
        canAdvance={canAdvanceFormat}
        advanceLabel={advanceButton.label}
      />

      {/* A tab strip, declared as one: without the roles a screen reader
          announces five ordinary buttons and never says which view is
          showing (REVIEW-BACKLOG.md G1). */}
      {rounds.length > 0 && (
        <div
          role="tablist"
          aria-label={t.tournament_view_tab_matches}
          className={`flex border-b-2 ${theme.inputBorder} mb-5`}
        >
          {(() => {
            const hasBracket = koRoundsForBracket.length > 0 && (isElimination || (isGroupKo && tournament.current_phase === "ko"));
            const hasDoubleElimBracket = isDoubleElimination && (winnersRounds.length > 0 || losersRounds.length > 0);
            const showRangliste = !isGroupKo || koRounds.length > 0;
            const viewTabs = [
              { key: "spiele" as const, label: t.tournament_view_tab_matches, icon: "target" as const },
              ...(isGroupKo && groupRounds.length > 0 ? [{ key: "gruppen" as const, label: t.tournament_view_tab_groups, icon: "clipboard" as const }] : []),
              ...(hasBracket || hasDoubleElimBracket ? [{ key: "bracket" as const, label: t.tournament_view_tab_bracket, icon: "trophy" as const }] : []),
              ...(showRangliste ? [{ key: "rangliste" as const, label: t.tournament_view_tab_standings, icon: "chart" as const }] : []),
              { key: "verwaltung" as const, label: t.tournament_view_tab_management, icon: "users" as const },
            ];
            return viewTabs;
          })().map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={viewTab === tab.key}
              onClick={() => setViewTab(tab.key)}
              className={`px-6 py-3 text-sm font-semibold transition-all duration-200 relative rounded-t-lg ${
                viewTab === tab.key
                  ? `${theme.textPrimary}`
                  : `${theme.textMuted} hover:${theme.textPrimary} hover:bg-black/[0.03]`
              }`}
            >
              <Icon name={tab.icon} className="mr-1.5" />
              {tab.label}
              {viewTab === tab.key ? (
                <span className={`absolute bottom-0 left-0 right-0 h-[3px] ${theme.primaryBg} rounded-t-full`} />
              ) : (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-transparent group-hover:bg-line-strong rounded-t-full transition-all" />
              )}
            </button>
          ))}
        </div>
      )}

      <MatchesTab
        tournament={tournament}
        rounds={rounds}
        allMatches={allMatches}
        matchesByRound={matchesByRound}
        setsByMatch={setsByMatch}
        activeRound={activeRound}
        setActiveRound={setActiveRound}
        showAllGroups={showAllGroups}
        setShowAllGroups={setShowAllGroups}
        viewTab={viewTab}
        editingMatchIds={editingMatchIds}
        recentlyCompleted={recentlyCompleted}
        effectiveScoring={effectiveScoring}
        sessionVenueHalls={sessionVenueHalls}
        isGroupKo={isGroupKo}
        isDoubleElimination={isDoubleElimination}
        koRounds={koRounds}
        groupRounds={groupRounds}
        winnersRounds={winnersRounds}
        losersRounds={losersRounds}
        actions={matchActions}
        derived={derived}
        playerName={playerName}
      />

      <SecondaryTabs
        viewTab={viewTab}
        tournament={tournament}
        players={players}
        allPlayers={allPlayers}
        rounds={rounds}
        allMatches={allMatches}
        matchesByRound={matchesByRound}
        setsByMatch={setsByMatch}
        standings={standings}
        paymentData={paymentData}
        setPaymentData={setPaymentData}
        collapsedClubs={collapsedClubs}
        setCollapsedClubs={setCollapsedClubs}
        showAddPlayer={showAddPlayer}
        setShowAddPlayer={setShowAddPlayer}
        setRetireTarget={setRetireTarget}
        isGroupKo={isGroupKo}
        isElimination={isElimination}
        isDoubleElimination={isDoubleElimination}
        koRoundsForBracket={koRoundsForBracket}
        winnersRounds={winnersRounds}
        losersRounds={losersRounds}
        derived={derived}
        getGroupData={derived.getGroupData}
        playerName={playerName}
        onAddPlayer={handleAddPlayer}
        onRemovePlayer={handleRemovePlayer}
        onUnretire={handlePlayerUnretire}
      />
    </div>
  );
}
