// src/pages/TournamentView/lib/useUndoRound.ts
//
// Taking back the last round.
//
// Two halves: working out what the next undo would delete — the round, how
// many matches and set scores go with it, whether any are still on a court
// — and doing it. The preview exists because the deletion is not
// recoverable, and a round with results in it is worth a second look
// (REVIEW-BACKLOG.md D1).

import { useMemo } from "react";
import { deleteRoundsAtomically } from "../../../lib/db";
import { getUndoTarget } from "./undoTarget";
import { useT } from "../../../lib/I18nContext";
import { useToast } from "../../../lib/ToastContext";
import type { TournamentDialogs } from "./useTournamentDialogs";
import type { GameSet, Match, Round, Tournament } from "../../../lib/types";

interface Args {
  tournamentId: number;
  tournament: Tournament | null;
  rounds: Round[];
  matchesByRound: Map<number, Match[]>;
  setsByMatch: Map<number, GameSet[]>;
  dialogs: TournamentDialogs;
  loadAll: () => void | Promise<void>;
}

export function useUndoRound({
  tournamentId,
  tournament,
  rounds,
  matchesByRound,
  setsByMatch,
  dialogs,
  loadAll,
}: Args) {
  const { t } = useT();
  const { showSuccess, showError } = useToast();
  const { setShowUndoRound } = dialogs;

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
  return { undoTarget, performUndo };
}
