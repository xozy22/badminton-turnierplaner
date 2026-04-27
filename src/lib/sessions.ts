// src/lib/sessions.ts
//
// CRUD + helpers for `sessions` — the multi-tournament-workspace concept.
// A session bundles N tournaments running in parallel at the same venue,
// sharing the physical court pool and player conflict awareness.
//
// Sessions are opt-in: tournaments without a session_id keep their pre-
// v2.8 single-tournament behavior. The session table was added by
// migration v12, the FK column on tournaments by v13. ensureExpectedSchema
// in db.ts also self-heals both for users on older DB files.

import { isTauri } from "./db";
import type { Session, SessionStatus, Tournament } from "./types";

// Internal helpers — keep this file decoupled from db.ts internals so it
// can be imported anywhere without circular imports. Both backends are
// proxied through narrow getters.
async function getDb() {
  // Late-import: only loads tauri-plugin-sql when actually running in Tauri.
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const { invoke } = await import("@tauri-apps/api/core");
  const dbPath = await invoke<string>("get_db_path");
  return Database.load(`sqlite:${dbPath}`);
}

// ---- LocalStorage fallback (parity with db.ts loadStore/saveStore) ----

interface LocalStoreShape {
  sessions?: Session[];
  tournaments?: Tournament[];
  nextId?: { sessions?: number; [k: string]: number | undefined };
  [k: string]: unknown;
}

function loadLocalStore(): LocalStoreShape {
  const raw = localStorage.getItem("turnierplaner");
  if (!raw) return { sessions: [], tournaments: [], nextId: { sessions: 1 } };
  try {
    const parsed = JSON.parse(raw) as LocalStoreShape;
    if (!parsed.sessions) parsed.sessions = [];
    if (!parsed.nextId) parsed.nextId = {};
    if (!parsed.nextId.sessions) parsed.nextId.sessions = 1;
    return parsed;
  } catch {
    return { sessions: [], tournaments: [], nextId: { sessions: 1 } };
  }
}

function saveLocalStore(store: LocalStoreShape): void {
  localStorage.setItem("turnierplaner", JSON.stringify(store));
}

// ---- Read API ----

/** All sessions, newest first (by id desc, which matches creation order). */
export async function getSessions(): Promise<Session[]> {
  if (isTauri()) {
    const d = await getDb();
    return d.select<Session[]>("SELECT * FROM sessions ORDER BY id DESC");
  }
  const store = loadLocalStore();
  return [...(store.sessions ?? [])].sort((a, b) => b.id - a.id);
}

export async function getSession(id: number): Promise<Session | null> {
  if (isTauri()) {
    const d = await getDb();
    const rows = await d.select<Session[]>("SELECT * FROM sessions WHERE id = $1", [id]);
    return rows[0] ?? null;
  }
  const store = loadLocalStore();
  return (store.sessions ?? []).find((s) => s.id === id) ?? null;
}

/** All sessions tied to a venue, regardless of status. */
export async function getSessionsAtVenue(venueId: number): Promise<Session[]> {
  if (isTauri()) {
    const d = await getDb();
    return d.select<Session[]>(
      "SELECT * FROM sessions WHERE venue_id = $1 ORDER BY id DESC",
      [venueId],
    );
  }
  const store = loadLocalStore();
  return (store.sessions ?? [])
    .filter((s) => s.venue_id === venueId)
    .sort((a, b) => b.id - a.id);
}

/** Tournaments currently attached to the session. */
export async function getSessionTournaments(sessionId: number): Promise<Tournament[]> {
  if (isTauri()) {
    const d = await getDb();
    return d.select<Tournament[]>(
      "SELECT * FROM tournaments WHERE session_id = $1 ORDER BY id ASC",
      [sessionId],
    );
  }
  const store = loadLocalStore();
  return (store.tournaments ?? []).filter((t) => (t as Tournament).session_id === sessionId);
}

// ---- Write API ----

/**
 * Create a new session. `venueId` may be null for legacy sessions without
 * a fixed venue — the cross-tournament helpers still work but can't
 * derive shared courts (since there's no venue.halls to consult).
 */
export async function createSession(name: string, venueId: number | null): Promise<number> {
  if (isTauri()) {
    const d = await getDb();
    const result = await d.execute(
      "INSERT INTO sessions (name, venue_id) VALUES ($1, $2)",
      [name, venueId],
    );
    return result.lastInsertId!;
  }
  const store = loadLocalStore();
  const id = (store.nextId?.sessions ?? 1);
  if (!store.sessions) store.sessions = [];
  if (!store.nextId) store.nextId = {};
  store.sessions.push({
    id,
    venue_id: venueId,
    name,
    started_at: new Date().toISOString(),
    ended_at: null,
    status: "active",
  });
  store.nextId.sessions = id + 1;
  saveLocalStore(store);
  return id;
}

/** Update mutable fields on a session (currently just name). */
export async function updateSession(id: number, name: string): Promise<void> {
  if (isTauri()) {
    const d = await getDb();
    await d.execute("UPDATE sessions SET name = $1 WHERE id = $2", [name, id]);
    return;
  }
  const store = loadLocalStore();
  const s = (store.sessions ?? []).find((x) => x.id === id);
  if (s) s.name = name;
  saveLocalStore(store);
}

/**
 * Transition a session's status. Going to "ended" sets the ended_at
 * timestamp; going back to "active" clears it. Tournaments stay attached
 * regardless of session status — they can keep running independently.
 */
export async function updateSessionStatus(id: number, status: SessionStatus): Promise<void> {
  if (isTauri()) {
    const d = await getDb();
    if (status === "ended") {
      await d.execute(
        "UPDATE sessions SET status = $1, ended_at = datetime('now') WHERE id = $2",
        [status, id],
      );
    } else if (status === "active") {
      await d.execute(
        "UPDATE sessions SET status = $1, ended_at = NULL WHERE id = $2",
        [status, id],
      );
    } else {
      await d.execute("UPDATE sessions SET status = $1 WHERE id = $2", [status, id]);
    }
    return;
  }
  const store = loadLocalStore();
  const s = (store.sessions ?? []).find((x) => x.id === id);
  if (s) {
    s.status = status;
    if (status === "ended") s.ended_at = new Date().toISOString();
    else if (status === "active") s.ended_at = null;
  }
  saveLocalStore(store);
}

/** Delete a session entirely. Tournaments get session_id detached (the
 *  FK declares ON DELETE SET NULL but SQLite enforces that only when
 *  PRAGMA foreign_keys is on — we set it on connect, so this is safe). */
export async function deleteSession(id: number): Promise<void> {
  if (isTauri()) {
    const d = await getDb();
    // Defensive manual detach in addition to the FK cascade — handles the
    // edge case where foreign_keys is off (e.g. legacy DBs).
    await d.execute("UPDATE tournaments SET session_id = NULL WHERE session_id = $1", [id]);
    await d.execute("DELETE FROM sessions WHERE id = $1", [id]);
    return;
  }
  const store = loadLocalStore();
  store.sessions = (store.sessions ?? []).filter((s) => s.id !== id);
  for (const t of (store.tournaments ?? [])) {
    if ((t as Tournament).session_id === id) (t as Tournament).session_id = null;
  }
  saveLocalStore(store);
}

// ---- Tournament <-> Session linking ----

export async function attachTournamentToSession(
  tournamentId: number,
  sessionId: number,
): Promise<void> {
  if (isTauri()) {
    const d = await getDb();
    await d.execute(
      "UPDATE tournaments SET session_id = $1 WHERE id = $2",
      [sessionId, tournamentId],
    );
    return;
  }
  const store = loadLocalStore();
  const t = (store.tournaments ?? []).find((x) => x.id === tournamentId) as Tournament | undefined;
  if (t) t.session_id = sessionId;
  saveLocalStore(store);
}

export async function detachTournamentFromSession(tournamentId: number): Promise<void> {
  if (isTauri()) {
    const d = await getDb();
    await d.execute(
      "UPDATE tournaments SET session_id = NULL WHERE id = $1",
      [tournamentId],
    );
    return;
  }
  const store = loadLocalStore();
  const t = (store.tournaments ?? []).find((x) => x.id === tournamentId) as Tournament | undefined;
  if (t) t.session_id = null;
  saveLocalStore(store);
}
