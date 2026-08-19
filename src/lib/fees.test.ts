// src/lib/fees.test.ts
//
// Money. Nobody notices this being wrong until somebody counts the cash
// box, which is why it left the JSX and came here.

import { describe, it, expect } from "vitest";
import { summariseFees, owesEntryFee, type FeeSettings } from "./fees";
import { makePlayer, makeMatch, resetIds } from "../test/factories";
import { beforeEach } from "vitest";
import type { FeeItem, TournamentPlayerInfo } from "./types";

beforeEach(resetIds);

const singles: FeeSettings = {
  entryFeeSingle: 5,
  entryFeeDouble: 8,
  isSingles: true,
  isFixedTeams: false,
  feeDue: "participation",
};

function entrant(overrides: Partial<TournamentPlayerInfo> = {}): TournamentPlayerInfo {
  return {
    player: makePlayer(),
    payment_status: "unpaid",
    payment_method: null,
    paid_date: null,
    retired: false,
    seed_rank: null,
    entry_status: "entered",
    waiting_rank: null,
    withdrawn_at: null,
    ...overrides,
  };
}

const item = (overrides: Partial<FeeItem> = {}): FeeItem => ({
  id: 1,
  tournament_id: 1,
  player_id: null,
  label: "Nachmeldung",
  amount: 3,
  paid: false,
  created_at: "2026-08-19T10:00:00.000Z",
  ...overrides,
});

describe("owesEntryFee", () => {
  it("charges everybody taking part", () => {
    expect(owesEntryFee({ entry_status: "entered" }, "participation")).toBe(true);
    expect(owesEntryFee({ entry_status: "entered" }, "entry")).toBe(true);
  });

  it("never charges somebody still waiting", () => {
    // They have not entered; they are queued behind those who have.
    expect(owesEntryFee({ entry_status: "waiting" }, "participation")).toBe(false);
    expect(owesEntryFee({ entry_status: "waiting" }, "entry")).toBe(false);
  });

  it("charges a withdrawal only when the fee fell due on entry", () => {
    // This is the whole reason withdrawals are kept rather than deleted.
    expect(owesEntryFee({ entry_status: "withdrawn" }, "entry")).toBe(true);
    expect(owesEntryFee({ entry_status: "withdrawn" }, "participation")).toBe(false);
  });
});

describe("summariseFees — singles", () => {
  it("charges each participant once", () => {
    const s = summariseFees([entrant(), entrant(), entrant()], [], [], singles);
    expect(s.entryCount).toBe(3);
    expect(s.total).toBe(15);
    expect(s.open).toBe(15);
  });

  it("counts what has been paid", () => {
    const s = summariseFees(
      [entrant({ payment_status: "paid" }), entrant()],
      [],
      [],
      singles,
    );
    expect(s.entryPaidCount).toBe(1);
    expect(s.paid).toBe(5);
    expect(s.open).toBe(5);
  });

  it("leaves the waiting list out of the sum", () => {
    const s = summariseFees(
      [entrant(), entrant({ entry_status: "waiting", waiting_rank: 1 })],
      [],
      [],
      singles,
    );
    expect(s.entryCount).toBe(1);
    expect(s.total).toBe(5);
  });

  it("still charges a withdrawal when the fee fell due on entry", () => {
    const withdrawn = entrant({ entry_status: "withdrawn", withdrawn_at: "2026-08-19" });
    expect(summariseFees([entrant(), withdrawn], [], [], singles).total).toBe(5);
    expect(
      summariseFees([entrant(), withdrawn], [], [], { ...singles, feeDue: "entry" }).total,
    ).toBe(10);
  });

  it("adds up extra items alongside the entry fees", () => {
    const s = summariseFees([entrant()], [], [item(), item({ id: 2, amount: 2, paid: true })], singles);
    expect(s.total).toBe(10);
    expect(s.paid).toBe(2);
    expect(s.open).toBe(8);
  });

  it("counts an extra item even where there is no entry fee", () => {
    // A tournament that charges nothing to enter can still sell shuttles.
    const free = { ...singles, entryFeeSingle: 0 };
    const s = summariseFees([entrant()], [], [item({ amount: 4 })], free);
    expect(s.total).toBe(4);
    expect(s.entryCount).toBe(1);
    expect(s.lines).toHaveLength(1);
  });
});

describe("summariseFees — fixed doubles teams", () => {
  const doubles: FeeSettings = {
    ...singles,
    isSingles: false,
    isFixedTeams: true,
  };

  it("charges once per pair", () => {
    const [a, b, c, d] = [entrant(), entrant(), entrant(), entrant()];
    const match = makeMatch({
      team1_p1: a.player.id,
      team1_p2: b.player.id,
      team2_p1: c.player.id,
      team2_p2: d.player.id,
    });
    const s = summariseFees([a, b, c, d], [match], [], doubles);
    expect(s.entryCount).toBe(2);
    expect(s.total).toBe(16);
  });

  it("treats a pair as paid when one partner paid", () => {
    // That is how the desk works: one of them hands over for both.
    const a = entrant({ payment_status: "paid" });
    const b = entrant();
    const match = makeMatch({
      team1_p1: a.player.id,
      team1_p2: b.player.id,
      team2_p1: null,
      team2_p2: null,
    });
    const s = summariseFees([a, b], [match], [], doubles);
    expect(s.entryCount).toBe(1);
    expect(s.entryPaidCount).toBe(1);
    expect(s.paid).toBe(8);
  });

  it("charges somebody who has no pair yet on their own", () => {
    // Before the draw there are no matches, so no pairs. Dropping them
    // would show a total of zero for a tournament with entries.
    const s = summariseFees([entrant(), entrant()], [], [], doubles);
    expect(s.entryCount).toBe(2);
    expect(s.total).toBe(16);
  });
});
