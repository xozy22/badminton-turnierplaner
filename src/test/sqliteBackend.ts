// src/test/sqliteBackend.ts
//
// An in-memory SQLite that behaves like the Tauri backend, so the data
// layer can be tested against the SQL it actually ships.
//
// The data layer carries two implementations of every function — SQL for
// Tauri, arrays for the browser fallback — and only the fallback was ever
// exercised by tests. Two bugs reached both paths unnoticed that way
// (REVIEW-BACKLOG.md C5). This harness runs the real migration chain from
// src-tauri/src/lib.rs and stands in for the two Tauri modules db.ts
// imports, so the same suite can drive either backend.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const LIB_RS = resolve(here, "../../src-tauri/src/lib.rs");

export interface RustMigration {
  version: number;
  description: string;
  sql: string;
}

/** Pulls the Migration{...} literals out of the Rust source. */
export function parseMigrations(source: string): RustMigration[] {
  // Drop whole-line Rust comments first: they may sit between the struct
  // fields. SQL comments inside the string literals use `--`, so a
  // line-anchored `//` never matches migration SQL.
  const stripped = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  const re =
    /version:\s*(\d+)\s*,\s*description:\s*"([^"]*)"\s*,\s*sql:\s*"([\s\S]*?)"\s*,\s*kind:/g;
  const out: RustMigration[] = [];
  for (const m of stripped.matchAll(re)) {
    out.push({ version: Number(m[1]), description: m[2], sql: m[3] });
  }
  return out;
}

export function readMigrations(): RustMigration[] {
  return parseMigrations(readFileSync(LIB_RS, "utf8"));
}

// --- node:sqlite ------------------------------------------------------------

export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number | bigint };
    all(...params: unknown[]): unknown[];
  };
  close(): void;
}

/**
 * node:sqlite is available from Node 22.5 (flagged) and unflagged from
 * Node 23.4. Callers skip rather than fail on older runtimes so the suite
 * stays usable everywhere; CI pins a version that has it.
 */
export let DatabaseSync: (new (path: string) => SqliteDb) | null = null;
try {
  ({ DatabaseSync } = (await import("node:sqlite")) as unknown as {
    DatabaseSync: new (path: string) => SqliteDb;
  });
} catch {
  DatabaseSync = null;
}

// --- the harness ------------------------------------------------------------

/** What db.ts expects from `@tauri-apps/plugin-sql`. */
interface SqlDatabase {
  select<T = unknown>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(
    query: string,
    bindValues?: unknown[],
  ): Promise<{ rowsAffected: number; lastInsertId?: number }>;
}

/** A statement as the Rust `execute_transaction` command receives it. */
interface TxStatement {
  sql: string;
  params: (string | number | boolean | null | { __lastInsertId: number })[];
}

export interface SqliteBackend {
  /** Stands in for the object `Database.load()` resolves to. */
  database: SqlDatabase;
  /** Stands in for `invoke` from `@tauri-apps/api/core`. */
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  /**
   * Statements sent since the last reset, counted the way the app pays for
   * them: one per `select`/`execute`, and one per transaction regardless of
   * how many statements it carries. Lets a test assert that a schedule
   * costs a single round trip (REVIEW-BACKLOG.md E4).
   */
  readonly roundTrips: number;
  /** Empties every table, keeping the schema. */
  reset(): void;
  close(): void;
}

/**
 * Rewrites `$1, $2, …` into the positional `?` that node:sqlite binds, and
 * returns the parameter list that goes with the rewritten statement.
 *
 * `$N` is a *named* placeholder as far as SQLite is concerned, so the same
 * number may appear several times and still consume a single value — which
 * `getPlayerMatchUsage` relies on: one player id against four columns. A
 * naive `$N` → `?` would turn that into four positional slots fed by one
 * value, so the query would run with three NULLs and quietly match less
 * than it should. Expanding the argument list keeps the harness faithful
 * to what the app's driver does.
 */
function toPositional(sql: string, values: unknown[]): { sql: string; values: unknown[] } {
  const expanded: unknown[] = [];
  const rewritten = sql.replace(/\$(\d+)/g, (_whole, digits: string) => {
    expanded.push(values[Number(digits) - 1]);
    return "?";
  });
  return { sql: rewritten, values: expanded };
}

/** SQLite binds booleans as integers; everything else passes straight through. */
function toBindValue(value: unknown): unknown {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined) return null;
  return value;
}

export function createSqliteBackend(): SqliteBackend {
  if (!DatabaseSync) throw new Error("node:sqlite is not available on this runtime");

  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON"); // what sqlx does on every connection

  for (const m of readMigrations()) {
    try {
      db.exec(m.sql);
    } catch (err) {
      throw new Error(`Migration ${m.version} (${m.description}) failed: ${String(err)}`);
    }
  }

  let roundTrips = 0;

  const database: SqlDatabase = {
    async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
      roundTrips++;
      const { sql, values } = toPositional(query, bindValues);
      return db.prepare(sql).all(...values.map(toBindValue)) as T;
    },
    async execute(query: string, bindValues: unknown[] = []) {
      roundTrips++;
      const { sql, values } = toPositional(query, bindValues);
      const result = db.prepare(sql).run(...values.map(toBindValue));
      return {
        rowsAffected: Number(result.changes),
        lastInsertId: Number(result.lastInsertRowid),
      };
    },
  };

  /**
   * Mirrors the Rust `execute_transaction` command, including its
   * `{__lastInsertId: n}` back-reference to an earlier statement — that
   * indirection is what lets createSchedule insert rounds and their
   * matches in one go.
   */
  function executeTransaction(statements: TxStatement[]): number[] {
    roundTrips++;
    const insertIds: number[] = [];
    db.exec("BEGIN");
    try {
      for (const statement of statements) {
        const params = statement.params.map((p) => {
          if (p !== null && typeof p === "object" && "__lastInsertId" in p) {
            const id = insertIds[p.__lastInsertId];
            if (id === undefined) {
              throw new Error(`__lastInsertId ${p.__lastInsertId} refers to a later statement`);
            }
            return id;
          }
          return toBindValue(p);
        });
        const { sql, values } = toPositional(statement.sql, params);
        const result = db.prepare(sql).run(...values);
        insertIds.push(Number(result.lastInsertRowid));
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return insertIds;
  }

  return {
    database,
    get roundTrips() {
      return roundTrips;
    },
    async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
      switch (command) {
        case "get_db_path":
          return ":memory:";
        case "execute_transaction":
          return executeTransaction((args?.statements ?? []) as TxStatement[]);
        default:
          throw new Error(`Unhandled Tauri command in tests: ${command}`);
      }
    },
    reset() {
      // Children first — foreign keys are enforced.
      for (const table of [
        "sets",
        "matches",
        "rounds",
        "tournament_players",
        "tournaments",
        "sessions",
        "players",
        "sportstaetten",
        "app_settings",
      ]) {
        db.exec(`DELETE FROM ${table}`);
      }
      // Hand out ids from 1 again, so tests can rely on them.
      db.exec("DELETE FROM sqlite_sequence");
      roundTrips = 0;
    },
    close() {
      db.close();
    },
  };
}
