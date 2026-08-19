// Schema guard: runs the real migration chain from src-tauri/src/lib.rs
// against an in-memory SQLite and asserts that the resulting schema can
// actually hold everything the TypeScript layer writes into it.
//
// This is the cheapest possible check for a class of bug that is otherwise
// invisible until a user clicks "create tournament" — see REVIEW-BACKLOG.md
// A1, where five of nine tournament formats are rejected by a CHECK
// constraint that was never extended.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  readMigrations,
  DatabaseSync,
  type SqliteDb,
} from "./sqliteBackend";

const here = dirname(fileURLToPath(import.meta.url));

const migrations = readMigrations();

describe("migration chain (parsed from src-tauri/src/lib.rs)", () => {
  it("finds every migration", () => {
    expect(migrations.length).toBeGreaterThanOrEqual(13);
  });

  it("numbers migrations consecutively from 1", () => {
    const versions = migrations.map((m) => m.version);
    expect(versions).toEqual(versions.map((_, i) => i + 1));
  });

  it("declares a description for each migration", () => {
    for (const m of migrations) {
      expect(m.description.trim(), `migration ${m.version}`).not.toBe("");
    }
  });
});

describe.skipIf(!DatabaseSync)("resulting schema", () => {
  let db: SqliteDb;

  beforeAll(() => {
    db = new DatabaseSync!(":memory:");
    db.exec("PRAGMA foreign_keys = ON"); // what sqlx does on every connection
    for (const m of migrations) {
      try {
        db.exec(m.sql);
      } catch (err) {
        throw new Error(`Migration ${m.version} (${m.description}) failed: ${String(err)}`);
      }
    }
    // Minimal fixtures the insert-level assertions below build on.
    db.exec(`
      INSERT INTO players (id, name, gender) VALUES (1, 'A', 'm'), (2, 'B', 'f');
      INSERT INTO tournaments (id, name, mode, format) VALUES (1, 'Fixture', 'singles', 'round_robin');
    `);
  });

  const tableInfo = (table: string) =>
    db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[];

  it("creates every table the app queries", () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name);

    for (const expected of [
      "players",
      "sportstaetten",
      "tournaments",
      "tournament_players",
      "rounds",
      "matches",
      "sets",
      "app_settings",
      "sessions",
    ]) {
      expect(tables, `missing table ${expected}`).toContain(expected);
    }
  });

  it("creates every tournaments column the TypeScript layer writes", () => {
    // Mirrors the Tournament interface in src/lib/types.ts.
    const columns = tableInfo("tournaments").map((c) => c.name);
    for (const expected of [
      "id", "name", "mode", "format", "sets_to_win", "points_per_set", "cap",
      "ko_points_per_set", "ko_sets_to_win", "ko_cap", "courts", "num_groups",
      "qualify_per_group", "current_phase", "entry_fee_single", "entry_fee_double",
      "team_config", "hall_config", "venue_id", "min_rest_minutes",
      "enable_third_place", "session_id", "created_at", "status",
    ]) {
      expect(columns, `tournaments.${expected} missing`).toContain(expected);
    }
  });

  it("satisfies every column verifySchema demands", async () => {
    // The strongest guard in this file: REQUIRED_SCHEMA in src/lib/db.ts is
    // what the app checks at startup. If a column is expected there but no
    // migration creates it, the app refuses to start — this test catches
    // that here instead (REVIEW-BACKLOG.md C7).
    const dbSource = readFileSync(resolve(here, "../lib/db.ts"), "utf8");
    const start = dbSource.indexOf("const REQUIRED_SCHEMA");
    const end = dbSource.indexOf("\n};", start);
    expect(start, "REQUIRED_SCHEMA not found in db.ts").toBeGreaterThan(-1);
    const block = dbSource.slice(start, end);

    const required = new Map<string, string[]>();
    for (const entry of block.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
      const columns = [...entry[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      required.set(entry[1], columns);
    }
    expect(required.size).toBeGreaterThan(5);

    for (const [table, columns] of required) {
      const present = new Set(tableInfo(table).map((c) => c.name));
      expect(present.size, `table ${table} missing`).toBeGreaterThan(0);
      for (const column of columns) {
        expect(present.has(column), `${table}.${column} is required but never created`).toBe(true);
      }
    }
  });

  it("drops the superseded age columns", () => {
    // C6: age and birth_year were replaced by birth_date long ago.
    const columns = tableInfo("players").map((c) => c.name);
    expect(columns).not.toContain("age");
    expect(columns).not.toContain("birth_year");
    expect(columns).toContain("archived_at");
  });

  it("creates every tournament_players column the TypeScript layer writes", () => {
    const columns = tableInfo("tournament_players").map((c) => c.name);
    for (const expected of [
      "tournament_id", "player_id", "retired", "payment_status",
      "payment_method", "paid_date", "seed_rank",
    ]) {
      expect(columns, `tournament_players.${expected} missing`).toContain(expected);
    }
  });

  it("accepts every tournament mode", () => {
    const insert = db.prepare(
      "INSERT INTO tournaments (name, mode, format) VALUES (?, ?, 'round_robin')",
    );
    for (const mode of ["singles", "doubles", "mixed"]) {
      expect(() => insert.run(`T-${mode}`, mode), `mode ${mode} rejected`).not.toThrow();
    }
  });

  it("accepts every tournament status", () => {
    const insert = db.prepare(
      "INSERT INTO tournaments (name, mode, format, status) VALUES (?, 'singles', 'round_robin', ?)",
    );
    for (const status of ["draft", "active", "completed", "archived"]) {
      expect(() => insert.run(`S-${status}`, status), `status ${status} rejected`).not.toThrow();
    }
  });

  it("accepts every tournament format the app offers", () => {
    // TournamentFormat in src/lib/types.ts. The v1 CHECK constraint only
    // lists the first four — swiss, double_elimination, monrad,
    // king_of_court and waterfall are rejected by SQLite.
    const insert = db.prepare(
      "INSERT INTO tournaments (name, mode, format) VALUES (?, 'singles', ?)",
    );
    for (const format of [
      "round_robin",
      "elimination",
      "random_doubles",
      "group_ko",
      "swiss",
      "double_elimination",
      "monrad",
      "king_of_court",
      "waterfall",
    ]) {
      expect(() => insert.run(`F-${format}`, format), `format ${format} rejected`).not.toThrow();
    }
  });

  it("stores a bye as a match without an opponent", () => {
    // A2: the loser slot is nullable so a player with a bye can be carried
    // through the bracket as a completed match.
    db.exec("INSERT INTO rounds (id, tournament_id, round_number) VALUES (800, 1, 1)");
    expect(() =>
      db.exec(
        "INSERT INTO matches (id, round_id, team1_p1, team2_p1, status, winner_team) " +
          "VALUES (800, 800, 1, NULL, 'completed', 1)",
      ),
    ).not.toThrow();

    const rows = db.prepare("SELECT team2_p1 FROM matches WHERE id = 800").all() as {
      team2_p1: number | null;
    }[];
    expect(rows[0].team2_p1).toBeNull();
  });

  it("indexes the foreign keys the hot queries filter on", () => {
    const indexes = (
      db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index'").all() as {
        name: string;
        tbl_name: string;
        sql: string | null;
      }[]
    ).filter((i) => i.sql !== null); // skip auto-indexes from PK/UNIQUE

    const covered = (table: string, column: string) =>
      indexes.some((i) => i.tbl_name === table && (i.sql ?? "").includes(column));

    for (const [table, column] of [
      ["matches", "round_id"],
      ["sets", "match_id"],
      ["rounds", "tournament_id"],
      ["tournaments", "session_id"],
    ] as const) {
      expect(covered(table, column), `no index on ${table}.${column}`).toBe(true);
    }
  });

  it("rejects a duplicate set number for the same match", () => {
    db.exec("INSERT INTO rounds (id, tournament_id, round_number) VALUES (900, 1, 1)");
    db.exec(
      "INSERT INTO matches (id, round_id, team1_p1, team2_p1) VALUES (900, 900, 1, 2)",
    );
    db.exec("INSERT INTO sets (match_id, set_number, team1_score, team2_score) VALUES (900, 1, 21, 15)");

    expect(() =>
      db.exec("INSERT INTO sets (match_id, set_number, team1_score, team2_score) VALUES (900, 1, 11, 9)"),
    ).toThrow();
  });
});

describe.skipIf(!DatabaseSync)("upgrade of an existing database", () => {
  /**
   * Runs migrations 1..13 (the schema an installed app already has), fills
   * in a realistic tournament, then applies the v14 rebuild — with foreign
   * keys ON, which is what the app will do once A5 lands. The rebuild drops
   * and recreates `tournaments` and `matches`; without `legacy_alter_table`
   * that cascades into `rounds`, `tournament_players` and `sets` and wipes
   * the tournament history. This test is the guard for exactly that.
   */
  function upgraded(): SqliteDb {
    const db = new DatabaseSync!(":memory:");
    db.exec("PRAGMA foreign_keys = ON");

    for (const m of migrations.filter((x) => x.version < 14)) db.exec(m.sql);

    db.exec(`
      INSERT INTO players (id, name, gender) VALUES (1, 'A', 'm'), (2, 'B', 'f');
      INSERT INTO tournaments (id, name, mode, format, status)
        VALUES (1, 'Legacy Cup', 'singles', 'round_robin', 'active');
      INSERT INTO tournament_players (tournament_id, player_id, payment_status)
        VALUES (1, 1, 'paid'), (1, 2, 'unpaid');
      INSERT INTO rounds (id, tournament_id, round_number) VALUES (1, 1, 1);
      INSERT INTO matches (id, round_id, team1_p1, team2_p1, winner_team, status)
        VALUES (1, 1, 1, 2, 1, 'completed');
      INSERT INTO sets (match_id, set_number, team1_score, team2_score)
        VALUES (1, 1, 21, 15), (1, 2, 21, 18);
    `);

    const v14 = migrations.find((m) => m.version === 14);
    expect(v14, "migration 14 missing").toBeTruthy();
    db.exec(v14!.sql);
    return db;
  }

  const count = (db: SqliteDb, table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).all() as { n: number }[])[0].n;

  it("keeps tournaments, rounds, matches, sets and player links", () => {
    const db = upgraded();
    expect(count(db, "tournaments")).toBe(1);
    expect(count(db, "tournament_players")).toBe(2);
    expect(count(db, "rounds")).toBe(1);
    expect(count(db, "matches")).toBe(1);
    expect(count(db, "sets")).toBe(2); // the cascade trap
    db.close();
  });

  it("keeps the column values intact", () => {
    const db = upgraded();
    const [t] = db.prepare("SELECT * FROM tournaments WHERE id = 1").all() as Record<string, unknown>[];
    expect(t.name).toBe("Legacy Cup");
    expect(t.status).toBe("active");
    expect(t.format).toBe("round_robin");

    const [m] = db.prepare("SELECT * FROM matches WHERE id = 1").all() as Record<string, unknown>[];
    expect(m.winner_team).toBe(1);
    expect(m.status).toBe("completed");
    expect(m.team2_p1).toBe(2);

    const [tp] = db
      .prepare("SELECT * FROM tournament_players WHERE tournament_id = 1 AND player_id = 1")
      .all() as Record<string, unknown>[];
    expect(tp.payment_status).toBe("paid");
    db.close();
  });

  it("leaves no dangling references behind", () => {
    const db = upgraded();
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    expect(violations).toEqual([]);
    db.close();
  });

  it("unlocks the formats that were previously rejected", () => {
    const db = upgraded();
    const insert = db.prepare("INSERT INTO tournaments (name, mode, format) VALUES (?, 'singles', ?)");
    for (const format of ["swiss", "double_elimination", "monrad", "king_of_court", "waterfall"]) {
      expect(() => insert.run(`F-${format}`, format), `format ${format} still rejected`).not.toThrow();
    }
    db.close();
  });
});

describe("migration 19 — when the tournament is played", () => {
  /** A database with the whole chain applied. */
  function fresh(): SqliteDb {
    const db = new DatabaseSync!(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    for (const m of migrations) db.exec(m.sql);
    return db;
  }

  it("adds play_date and start_time", () => {
    const db = fresh();
    const cols = db
      .prepare("PRAGMA table_info(tournaments)")
      .all()
      .map((c: unknown) => (c as { name: string }).name);
    expect(cols).toContain("play_date");
    expect(cols).toContain("start_time");
    db.close();
  });

  it("leaves existing tournaments without a date rather than guessing one", () => {
    // created_at says when the row was written. For anything planned in
    // advance that is not the play date, so inventing one would be wrong.
    const db = fresh();
    db.prepare("INSERT INTO tournaments (name, mode, format) VALUES ('Alt', 'singles', 'round_robin')").run();
    const [row] = db
      .prepare("SELECT play_date, start_time FROM tournaments WHERE name = 'Alt'")
      .all() as { play_date: string | null; start_time: string | null }[];
    expect(row.play_date).toBeNull();
    expect(row.start_time).toBeNull();
    db.close();
  });

  it("stores and returns both", () => {
    const db = fresh();
    db.prepare(
      "INSERT INTO tournaments (name, mode, format, play_date, start_time) VALUES ('Neu', 'singles', 'round_robin', '2026-08-19', '19:30')",
    ).run();
    const [row] = db
      .prepare("SELECT play_date, start_time FROM tournaments WHERE name = 'Neu'")
      .all() as { play_date: string; start_time: string }[];
    expect(row.play_date).toBe("2026-08-19");
    expect(row.start_time).toBe("19:30");
    db.close();
  });
});

describe("migration 20 — why a match was not played", () => {
  /** A database with the whole chain applied. */
  function fresh(): SqliteDb {
    const db = new DatabaseSync!(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    for (const m of migrations) db.exec(m.sql);
    return db;
  }

  /** The chain up to and including `version`, so a pre-20 state can be built. */
  function upTo(version: number): SqliteDb {
    const db = new DatabaseSync!(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    for (const m of migrations) {
      if (m.version > version) break;
      db.exec(m.sql);
    }
    return db;
  }

  it("adds the outcome column", () => {
    const db = fresh();
    const cols = db
      .prepare("PRAGMA table_info(matches)")
      .all()
      .map((c: unknown) => (c as { name: string }).name);
    expect(cols).toContain("outcome");
    db.close();
  });

  it("leaves a played match without a reason", () => {
    const db = fresh();
    db.prepare("INSERT INTO players (id, name, gender) VALUES (1, 'A', 'm')").run();
    db.prepare("INSERT INTO players (id, name, gender) VALUES (2, 'B', 'm')").run();
    db.prepare("INSERT INTO tournaments (id, name, mode, format) VALUES (1, 'T', 'singles', 'round_robin')").run();
    db.prepare("INSERT INTO rounds (id, tournament_id, round_number) VALUES (1, 1, 1)").run();
    db.prepare(
      "INSERT INTO matches (id, round_id, team1_p1, team2_p1, winner_team, status) VALUES (1, 1, 1, 2, 1, 'completed')",
    ).run();
    const [row] = db.prepare("SELECT outcome, walkover FROM matches WHERE id = 1").all() as {
      outcome: string | null;
      walkover: number;
    }[];
    expect(row.outcome).toBeNull();
    expect(row.walkover).toBe(0);
    db.close();
  });

  it("names the reason for walkovers recorded before the column existed", () => {
    // Everything already flagged meant the one thing the flag could mean.
    // Leaving those rows at NULL would make them read as played matches.
    const db = upTo(19);
    db.prepare("INSERT INTO players (id, name, gender) VALUES (1, 'A', 'm')").run();
    db.prepare("INSERT INTO players (id, name, gender) VALUES (2, 'B', 'm')").run();
    db.prepare("INSERT INTO tournaments (id, name, mode, format) VALUES (1, 'T', 'singles', 'round_robin')").run();
    db.prepare("INSERT INTO rounds (id, tournament_id, round_number) VALUES (1, 1, 1)").run();
    db.prepare(
      "INSERT INTO matches (id, round_id, team1_p1, team2_p1, winner_team, status, walkover) VALUES (1, 1, 1, 2, 2, 'completed', 1)",
    ).run();

    for (const m of migrations) {
      if (m.version === 20) db.exec(m.sql);
    }

    const [row] = db.prepare("SELECT outcome FROM matches WHERE id = 1").all() as {
      outcome: string | null;
    }[];
    expect(row.outcome).toBe("walkover");
    db.close();
  });

  it("accepts a completed match with no winner", () => {
    // The whole point of no_match: nobody won, and the match is still done,
    // so the tournament can be finished.
    const db = fresh();
    db.prepare("INSERT INTO players (id, name, gender) VALUES (1, 'A', 'm')").run();
    db.prepare("INSERT INTO players (id, name, gender) VALUES (2, 'B', 'm')").run();
    db.prepare("INSERT INTO tournaments (id, name, mode, format) VALUES (1, 'T', 'singles', 'round_robin')").run();
    db.prepare("INSERT INTO rounds (id, tournament_id, round_number) VALUES (1, 1, 1)").run();
    db.prepare(
      "INSERT INTO matches (id, round_id, team1_p1, team2_p1, winner_team, status, walkover, outcome) VALUES (1, 1, 1, 2, NULL, 'completed', 1, 'no_match')",
    ).run();
    const [row] = db.prepare("SELECT winner_team, status, outcome FROM matches WHERE id = 1").all() as {
      winner_team: number | null;
      status: string;
      outcome: string;
    }[];
    expect(row.winner_team).toBeNull();
    expect(row.status).toBe("completed");
    expect(row.outcome).toBe("no_match");
    db.close();
  });
});
