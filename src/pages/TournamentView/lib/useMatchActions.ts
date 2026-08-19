// src/pages/TournamentView/lib/useMatchActions.ts
//
// Entering a score, assigning a court, reopening a finished match.
//
// The most-used code in the application — several times per match, all
// evening. It reads the scoring rules that apply to the active round and
// writes matches and sets, plus the two dialogs that can block an
// assignment: the rest-time warning (which offers a bypass) and the
// player-overlap block (which does not).
//
// Extracted from index.tsx, where it sat between the data layer and the
// markup (REVIEW-BACKLOG.md D1).

import {
  clearMatchCourt,
  reopenMatch,
  updateMatchCourt,
  updateMatchResult,
  upsertSet,
} from "../../../lib/db";
import {
  autoFillOpponentScore,
  determineMatchWinner,
  getMaxScore,
} from "../../../lib/scoring";
import { getMatchConflicts } from "../../../lib/courtConflicts";
import { getRestingPlayers } from "../../../lib/restTime";
import type { TournamentDialogs } from "./useTournamentDialogs";
import type { getEffectiveScoring } from "./effectiveScoring";
import type { GameSet, Match, Tournament } from "../../../lib/types";
import type { RunningPlayerCourt } from "../../../lib/courtConflicts";

interface Args {
  tournamentId: number;
  tournament: Tournament | null;
  allMatches: Match[];
  setsByMatch: Map<number, GameSet[]>;
  setSetsByMatch: React.Dispatch<React.SetStateAction<Map<number, GameSet[]>>>;
  effectiveScoring: ReturnType<typeof getEffectiveScoring>;
  dialogs: TournamentDialogs;
  editingMatchIds: Set<number>;
  setEditingMatchIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  setRecentlyCompleted: React.Dispatch<React.SetStateAction<Set<number>>>;
  runningPlayerCourts: Map<number, RunningPlayerCourt>;
  playerName: (id: number | null) => string;
  refreshScores: () => void | Promise<void>;
}

export function useMatchActions({
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
  runningPlayerCourts,
  playerName,
  refreshScores,
}: Args) {
  const { setRestWarning, setPlayerConflict } = dialogs;

  const handleScoreChange = async (
    matchId: number,
    setNumber: number,
    team: 1 | 2,
    value: number
  ) => {
    if (!tournament) return;
    const currentSets = setsByMatch.get(matchId) || [];
    const existing = currentSets.find((s) => s.set_number === setNumber);

    const t1 = team === 1 ? value : existing?.team1_score ?? 0;
    const t2 = team === 2 ? value : existing?.team2_score ?? 0;

    const maxScore = getMaxScore(effectiveScoring.pointsPerSet, effectiveScoring.cap);
    const clampedT1 = Math.min(Math.max(t1, 0), maxScore);
    const clampedT2 = Math.min(Math.max(t2, 0), maxScore);

    // Optimistically update the local sets-by-match state so the controlled
    // input value reflects the keystroke immediately, without round-tripping
    // through DB write + full loadAll. This avoids a re-render storm on
    // every keystroke and prevents controlled-value clobbering races during
    // rapid typing (typing "12" quickly used to settle to "2" because two
    // overlapping loadAll cycles could re-set the input value to the
    // previous-keystroke read of the DB while the user kept typing).
    setSetsByMatch((prev) => {
      const next = new Map(prev);
      const sets = [...(next.get(matchId) ?? [])];
      const idx = sets.findIndex((s) => s.set_number === setNumber);
      if (idx >= 0) {
        sets[idx] = { ...sets[idx], team1_score: clampedT1, team2_score: clampedT2 };
      } else {
        sets.push({
          id: 0,
          match_id: matchId,
          set_number: setNumber,
          team1_score: clampedT1,
          team2_score: clampedT2,
        });
      }
      next.set(matchId, sets);
      return next;
    });

    // Persist to DB in the background. handleScoreBlur fires the full
    // loadAll() once the user leaves the field — that's when winner
    // detection, auto-fill, and standings recompute happen anyway.
    await upsertSet(matchId, setNumber, clampedT1, clampedT2);
  };

  // onBlur: Auto-Fill (auf Tab/Click). Winner-Detection ist hier
  // bewusst NICHT mehr drin — das passiert nur noch auf explizites
  // Enter via handleScoreCommit (siehe unten). So kann der TD durch
  // mehrere Sets tabben und Auto-Fill-Vorschläge sehen / korrigieren,
  // ohne dass das Match versehentlich abgeschlossen wird.
  const handleScoreBlur = async (
    matchId: number,
    setNumber: number,
    team: 1 | 2
  ) => {
    if (!tournament) return;
    const currentSets = setsByMatch.get(matchId) || [];
    const existing = currentSets.find((s) => s.set_number === setNumber);
    if (!existing) return;

    let t1 = existing.team1_score;
    let t2 = existing.team2_score;

    // Auto-Fill: Gegner-Score automatisch setzen.
    // Logic UNVERÄNDERT — gleiche autoFillOpponentScore-Aufrufe und
    // gleiche Bedingungen wie zuvor. Punktemodus-Vorschläge (21-Ext-30,
    // 2-Punkte-Vorsprung, Caps etc.) funktionieren genau wie bisher.
    const enteredScore = team === 1 ? t1 : t2;
    const currentOther = team === 1 ? t2 : t1;
    if (enteredScore > 0 && currentOther === 0) {
      const autoScore = autoFillOpponentScore(
        enteredScore,
        effectiveScoring.pointsPerSet,
        effectiveScoring.cap,
        true
      );
      if (autoScore !== null) {
        if (team === 1) t2 = autoScore;
        else t1 = autoScore;
        await upsertSet(matchId, setNumber, t1, t2);
      }
    }

    refreshScores();
  };

  // onKeyDown=Enter: Auto-Fill (gleicher Code wie in handleScoreBlur)
  // gefolgt von Winner-Detection. Wird nur bei explizitem Enter
  // gerufen — der unmittelbar folgende native Blur (durch goNext in
  // MatchCard) feuert handleScoreBlur, das loadAll() macht. Kein
  // eigenes loadAll hier um Doppel-Reloads zu vermeiden.
  const handleScoreCommit = async (
    matchId: number,
    setNumber: number,
    team: 1 | 2
  ) => {
    if (!tournament) return;
    const currentSets = setsByMatch.get(matchId) || [];
    const existing = currentSets.find((s) => s.set_number === setNumber);
    if (!existing) return;

    let t1 = existing.team1_score;
    let t2 = existing.team2_score;

    // Auto-Fill (idempotent — wenn Tab schon gefüllt hat, currentOther !== 0 → no-op)
    const enteredScore = team === 1 ? t1 : t2;
    const currentOther = team === 1 ? t2 : t1;
    if (enteredScore > 0 && currentOther === 0) {
      const autoScore = autoFillOpponentScore(
        enteredScore,
        effectiveScoring.pointsPerSet,
        effectiveScoring.cap,
        true
      );
      if (autoScore !== null) {
        if (team === 1) t2 = autoScore;
        else t1 = autoScore;
        await upsertSet(matchId, setNumber, t1, t2);
      }
    }

    // Winner-Detection — exakt der Block, der vorher in handleScoreBlur stand.
    const updatedSets = [...currentSets.filter((s) => s.set_number !== setNumber)];
    updatedSets.push({
      id: existing.id ?? 0,
      match_id: matchId,
      set_number: setNumber,
      team1_score: t1,
      team2_score: t2,
    });
    updatedSets.sort((a, b) => a.set_number - b.set_number);

    const winner = determineMatchWinner(
      updatedSets,
      effectiveScoring.setsToWin,
      effectiveScoring.pointsPerSet,
      effectiveScoring.cap
    );
    const currentMatch = allMatches.find(m => m.id === matchId);
    if (winner) {
      await updateMatchResult(matchId, winner);
      const wasEditing = editingMatchIds.has(matchId);
      setEditingMatchIds((prev) => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
      // 3s delay only for fresh completions, not for re-edited matches
      if (!wasEditing) {
        setRecentlyCompleted((prev) => new Set(prev).add(matchId));
        setTimeout(() => {
          setRecentlyCompleted((prev) => {
            const next = new Set(prev);
            next.delete(matchId);
            return next;
          });
        }, 3000);
      }
    } else if (currentMatch && currentMatch.winner_team !== null) {
      // Match was completed but scores were changed so no winner anymore — reset
      await updateMatchResult(matchId, null);
    }
    // Selbst aktualisieren, statt sich auf den folgenden Blur zu
    // verlassen.
    //
    // Vorher stand hier, der Fokuswechsel loese handleScoreBlur aus und
    // das mache loadAll(). Beides stimmte nicht: handleScoreBlur ruft
    // refreshScores(), und der Blur kommt nicht zuverlaessig -- das
    // setEditingMatchIds weiter oben rendert neu, und das Element, das
    // danach geblurrt wird, ist unter Umstaenden nicht mehr das
    // fokussierte. Beim letzten Ergebnis einer Runde blieb die Anzeige
    // dadurch stehen: die Naechster-Schritt-Leiste zeigte weiter offene
    // Spiele, obwohl alle eingetragen waren.
    //
    // Feuert der Blur doch, laeuft refreshScores zweimal. Zwei Abfragen
    // sind der Preis dafuer, dass der Bildschirm stimmt.
    await refreshScores();
  };

  const handleCourtChange = async (matchId: number, court: number | null, bypassRestCheck = false) => {
    // Player-overlap check — HARD block, no bypass. A player who is currently
    // running on another court cannot be on a second court at the same time.
    // Runs even when `bypassRestCheck=true` (the rest-warning "assign anyway"
    // path must NOT also bypass this physical impossibility).
    if (court !== null) {
      const targetMatch = allMatches.find((m) => m.id === matchId);
      if (targetMatch) {
        const conflicts = getMatchConflicts(targetMatch, runningPlayerCourts);
        if (conflicts.length > 0) {
          setPlayerConflict({
            matchId,
            players: conflicts.map((c) => ({
              id: c.playerId,
              name: playerName(c.playerId),
              court: c.court,
            })),
          });
          return;
        }
      }
    }

    // Rest-time check: only when assigning (not clearing) and tournament has min_rest configured
    if (!bypassRestCheck && court !== null && tournament && tournament.min_rest_minutes > 0) {
      const targetMatch = allMatches.find((m) => m.id === matchId);
      if (targetMatch) {
        const restingMap = getRestingPlayers(
          allMatches,
          tournament.min_rest_minutes,
          Date.now(),
          matchId,
        );
        const playerIds = [
          targetMatch.team1_p1,
          targetMatch.team1_p2,
          targetMatch.team2_p1,
          targetMatch.team2_p2,
        ].filter((pid): pid is number => pid !== null && pid !== undefined && pid > 0);

        const resting: { id: number; name: string; minutesLeft: number }[] = [];
        for (const pid of playerIds) {
          const s = restingMap.get(pid);
          if (s) {
            resting.push({ id: pid, name: playerName(pid), minutesLeft: s.minutesLeft });
          }
        }

        if (resting.length > 0) {
          setRestWarning({ matchId, court, players: resting });
          return;
        }
      }
    }

    await updateMatchCourt(matchId, court);
    refreshScores();
  };

  const handleAnnounce = (court: number, team1: string, team2: string) => {
    try {
      const bc = new BroadcastChannel(`tournament-${tournamentId}`);
      bc.postMessage({ type: "announce", court, team1, team2 });
      bc.close();
    } catch (err) {
      console.error("TournamentView: failed to send announcement via BroadcastChannel:", err);
    }
  };

  const handleReopenMatch = async (matchId: number) => {
    setEditingMatchIds((prev) => new Set(prev).add(matchId));
    // Clear court (but keep court_assigned_at) so it doesn't show on a field
    await clearMatchCourt(matchId);
    await reopenMatch(matchId);
    refreshScores();
  };
  return {
    handleScoreChange,
    handleScoreBlur,
    handleScoreCommit,
    handleCourtChange,
    handleAnnounce,
    handleReopenMatch,
  };
}
