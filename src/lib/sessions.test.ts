// src/lib/sessions.test.ts
//
// Sessions carry the same two-backend split as db.ts, so they get the same
// treatment: every case runs against the fallback and against the real
// SQLite schema (REVIEW-BACKLOG.md C5).

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { createSqliteBackend, DatabaseSync, type SqliteBackend } from "../test/sqliteBackend";
import {
  getSessions,
  getSession,
  getSessionsAtVenue,
  getSessionTournaments,
  createSession,
  updateSession,
  updateSessionStatus,
  deleteSession,
  getSessionEndStats,
  attachTournamentToSession,
  detachTournamentFromSession,
} from "./sessions";
import {
  createSportstaette,
  getSportstaetten,
  createTournament,
  getTournament,
  createSchedule,
  getAllMatchesByTournament,
  updateMatchCourt,
  createPlayer,
  getPlayers,
  addPlayerToTournament,
} from "./db";

let sqlite: SqliteBackend | null = null;

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: async () => sqlite!.database },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string, args?: Record<string, unknown>) =>
    sqlite!.invoke(command, args),
}));

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

async function seedVenue(name = "Sporthalle"): Promise<number> {
  await createSportstaette(name, null, null, null, 4);
  const venues = await getSportstaetten();
  return venues[venues.length - 1].id;
}

for (const backend of BACKENDS) {
  describe.skipIf(!backend.available)(backend.name, () => {
    beforeAll(() => backend.setup());
    afterAll(() => backend.teardown());
    beforeEach(() => backend.clear());

    describe("creating and reading", () => {
      it("creates an active session", async () => {
        const venueId = await seedVenue();
        const id = await createSession("Dienstagstraining", venueId);

        const session = await getSession(id);
        expect(session).toMatchObject({
          name: "Dienstagstraining",
          venue_id: venueId,
          status: "active",
          ended_at: null,
        });
        expect(session!.started_at).toBeTruthy();
      });

      it("creates a session without a venue", async () => {
        const id = await createSession("Ohne Halle", null);
        expect((await getSession(id))!.venue_id).toBeNull();
      });

      it("returns null for an unknown id", async () => {
        expect(await getSession(999)).toBeNull();
      });

      it("lists every session", async () => {
        await createSession("A", null);
        await createSession("B", null);
        expect(await getSessions()).toHaveLength(2);
      });

      it("filters by venue", async () => {
        const first = await seedVenue("Halle A");
        const second = await seedVenue("Halle B");
        await createSession("In A", first);
        await createSession("Auch in A", first);
        await createSession("In B", second);

        const atFirst = await getSessionsAtVenue(first);
        expect(atFirst.map((s) => s.name).sort()).toEqual(["Auch in A", "In A"]);
        expect(await getSessionsAtVenue(second)).toHaveLength(1);
      });

      it("renames a session", async () => {
        const id = await createSession("Alt", null);
        await updateSession(id, "Neu");
        expect((await getSession(id))!.name).toBe("Neu");
      });
    });

    describe("status", () => {
      it("stamps ended_at when the session ends", async () => {
        const id = await createSession("Abend", null);

        await updateSessionStatus(id, "ended");

        const session = await getSession(id);
        expect(session!.status).toBe("ended");
        expect(session!.ended_at).toBeTruthy();
      });

      it("clears ended_at when the session is reopened", async () => {
        const id = await createSession("Abend", null);
        await updateSessionStatus(id, "ended");

        await updateSessionStatus(id, "active");

        const session = await getSession(id);
        expect(session!.status).toBe("active");
        expect(session!.ended_at).toBeNull();
      });
    });

    describe("tournaments in a session", () => {
      it("attaches and detaches a tournament", async () => {
        const sessionId = await createSession("Turniertag", null);
        const tournamentId = await createTournament("Cup", "singles", "round_robin", 2, 21);

        await attachTournamentToSession(tournamentId, sessionId);
        expect((await getTournament(tournamentId)).session_id).toBe(sessionId);
        expect((await getSessionTournaments(sessionId)).map((t) => t.name)).toEqual(["Cup"]);

        await detachTournamentFromSession(tournamentId);
        expect((await getTournament(tournamentId)).session_id).toBeNull();
        expect(await getSessionTournaments(sessionId)).toHaveLength(0);
      });

      it("moves a tournament from one session to another", async () => {
        const first = await createSession("Vormittag", null);
        const second = await createSession("Nachmittag", null);
        const tournamentId = await createTournament("Cup", "singles", "round_robin", 2, 21);

        await attachTournamentToSession(tournamentId, first);
        await attachTournamentToSession(tournamentId, second);

        expect(await getSessionTournaments(first)).toHaveLength(0);
        expect(await getSessionTournaments(second)).toHaveLength(1);
      });

      it("detaches the tournaments when the session is deleted", async () => {
        const sessionId = await createSession("Wird gelöscht", null);
        const tournamentId = await createTournament("Cup", "singles", "round_robin", 2, 21);
        await attachTournamentToSession(tournamentId, sessionId);

        await deleteSession(sessionId);

        expect(await getSession(sessionId)).toBeNull();
        // The tournament survives, just without its session.
        expect((await getTournament(tournamentId)).session_id).toBeNull();
      });
    });

    describe("end-of-session stats", () => {
      it("counts running tournaments and the matches on court", async () => {
        const sessionId = await createSession("Turniertag", null);

        await createPlayer("Anna", "Meier", "f");
        await createPlayer("Ben", "Schulz", "m");
        const playerIds = (await getPlayers()).map((p) => p.id);

        const tournamentId = await createTournament("Läuft", "singles", "round_robin", 2, 21);
        for (const pid of playerIds) await addPlayerToTournament(tournamentId, pid);
        await attachTournamentToSession(tournamentId, sessionId);
        await createSchedule(
          tournamentId,
          [{ roundNumber: 1, matches: [{ team1_p1: playerIds[0], team2_p1: playerIds[1] }] }],
          { status: "active" },
        );
        const [match] = await getAllMatchesByTournament(tournamentId);
        await updateMatchCourt(match.id, 1);

        const stats = await getSessionEndStats(sessionId);

        expect(stats.activeTournaments.map((t) => t.name)).toEqual(["Läuft"]);
        expect(stats.matchesOnCourt).toBe(1);
      });

      it("reports nothing for an empty session", async () => {
        const sessionId = await createSession("Leer", null);
        const stats = await getSessionEndStats(sessionId);

        expect(stats.activeTournaments).toHaveLength(0);
        expect(stats.matchesOnCourt).toBe(0);
      });
    });
  });
}
