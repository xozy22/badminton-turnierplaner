import type {
  Player,
  Gender,
  Sportstaette,
  Tournament,
  TournamentMode,
  TournamentFormat,
  TournamentPlayerInfo,
  PaymentStatus,
  PaymentMethod,
  Round,
  Match,
  MatchOutcome,
  GameSet,
} from "./types";
import { playerDisplayName } from "./types";
import { nowIso, byNewest } from "./datetime";
import { notifyDataChanged } from "./changeEvents";

// DB row type for type safety
interface PlayerRow {
  id: number; name: string; gender: string; age: number | null; club: string | null;
  birth_year: number | null; birth_date: string | null; first_name: string | null; last_name: string | null;
  created_at: string; archived_at: string | null;
}
interface TournamentPlayerRow extends PlayerRow {
  retired: number; payment_status: string; payment_method: string | null; paid_date: string | null;
  seed_rank: number | null;
}

/**
 * Maps a `players` row to the domain type.
 *
 * Since migration v18 `first_name` / `last_name` are guaranteed to be
 * filled, so the old "if first_name is empty, split `name` at the first
 * space" reconstruction is gone — it existed in three copies (C6).
 */
function rowToPlayer(r: PlayerRow): Player {
  return {
    id: r.id,
    first_name: r.first_name ?? "",
    last_name: r.last_name ?? "",
    gender: r.gender as Gender,
    birth_date: r.birth_date ?? null,
    club: r.club,
    created_at: r.created_at,
    archived_at: r.archived_at ?? null,
  };
}

/**
 * The part of tauri-plugin-sql's `Database` this app actually uses.
 *
 * The plugin ships no usable type for the loaded instance, so it used to be
 * held as `any` — which meant a renamed column only showed up at runtime
 * (REVIEW-BACKLOG.md D9).
 */
interface SqlDatabase {
  select<T = unknown>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(
    query: string,
    bindValues?: unknown[],
  ): Promise<{ rowsAffected: number; lastInsertId?: number }>;
}

// ---- Detect if running inside Tauri ----
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

// =============================================
// Tauri SQLite Backend
// =============================================
let tauriDb: SqlDatabase | null = null;

async function getTauriDb(): Promise<SqlDatabase> {
  if (!tauriDb) {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const { invoke } = await import("@tauri-apps/api/core");
    // DB-Pfad vom Rust-Backend holen (beruecksichtigt custom Speicherort)
    const dbPath = await invoke<string>("get_db_path");
    tauriDb = await Database.load(`sqlite:${dbPath}`);
    // Foreign keys are already enforced: sqlx (via tauri-plugin-sql) sends
    // `PRAGMA foreign_keys = ON` on every connection it opens. This call is
    // therefore redundant on the pool connection it happens to land on, and
    // it never was the thing that made enforcement reliable — keeping it
    // only as a belt-and-braces no-op for non-sqlx backends.
    await tauriDb.execute("PRAGMA foreign_keys = ON");
    // Fail loudly if the migrations did not produce the expected schema —
    // see verifySchema below.
    await verifySchema(tauriDb);
  }
  return tauriDb;
}

/**
 * Verifies that the migrations actually ran, instead of quietly repairing
 * the schema on every start.
 *
 * The previous version issued an ALTER TABLE for every column the code
 * expects, wrapped in try/catch. That hid migration failures rather than
 * surfacing them — a database that silently lost a migration kept limping
 * along until an INSERT hit the missing column mid-tournament
 * (REVIEW-BACKLOG.md C7). Now a mismatch is reported loudly and the caller
 * can show it, because a wrong schema is a problem to fix before the first
 * match, not during it.
 */
export class SchemaMismatchError extends Error {
  missing: string[];

  constructor(missing: string[]) {
    super(`Database schema is incomplete: ${missing.join(", ")}`);
    this.name = "SchemaMismatchError";
    this.missing = missing;
  }
}

/** Columns and tables every current code path relies on. */
const REQUIRED_SCHEMA: Record<string, string[]> = {
  players: ["id", "name", "first_name", "last_name", "gender", "birth_date", "club", "created_at", "archived_at"],
  tournaments: [
    "id", "name", "mode", "format", "sets_to_win", "points_per_set", "cap",
    "ko_points_per_set", "ko_sets_to_win", "ko_cap", "courts", "num_groups",
    "qualify_per_group", "current_phase", "entry_fee_single", "entry_fee_double",
    "team_config", "hall_config", "venue_id", "min_rest_minutes",
    "enable_third_place", "session_id", "planned_rounds", "play_date", "start_time",
    "created_at", "status",
  ],
  tournament_players: [
    "tournament_id", "player_id", "retired", "payment_status",
    "payment_method", "paid_date", "seed_rank",
  ],
  rounds: ["id", "tournament_id", "round_number", "phase", "group_number"],
  matches: [
    "id", "round_id", "team1_p1", "team1_p2", "team2_p1", "team2_p2",
    "winner_team", "status", "walkover", "outcome", "court", "court_assigned_at",
    "started_at", "completed_at",
  ],
  sets: ["id", "match_id", "set_number", "team1_score", "team2_score"],
  sessions: ["id", "venue_id", "name", "started_at", "ended_at", "status"],
  sportstaetten: ["id", "name", "address", "zip", "city", "courts", "halls", "created_at"],
  app_settings: ["key", "value"],
};

async function verifySchema(db: SqlDatabase): Promise<void> {
  const missing: string[] = [];

  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    const info: { name: string }[] = await db.select(`PRAGMA table_info(${table})`);
    if (info.length === 0) {
      missing.push(`table ${table}`);
      continue;
    }
    const present = new Set(info.map((c) => c.name));
    for (const column of columns) {
      if (!present.has(column)) missing.push(`${table}.${column}`);
    }
  }

  if (missing.length > 0) {
    console.error("verifySchema: database does not match the expected schema:", missing);
    throw new SchemaMismatchError(missing);
  }
}

// =============================================
// LocalStorage Fallback Backend (for browser debugging)
// =============================================
/**
 * A tournament-player link in the fallback store. The Tauri backend keeps
 * these fields as columns on `tournament_players`; typing them here too is
 * what removes the `as any` casts that used to litter every write path
 * (REVIEW-BACKLOG.md D9).
 */
interface StoredTournamentPlayer {
  tournament_id: number;
  player_id: number;
  retired: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  paid_date: string | null;
  seed_rank: number | null;
}

interface LocalStore {
  players: Player[];
  sportstaetten: Sportstaette[];
  tournaments: Tournament[];
  tournamentPlayers: StoredTournamentPlayer[];
  rounds: Round[];
  matches: Match[];
  sets: GameSet[];
  sessions: import("./types").Session[];
  nextId: { [table: string]: number };
}

/** A fresh link row with the same defaults the SQL schema uses. */
function newTournamentPlayer(tournamentId: number, playerId: number): StoredTournamentPlayer {
  return {
    tournament_id: tournamentId,
    player_id: playerId,
    retired: 0,
    payment_status: "unpaid",
    payment_method: null,
    paid_date: null,
    seed_rank: null,
  };
}

function loadStore(): LocalStore {
  const defaults: LocalStore = {
    players: [],
    sportstaetten: [],
    tournaments: [],
    tournamentPlayers: [],
    rounds: [],
    matches: [],
    sets: [],
    sessions: [],
    nextId: { players: 1, sportstaetten: 1, tournaments: 1, rounds: 1, matches: 1, sets: 1, sessions: 1 },
  };
  const raw = localStorage.getItem("turnierplaner");
  if (raw) {
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed, nextId: { ...defaults.nextId, ...parsed.nextId } };
  }
  return defaults;
}

function saveStore(store: LocalStore) {
  localStorage.setItem("turnierplaner", JSON.stringify(store));
}

function nextId(store: LocalStore, table: string): number {
  const id = store.nextId[table] || 1;
  store.nextId[table] = id + 1;
  return id;
}

// =============================================
// Unified API
// =============================================

// --- Players ---

/**
 * Active players, i.e. everyone who is not archived. Pass
 * `includeArchived` to get the full roster — the player management page
 * uses that to show and restore archived entries.
 */
export async function getPlayers(includeArchived = false): Promise<Player[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    const rows: PlayerRow[] = await d.select(
      includeArchived
        ? "SELECT * FROM players ORDER BY name"
        : "SELECT * FROM players WHERE archived_at IS NULL ORDER BY name",
    );
    return rows.map(rowToPlayer);
  }
  const store = loadStore();
  return [...store.players]
    .filter((p) => includeArchived || !p.archived_at)
    .sort((a, b) => playerDisplayName(a).localeCompare(playerDisplayName(b)));
}

export async function createPlayer(firstName: string, lastName: string, gender: Gender, birthDate?: string | null, club?: string | null): Promise<void> {
  const fn = (firstName || "").trim();
  const ln = (lastName || "").trim();
  // `name` is kept in sync because ORDER BY and the published snapshots
  // still read it; first_name/last_name are the source of truth (C6).
  const fullName = ln ? `${fn} ${ln}` : fn;
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute(
      "INSERT INTO players (name, first_name, last_name, gender, birth_date, club) VALUES ($1, $2, $3, $4, $5, $6)",
      [fullName, fn, ln, gender, birthDate || null, club || null],
    );
    return;
  }
  const store = loadStore();
  store.players.push({
    id: nextId(store, "players"),
    first_name: fn,
    last_name: ln,
    gender,
    birth_date: birthDate ?? null,
    club: club ?? null,
    created_at: nowIso(),
    archived_at: null,
  });
  saveStore(store);
}

export async function updatePlayer(id: number, firstName: string, lastName: string, gender: Gender, birthDate?: string | null, club?: string | null): Promise<void> {
  const fn = (firstName || "").trim();
  const ln = (lastName || "").trim();
  const fullName = ln ? `${fn} ${ln}` : fn;
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute(
      "UPDATE players SET name = $1, first_name = $2, last_name = $3, gender = $4, birth_date = $5, club = $6 WHERE id = $7",
      [fullName, fn, ln, gender, birthDate ?? null, club ?? null, id],
    );
    return;
  }
  const store = loadStore();
  const p = store.players.find((p) => p.id === id);
  if (p) {
    p.first_name = firstName;
    p.last_name = lastName;
    p.gender = gender;
    p.birth_date = birthDate ?? null;
    p.club = club ?? null;
  }
  saveStore(store);
}

/**
 * Tournaments in which `playerId` appears in at least one match. A player
 * with any entry here cannot be deleted: `matches` references `players`
 * without ON DELETE, so SQLite refuses the delete (foreign keys are on —
 * sqlx enables them for every connection).
 */
export async function getPlayerMatchUsage(id: number): Promise<{ id: number; name: string }[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    return d.select(
      `SELECT DISTINCT t.id, t.name
         FROM matches m
         JOIN rounds r ON m.round_id = r.id
         JOIN tournaments t ON r.tournament_id = t.id
        WHERE m.team1_p1 = $1 OR m.team1_p2 = $1 OR m.team2_p1 = $1 OR m.team2_p2 = $1
        ORDER BY t.id`,
      [id],
    );
  }
  const store = loadStore();
  const matchRoundIds = new Set(
    store.matches
      .filter((m) => [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].includes(id))
      .map((m) => m.round_id),
  );
  const tournamentIds = new Set(
    store.rounds.filter((r) => matchRoundIds.has(r.id)).map((r) => r.tournament_id),
  );
  return store.tournaments
    .filter((t) => tournamentIds.has(t.id))
    .map((t) => ({ id: t.id, name: t.name }));
}

/** Thrown by deletePlayer when the player still appears in played matches. */
export class PlayerInUseError extends Error {
  tournaments: { id: number; name: string }[];

  constructor(tournaments: { id: number; name: string }[]) {
    super(`Player is referenced by matches in: ${tournaments.map((t) => t.name).join(", ")}`);
    this.name = "PlayerInUseError";
    this.tournaments = tournaments;
  }
}

/**
 * Removes a player from the active roster.
 *
 * With match history the row has to stay — deleting it would break the
 * foreign keys and turn the name into a "?" in finished tournaments — so
 * the player is archived instead. Without history they are deleted for
 * real. The return value says which of the two happened, so the UI can
 * report it (REVIEW-BACKLOG.md C8).
 */
export async function removePlayer(id: number): Promise<"deleted" | "archived"> {
  const usage = await getPlayerMatchUsage(id);
  if (usage.length > 0) {
    await archivePlayer(id);
    return "archived";
  }
  await deletePlayer(id);
  return "deleted";
}

/** Hides a player from the pickers, keeping their history intact. */
export async function archivePlayer(id: number): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE players SET archived_at = $1 WHERE id = $2", [nowIso(), id]);
    return;
  }
  const store = loadStore();
  const p = store.players.find((p) => p.id === id);
  if (p) p.archived_at = nowIso();
  saveStore(store);
}

/** Brings an archived player back into the active roster. */
export async function restorePlayer(id: number): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE players SET archived_at = NULL WHERE id = $1", [id]);
    return;
  }
  const store = loadStore();
  const p = store.players.find((p) => p.id === id);
  if (p) p.archived_at = null;
  saveStore(store);
}

export async function deletePlayer(id: number): Promise<void> {
  // Guard first so the caller gets a typed error naming the tournaments,
  // instead of a bare "FOREIGN KEY constraint failed" from SQLite.
  const usage = await getPlayerMatchUsage(id);
  if (usage.length > 0) throw new PlayerInUseError(usage);

  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("DELETE FROM tournament_players WHERE player_id = $1", [id]);
    await d.execute("DELETE FROM players WHERE id = $1", [id]);
    return;
  }
  const store = loadStore();
  store.players = store.players.filter((p) => p.id !== id);
  store.tournamentPlayers = store.tournamentPlayers.filter((tp) => tp.player_id !== id);
  saveStore(store);
}

// --- Sportstaetten ---

export async function getSportstaetten(): Promise<Sportstaette[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    return d.select("SELECT * FROM sportstaetten ORDER BY name");
  }
  const store = loadStore();
  return [...store.sportstaetten].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createSportstaette(name: string, address: string | null, zip: string | null, city: string | null, courts: number, halls: string | null = null): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("INSERT INTO sportstaetten (name, address, zip, city, courts, halls) VALUES ($1, $2, $3, $4, $5, $6)", [name, address, zip, city, courts, halls]);
    return;
  }
  const store = loadStore();
  store.sportstaetten.push({
    id: nextId(store, "sportstaetten"),
    name,
    address,
    zip,
    city,
    courts,
    halls,
    created_at: nowIso(),
  });
  saveStore(store);
}

export async function updateSportstaette(id: number, name: string, address: string | null, zip: string | null, city: string | null, courts: number, halls: string | null = null): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE sportstaetten SET name = $1, address = $2, zip = $3, city = $4, courts = $5, halls = $6 WHERE id = $7", [name, address, zip, city, courts, halls, id]);
    return;
  }
  const store = loadStore();
  const s = store.sportstaetten.find((s) => s.id === id);
  if (s) {
    s.name = name;
    s.address = address;
    s.zip = zip;
    s.city = city;
    s.courts = courts;
    s.halls = halls;
  }
  saveStore(store);
}

/**
 * Returns the in-use counts for a venue: how many active/draft tournaments
 * and how many active sessions reference it. A venue with any non-zero count
 * MUST NOT be deleted — it would orphan the live data and break the session
 * dashboard's hall_config lookup.
 *
 * "In use" semantics:
 *  - Tournaments: status IN ('draft', 'active') count. Completed and
 *    archived tournaments don't block delete (the venue link there is
 *    historical reference only — losing it doesn't break ongoing work).
 *  - Sessions: status = 'active' counts. Ended/archived sessions don't
 *    block delete for the same historical-reference reason.
 */
export interface VenueUsage {
  activeTournaments: { id: number; name: string; status: string }[];
  activeSessions: { id: number; name: string }[];
}

export async function getVenueUsage(id: number): Promise<VenueUsage> {
  if (isTauri()) {
    const d = await getTauriDb();
    const tournaments: { id: number; name: string; status: string }[] = await d.select(
      "SELECT id, name, status FROM tournaments WHERE venue_id = $1 AND status IN ('draft', 'active') ORDER BY id ASC",
      [id],
    );
    const sessions: { id: number; name: string }[] = await d.select(
      "SELECT id, name FROM sessions WHERE venue_id = $1 AND status = 'active' ORDER BY id ASC",
      [id],
    );
    return { activeTournaments: tournaments, activeSessions: sessions };
  }
  const store = loadStore();
  const tournaments = (store.tournaments ?? [])
    .filter((tt) => tt.venue_id === id && (tt.status === "draft" || tt.status === "active"))
    .map((tt) => ({ id: tt.id, name: tt.name, status: tt.status }));
  const sessionsArr = store.sessions ?? [];
  const sessions = sessionsArr
    .filter((ss) => ss.venue_id === id && ss.status === "active")
    .map((ss) => ({ id: ss.id, name: ss.name }));
  return { activeTournaments: tournaments, activeSessions: sessions };
}

/**
 * Thrown when a venue still has tournaments or sessions attached.
 *
 * Carries the blockers as data rather than as a sentence: the message used
 * to be hard-coded German and was shown verbatim to English users
 * (REVIEW-BACKLOG.md H1). It stays readable for logs, but the UI builds
 * its own text from `tournaments` and `sessions`.
 */
export class VenueInUseError extends Error {
  tournaments: { id: number; name: string; status: string }[];
  sessions: { id: number; name: string }[];

  constructor(
    tournaments: { id: number; name: string; status: string }[],
    sessions: { id: number; name: string }[],
  ) {
    const names = [...tournaments, ...sessions].map((x) => x.name).join(", ");
    super(`Venue is still in use by: ${names}`);
    this.name = "VenueInUseError";
    this.tournaments = tournaments;
    this.sessions = sessions;
  }
}

export async function deleteSportstaette(id: number): Promise<void> {
  // Defense in depth: even if the UI somehow misses the guard, the DB
  // layer throws a typed error so the caller can surface it.
  const usage = await getVenueUsage(id);
  if (usage.activeTournaments.length > 0 || usage.activeSessions.length > 0) {
    throw new VenueInUseError(usage.activeTournaments, usage.activeSessions);
  }
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("DELETE FROM sportstaetten WHERE id = $1", [id]);
    return;
  }
  const store = loadStore();
  store.sportstaetten = store.sportstaetten.filter((s) => s.id !== id);
  saveStore(store);
}

// --- Tournaments ---

function normalizeTournament(t: Tournament): Tournament {
  // Defensive defaults for columns added by later migrations / older
  // localStorage rows that may pre-date them.
  return {
    ...t,
    enable_third_place: t.enable_third_place ?? 0,
    session_id: t.session_id ?? null,
    planned_rounds: t.planned_rounds ?? null,
    play_date: t.play_date ?? null,
    start_time: t.start_time ?? null,
  };
}

export async function getTournaments(): Promise<Tournament[]> {
  // `id DESC` is the tie-breaker, not decoration: SQLite fills created_at
  // from datetime('now'), which is only accurate to the second, so two
  // tournaments created in the same second sort arbitrarily — and not even
  // stably between two calls. The fallback stores milliseconds and would
  // never have shown it (REVIEW-BACKLOG.md C5).
  if (isTauri()) {
    const d = await getTauriDb();
    const rows: Tournament[] = await d.select(
      "SELECT * FROM tournaments ORDER BY created_at DESC, id DESC",
    );
    return rows.map(normalizeTournament);
  }
  const store = loadStore();
  return [...store.tournaments]
    .sort((a, b) => byNewest(a.created_at, b.created_at) || b.id - a.id)
    .map(normalizeTournament);
}

export async function getTournament(id: number): Promise<Tournament> {
  if (isTauri()) {
    const d = await getTauriDb();
    const rows: Tournament[] = await d.select("SELECT * FROM tournaments WHERE id = $1", [id]);
    if (!rows[0]) throw new Error(`Tournament ${id} not found`);
    return normalizeTournament(rows[0]);
  }
  const store = loadStore();
  const t = store.tournaments.find((t) => t.id === id);
  if (!t) throw new Error(`Tournament ${id} not found`);
  return normalizeTournament(t);
}

/**
 * Fields added after the positional signature had already grown too long.
 *
 * `playDate` and `startTime` say when the tournament is played, as opposed
 * to `created_at`, which says when the row was written (FEATURE-BACKLOG.md
 * A1). Both may be null: a tournament set up on the spot has no separate
 * date worth recording.
 */
export interface TournamentSchedule {
  /** ISO date, YYYY-MM-DD. Absent on an update leaves the column alone. */
  playDate?: string | null;
  /** 24-hour clock, HH:MM. Absent on an update leaves the column alone. */
  startTime?: string | null;
}

export async function createTournament(
  name: string,
  mode: TournamentMode,
  format: TournamentFormat,
  setsToWin: number,
  pointsPerSet: number,
  courts: number = 1,
  numGroups: number = 0,
  qualifyPerGroup: number = 0,
  entryFeeSingle: number = 0,
  entryFeeDouble: number = 0,
  cap: number | null = null,
  minRestMinutes: number = 0,
  enableThirdPlace: boolean = false,
  schedule: TournamentSchedule = {}
): Promise<number> {
  const ttp = enableThirdPlace ? 1 : 0;
  const playDate = schedule.playDate ?? null;
  const startTime = schedule.startTime ?? null;
  if (isTauri()) {
    const d = await getTauriDb();
    const result = await d.execute(
      "INSERT INTO tournaments (name, mode, format, sets_to_win, points_per_set, courts, num_groups, qualify_per_group, entry_fee_single, entry_fee_double, cap, min_rest_minutes, enable_third_place, play_date, start_time) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
      [name, mode, format, setsToWin, pointsPerSet, courts, numGroups, qualifyPerGroup, entryFeeSingle, entryFeeDouble, cap, minRestMinutes, ttp, playDate, startTime]
    );
    return result.lastInsertId!;
  }
  const store = loadStore();
  const id = nextId(store, "tournaments");
  store.tournaments.push({
    id,
    name,
    mode,
    format,
    sets_to_win: setsToWin,
    points_per_set: pointsPerSet,
    cap,
    ko_points_per_set: null,
    ko_sets_to_win: null,
    ko_cap: null,
    courts,
    num_groups: numGroups,
    qualify_per_group: qualifyPerGroup,
    current_phase: null,
    entry_fee_single: entryFeeSingle,
    entry_fee_double: entryFeeDouble,
    team_config: null,
    hall_config: null,
    venue_id: null,
    min_rest_minutes: minRestMinutes,
    enable_third_place: ttp,
    play_date: playDate,
    start_time: startTime,
    session_id: null,
    planned_rounds: null,
    created_at: nowIso(),
    status: "draft",
  });
  saveStore(store);
  return id;
}

export async function updateTournament(
  id: number,
  name: string,
  mode: TournamentMode,
  format: TournamentFormat,
  setsToWin: number,
  pointsPerSet: number,
  courts: number,
  numGroups: number,
  qualifyPerGroup: number,
  entryFeeSingle: number = 0,
  entryFeeDouble: number = 0,
  cap: number | null = null,
  minRestMinutes: number = 0,
  enableThirdPlace: boolean = false,
  schedule: TournamentSchedule = {}
): Promise<void> {
  const ttp = enableThirdPlace ? 1 : 0;
  // A key that is not there means "leave this column alone"; an explicit
  // null clears it. Every other caller of this function passes no
  // schedule at all, and the create wizard auto-saves once a second --
  // writing null unconditionally erased the date the user had just typed.
  const args: (string | number | null)[] = [
    name, mode, format, setsToWin, pointsPerSet, courts, numGroups,
    qualifyPerGroup, entryFeeSingle, entryFeeDouble, cap, minRestMinutes, ttp,
  ];
  const sets = [
    "name=$1", "mode=$2", "format=$3", "sets_to_win=$4", "points_per_set=$5",
    "courts=$6", "num_groups=$7", "qualify_per_group=$8", "entry_fee_single=$9",
    "entry_fee_double=$10", "cap=$11", "min_rest_minutes=$12",
    "enable_third_place=$13",
  ];
  if ("playDate" in schedule) {
    args.push(schedule.playDate ?? null);
    sets.push(`play_date=$${args.length}`);
  }
  if ("startTime" in schedule) {
    args.push(schedule.startTime ?? null);
    sets.push(`start_time=$${args.length}`);
  }
  if (isTauri()) {
    const d = await getTauriDb();
    args.push(id);
    await d.execute(
      `UPDATE tournaments SET ${sets.join(", ")} WHERE id=$${args.length}`,
      args
    );
    return;
  }
  const store = loadStore();
  const t = store.tournaments.find((t) => t.id === id);
  if (t) {
    t.name = name;
    t.mode = mode;
    t.format = format;
    t.sets_to_win = setsToWin;
    t.points_per_set = pointsPerSet;
    t.cap = cap;
    t.courts = courts;
    t.num_groups = numGroups;
    t.qualify_per_group = qualifyPerGroup;
    t.entry_fee_single = entryFeeSingle;
    t.entry_fee_double = entryFeeDouble;
    t.min_rest_minutes = minRestMinutes;
    t.enable_third_place = ttp;
    if ("playDate" in schedule) t.play_date = schedule.playDate ?? null;
    if ("startTime" in schedule) t.start_time = schedule.startTime ?? null;
  }
  saveStore(store);
}

export async function updateTeamConfig(id: number, teamConfig: [number, number][] | null): Promise<void> {
  const json = teamConfig ? JSON.stringify(teamConfig) : null;
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE tournaments SET team_config=$1 WHERE id=$2", [json, id]);
    return;
  }
  const store = loadStore();
  const t = store.tournaments.find((t) => t.id === id);
  if (t) t.team_config = json;
  saveStore(store);
}

export async function updateHallConfig(id: number, hallConfig: import("./types").HallConfig[] | null): Promise<void> {
  const json = hallConfig && hallConfig.length > 0 ? JSON.stringify(hallConfig) : null;
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE tournaments SET hall_config=$1 WHERE id=$2", [json, id]);
    return;
  }
  const store = loadStore();
  const t = store.tournaments.find((t) => t.id === id);
  if (t) t.hall_config = json;
  saveStore(store);
}

export async function updateTournamentVenueId(id: number, venueId: number | null): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE tournaments SET venue_id=$1 WHERE id=$2", [venueId, id]);
    return;
  }
  const store = loadStore();
  const t = store.tournaments.find((t) => t.id === id);
  if (t) t.venue_id = venueId;
  saveStore(store);
}

export async function updateTournamentPhase(id: number, phase: string | null): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE tournaments SET current_phase = $1 WHERE id = $2", [phase, id]);
    await notifyDataChanged({ kind: "tournament", tournamentId: id });
    return;
  }
  const store = loadStore();
  const t = store.tournaments.find((t) => t.id === id);
  if (t) t.current_phase = phase as Tournament["current_phase"];
  saveStore(store);
  await notifyDataChanged({ kind: "tournament", tournamentId: id });
}

export async function updateTournamentKoScoring(
  id: number,
  koPointsPerSet: number | null,
  koSetsToWin: number | null,
  koCap: number | null
): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute(
      "UPDATE tournaments SET ko_points_per_set=$1, ko_sets_to_win=$2, ko_cap=$3 WHERE id=$4",
      [koPointsPerSet, koSetsToWin, koCap, id]
    );
    return;
  }
  const store = loadStore();
  const t = store.tournaments.find((t) => t.id === id);
  if (t) {
    t.ko_points_per_set = koPointsPerSet;
    t.ko_sets_to_win = koSetsToWin;
    t.ko_cap = koCap;
  }
  saveStore(store);
}

export async function updateTournamentStatus(id: number, status: string): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE tournaments SET status = $1 WHERE id = $2", [status, id]);
    await notifyDataChanged({ kind: "tournament", tournamentId: id });
    return;
  }
  const store = loadStore();
  const t = store.tournaments.find((t) => t.id === id);
  if (t) t.status = status as Tournament["status"];
  saveStore(store);
  await notifyDataChanged({ kind: "tournament", tournamentId: id });
}

export async function deleteTournament(id: number): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    // Get round IDs first, then delete step by step (avoid subquery issues)
    const rounds: { id: number }[] = await d.select(
      "SELECT id FROM rounds WHERE tournament_id = $1", [id]
    );
    const roundIds = rounds.map(r => r.id);
    for (const rid of roundIds) {
      const matches: { id: number }[] = await d.select(
        "SELECT id FROM matches WHERE round_id = $1", [rid]
      );
      for (const m of matches) {
        await d.execute("DELETE FROM sets WHERE match_id = $1", [m.id]);
      }
      await d.execute("DELETE FROM matches WHERE round_id = $1", [rid]);
    }
    await d.execute("DELETE FROM rounds WHERE tournament_id = $1", [id]);
    await d.execute("DELETE FROM tournament_players WHERE tournament_id = $1", [id]);
    await d.execute("DELETE FROM tournaments WHERE id = $1", [id]);
    await deleteTournamentSettings(id);
    return;
  }
  const store = loadStore();
  const roundIds = store.rounds.filter((r) => r.tournament_id === id).map((r) => r.id);
  const matchIds = store.matches.filter((m) => roundIds.includes(m.round_id)).map((m) => m.id);
  store.sets = store.sets.filter((s) => !matchIds.includes(s.match_id));
  store.matches = store.matches.filter((m) => !roundIds.includes(m.round_id));
  store.rounds = store.rounds.filter((r) => r.tournament_id !== id);
  store.tournamentPlayers = store.tournamentPlayers.filter((tp) => tp.tournament_id !== id);
  store.tournaments = store.tournaments.filter((t) => t.id !== id);
  saveStore(store);
  await deleteTournamentSettings(id);
}

// --- Tournament Players ---

export async function getTournamentPlayers(tournamentId: number): Promise<Player[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    const rows: PlayerRow[] = await d.select(
      "SELECT p.* FROM players p JOIN tournament_players tp ON p.id = tp.player_id WHERE tp.tournament_id = $1 ORDER BY p.name",
      [tournamentId]
    );
    return rows.map(rowToPlayer);
  }
  const store = loadStore();
  const playerIds = store.tournamentPlayers
    .filter((tp) => tp.tournament_id === tournamentId)
    .map((tp) => tp.player_id);
  return store.players
    .filter((p) => playerIds.includes(p.id))
    .sort((a, b) => playerDisplayName(a).localeCompare(playerDisplayName(b)));
}

export async function addPlayerToTournament(tournamentId: number, playerId: number): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute(
      "INSERT OR IGNORE INTO tournament_players (tournament_id, player_id) VALUES ($1, $2)",
      [tournamentId, playerId]
    );
    return;
  }
  const store = loadStore();
  const exists = store.tournamentPlayers.some(
    (tp) => tp.tournament_id === tournamentId && tp.player_id === playerId
  );
  if (!exists) {
    store.tournamentPlayers.push(newTournamentPlayer(tournamentId, playerId));
  }
  saveStore(store);
}

export async function removePlayerFromTournament(
  tournamentId: number,
  playerId: number
): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute(
      "DELETE FROM tournament_players WHERE tournament_id = $1 AND player_id = $2",
      [tournamentId, playerId]
    );
    return;
  }
  const store = loadStore();
  store.tournamentPlayers = store.tournamentPlayers.filter(
    (tp) => !(tp.tournament_id === tournamentId && tp.player_id === playerId)
  );
  saveStore(store);
}

export async function retirePlayerFromTournament(
  tournamentId: number,
  playerId: number
): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute(
      "UPDATE tournament_players SET retired = 1 WHERE tournament_id = $1 AND player_id = $2",
      [tournamentId, playerId]
    );
    return;
  }
  const store = loadStore();
  const tp = store.tournamentPlayers.find(
    (tp) => tp.tournament_id === tournamentId && tp.player_id === playerId
  );
  if (tp) tp.retired = 1;
  saveStore(store);
}

export async function unretirePlayerFromTournament(
  tournamentId: number,
  playerId: number
): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute(
      "UPDATE tournament_players SET retired = 0 WHERE tournament_id = $1 AND player_id = $2",
      [tournamentId, playerId]
    );
    return;
  }
  const store = loadStore();
  const tp = store.tournamentPlayers.find(
    (tp) => tp.tournament_id === tournamentId && tp.player_id === playerId
  );
  if (tp) tp.retired = 0;
  saveStore(store);
}

export async function getRetiredPlayerIds(tournamentId: number): Promise<number[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    const rows: { player_id: number }[] = await d.select(
      "SELECT player_id FROM tournament_players WHERE tournament_id = $1 AND retired = 1",
      [tournamentId]
    );
    return rows.map((r) => r.player_id);
  }
  const store = loadStore();
  return store.tournamentPlayers
    .filter((tp) => tp.tournament_id === tournamentId && tp.retired === 1)
    .map((tp) => tp.player_id);
}

// --- Payment Tracking ---

export async function getTournamentPlayersDetailed(tournamentId: number): Promise<TournamentPlayerInfo[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    const rows: TournamentPlayerRow[] = await d.select(
      `SELECT p.*, tp.retired, tp.payment_status, tp.payment_method, tp.paid_date, tp.seed_rank
       FROM tournament_players tp
       JOIN players p ON p.id = tp.player_id
       WHERE tp.tournament_id = $1
       ORDER BY p.name`,
      [tournamentId]
    );
    return rows.map((r) => {
      return {
      player: rowToPlayer(r),
      payment_status: (r.payment_status ?? "unpaid") as PaymentStatus,
      payment_method: (r.payment_method ?? null) as PaymentMethod | null,
      paid_date: r.paid_date ?? null,
      retired: r.retired === 1,
      seed_rank: r.seed_rank ?? null,
    };});
  }
  const store = loadStore();
  const tps = store.tournamentPlayers.filter((tp) => tp.tournament_id === tournamentId);
  return tps.map((tp) => {
    const player = store.players.find((p) => p.id === tp.player_id)!;
    return {
      player,
      payment_status: tp.payment_status ?? "unpaid",
      payment_method: tp.payment_method ?? null,
      paid_date: tp.paid_date ?? null,
      retired: tp.retired === 1,
      seed_rank: tp.seed_rank ?? null,
    };
  }).filter((x) => x.player).sort((a, b) => playerDisplayName(a.player).localeCompare(playerDisplayName(b.player)));
}

export async function updatePlayerPayment(
  tournamentId: number,
  playerId: number,
  status: PaymentStatus,
  method: PaymentMethod | null,
  date: string | null
): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute(
      "UPDATE tournament_players SET payment_status=$1, payment_method=$2, paid_date=$3 WHERE tournament_id=$4 AND player_id=$5",
      [status, method, date, tournamentId, playerId]
    );
    return;
  }
  const store = loadStore();
  const tp = store.tournamentPlayers.find(
    (tp) => tp.tournament_id === tournamentId && tp.player_id === playerId
  );
  if (tp) {
    tp.payment_status = status;
    tp.payment_method = method;
    tp.paid_date = date;
  }
  saveStore(store);
}

/**
 * Replaces all seed ranks for a tournament. seedOrder[i] = playerId at
 * Setzplatz (i+1). Players not in seedOrder get seed_rank = NULL.
 * Idempotent — safe to call repeatedly.
 */
export async function setTournamentSeeds(
  tournamentId: number,
  seedOrder: number[],
): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    if (seedOrder.length === 0) {
      await d.execute(
        "UPDATE tournament_players SET seed_rank = NULL WHERE tournament_id = $1",
        [tournamentId],
      );
      return;
    }
    // One CASE instead of a clear-all plus an UPDATE per seeded player: the
    // ELSE branch does the clearing, so a 32-player seeding is one IPC
    // round trip rather than 33 (REVIEW-BACKLOG.md E4).
    //
    // Placeholders are numbered in the order they appear and each is used
    // once — the tournament id therefore comes last. Binding is positional,
    // so a $1 reused in two places would pick up the wrong value.
    const cases = seedOrder
      .map((_, i) => `WHEN $${i * 2 + 1} THEN $${i * 2 + 2}`)
      .join(" ");
    const params: number[] = [];
    seedOrder.forEach((playerId, i) => params.push(playerId, i + 1));
    params.push(tournamentId);
    await d.execute(
      `UPDATE tournament_players
          SET seed_rank = CASE player_id ${cases} ELSE NULL END
        WHERE tournament_id = $${params.length}`,
      params,
    );
    return;
  }
  const store = loadStore();
  for (const tp of store.tournamentPlayers) {
    if (tp.tournament_id !== tournamentId) continue;
    const idx = seedOrder.indexOf(tp.player_id);
    tp.seed_rank = idx >= 0 ? idx + 1 : null;
  }
  saveStore(store);
}

// --- Rounds ---

export async function getRounds(tournamentId: number): Promise<Round[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    return d.select(
      "SELECT * FROM rounds WHERE tournament_id = $1 ORDER BY round_number",
      [tournamentId]
    );
  }
  const store = loadStore();
  return store.rounds
    .filter((r) => r.tournament_id === tournamentId)
    .sort((a, b) => a.round_number - b.round_number);
}

export async function createRound(
  tournamentId: number,
  roundNumber: number,
  phase: string | null = null,
  groupNumber: number | null = null
): Promise<number> {
  if (isTauri()) {
    const d = await getTauriDb();
    const result = await d.execute(
      "INSERT INTO rounds (tournament_id, round_number, phase, group_number) VALUES ($1, $2, $3, $4)",
      [tournamentId, roundNumber, phase, groupNumber]
    );
    return result.lastInsertId!;
  }
  const store = loadStore();
  const id = nextId(store, "rounds");
  store.rounds.push({
    id,
    tournament_id: tournamentId,
    round_number: roundNumber,
    phase: phase as Round["phase"],
    group_number: groupNumber,
  });
  saveStore(store);
  return id;
}

export async function deleteRound(roundId: number): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    const matches: { id: number }[] = await d.select(
      "SELECT id FROM matches WHERE round_id = $1", [roundId]
    );
    for (const m of matches) {
      await d.execute("DELETE FROM sets WHERE match_id = $1", [m.id]);
    }
    await d.execute("DELETE FROM matches WHERE round_id = $1", [roundId]);
    await d.execute("DELETE FROM rounds WHERE id = $1", [roundId]);
    return;
  }
  const store = loadStore();
  const matchIds = store.matches.filter((m) => m.round_id === roundId).map((m) => m.id);
  store.sets = store.sets.filter((s) => !matchIds.includes(s.match_id));
  store.matches = store.matches.filter((m) => m.round_id !== roundId);
  store.rounds = store.rounds.filter((r) => r.id !== roundId);
  saveStore(store);
}

// --- Matches ---

export async function getMatchesByRound(roundId: number): Promise<Match[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    return d.select("SELECT * FROM matches WHERE round_id = $1 ORDER BY id", [roundId]);
  }
  const store = loadStore();
  return store.matches.filter((m) => m.round_id === roundId).sort((a, b) => a.id - b.id);
}

export async function createMatch(
  roundId: number,
  team1P1: number,
  team1P2: number | null,
  /** null = bye: team 1 advances without an opponent. */
  team2P1: number | null,
  team2P2: number | null,
  court: number | null = null
): Promise<number> {
  const assignedAt = court ? nowIso() : null;
  const startedAt = court ? nowIso() : null;
  if (isTauri()) {
    const d = await getTauriDb();
    const result = await d.execute(
      "INSERT INTO matches (round_id, team1_p1, team1_p2, team2_p1, team2_p2, court, court_assigned_at, started_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [roundId, team1P1, team1P2, team2P1, team2P2, court, assignedAt, startedAt]
    );
    return result.lastInsertId!;
  }
  const store = loadStore();
  const id = nextId(store, "matches");
  store.matches.push({
    id,
    round_id: roundId,
    court,
    court_assigned_at: assignedAt,
    team1_p1: team1P1,
    team1_p2: team1P2,
    team2_p1: team2P1,
    team2_p2: team2P2,
    winner_team: null,
    status: "pending",
    walkover: 0,
    outcome: null,
    started_at: startedAt,
    completed_at: null,
  });
  saveStore(store);
  return id;
}

// --- Atomic schedule writes ------------------------------------------------

/**
 * King of the Court keeps its whole state in the waiting queue: who is on
 * court, and in which order everyone else steps up. It lives in
 * `app_settings` because it is per-tournament scheduling state, not part of
 * the match record (REVIEW-BACKLOG.md B5).
 */
function kotcQueueKey(tournamentId: number): string {
  return `kotc_queue_${tournamentId}`;
}

export async function getKingOfCourtQueue(tournamentId: number): Promise<number[]> {
  const raw = await getAppSetting(kotcQueueKey(tournamentId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  } catch (err) {
    console.error("getKingOfCourtQueue: failed to parse queue:", err);
    return [];
  }
}

export async function setKingOfCourtQueue(tournamentId: number, queue: number[]): Promise<void> {
  await setAppSetting(kotcQueueKey(tournamentId), JSON.stringify(queue));
}

/**
 * Which rounds of a double-elimination tournament are grand finals.
 *
 * The grand final is stored as a normal winners round so the bracket needs
 * no extra column; this note is what tells the two apart when the state is
 * read back (REVIEW-BACKLOG.md B4).
 */
export async function getGrandFinalRounds(tournamentId: number): Promise<number[]> {
  const raw = await getAppSetting(`grand_final_rounds_${tournamentId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isFinite(n)) : [];
  } catch (err) {
    console.error("getGrandFinalRounds: failed to parse:", err);
    return [];
  }
}

export async function markGrandFinalRounds(tournamentId: number, roundIds: number[]): Promise<void> {
  const unique = Array.from(new Set(roundIds)).sort((a, b) => a - b);
  await setAppSetting(`grand_final_rounds_${tournamentId}`, JSON.stringify(unique));
}

/** Sets `planned_rounds` for the formats that run a fixed number of rounds. */
/**
 * Removes the settings rows that belong to one tournament.
 *
 * These live in `app_settings` under a key built from the tournament id, so
 * they are not covered by the cascade in `deleteTournament`. SQLite hands
 * out the id of a deleted row again, which let a new tournament inherit the
 * King-of-the-Court queue — a list of player ids from an entirely different
 * event (REVIEW-BACKLOG.md C5).
 */
async function deleteTournamentSettings(tournamentId: number): Promise<void> {
  await deleteAppSetting(kotcQueueKey(tournamentId));
  await deleteAppSetting(`grand_final_rounds_${tournamentId}`);
}

export async function updatePlannedRounds(id: number, rounds: number | null): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE tournaments SET planned_rounds = $1 WHERE id = $2", [rounds, id]);
    return;
  }
  const store = loadStore();
  const t = store.tournaments.find((t) => t.id === id);
  if (t) t.planned_rounds = rounds;
  saveStore(store);
}

/**
 * Closes a match that was not played, and records why.
 *
 * The winner -- if there is one -- is credited, but the match carries no
 * sets, so it stays out of every set/point ratio.
 *
 * `winnerTeam` is null only for `no_match`, where neither side turned up.
 * That match still counts as completed: the tournament has to be able to
 * finish, and a match nobody played is not a match still to be played
 * (FEATURE-BACKLOG.md D1).
 */
export async function setMatchOutcome(
  matchId: number,
  outcome: Exclude<MatchOutcome, null>,
  winnerTeam: 1 | 2 | null,
): Promise<void> {
  if (outcome === "no_match" && winnerTeam !== null) {
    throw new Error("no_match cannot have a winner");
  }
  if (outcome !== "no_match" && winnerTeam === null) {
    throw new Error(`${outcome} needs a winner`);
  }
  const completedAt = nowIso();
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("DELETE FROM sets WHERE match_id = $1", [matchId]);
    await d.execute(
      "UPDATE matches SET winner_team = $1, status = 'completed', walkover = 1, outcome = $2, court = NULL, completed_at = $3 WHERE id = $4",
      [winnerTeam, outcome, completedAt, matchId],
    );
    await notifyDataChanged({ kind: "match" });
    return;
  }
  const store = loadStore();
  store.sets = store.sets.filter((s) => s.match_id !== matchId);
  const m = store.matches.find((m) => m.id === matchId);
  if (m) {
    m.winner_team = winnerTeam;
    m.status = "completed";
    m.walkover = 1;
    m.outcome = outcome;
    m.court = null;
    m.completed_at = completedAt;
  }
  saveStore(store);
  await notifyDataChanged({ kind: "match" });
}

/** The plain no-show, kept as its own name because most callers mean this one. */
export async function setMatchWalkover(matchId: number, winnerTeam: 1 | 2): Promise<void> {
  await setMatchOutcome(matchId, "walkover", winnerTeam);
}

/** One match to create. `team2_p1 === null` marks a bye (no opponent). */
export interface MatchSpec {
  team1_p1: number;
  team1_p2?: number | null;
  team2_p1?: number | null;
  team2_p2?: number | null;
  court?: number | null;
  /** Byes are stored as already-decided matches so the bracket carries them. */
  completed?: boolean;
}

export interface RoundSpec {
  roundNumber: number;
  phase?: string | null;
  groupNumber?: number | null;
  matches: MatchSpec[];
  /**
   * Marks the grand final of a double-elimination bracket. Not written to
   * the database — the match lives in the winners bracket — but returned to
   * the caller so it can note the round id (REVIEW-BACKLOG.md B4).
   */
  isGrandFinal?: boolean;
}

/**
 * Creates rounds with their matches — and optionally flips tournament status
 * and phase — in a single transaction.
 *
 * Generating a schedule statement by statement leaves a half-built
 * tournament behind if anything fails midway (see REVIEW-BACKLOG.md A6): an
 * "active" tournament with three of twelve rounds cannot be started again
 * and cannot be played. Here either the whole schedule lands or nothing
 * does.
 *
 * Returns the ids of the created rounds, in the order they were passed.
 */
export async function createSchedule(
  tournamentId: number,
  rounds: RoundSpec[],
  opts: { status?: string; phase?: string | null } = {},
): Promise<number[]> {
  const now = nowIso();

  if (isTauri()) {
    await getTauriDb(); // ensure the pool exists before the command runs
    const { invoke } = await import("@tauri-apps/api/core");

    type Param = string | number | boolean | null | { __lastInsertId: number };
    const statements: { sql: string; params: Param[] }[] = [];
    const roundStatementIndex: number[] = [];

    for (const round of rounds) {
      roundStatementIndex.push(statements.length);
      statements.push({
        sql: "INSERT INTO rounds (tournament_id, round_number, phase, group_number) VALUES ($1, $2, $3, $4)",
        params: [tournamentId, round.roundNumber, round.phase ?? null, round.groupNumber ?? null],
      });

      const roundRef = { __lastInsertId: statements.length - 1 };
      for (const m of round.matches) {
        const court = m.court ?? null;
        statements.push({
          sql:
            "INSERT INTO matches (round_id, team1_p1, team1_p2, team2_p1, team2_p2, court, court_assigned_at, started_at, status, winner_team, completed_at) " +
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
          params: [
            roundRef,
            m.team1_p1,
            m.team1_p2 ?? null,
            m.team2_p1 ?? null,
            m.team2_p2 ?? null,
            court,
            court !== null ? now : null,
            court !== null ? now : null,
            m.completed ? "completed" : "pending",
            m.completed ? 1 : null,
            m.completed ? now : null,
          ],
        });
      }
    }

    if (opts.status !== undefined) {
      statements.push({
        sql: "UPDATE tournaments SET status = $1 WHERE id = $2",
        params: [opts.status, tournamentId],
      });
    }
    if (opts.phase !== undefined) {
      statements.push({
        sql: "UPDATE tournaments SET current_phase = $1 WHERE id = $2",
        params: [opts.phase, tournamentId],
      });
    }

    const ids: number[] = await invoke("execute_transaction", { statements });
    await notifyDataChanged({ kind: "schedule", tournamentId });
    return roundStatementIndex.map((i) => ids[i]);
  }

  // localStorage fallback: no transactions available, applied in order.
  const roundIds: number[] = [];
  for (const round of rounds) {
    const roundId = await createRound(tournamentId, round.roundNumber, round.phase ?? null, round.groupNumber ?? null);
    roundIds.push(roundId);
    for (const m of round.matches) {
      const matchId = await createMatch(
        roundId,
        m.team1_p1,
        m.team1_p2 ?? null,
        m.team2_p1 ?? null,
        m.team2_p2 ?? null,
        m.court ?? null,
      );
      if (m.completed) await updateMatchResult(matchId, 1);
    }
  }
  if (opts.status !== undefined) await updateTournamentStatus(tournamentId, opts.status);
  if (opts.phase !== undefined) await updateTournamentPhase(tournamentId, opts.phase);
  await notifyDataChanged({ kind: "schedule", tournamentId });
  return roundIds;
}

/**
 * Deletes rounds (cascading to their matches and sets) and applies the
 * follow-up tournament state in one transaction — the undo counterpart to
 * {@link createSchedule}.
 */
export async function deleteRoundsAtomically(
  tournamentId: number,
  roundIds: number[],
  opts: { status?: string; phase?: string | null; clearKoScoring?: boolean } = {},
): Promise<void> {
  if (isTauri()) {
    await getTauriDb();
    const { invoke } = await import("@tauri-apps/api/core");
    const statements: { sql: string; params: (string | number | null)[] }[] = [];

    for (const roundId of roundIds) {
      // Explicit child deletes: ON DELETE CASCADE covers this, but being
      // explicit keeps the statement list readable in error messages.
      statements.push({
        sql: "DELETE FROM sets WHERE match_id IN (SELECT id FROM matches WHERE round_id = $1)",
        params: [roundId],
      });
      statements.push({ sql: "DELETE FROM matches WHERE round_id = $1", params: [roundId] });
      statements.push({ sql: "DELETE FROM rounds WHERE id = $1", params: [roundId] });
    }
    if (opts.status !== undefined) {
      statements.push({ sql: "UPDATE tournaments SET status = $1 WHERE id = $2", params: [opts.status, tournamentId] });
    }
    if (opts.phase !== undefined) {
      statements.push({ sql: "UPDATE tournaments SET current_phase = $1 WHERE id = $2", params: [opts.phase, tournamentId] });
    }
    if (opts.clearKoScoring) {
      statements.push({
        sql: "UPDATE tournaments SET ko_points_per_set = NULL, ko_sets_to_win = NULL, ko_cap = NULL WHERE id = $1",
        params: [tournamentId],
      });
    }

    await invoke("execute_transaction", { statements });
    await notifyDataChanged({ kind: "schedule", tournamentId });
    return;
  }

  for (const roundId of roundIds) await deleteRound(roundId);
  if (opts.status !== undefined) await updateTournamentStatus(tournamentId, opts.status);
  if (opts.phase !== undefined) await updateTournamentPhase(tournamentId, opts.phase);
  if (opts.clearKoScoring) await updateTournamentKoScoring(tournamentId, null, null, null);
  await notifyDataChanged({ kind: "schedule", tournamentId });
}

export async function updateMatchCourt(matchId: number, court: number | null): Promise<void> {
  const assignedAt = court ? nowIso() : null;
  const startedAt = court ? nowIso() : null;
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE matches SET court = $1, court_assigned_at = $2, started_at = $3 WHERE id = $4", [court, assignedAt, startedAt, matchId]);
    await notifyDataChanged({ kind: "match" });
    return;
  }
  const store = loadStore();
  const m = store.matches.find((m) => m.id === matchId);
  if (m) {
    m.court = court;
    m.court_assigned_at = assignedAt;
    m.started_at = startedAt;
  }
  saveStore(store);
  await notifyDataChanged({ kind: "match" });
}

export async function clearMatchCourt(matchId: number): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("UPDATE matches SET court = NULL WHERE id = $1", [matchId]);
    await notifyDataChanged({ kind: "match" });
    return;
  }
  const store = loadStore();
  const m = store.matches.find((m) => m.id === matchId);
  if (m) m.court = null;
  saveStore(store);
  await notifyDataChanged({ kind: "match" });
}

export async function updateMatchResult(matchId: number, winnerTeam: 1 | 2 | null): Promise<void> {
  if (winnerTeam === null) {
    // Reset match to active (scores changed, no winner yet)
    if (isTauri()) {
      const d = await getTauriDb();
      await d.execute(
        "UPDATE matches SET winner_team = NULL, status = 'active', completed_at = NULL, walkover = 0, outcome = NULL WHERE id = $1",
        [matchId]
      );
      await notifyDataChanged({ kind: "match" });
      return;
    }
    const store = loadStore();
    const m = store.matches.find((m) => m.id === matchId);
    if (m) {
      m.winner_team = null;
      m.status = "active";
      m.completed_at = null;
      m.walkover = 0;
    m.outcome = null;
    }
    saveStore(store);
    await notifyDataChanged({ kind: "match" });
    return;
  }
  const completedAt = nowIso();
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute(
      "UPDATE matches SET winner_team = $1, status = 'completed', completed_at = $2 WHERE id = $3",
      [winnerTeam, completedAt, matchId]
    );
    await notifyDataChanged({ kind: "match" });
    return;
  }
  const store = loadStore();
  const m = store.matches.find((m) => m.id === matchId);
  if (m) {
    m.winner_team = winnerTeam;
    m.status = "completed";
    m.completed_at = completedAt;
  }
  saveStore(store);
  await notifyDataChanged({ kind: "match" });
}

export async function reopenMatch(matchId: number): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute(
      "UPDATE matches SET winner_team = NULL, status = 'pending', completed_at = NULL, walkover = 0, outcome = NULL WHERE id = $1",
      [matchId]
    );
    await notifyDataChanged({ kind: "match" });
    return;
  }
  const store = loadStore();
  const m = store.matches.find((m) => m.id === matchId);
  if (m) {
    m.winner_team = null;
    m.status = "pending";
    m.completed_at = null;
    m.walkover = 0;
    m.outcome = null;
  }
  saveStore(store);
  await notifyDataChanged({ kind: "match" });
}

// --- Sets ---

export async function getSetsByMatch(matchId: number): Promise<GameSet[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    return d.select("SELECT * FROM sets WHERE match_id = $1 ORDER BY set_number", [matchId]);
  }
  const store = loadStore();
  return store.sets
    .filter((s) => s.match_id === matchId)
    .sort((a, b) => a.set_number - b.set_number);
}

// --- Bulk queries (avoid N+1 per-round/per-match fetching) ---

export async function getAllMatchesByTournament(tournamentId: number): Promise<Match[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    return d.select(
      "SELECT m.* FROM matches m JOIN rounds r ON m.round_id = r.id WHERE r.tournament_id = $1 ORDER BY r.round_number, m.id",
      [tournamentId]
    );
  }
  const store = loadStore();
  const roundIds = new Set(
    store.rounds.filter((r) => r.tournament_id === tournamentId).map((r) => r.id)
  );
  return store.matches
    .filter((m) => roundIds.has(m.round_id))
    .sort((a, b) => a.id - b.id);
}

/**
 * Matches of several tournaments at once, each tagged with the tournament
 * it belongs to.
 *
 * The session view used to call getAllMatchesByTournament in a loop — one
 * IPC round trip per tournament, five seconds apart, for as long as the
 * dashboard is open (REVIEW-BACKLOG.md E4).
 */
export async function getMatchesForTournaments(
  tournamentIds: number[],
): Promise<(Match & { tournament_id: number })[]> {
  if (tournamentIds.length === 0) return [];

  if (isTauri()) {
    const d = await getTauriDb();
    const placeholders = tournamentIds.map((_, i) => `$${i + 1}`).join(", ");
    return d.select(
      `SELECT m.*, r.tournament_id
         FROM matches m
         JOIN rounds r ON m.round_id = r.id
        WHERE r.tournament_id IN (${placeholders})
        ORDER BY r.tournament_id, r.round_number, m.id`,
      tournamentIds,
    );
  }

  const store = loadStore();
  const wanted = new Set(tournamentIds);
  const roundToTournament = new Map<number, number>();
  for (const r of store.rounds) {
    if (wanted.has(r.tournament_id)) roundToTournament.set(r.id, r.tournament_id);
  }
  return store.matches
    .filter((m) => roundToTournament.has(m.round_id))
    .map((m) => ({ ...m, tournament_id: roundToTournament.get(m.round_id)! }))
    .sort((a, b) => a.tournament_id - b.tournament_id || a.id - b.id);
}

export async function getAllSetsByTournament(tournamentId: number): Promise<GameSet[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    return d.select(
      "SELECT s.* FROM sets s JOIN matches m ON s.match_id = m.id JOIN rounds r ON m.round_id = r.id WHERE r.tournament_id = $1",
      [tournamentId]
    );
  }
  const store = loadStore();
  const roundIds = new Set(
    store.rounds.filter((r) => r.tournament_id === tournamentId).map((r) => r.id)
  );
  const matchIds = new Set(
    store.matches.filter((m) => roundIds.has(m.round_id)).map((m) => m.id)
  );
  return store.sets.filter((s) => matchIds.has(s.match_id));
}

export async function upsertSet(
  matchId: number,
  setNumber: number,
  team1Score: number,
  team2Score: number
): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    // Single statement against the unique index from migration v16. The
    // previous SELECT-then-INSERT/UPDATE could interleave with a second
    // keystroke and create a duplicate row whose points were counted twice
    // (REVIEW-BACKLOG.md C2).
    await d.execute(
      `INSERT INTO sets (match_id, set_number, team1_score, team2_score)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT(match_id, set_number)
       DO UPDATE SET team1_score = excluded.team1_score,
                     team2_score = excluded.team2_score`,
      [matchId, setNumber, team1Score, team2Score],
    );
    await notifyDataChanged({ kind: "match" });
    return;
  }
  const store = loadStore();
  const existing = store.sets.find(
    (s) => s.match_id === matchId && s.set_number === setNumber
  );
  if (existing) {
    existing.team1_score = team1Score;
    existing.team2_score = team2Score;
  } else {
    store.sets.push({
      id: nextId(store, "sets"),
      match_id: matchId,
      set_number: setNumber,
      team1_score: team1Score,
      team2_score: team2Score,
    });
  }
  saveStore(store);
  await notifyDataChanged({ kind: "match" });
}

// --- Wipe / Reset ---

export async function wipeAllPlayers(): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    // Delete in correct order to respect FK constraints:
    // sets -> matches -> rounds -> tournament_players -> tournaments -> players
    await d.execute("DELETE FROM sets");
    await d.execute("DELETE FROM matches");
    await d.execute("DELETE FROM rounds");
    await d.execute("DELETE FROM tournament_players");
    await d.execute("DELETE FROM tournaments");
    await d.execute("DELETE FROM players");
    return;
  }
  const store = loadStore();
  store.players = [];
  store.tournamentPlayers = [];
  store.sets = [];
  store.matches = [];
  store.rounds = [];
  store.tournaments = [];
  saveStore(store);
}

export async function wipeAllTournaments(): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("DELETE FROM sets");
    await d.execute("DELETE FROM matches");
    await d.execute("DELETE FROM rounds");
    await d.execute("DELETE FROM tournament_players");
    await d.execute("DELETE FROM tournaments");
    // Same orphan problem as in deleteTournament, for every tournament at once.
    await d.execute(
      "DELETE FROM app_settings WHERE key LIKE 'kotc_queue_%' OR key LIKE 'grand_final_rounds_%'",
    );
    return;
  }
  const store = loadStore();
  store.sets = [];
  store.matches = [];
  store.rounds = [];
  store.tournamentPlayers = [];
  store.tournaments = [];
  saveStore(store);
  // Backwards: removeItem shifts every later index down by one.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (
      key &&
      (key.startsWith("app_setting_kotc_queue_") ||
        key.startsWith("app_setting_grand_final_rounds_"))
    ) {
      localStorage.removeItem(key);
    }
  }
}

export async function wipeEntireDatabase(): Promise<void> {
  if (isTauri()) {
    // Markiert die DB zur Löschung und startet die App neu.
    // Beim Neustart löscht Rust die DB-Datei (+ WAL/SHM) vor der SQL-Plugin-Init,
    // das Plugin legt dann automatisch eine frische DB mit dem aktuellen Migration-Stand an.
    // Diese Invoke-Promise resolved nicht — der Prozess terminiert durch restart().
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("wipe_database_and_restart");
    return;
  }
  // Browser-Fallback: In-Memory-Store leeren
  const store = loadStore();
  store.sets = [];
  store.matches = [];
  store.rounds = [];
  store.tournamentPlayers = [];
  store.tournaments = [];
  store.players = [];
  store.sportstaetten = [];
  saveStore(store);
}

// --- App Settings (key-value store in DB) ---

export async function getAppSetting(key: string): Promise<string | null> {
  if (isTauri()) {
    const d = await getTauriDb();
    const rows: { value: string }[] = await d.select(
      "SELECT value FROM app_settings WHERE key = $1",
      [key]
    );
    return rows.length > 0 ? rows[0].value : null;
  }
  // Fallback: localStorage
  return localStorage.getItem(`app_setting_${key}`);
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    const existing: { key: string }[] = await d.select(
      "SELECT key FROM app_settings WHERE key = $1",
      [key]
    );
    if (existing.length > 0) {
      await d.execute("UPDATE app_settings SET value = $1 WHERE key = $2", [value, key]);
    } else {
      await d.execute("INSERT INTO app_settings (key, value) VALUES ($1, $2)", [key, value]);
    }
    return;
  }
  localStorage.setItem(`app_setting_${key}`, value);
}

export async function deleteAppSetting(key: string): Promise<void> {
  if (isTauri()) {
    const d = await getTauriDb();
    await d.execute("DELETE FROM app_settings WHERE key = $1", [key]);
    return;
  }
  localStorage.removeItem(`app_setting_${key}`);
}

// --- Match Duration Queries ---

export async function getAllMatchesWithTournament(): Promise<(Match & { tournament_id: number; tournament_name: string })[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    return d.select(
      "SELECT m.*, r.tournament_id, t.name as tournament_name FROM matches m JOIN rounds r ON m.round_id = r.id JOIN tournaments t ON r.tournament_id = t.id WHERE m.status = 'completed'"
    );
  }
  const store = loadStore();
  const completedMatches = store.matches.filter((m) => m.status === "completed");
  return completedMatches.map((m) => {
    const round = store.rounds.find((r) => r.id === m.round_id);
    const tournament = store.tournaments.find((t) => t.id === round?.tournament_id);
    return {
      ...m,
      tournament_id: round?.tournament_id ?? 0,
      tournament_name: tournament?.name ?? "",
    };
  });
}

export async function getAllSetsFlat(): Promise<GameSet[]> {
  if (isTauri()) {
    const d = await getTauriDb();
    return d.select("SELECT * FROM sets");
  }
  const store = loadStore();
  return [...store.sets];
}
