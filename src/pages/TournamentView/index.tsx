import React, { useEffect, useState, useCallback, useMemo } from "react";
import Icon, { type IconName } from "../../components/ui/Icon";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import NextStepBar from "../../components/tournament/NextStepBar";
import { LoadingState, NotFoundState } from "../../components/ui/States";
import { useTheme } from "../../lib/ThemeContext";
import {
  getTournamentPlayers,
  updateTournamentStatus,
  removePlayerFromTournament,
  isTauri,
  createSchedule,
  setKingOfCourtQueue,
  deleteRoundsAtomically,
} from "../../lib/db";
import type {
  Player,
  Match,
  GameSet,
} from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";
import { useToast } from "../../lib/ToastContext";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { getEffectiveScoring } from "./lib/effectiveScoring";
import { getUndoTarget } from "./lib/undoTarget";
import { engineFor } from "../../lib/formats";
import type { FormatContext, FormatPlan } from "../../lib/formats";
import { markGrandFinalRounds } from "../../lib/db";
import {
  matchesToCsv,
  standingsToCsv,
  paymentsToCsv,
  toJsonExport,
  exportFileName,
} from "../../lib/resultExport";
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
import { useTournamentDialogs } from "./lib/useTournamentDialogs";
import {
  useTournamentData,
} from "./lib/useTournamentData";


export default function TournamentView() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showSuccess, showError, showInfo } = useToast();
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
    setShowAttendance,
    setShowReopenConfirm,
    setShowUndoRound,
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
  }, [navTeamsFromState, tournament?.team_config]);
  const [collapsedClubs, setCollapsedClubs] = useState<Set<string>>(new Set());
  const [viewTab, setViewTab] = useState<"spiele" | "gruppen" | "bracket" | "rangliste" | "verwaltung">("spiele");
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<number>>(new Set());
  const [editingMatchIds, setEditingMatchIds] = useState<Set<number>>(new Set());
  // Hard player-overlap block: opens when the user tries to assign a match
  // whose players are still on another court. No bypass — only "close".
  const recentlyCompletedRef = React.useRef(recentlyCompleted)
  recentlyCompletedRef.current = recentlyCompleted;
  const activeRoundRef = React.useRef(activeRound);
  activeRoundRef.current = activeRound;


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
  const buildFormatContext = useCallback(
    (playersOverride?: Player[]): FormatContext | null => {
      if (!tournament) return null;
      const active = (playersOverride ?? players).filter((p) => !retiredPlayerIds.has(p.id));
      return {
        tournament,
        players: active,
        rounds,
        matchesByRound,
        setsByMatch,
        allMatches,
        seedOrder,
        teams: navTeams ?? [],
        // One court: assign it right away, no drag and drop needed.
        courtForNewMatch: (tournament.courts || 1) === 1 ? 1 : null,
        formatState: { kotcQueue, grandFinalRoundIds: [...grandFinalRoundIds] },
      };
    },
    [tournament, players, retiredPlayerIds, rounds, matchesByRound, setsByMatch, allMatches, seedOrder, navTeams, kotcQueue, grandFinalRoundIds],
  );

  /**
   * Writes a plan: schedule, status and phase in one transaction, then the
   * per-format state, then a reload. Shared by "start" and "next round".
   */
  const applyFormatPlan = async (plan: FormatPlan): Promise<boolean> => {
    if (plan.rounds.length === 0) return false;

    let createdIds: number[];
    try {
      createdIds = await createSchedule(tournamentId, plan.rounds, {
        ...(plan.status !== undefined ? { status: plan.status } : {}),
        ...(plan.phase !== undefined ? { phase: plan.phase } : {}),
      });
    } catch (err) {
      console.error("applyFormatPlan: schedule creation failed:", err);
      showError(t.tournament_view_start_failed);
      return false;
    }

    // Grand finals are stored as winners rounds; remember which ones.
    const grandFinals = plan.rounds
      .map((spec, index) => (spec.isGrandFinal ? createdIds[index] : null))
      .filter((id): id is number => id !== null);
    if (grandFinals.length > 0) {
      const merged = [...grandFinalRoundIds, ...grandFinals];
      await markGrandFinalRounds(tournamentId, merged);
      setGrandFinalRoundIds(new Set(merged));
    }

    if (plan.stateUpdates?.kotcQueue) {
      await setKingOfCourtQueue(tournamentId, plan.stateUpdates.kotcQueue);
      setKotcQueue(plan.stateUpdates.kotcQueue);
    }

    if (plan.byePlayers && plan.byePlayers.length > 0) {
      showInfo(
        t.tournament_view_round_byes.replace(
          "{players}",
          plan.byePlayers.map((pid) => playerName(pid)).join(", "),
        ),
      );
    }

    if (plan.activateLastRound && createdIds.length > 0) {
      setActiveRound(createdIds[createdIds.length - 1]);
    }

    loadAll();
    return true;
  };

  const handleStartTournament = async (playersOverride?: Player[]) => {
    const ctx = buildFormatContext(playersOverride);
    if (!ctx) return;

    const plan = engineFor(ctx.tournament.format).start(ctx);
    if (!plan) {
      showError(t.tournament_view_start_failed);
      return;
    }
    await applyFormatPlan(plan);
  };

  /**
   * Absent players are removed before the draw, so the bracket is built
   * from who is actually there.
   */
  const handleAttendanceConfirm = async (presentIds: Set<number>) => {
    setShowAttendance(false);
    const absent = players.filter((p) => !presentIds.has(p.id)).map((p) => p.id);
    for (const id of absent) {
      await removePlayerFromTournament(tournamentId, id);
    }
    const fresh = await getTournamentPlayers(tournamentId);
    setPlayers(fresh);
    await handleStartTournament(fresh);
  };

  /** Draws whatever the format has queued up next. */
  /** Opens the TV display in its own window (Tauri) or tab (browser). */
  const openTvWindow = async () => {
    if (isTauri()) {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const tvWin = new WebviewWindow(`tv-${tournamentId}`, {
          url: `/tv/${tournamentId}`,
          title: `${t.tournament_view_tv_mode}: ${tournament?.name ?? ""}`,
          width: 1920,
          height: 1080,
          fullscreen: false,
          maximized: true,
          decorations: true,
          dragDropEnabled: false,
        });
        tvWin.once("tauri://error", (e) => {
          console.error("TV window error:", e);
        });
      } catch (err) {
        console.error("Failed to open TV window:", err);
      }
    } else {
      const url = `${window.location.origin}/tv/${tournamentId}`;
      window.open(url, `tv-${tournamentId}`, "width=1920,height=1080,menubar=no,toolbar=no");
    }
  };

  const advanceFormat = async () => {
    const ctx = buildFormatContext();
    if (!ctx) return;

    const plan = engineFor(ctx.tournament.format).advance(ctx);
    if (!plan) return;

    // Keep the current tab when the previous round is still running, so
    // ongoing matches stay visible on an early draw.
    const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
    const wasComplete = lastRound ? allRoundMatchesCompleted(lastRound.id) : true;
    await applyFormatPlan({ ...plan, activateLastRound: plan.activateLastRound ?? wasComplete });
  };

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


  const handleCompleteTournament = async () => {
    await updateTournamentStatus(tournamentId, "completed");
    loadAll();
  };

  const handleReopenTournament = async () => {
    await updateTournamentStatus(tournamentId, "active");
    setShowReopenConfirm(false);
    loadAll();
  };


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


  /**
   * Memoized "what does the next undo step delete?" computation. Returns
   * null when there's nothing to undo. The result is used both to disable
   * the Undo button (no target → no click) and to drive the rich confirm
   * modal (preview of what will be lost).
   *
   * Strategy:
   *   1. Pick the round with the largest id — that's the most-recently
   *      created one in DB-insertion order.
   *   2. Bronze + Final pairing: when the head is a `third_place` round,
   *      look for the Final/winners round with the same `round_number`
   *      and bundle them. Same the other way around. Both get deleted in
   *      one logical undo step.
   *   3. Aggregate stats over the involved rounds so the modal can show
   *      what data the user is about to lose.
   *   4. Predict the post-undo phase transition (full reset / back-to-
   *      group / no change) — see decision matrix in plan.
   */
  const undoTarget = useMemo(
    () => getUndoTarget(tournament, rounds, matchesByRound, setsByMatch, t),
    [tournament, rounds, matchesByRound, setsByMatch, t],
  );

  /**
   * Execute the undo step previewed by the modal. Idempotent against
   * stale clicks (re-reads `undoTarget` at call time; if it's null,
   * silently no-ops). Cleanup order: delete rounds first (FK cascades to
   * matches/sets), then apply phase transition, then reload + toast.
   */
  const performUndo = async () => {
    const target = undoTarget;
    if (!target) {
      setShowUndoRound(false);
      return;
    }

    // Deletes and the follow-up state change go together: a half-applied
    // undo would leave the tournament in a phase that no longer matches its
    // rounds (REVIEW-BACKLOG.md A6). Descending id keeps the order
    // predictable while the transaction runs.
    const roundIds = [...target.rounds].sort((a, b) => b.id - a.id).map((r) => r.id);
    try {
      await deleteRoundsAtomically(
        tournamentId,
        roundIds,
        target.resetStatusToDraft
          ? { status: "draft", phase: "ready" }
          : target.isGroupKoBackToGroup
            ? { phase: "group", clearKoScoring: true }
            : {},
      );
    } catch (err) {
      console.error("performUndo: failed:", err);
      showError(String(err));
      setShowUndoRound(false);
      return;
    }

    setShowUndoRound(false);
    showSuccess(
      t.tournament_view_undo_done
        .replace("{label}", target.label)
        .replace("{matches}", String(target.matchCount))
        .replace("{sets}", String(target.setCount)),
    );
    loadAll();
  };

  /**
   * Matches, sets and participants of one group — for the group tables in
   * the UI. The draw itself no longer needs this; the group_ko engine has
   * its own copy of the logic (REVIEW-BACKLOG.md D2).
   */
  const getGroupData = (groupNum: number) => {
    const gRounds = rounds.filter((r) => r.phase === "group" && r.group_number === groupNum);
    const gMatches: Match[] = [];
    const gSets = new Map<number, GameSet[]>();
    for (const r of gRounds) {
      const ms = matchesByRound.get(r.id) || [];
      gMatches.push(...ms);
      for (const m of ms) gSets.set(m.id, setsByMatch.get(m.id) || []);
    }
    const pIds = new Set<number>();
    for (const m of gMatches) {
      pIds.add(m.team1_p1); if (m.team1_p2) pIds.add(m.team1_p2);
      if (m.team2_p1) pIds.add(m.team2_p1); if (m.team2_p2) pIds.add(m.team2_p2);
    }
    return { gMatches, gSets, pIds };
  };

  const allRoundMatchesCompleted = (roundId: number): boolean => {
    const matches = matchesByRound.get(roundId) || [];
    return matches.length > 0 && matches.every((m) => m.status === "completed");
  };

  // What the court view works out from the match list (REVIEW-BACKLOG.md D1).
  const derived = useCourtDerivations({
    tournament,
    rounds,
    allMatches,
    matchesByRound,
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
  }, [sessionCtx.tournaments, tournament?.session_id, tournament?.id]);

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

  /**
   * Writes one of the export files. In the packaged app a native save
   * dialog picks the location; in the browser the file is downloaded
   * (REVIEW-BACKLOG.md C9).
   */
  const handleExport = async (kind: "matches" | "standings" | "payments" | "json") => {
    if (!tournament) return;

    const allSets: GameSet[] = [];
    for (const list of setsByMatch.values()) allSets.push(...list);

    const input = {
      tournament,
      players,
      rounds,
      matches: allMatches,
      sets: allSets,
      standings,
      paymentData,
      locale: undefined,
    };

    const isJson = kind === "json";
    const content = isJson
      ? toJsonExport(input)
      : kind === "matches"
        ? matchesToCsv(input)
        : kind === "standings"
          ? standingsToCsv(input)
          : paymentsToCsv(input);
    const fileName = exportFileName(tournament, kind, isJson ? "json" : "csv");

    try {
      if (isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await save({
          defaultPath: fileName,
          filters: [{ name: isJson ? "JSON" : "CSV", extensions: [isJson ? "json" : "csv"] }],
        });
        if (!path) return;
        // BOM so Excel opens the file as UTF-8 instead of mangling umlauts.
        await writeTextFile(path, isJson ? content : `\ufeff${content}`);
      } else {
        const blob = new Blob([isJson ? content : `\ufeff${content}`], {
          type: isJson ? "application/json" : "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      }
      showSuccess(t.export_done.replace("{file}", fileName));
    } catch (err) {
      showError(t.export_failed.replace("{error}", String(err)));
    }
  };

  const handleArchive = async () => {
    await updateTournamentStatus(tournamentId, "archived");
    loadAll();
  };


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
        getGroupData={getGroupData}
        playerName={playerName}
        onAddPlayer={handleAddPlayer}
        onRemovePlayer={handleRemovePlayer}
        onUnretire={handlePlayerUnretire}
      />
    </div>
  );
}
