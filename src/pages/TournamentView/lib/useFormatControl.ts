// src/pages/TournamentView/lib/useFormatControl.ts
//
// Starting a tournament and drawing the next round.
//
// The engine for the format decides what the next round looks like (see
// lib/formats/). This is the part around it: gathering the state the
// engine reads, writing back what it returns — rounds, matches, byes, the
// per-format state that lives outside the match tables — and the two ways
// in, which are the attendance check before the draw and the advance
// button afterwards (REVIEW-BACKLOG.md D1, D2).

import { useCallback, useRef } from "react";
import {
  createSchedule,
  getTournamentPlayers,
  markGrandFinalRounds,
  removePlayerFromTournament,
  setKingOfCourtQueue,
} from "../../../lib/db";
import { engineFor } from "../../../lib/formats";
import { couldDrawDiffer } from "../../../lib/formats/planIdentity";
import { useT } from "../../../lib/I18nContext";
import { useToast } from "../../../lib/ToastContext";
import type { FormatContext, FormatPlan } from "../../../lib/formats";
import type { TournamentDialogs } from "./useTournamentDialogs";
import type { GameSet, Match, Player, Round, Tournament } from "../../../lib/types";

interface Args {
  tournamentId: number;
  tournament: Tournament | null;
  players: Player[];
  setPlayers: (players: Player[]) => void;
  rounds: Round[];
  matchesByRound: Map<number, Match[]>;
  setsByMatch: Map<number, GameSet[]>;
  allMatches: Match[];
  retiredPlayerIds: Set<number>;
  seedOrder: number[];
  navTeams: [number, number][] | undefined;
  kotcQueue: number[];
  setKotcQueue: (queue: number[]) => void;
  grandFinalRoundIds: Set<number>;
  setGrandFinalRoundIds: (ids: Set<number>) => void;
  setActiveRound: (id: number | null) => void;
  dialogs: TournamentDialogs;
  playerName: (id: number | null) => string;
  allRoundMatchesCompleted: (roundId: number) => boolean;
  loadAll: () => void | Promise<void>;
}

export function useFormatControl({
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
}: Args) {
  const { t } = useT();
  const { showError, showInfo } = useToast();
  const { setShowAttendance } = dialogs;

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

  /** The plan the preview is showing, plus how to build another one. */
  const pendingPlan = useRef<{
    plan: FormatPlan;
    make: () => FormatPlan | null;
    playersOverride?: Player[];
  } | null>(null);

  /**
   * Builds a plan and offers it for inspection instead of writing it.
   *
   * The plan is built twice: if both come out the same, drawing again
   * cannot change anything and the preview says so rather than showing a
   * button that does nothing (FEATURE-BACKLOG.md C4).
   */
  const previewPlan = (
    make: () => FormatPlan | null,
    isStart: boolean,
    playersOverride?: Player[],
  ): boolean => {
    const plan = make();
    if (!plan) return false;
    const second = make();
    dialogs.setDrawPreview({
      rounds: plan.rounds,
      byePlayers: plan.byePlayers ?? [],
      canRedraw: second !== null && couldDrawDiffer(plan, second),
      isStart,
    });
    pendingPlan.current = { plan, make, playersOverride };
    return true;
  };

  const handleStartTournament = (playersOverride?: Player[]) => {
    const ctx = buildFormatContext(playersOverride);
    if (!ctx) return;

    const ok = previewPlan(
      () => {
        const fresh = buildFormatContext(playersOverride);
        return fresh ? engineFor(fresh.tournament.format).start(fresh) : null;
      },
      true,
      playersOverride,
    );
    if (!ok) showError(t.tournament_view_start_failed);
  };

  /** Draws again from the same state; the preview replaces itself. */
  const redrawPreview = () => {
    const pending = pendingPlan.current;
    if (!pending) return;
    previewPlan(pending.make, dialogs.drawPreview?.isStart ?? true, pending.playersOverride);
  };

  /** Writes the plan the preview is showing. */
  const confirmPreview = async () => {
    const pending = pendingPlan.current;
    if (!pending) return;
    dialogs.setDrawPreview(null);
    pendingPlan.current = null;
    await applyFormatPlan(pending.plan);
  };

  const cancelPreview = () => {
    dialogs.setDrawPreview(null);
    pendingPlan.current = null;
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
    handleStartTournament(fresh);
  };

  /** Draws whatever the format has queued up next. */
  /** Opens the TV display in its own window (Tauri) or tab (browser). */
  const advanceFormat = () => {
    const ctx = buildFormatContext();
    if (!ctx) return;

    // Keep the current tab when the previous round is still running, so
    // ongoing matches stay visible on an early draw.
    const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
    const wasComplete = lastRound ? allRoundMatchesCompleted(lastRound.id) : true;

    // A follow-up round gets the same preview. For a knockout it is a
    // confirmation -- the winners decide the pairings -- but Swiss, Monrad
    // and random doubles draw afresh every round, and those are exactly
    // the ones worth checking before they stand.
    previewPlan(() => {
      const fresh = buildFormatContext();
      if (!fresh) return null;
      const plan = engineFor(fresh.tournament.format).advance(fresh);
      if (!plan) return null;
      return { ...plan, activateLastRound: plan.activateLastRound ?? wasComplete };
    }, false);
  };
  return {
    buildFormatContext,
    applyFormatPlan,
    handleStartTournament,
    handleAttendanceConfirm,
    advanceFormat,
    confirmPreview,
    redrawPreview,
    cancelPreview,
  };
}
