// src/lib/db.test.ts
//
// Tests for the data layer against its in-memory backend.
//
// The Tauri path and this one are two implementations of the same 58
// functions, kept in step by hand (REVIEW-BACKLOG.md C5). Before either
// gets restructured, the behaviour has to be pinned down — this file does
// that for the backend that can run in a test process.

import { describe, it, expect, beforeEach } from "vitest";
import {
  createPlayer,
  getPlayers,
  updatePlayer,
  removePlayer,
  archivePlayer,
  restorePlayer,
  deletePlayer,
  getPlayerMatchUsage,
  PlayerInUseError,
  createTournament,
  getTournament,
  getTournaments,
  updateTournamentStatus,
  updateTournamentPhase,
  updatePlannedRounds,
  addPlayerToTournament,
  removePlayerFromTournament,
  getTournamentPlayers,
  getTournamentPlayersDetailed,
  retirePlayerFromTournament,
  unretirePlayerFromTournament,
  getRetiredPlayerIds,
  updatePlayerPayment,
  setTournamentSeeds,
  createSchedule,
  deleteRoundsAtomically,
  getRounds,
  getAllMatchesByTournament,
  getAllSetsByTournament,
  upsertSet,
  updateMatchResult,
  setMatchWalkover,
  reopenMatch,
  updateMatchCourt,
  clearMatchCourt,
  getAppSetting,
  setAppSetting,
  getKingOfCourtQueue,
  setKingOfCourtQueue,
  deleteTournament,
  wipeAllTournaments,
} from "./db";

/** Fresh store before every test — the backend keeps state in localStorage. */
beforeEach(() => {
  localStorage.clear();
});

async function seedPlayers(count: number): Promise<number[]> {
  for (let i = 1; i <= count; i++) {
    await createPlayer(`Vorname${i}`, `Nachname${i}`, i % 2 === 0 ? "f" : "m", null, "TSV");
  }
  return (await getPlayers()).map((p) => p.id);
}

async function seedTournament(playerIds: number[]): Promise<number> {
  const id = await createTournament("Testturnier", "singles", "round_robin", 2, 21, 2);
  for (const pid of playerIds) await addPlayerToTournament(id, pid);
  return id;
}

describe("players", () => {
  it("creates and reads back a player", async () => {
    await createPlayer("Anna", "Meier", "f", "1990-05-04", "TSV");
    const players = await getPlayers();

    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({
      first_name: "Anna",
      last_name: "Meier",
      gender: "f",
      birth_date: "1990-05-04",
      club: "TSV",
      archived_at: null,
    });
  });

  it("trims the name parts", async () => {
    await createPlayer("  Anna  ", "  Meier ", "f");
    const [player] = await getPlayers();
    expect(player.first_name).toBe("Anna");
    expect(player.last_name).toBe("Meier");
  });

  it("sorts by display name", async () => {
    await createPlayer("Zoe", "Adler", "f");
    await createPlayer("Anna", "Zimmer", "f");
    const names = (await getPlayers()).map((p) => p.first_name);
    expect(names).toEqual(["Anna", "Zoe"]);
  });

  it("updates a player", async () => {
    await createPlayer("Anna", "Meier", "f");
    const [player] = await getPlayers();
    await updatePlayer(player.id, "Anna", "Schmidt", "f", null, "TSV Neu");

    const [updated] = await getPlayers();
    expect(updated.last_name).toBe("Schmidt");
    expect(updated.club).toBe("TSV Neu");
  });

  it("deletes a player without history", async () => {
    const [id] = await seedPlayers(1);
    expect(await removePlayer(id)).toBe("deleted");
    expect(await getPlayers()).toHaveLength(0);
  });
});

describe("archiving", () => {
  it("archives a player who has played", async () => {
    const ids = await seedPlayers(2);
    const tournamentId = await seedTournament(ids);
    await createSchedule(tournamentId, [
      { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1] }] },
    ]);

    expect(await removePlayer(ids[0])).toBe("archived");
    // Gone from the active roster, still there with history.
    expect((await getPlayers()).map((p) => p.id)).not.toContain(ids[0]);
    expect((await getPlayers(true)).map((p) => p.id)).toContain(ids[0]);
  });

  it("restores an archived player", async () => {
    const [id] = await seedPlayers(1);
    await archivePlayer(id);
    expect(await getPlayers()).toHaveLength(0);

    await restorePlayer(id);
    expect(await getPlayers()).toHaveLength(1);
  });

  it("reports which tournaments block a delete", async () => {
    const ids = await seedPlayers(2);
    const tournamentId = await seedTournament(ids);
    await createSchedule(tournamentId, [
      { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1] }] },
    ]);

    const usage = await getPlayerMatchUsage(ids[0]);
    expect(usage.map((t) => t.name)).toEqual(["Testturnier"]);
    await expect(deletePlayer(ids[0])).rejects.toBeInstanceOf(PlayerInUseError);
  });
});

describe("tournaments", () => {
  it("creates a draft with the given settings", async () => {
    const id = await createTournament("Sommercup", "doubles", "elimination", 2, 21, 4, 0, 0, 5, 10, 30, 15, true);
    const tournament = await getTournament(id);

    expect(tournament).toMatchObject({
      name: "Sommercup",
      mode: "doubles",
      format: "elimination",
      courts: 4,
      entry_fee_single: 5,
      entry_fee_double: 10,
      cap: 30,
      min_rest_minutes: 15,
      enable_third_place: 1,
      status: "draft",
    });
  });

  it("lists the newest tournament first", async () => {
    await createTournament("Alt", "singles", "round_robin", 2, 21);
    await new Promise((r) => setTimeout(r, 5));
    await createTournament("Neu", "singles", "round_robin", 2, 21);

    const names = (await getTournaments()).map((t) => t.name);
    expect(names[0]).toBe("Neu");
  });

  it("changes status and phase", async () => {
    const id = await createTournament("T", "singles", "group_ko", 2, 21);
    await updateTournamentStatus(id, "active");
    await updateTournamentPhase(id, "group");

    const tournament = await getTournament(id);
    expect(tournament.status).toBe("active");
    expect(tournament.current_phase).toBe("group");
  });

  it("stores the planned round count", async () => {
    const id = await createTournament("T", "singles", "swiss", 2, 21);
    await updatePlannedRounds(id, 5);
    expect((await getTournament(id)).planned_rounds).toBe(5);
  });

  it("throws for an unknown id", async () => {
    await expect(getTournament(999)).rejects.toThrow();
  });
});

describe("tournament players", () => {
  it("adds and removes participants", async () => {
    const ids = await seedPlayers(3);
    const tournamentId = await seedTournament(ids);

    expect(await getTournamentPlayers(tournamentId)).toHaveLength(3);
    await removePlayerFromTournament(tournamentId, ids[0]);
    expect(await getTournamentPlayers(tournamentId)).toHaveLength(2);
  });

  it("ignores a duplicate add", async () => {
    const ids = await seedPlayers(1);
    const tournamentId = await seedTournament(ids);
    await addPlayerToTournament(tournamentId, ids[0]);
    expect(await getTournamentPlayers(tournamentId)).toHaveLength(1);
  });

  it("tracks retirement", async () => {
    const ids = await seedPlayers(2);
    const tournamentId = await seedTournament(ids);

    await retirePlayerFromTournament(tournamentId, ids[0]);
    expect(await getRetiredPlayerIds(tournamentId)).toEqual([ids[0]]);

    await unretirePlayerFromTournament(tournamentId, ids[0]);
    expect(await getRetiredPlayerIds(tournamentId)).toEqual([]);
  });

  it("records payments", async () => {
    const ids = await seedPlayers(1);
    const tournamentId = await seedTournament(ids);

    await updatePlayerPayment(tournamentId, ids[0], "paid", "bar", "2026-08-18");
    const [entry] = await getTournamentPlayersDetailed(tournamentId);

    expect(entry.payment_status).toBe("paid");
    expect(entry.payment_method).toBe("bar");
    expect(entry.paid_date).toBe("2026-08-18");
  });

  it("replaces the seed order", async () => {
    const ids = await seedPlayers(3);
    const tournamentId = await seedTournament(ids);

    await setTournamentSeeds(tournamentId, [ids[2], ids[0]]);
    const detailed = await getTournamentPlayersDetailed(tournamentId);
    const ranks = new Map(detailed.map((d) => [d.player.id, d.seed_rank]));

    expect(ranks.get(ids[2])).toBe(1);
    expect(ranks.get(ids[0])).toBe(2);
    expect(ranks.get(ids[1])).toBeNull();

    // A second call replaces rather than adds.
    await setTournamentSeeds(tournamentId, [ids[1]]);
    const after = new Map(
      (await getTournamentPlayersDetailed(tournamentId)).map((d) => [d.player.id, d.seed_rank]),
    );
    expect(after.get(ids[1])).toBe(1);
    expect(after.get(ids[2])).toBeNull();
  });
});

describe("schedule writes", () => {
  it("creates rounds with their matches and flips the status", async () => {
    const ids = await seedPlayers(4);
    const tournamentId = await seedTournament(ids);

    const roundIds = await createSchedule(
      tournamentId,
      [
        {
          roundNumber: 1,
          matches: [
            { team1_p1: ids[0], team2_p1: ids[1], court: 1 },
            { team1_p1: ids[2], team2_p1: ids[3], court: 2 },
          ],
        },
        { roundNumber: 2, phase: "ko", matches: [{ team1_p1: ids[0], team2_p1: ids[2] }] },
      ],
      { status: "active", phase: "ko" },
    );

    expect(roundIds).toHaveLength(2);
    expect(await getRounds(tournamentId)).toHaveLength(2);
    expect(await getAllMatchesByTournament(tournamentId)).toHaveLength(3);

    const tournament = await getTournament(tournamentId);
    expect(tournament.status).toBe("active");
    expect(tournament.current_phase).toBe("ko");
  });

  it("stores a bye as a decided match", async () => {
    const ids = await seedPlayers(2);
    const tournamentId = await seedTournament(ids);

    await createSchedule(tournamentId, [
      { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: null, completed: true }] },
    ]);

    const [match] = await getAllMatchesByTournament(tournamentId);
    expect(match.team2_p1).toBeNull();
    expect(match.status).toBe("completed");
    expect(match.winner_team).toBe(1);
  });

  it("deletes rounds with their matches and sets", async () => {
    const ids = await seedPlayers(2);
    const tournamentId = await seedTournament(ids);
    const [roundId] = await createSchedule(tournamentId, [
      { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1] }] },
    ]);

    const [match] = await getAllMatchesByTournament(tournamentId);
    await upsertSet(match.id, 1, 21, 15);
    expect(await getAllSetsByTournament(tournamentId)).toHaveLength(1);

    await deleteRoundsAtomically(tournamentId, [roundId], { status: "draft", phase: "ready" });

    expect(await getRounds(tournamentId)).toHaveLength(0);
    expect(await getAllMatchesByTournament(tournamentId)).toHaveLength(0);
    expect(await getAllSetsByTournament(tournamentId)).toHaveLength(0);
    expect((await getTournament(tournamentId)).status).toBe("draft");
  });
});

describe("matches and sets", () => {
  async function oneMatch() {
    const ids = await seedPlayers(2);
    const tournamentId = await seedTournament(ids);
    await createSchedule(tournamentId, [
      { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1], court: 1 }] },
    ]);
    const [match] = await getAllMatchesByTournament(tournamentId);
    return { tournamentId, match };
  }

  it("writes a set once per set number", async () => {
    const { tournamentId, match } = await oneMatch();

    await upsertSet(match.id, 1, 21, 15);
    await upsertSet(match.id, 1, 21, 18); // same set, corrected

    const sets = await getAllSetsByTournament(tournamentId);
    expect(sets).toHaveLength(1);
    expect(sets[0].team2_score).toBe(18);
  });

  it("records and resets a result", async () => {
    const { tournamentId, match } = await oneMatch();

    await updateMatchResult(match.id, 2);
    let [stored] = await getAllMatchesByTournament(tournamentId);
    expect(stored.winner_team).toBe(2);
    expect(stored.status).toBe("completed");

    await updateMatchResult(match.id, null);
    [stored] = await getAllMatchesByTournament(tournamentId);
    expect(stored.winner_team).toBeNull();
    expect(stored.status).toBe("active");
  });

  it("awards a walkover without sets", async () => {
    const { tournamentId, match } = await oneMatch();
    await upsertSet(match.id, 1, 21, 15);

    await setMatchWalkover(match.id, 1);

    const [stored] = await getAllMatchesByTournament(tournamentId);
    expect(stored.walkover).toBe(1);
    expect(stored.winner_team).toBe(1);
    expect(stored.court).toBeNull();
    expect(await getAllSetsByTournament(tournamentId)).toHaveLength(0);
  });

  it("clears the walkover flag when the result is reset", async () => {
    // A walkover awarded by mistake — the opponent turns up after all. The
    // match is played normally, so nothing may remember the walkover: scoring
    // discards the sets of any match still flagged as one, which would leave
    // the standings with a phantom 0:0 (REVIEW-BACKLOG.md C5).
    const { tournamentId, match } = await oneMatch();
    await setMatchWalkover(match.id, 1);

    await updateMatchResult(match.id, null);

    const [stored] = await getAllMatchesByTournament(tournamentId);
    expect(stored.walkover).toBe(0);
    expect(stored.completed_at).toBeNull();
  });

  it("clears the walkover flag when the match is reopened", async () => {
    const { tournamentId, match } = await oneMatch();
    await setMatchWalkover(match.id, 1);

    await reopenMatch(match.id);

    const [stored] = await getAllMatchesByTournament(tournamentId);
    expect(stored.status).toBe("pending");
    expect(stored.walkover).toBe(0);
    expect(stored.completed_at).toBeNull();
  });

  it("assigns and clears a court", async () => {
    const { tournamentId, match } = await oneMatch();

    await updateMatchCourt(match.id, 3);
    let [stored] = await getAllMatchesByTournament(tournamentId);
    expect(stored.court).toBe(3);
    expect(stored.court_assigned_at).toBeTruthy();

    await clearMatchCourt(match.id);
    [stored] = await getAllMatchesByTournament(tournamentId);
    expect(stored.court).toBeNull();
  });
});

describe("app settings", () => {
  it("stores and reads a value", async () => {
    await setAppSetting("greeting", "hallo");
    expect(await getAppSetting("greeting")).toBe("hallo");
  });

  it("returns null for an unknown key", async () => {
    expect(await getAppSetting("nope")).toBeNull();
  });

  it("round-trips the King of the Court queue", async () => {
    await setKingOfCourtQueue(7, [3, 1, 2]);
    expect(await getKingOfCourtQueue(7)).toEqual([3, 1, 2]);
    expect(await getKingOfCourtQueue(8)).toEqual([]);
  });

  it("drops the queue when its tournament is deleted", async () => {
    // SQLite reuses the id of a deleted row, so a leftover queue would be
    // handed to whichever tournament is created next (REVIEW-BACKLOG.md C5).
    const ids = await seedPlayers(2);
    const tournamentId = await seedTournament(ids);
    await setKingOfCourtQueue(tournamentId, ids);

    await deleteTournament(tournamentId);

    expect(await getKingOfCourtQueue(tournamentId)).toEqual([]);
  });

  it("drops every queue when all tournaments are wiped", async () => {
    const ids = await seedPlayers(2);
    const a = await seedTournament(ids);
    const b = await seedTournament(ids);
    await setKingOfCourtQueue(a, ids);
    await setKingOfCourtQueue(b, ids);
    await setAppSetting("club_name", "TSV"); // unrelated, must survive

    await wipeAllTournaments();

    expect(await getKingOfCourtQueue(a)).toEqual([]);
    expect(await getKingOfCourtQueue(b)).toEqual([]);
    expect(await getAppSetting("club_name")).toBe("TSV");
  });

  it("survives a corrupted queue entry", async () => {
    await setAppSetting("kotc_queue_9", "not json");
    expect(await getKingOfCourtQueue(9)).toEqual([]);
  });
});
