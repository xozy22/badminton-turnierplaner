// src/pages/TournamentView/lib/undoTarget.ts
//
// Pure computation of "what does the next undo step delete?" — the result
// drives both the Undo button's disabled state (no target → no click) and
// the rich confirm modal's preview (round label + counts + phase hint).
//
// Strategy:
//   1. Pick the round with the largest id — most-recently created in DB
//      insertion order. Ignores round_number (which is *not* chronological
//      in group_ko: each group's rounds get a global counter so the last
//      group's rounds always have the largest round_numbers, regardless
//      of when they were drawn).
//   2. Bronze + Final pairing: when the head is a `third_place` round,
//      include the matching Final/winners round with the same round_number
//      (and vice versa). Both get deleted in one logical undo step — they
//      were created together in the SF→Final transition.
//   3. Aggregate stats over the involved rounds so the modal can show
//      exactly what data the user is about to lose.
//   4. Predict the post-undo phase transition: full reset to draft when
//      no rounds remain, back-to-group when KO+bronze are removed and
//      only group rounds are left, otherwise no change.

import type { Match, GameSet, Round, Tournament } from "../../../lib/types";
import type { UndoTarget } from "../components/modals/UndoRoundModal";

interface Translations {
  bracket_third_place_short: string;
  tournament_view_round_label: string;
  group_progress_label: string;
}

export function getUndoTarget(
  tournament: Tournament | null,
  rounds: Round[],
  matchesByRound: Map<number, Match[]>,
  setsByMatch: Map<number, GameSet[]>,
  t: Translations,
): UndoTarget | null {
  if (!tournament || rounds.length === 0) return null;

  // Newest-first by insertion order. round.id is auto-increment so largest
  // id == most-recently created round.
  const byIdDesc = [...rounds].sort((a, b) => b.id - a.id);
  const head = byIdDesc[0];

  // Bronze + Final pairing — both share round_number, created in the same
  // SF→Final transition.
  const pair: Round[] = [head];
  if (head.phase === "third_place") {
    const finalSibling = rounds.find(
      (r) =>
        r.id !== head.id &&
        r.round_number === head.round_number &&
        (r.phase === "ko" || r.phase === "winners" || r.phase == null),
    );
    if (finalSibling) pair.unshift(finalSibling); // Final first, Bronze second
  } else if (head.phase === "ko" || head.phase === "winners" || head.phase == null) {
    const bronzeSibling = rounds.find(
      (r) =>
        r.id !== head.id &&
        r.round_number === head.round_number &&
        r.phase === "third_place",
    );
    if (bronzeSibling) pair.push(bronzeSibling);
  }

  // Stats across the involved rounds.
  let matchCount = 0;
  let completedCount = 0;
  let activeOnCourtCount = 0;
  let setCount = 0;
  for (const r of pair) {
    const ms = matchesByRound.get(r.id) ?? [];
    matchCount += ms.length;
    for (const m of ms) {
      if (m.status === "completed") completedCount++;
      if (m.status === "active" || (m.court != null && m.status !== "completed")) {
        activeOnCourtCount++;
      }
      setCount += (setsByMatch.get(m.id) ?? []).length;
    }
  }

  // Round label. Keep it short and descriptive; bronze pairing appends
  // the trophy marker so the user sees both deletions at once.
  const primary = pair[0];
  const labelForRound = (r: Round): string => {
    if (r.phase === "third_place") return t.bracket_third_place_short;
    if (r.phase === "group" && r.group_number != null) {
      // Local round-index within the group (handles non-contiguous round_numbers).
      const groupRounds = rounds
        .filter((rr) => rr.phase === "group" && rr.group_number === r.group_number)
        .sort((a, b) => a.round_number - b.round_number);
      const idx = groupRounds.findIndex((rr) => rr.id === r.id);
      const label = t.tournament_view_round_label.replace("{n}", String(idx + 1));
      return `${t.group_progress_label.replace("{n}", String(r.group_number))} · ${label}`;
    }
    if (r.phase === "winners") return `W · ${t.tournament_view_round_label.replace("{n}", String(r.round_number))}`;
    if (r.phase === "losers")  return `L · ${t.tournament_view_round_label.replace("{n}", String(r.round_number))}`;
    return t.tournament_view_round_label.replace("{n}", String(r.round_number));
  };
  let label = labelForRound(primary);
  if (pair.length > 1 && pair.some((r) => r.phase === "third_place")) {
    label += ` + ${t.bracket_third_place_short}`;
  }

  // Phase transition prediction.
  const remaining = rounds.filter((r) => !pair.some((p) => p.id === r.id));
  const resetStatusToDraft = remaining.length === 0;
  const remainingKo = remaining.filter(
    (r) => r.phase === "ko" || r.phase === "winners" || r.phase === "losers",
  );
  const remainingGroup = remaining.filter((r) => r.phase === "group");
  const isGroupKoBackToGroup =
    tournament.format === "group_ko" &&
    remainingKo.length === 0 &&
    remainingGroup.length > 0 &&
    pair.some((r) => r.phase === "ko" || r.phase === "third_place");

  return {
    rounds: pair,
    label,
    matchCount,
    completedCount,
    activeOnCourtCount,
    setCount,
    resetStatusToDraft,
    isGroupKoBackToGroup,
  };
}
