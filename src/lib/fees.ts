// src/lib/fees.ts
//
// What a tournament is owed, and by whom.
//
// The sum used to be worked out inside the JSX of the management tab, in
// an inline function fifty lines long. That was fine while there was one
// rule -- everyone who plays pays -- and stopped being fine the moment
// there were three: fees can now fall due on entry rather than on turning
// up (E3), withdrawals are kept rather than deleted (E2), and there are
// charges beyond the entry fee (E4).
//
// It lives here so it can be tested. Money is exactly the kind of thing
// nobody notices being wrong until somebody counts the cash box.

import type { FeeItem, FeeDue, Match, TournamentPlayerInfo } from "./types";

export interface FeeSettings {
  /** Entry fee for a singles tournament. */
  entryFeeSingle: number;
  /** Entry fee for a doubles or mixed tournament, per team. */
  entryFeeDouble: number;
  /** Whether the tournament is played as singles. */
  isSingles: boolean;
  /**
   * True for formats where a doubles pair is fixed for the whole
   * tournament, so the fee is charged once per pair rather than per head.
   */
  isFixedTeams: boolean;
  /** When the entry fee falls due. */
  feeDue: FeeDue;
}

export interface FeeLine {
  /** Who owes it. Null for a charge that belongs to the tournament. */
  playerId: number | null;
  label: string;
  amount: number;
  paid: boolean;
}

export interface FeeSummary {
  /** Everything owed, entry fees and extra items together. */
  total: number;
  paid: number;
  open: number;
  /** How many entry fees are due at all — heads, or teams. */
  entryCount: number;
  entryPaidCount: number;
  lines: FeeLine[];
}

/**
 * Whether this participant owes the entry fee.
 *
 * With `participation` the fee follows the play: somebody who withdrew or
 * never came off the waiting list owes nothing. With `entry` the fee
 * follows the sign-up, so a withdrawal still owes it — which is the whole
 * reason withdrawals are kept rather than deleted.
 *
 * Somebody still waiting never owes under either rule: they have not
 * entered, they are queued behind those who have.
 */
export function owesEntryFee(
  info: Pick<TournamentPlayerInfo, "entry_status">,
  feeDue: FeeDue,
): boolean {
  if (info.entry_status === "waiting") return false;
  if (info.entry_status === "withdrawn") return feeDue === "entry";
  return true;
}

/**
 * Pairs found in the match list, as a stable key per pair.
 *
 * A fixed-team tournament charges once per pair, and the pairs are only
 * discoverable from the matches — there is no team table.
 */
function pairsOf(matches: Match[]): Map<number, string> {
  const pairOf = new Map<number, string>();
  const note = (a: number | null, b: number | null) => {
    if (a === null || b === null) return;
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    pairOf.set(a, key);
    pairOf.set(b, key);
  };
  for (const m of matches) {
    note(m.team1_p1, m.team1_p2);
    note(m.team2_p1, m.team2_p2);
  }
  return pairOf;
}

/**
 * Adds up entry fees and extra items.
 *
 * A pair in a fixed-team tournament counts as one entry, and counts as
 * paid when either partner has paid — which is how the desk actually
 * works: one of them hands over the money for both.
 */
export function summariseFees(
  participants: TournamentPlayerInfo[],
  matches: Match[],
  items: FeeItem[],
  settings: FeeSettings,
): FeeSummary {
  const fee = settings.isSingles ? settings.entryFeeSingle : settings.entryFeeDouble;
  const lines: FeeLine[] = [];

  const owing = participants.filter((p) => owesEntryFee(p, settings.feeDue));

  let entryCount = 0;
  let entryPaidCount = 0;

  if (settings.isFixedTeams && !settings.isSingles) {
    const pairOf = pairsOf(matches);
    // Grouped by pair; anybody without a pair (odd number, or not drawn
    // yet) is charged on their own rather than dropped.
    const groups = new Map<string, TournamentPlayerInfo[]>();
    for (const p of owing) {
      const key = pairOf.get(p.player.id) ?? `solo-${p.player.id}`;
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }
    for (const [, members] of groups) {
      entryCount++;
      const paid = members.some((m) => m.payment_status === "paid");
      if (paid) entryPaidCount++;
      if (fee > 0) {
        lines.push({
          playerId: members[0].player.id,
          label: "entry",
          amount: fee,
          paid,
        });
      }
    }
  } else {
    for (const p of owing) {
      entryCount++;
      const paid = p.payment_status === "paid";
      if (paid) entryPaidCount++;
      if (fee > 0) {
        lines.push({ playerId: p.player.id, label: "entry", amount: fee, paid });
      }
    }
  }

  for (const item of items) {
    lines.push({
      playerId: item.player_id,
      label: item.label,
      amount: item.amount,
      paid: item.paid,
    });
  }

  const total = lines.reduce((n, l) => n + l.amount, 0);
  const paid = lines.filter((l) => l.paid).reduce((n, l) => n + l.amount, 0);

  return {
    total,
    paid,
    // Derived rather than summed separately: the two must agree, and a
    // rounding difference between two sums is a bug nobody would spot.
    open: total - paid,
    entryCount,
    entryPaidCount,
    lines,
  };
}
