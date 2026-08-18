// src/lib/db.test.ts
//
// Tests for the data layer — run twice, once against each backend.
//
// db.ts carries two implementations of every function: SQL for Tauri and
// arrays for the browser fallback. They are kept in step by hand, and for
// a long time only the fallback was reachable from a test process, so two
// defects settled into both paths unnoticed (REVIEW-BACKLOG.md C5).
//
// Every case below therefore runs against the fallback *and* against the
// real migration chain in an in-memory SQLite. A behaviour that exists in
// only one of them now fails here instead of in a tournament.

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { createSqliteBackend, DatabaseSync, type SqliteBackend } from "../test/sqliteBackend";
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
  wipeAllPlayers,
  createSportstaette,
  updateSportstaette,
  deleteSportstaette,
  getSportstaetten,
  getVenueUsage,
  VenueInUseError,
  updateTournamentVenueId,
  updateTournamentKoScoring,
  updateTeamConfig,
  updateHallConfig,
  createRound,
  createMatch,
  deleteRound,
  getMatchesByRound,
  getSetsByMatch,
  markGrandFinalRounds,
  getGrandFinalRounds,
  getAllMatchesWithTournament,
  getAllSetsFlat,
  getMatchesForTournaments,
} from "./db";

// db.ts reaches for these two modules on the Tauri path; the harness
// answers for both. vi.mock is hoisted, so the factories read a variable
// that is filled in beforeAll.
let sqlite: SqliteBackend | null = null;

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: async () => sqlite!.database },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string, args?: Record<string, unknown>) =>
    sqlite!.invoke(command, args),
}));

/** Marks the process as running inside Tauri, which is what isTauri() asks. */
function enterTauri(): void {
  (globalThis.window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

function leaveTauri(): void {
  delete (globalThis.window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

interface Backend {
  name: string;
  available: boolean;
  setup(): void;
  teardown(): void;
  clear(): void;
}

const BACKENDS: Backend[] = [
  {
    name: "in-memory fallback",
    available: true,
    setup: leaveTauri,
    teardown: leaveTauri,
    clear: () => localStorage.clear(),
  },
  {
    name: "SQLite (real migrations)",
    available: DatabaseSync !== null,
    setup: () => {
      sqlite = createSqliteBackend();
      enterTauri();
    },
    teardown: () => {
      leaveTauri();
      sqlite?.close();
      sqlite = null;
    },
    clear: () => sqlite!.reset(),
  },
];

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

for (const backend of BACKENDS) {
  describe.skipIf(!backend.available)(backend.name, () => {
    beforeAll(() => backend.setup());
    afterAll(() => backend.teardown());
    beforeEach(() => backend.clear());

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

    it("finds a player in any of the four team columns", async () => {
      // The query tests one id against team1_p1, team1_p2, team2_p1 and
      // team2_p2. Checking only the first column would pass while three
      // quarters of it were broken (REVIEW-BACKLOG.md E4).
      const ids = await seedPlayers(4);
      const tournamentId = await seedTournament(ids);
      await createSchedule(tournamentId, [
        {
          roundNumber: 1,
          matches: [
            { team1_p1: ids[0], team1_p2: ids[1], team2_p1: ids[2], team2_p2: ids[3] },
          ],
        },
      ]);

      for (const id of ids) {
        expect(
          (await getPlayerMatchUsage(id)).map((t) => t.name),
          `player ${id}`,
        ).toEqual(["Testturnier"]);
      }
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
      // No delay between the two: SQLite's created_at only resolves to the
      // second, so without the id tie-breaker this ordering is arbitrary.
      await createTournament("Alt", "singles", "round_robin", 2, 21);
      await createTournament("Neu", "singles", "round_robin", 2, 21);

      const names = (await getTournaments()).map((t) => t.name);
      expect(names).toEqual(["Neu", "Alt"]);
    });

    it("keeps that order stable across calls", async () => {
      for (const name of ["A", "B", "C", "D"]) {
        await createTournament(name, "singles", "round_robin", 2, 21);
      }

      const first = (await getTournaments()).map((t) => t.name);
      const second = (await getTournaments()).map((t) => t.name);

      expect(first).toEqual(["D", "C", "B", "A"]);
      expect(second).toEqual(first);
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

  describe("venues", () => {
    it("creates and lists a venue", async () => {
      await createSportstaette("Sporthalle Nord", "Hauptstr. 1", "12345", "Musterstadt", 4);
      const venues = await getSportstaetten();

      expect(venues).toHaveLength(1);
      expect(venues[0]).toMatchObject({
        name: "Sporthalle Nord",
        address: "Hauptstr. 1",
        zip: "12345",
        city: "Musterstadt",
        courts: 4,
      });
    });

    it("updates a venue", async () => {
      await createSportstaette("Alt", null, null, null, 2);
      const [venue] = await getSportstaetten();

      await updateSportstaette(venue.id, "Neu", "Weg 2", "54321", "Anderstadt", 6);
      const [updated] = await getSportstaetten();

      expect(updated.name).toBe("Neu");
      expect(updated.courts).toBe(6);
    });

    it("deletes an unused venue", async () => {
      await createSportstaette("Ungenutzt", null, null, null, 2);
      const [venue] = await getSportstaetten();

      await deleteSportstaette(venue.id);
      expect(await getSportstaetten()).toHaveLength(0);
    });

    it("refuses to delete a venue an active tournament sits in", async () => {
      await createSportstaette("Belegt", null, null, null, 2);
      const [venue] = await getSportstaetten();
      const tournamentId = await createTournament("Cup", "singles", "round_robin", 2, 21);
      await updateTournamentVenueId(tournamentId, venue.id);

      const usage = await getVenueUsage(venue.id);
      expect(usage.activeTournaments.map((t) => t.name)).toEqual(["Cup"]);

      await expect(deleteSportstaette(venue.id)).rejects.toBeInstanceOf(VenueInUseError);
      expect(await getSportstaetten()).toHaveLength(1);
    });

    it("allows the delete once the tournament is finished", async () => {
      await createSportstaette("Frei danach", null, null, null, 2);
      const [venue] = await getSportstaetten();
      const tournamentId = await createTournament("Cup", "singles", "round_robin", 2, 21);
      await updateTournamentVenueId(tournamentId, venue.id);
      await updateTournamentStatus(tournamentId, "completed");

      await deleteSportstaette(venue.id);
      expect(await getSportstaetten()).toHaveLength(0);
    });
  });

  describe("tournament settings", () => {
    it("stores the KO scoring separately from the group scoring", async () => {
      const id = await createTournament("T", "singles", "group_ko", 2, 21, 2, 2, 2, 0, 0, 30);

      await updateTournamentKoScoring(id, 15, 3, 21);
      const t = await getTournament(id);

      expect(t.ko_sets_to_win).toBe(3);
      expect(t.ko_points_per_set).toBe(15);
      expect(t.ko_cap).toBe(21);
      // The group values stay untouched.
      expect(t.sets_to_win).toBe(2);
      expect(t.points_per_set).toBe(21);
    });

    it("round-trips the team configuration", async () => {
      const id = await createTournament("T", "doubles", "random_doubles", 2, 21);

      await updateTeamConfig(id, [[1, 2], [3, 4]]);
      expect(JSON.parse((await getTournament(id)).team_config!)).toEqual([[1, 2], [3, 4]]);

      await updateTeamConfig(id, null);
      expect((await getTournament(id)).team_config).toBeNull();
    });

    it("round-trips the hall configuration", async () => {
      const id = await createTournament("T", "singles", "round_robin", 2, 21);

      await updateHallConfig(id, [{ name: "Halle A", courts: 3 }]);
      const stored = JSON.parse((await getTournament(id)).hall_config!);

      expect(stored).toEqual([{ name: "Halle A", courts: 3 }]);
    });

    it("attaches and detaches a venue", async () => {
      await createSportstaette("Halle", null, null, null, 2);
      const [venue] = await getSportstaetten();
      const id = await createTournament("T", "singles", "round_robin", 2, 21);

      await updateTournamentVenueId(id, venue.id);
      expect((await getTournament(id)).venue_id).toBe(venue.id);

      await updateTournamentVenueId(id, null);
      expect((await getTournament(id)).venue_id).toBeNull();
    });
  });

  describe("rounds and matches", () => {
    it("creates a round with a match and reads both back", async () => {
      const ids = await seedPlayers(2);
      const tournamentId = await seedTournament(ids);

      const roundId = await createRound(tournamentId, 1, "ko", null);
      await createMatch(roundId, ids[0], null, ids[1], null, 2);

      const rounds = await getRounds(tournamentId);
      expect(rounds).toHaveLength(1);
      expect(rounds[0]).toMatchObject({ round_number: 1, phase: "ko" });

      const matches = await getMatchesByRound(roundId);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ team1_p1: ids[0], team2_p1: ids[1], court: 2 });
    });

    it("deletes a single round with its matches and sets", async () => {
      const ids = await seedPlayers(2);
      const tournamentId = await seedTournament(ids);
      const roundId = await createRound(tournamentId, 1, null, null);
      await createMatch(roundId, ids[0], null, ids[1], null, null);
      const [match] = await getMatchesByRound(roundId);
      await upsertSet(match.id, 1, 21, 19);

      await deleteRound(roundId);

      expect(await getRounds(tournamentId)).toHaveLength(0);
      expect(await getAllMatchesByTournament(tournamentId)).toHaveLength(0);
      expect(await getAllSetsByTournament(tournamentId)).toHaveLength(0);
    });

    it("reads the sets of one match in order", async () => {
      const ids = await seedPlayers(2);
      const tournamentId = await seedTournament(ids);
      await createSchedule(tournamentId, [
        { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1] }] },
      ]);
      const [match] = await getAllMatchesByTournament(tournamentId);

      await upsertSet(match.id, 2, 15, 21);
      await upsertSet(match.id, 1, 21, 15);

      const sets = await getSetsByMatch(match.id);
      expect(sets.map((x) => x.set_number)).toEqual([1, 2]);
    });

    it("marks and reads the grand-final rounds", async () => {
      const ids = await seedPlayers(2);
      const tournamentId = await seedTournament(ids);
      const roundId = await createRound(tournamentId, 1, "ko", null);

      await markGrandFinalRounds(tournamentId, [roundId, roundId]); // duplicate on purpose
      expect(await getGrandFinalRounds(tournamentId)).toEqual([roundId]);
    });

    it("reopens a completed match", async () => {
      const ids = await seedPlayers(2);
      const tournamentId = await seedTournament(ids);
      await createSchedule(tournamentId, [
        { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1] }] },
      ]);
      const [match] = await getAllMatchesByTournament(tournamentId);
      await updateMatchResult(match.id, 1);

      await reopenMatch(match.id);

      const [stored] = await getAllMatchesByTournament(tournamentId);
      expect(stored.status).toBe("pending");
      expect(stored.winner_team).toBeNull();
    });
  });

  describe("cross-tournament queries", () => {
    it("returns completed matches with the name of their tournament", async () => {
      const ids = await seedPlayers(2);
      const a = await createTournament("Erstes", "singles", "round_robin", 2, 21);
      const b = await createTournament("Zweites", "singles", "round_robin", 2, 21);
      for (const t of [a, b]) {
        for (const pid of ids) await addPlayerToTournament(t, pid);
        await createSchedule(t, [
          { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1] }] },
        ]);
      }
      // Only one of the two is played to the end.
      const [firstMatch] = await getAllMatchesByTournament(a);
      await updateMatchResult(firstMatch.id, 1);

      const rows = await getAllMatchesWithTournament();

      expect(rows).toHaveLength(1);
      expect(rows[0].tournament_name).toBe("Erstes");
      expect(rows[0].tournament_id).toBe(a);
    });

    it("returns the matches of several tournaments in one call", async () => {
      const ids = await seedPlayers(2);
      const a = await createTournament("Erstes", "singles", "round_robin", 2, 21);
      const b = await createTournament("Zweites", "singles", "round_robin", 2, 21);
      const c = await createTournament("Drittes", "singles", "round_robin", 2, 21);
      for (const t of [a, b, c]) {
        for (const pid of ids) await addPlayerToTournament(t, pid);
        await createSchedule(t, [
          { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1] }] },
        ]);
      }

      const rows = await getMatchesForTournaments([a, c]);

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.tournament_id)).toEqual([a, c]);
      // The tournament each match belongs to has to survive the join.
      expect(new Set(rows.map((r) => r.tournament_id))).not.toContain(b);
    });

    it("returns nothing for an empty id list", async () => {
      expect(await getMatchesForTournaments([])).toEqual([]);
    });

    it("returns every set across all tournaments", async () => {
      const ids = await seedPlayers(2);
      const tournamentId = await seedTournament(ids);
      await createSchedule(tournamentId, [
        { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1] }] },
      ]);
      const [match] = await getAllMatchesByTournament(tournamentId);
      await upsertSet(match.id, 1, 21, 15);
      await upsertSet(match.id, 2, 21, 18);

      expect(await getAllSetsFlat()).toHaveLength(2);
    });
  });

  describe("wiping", () => {
    it("removes every player but keeps the venues", async () => {
      await seedPlayers(3);
      await createSportstaette("Bleibt", null, null, null, 2);

      await wipeAllPlayers();

      expect(await getPlayers(true)).toHaveLength(0);
      expect(await getSportstaetten()).toHaveLength(1);
    });

    it("removes every tournament but keeps the players", async () => {
      const ids = await seedPlayers(2);
      const tournamentId = await seedTournament(ids);
      await createSchedule(tournamentId, [
        { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1] }] },
      ]);

      await wipeAllTournaments();

      expect(await getTournaments()).toHaveLength(0);
      expect(await getAllMatchesWithTournament()).toHaveLength(0);
      expect(await getPlayers()).toHaveLength(2);
    });
  });

  // These only make sense against SQL — the fallback has no round trips to
  // count (REVIEW-BACKLOG.md E4).
  describe.skipIf(backend.name !== "SQLite (real migrations)")("round trips", () => {
    it("builds a 16-player round robin in a single transaction", async () => {
      const ids = await seedPlayers(16);
      const tournamentId = await seedTournament(ids);

      // Berger tables: 15 rounds of 8 matches for 16 players.
      const rounds = [];
      for (let r = 0; r < 15; r++) {
        const matches = [];
        for (let m = 0; m < 8; m++) {
          matches.push({ team1_p1: ids[m], team2_p1: ids[15 - m] });
        }
        rounds.push({ roundNumber: r + 1, matches });
      }

      const before = sqlite!.roundTrips;
      await createSchedule(tournamentId, rounds, { status: "active" });
      const spent = sqlite!.roundTrips - before;

      // 135 inserts plus the status update, in one transaction.
      expect(spent).toBe(1);
      expect(await getAllMatchesByTournament(tournamentId)).toHaveLength(120);
    });

    it("seeds every player in a single statement", async () => {
      const ids = await seedPlayers(16);
      const tournamentId = await seedTournament(ids);

      const before = sqlite!.roundTrips;
      await setTournamentSeeds(tournamentId, ids);

      expect(sqlite!.roundTrips - before).toBe(1);
      const ranks = new Map(
        (await getTournamentPlayersDetailed(tournamentId)).map((d) => [d.player.id, d.seed_rank]),
      );
      ids.forEach((id, i) => expect(ranks.get(id), `player ${id}`).toBe(i + 1));
    });

    it("reads the matches of several tournaments in a single query", async () => {
      const ids = await seedPlayers(2);
      const tournamentIds = [];
      for (const name of ["A", "B", "C", "D"]) {
        const t = await createTournament(name, "singles", "round_robin", 2, 21);
        for (const pid of ids) await addPlayerToTournament(t, pid);
        await createSchedule(t, [
          { roundNumber: 1, matches: [{ team1_p1: ids[0], team2_p1: ids[1] }] },
        ]);
        tournamentIds.push(t);
      }

      const before = sqlite!.roundTrips;
      const rows = await getMatchesForTournaments(tournamentIds);

      expect(sqlite!.roundTrips - before).toBe(1);
      expect(rows).toHaveLength(4);
    });
  });
  });
}
