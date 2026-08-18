import { describe, it, expect } from "vitest";
import {
  parseDbDate,
  dbDateToMillis,
  byNewest,
  formatDate,
  formatTime,
  formatDateTime,
  nowIso,
} from "./datetime";

describe("parseDbDate", () => {
  it("reads SQLite's zoneless format as UTC", () => {
    // C3: `new Date("2026-08-18 14:03:00")` treats this as local time and
    // shifts it by the local offset. datetime('now') is UTC.
    const date = parseDbDate("2026-08-18 14:03:00");
    expect(date?.toISOString()).toBe("2026-08-18T14:03:00.000Z");
  });

  it("reads JavaScript's ISO format unchanged", () => {
    const date = parseDbDate("2026-08-18T14:03:00.000Z");
    expect(date?.toISOString()).toBe("2026-08-18T14:03:00.000Z");
  });

  it("honours an explicit offset", () => {
    const date = parseDbDate("2026-08-18T16:03:00+02:00");
    expect(date?.toISOString()).toBe("2026-08-18T14:03:00.000Z");
  });

  it("agrees across both stored shapes", () => {
    const fromSqlite = parseDbDate("2026-08-18 14:03:00");
    const fromJs = parseDbDate("2026-08-18T14:03:00.000Z");
    expect(fromSqlite?.getTime()).toBe(fromJs?.getTime());
  });

  it("returns null for empty or unusable input", () => {
    expect(parseDbDate(null)).toBeNull();
    expect(parseDbDate(undefined)).toBeNull();
    expect(parseDbDate("")).toBeNull();
    expect(parseDbDate("   ")).toBeNull();
    expect(parseDbDate("not a date")).toBeNull();
  });
});

describe("dbDateToMillis", () => {
  it("returns the epoch milliseconds", () => {
    expect(dbDateToMillis("2026-08-18 14:03:00")).toBe(Date.parse("2026-08-18T14:03:00Z"));
  });

  it("returns null instead of NaN", () => {
    expect(dbDateToMillis("rubbish")).toBeNull();
  });
});

describe("byNewest", () => {
  it("sorts the newest first", () => {
    const values = ["2026-01-01 10:00:00", "2026-03-01T10:00:00Z", "2026-02-01 10:00:00"];
    expect([...values].sort(byNewest)).toEqual([
      "2026-03-01T10:00:00Z",
      "2026-02-01 10:00:00",
      "2026-01-01 10:00:00",
    ]);
  });

  it("puts rows without a timestamp last", () => {
    const values = [null, "2026-01-01 10:00:00", undefined];
    const sorted = [...values].sort(byNewest);
    expect(sorted[0]).toBe("2026-01-01 10:00:00");
  });

  it("mixes both stored shapes correctly", () => {
    // Same instant, different shape: neither may sort ahead of the other.
    expect(byNewest("2026-08-18 14:03:00", "2026-08-18T14:03:00.000Z")).toBe(0);
  });
});

describe("formatting", () => {
  it("formats a date for a locale", () => {
    expect(formatDate("2026-08-18 14:03:00", "de-DE")).toContain("2026");
    expect(formatDate("2026-08-18 14:03:00", "de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }))
      .toBe("18.08.2026");
  });

  it("formats a time for a locale", () => {
    expect(formatTime("2026-08-18 14:03:00", "de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }))
      .toBe("14:03");
  });

  it("formats date and time together", () => {
    expect(formatDateTime("2026-08-18 14:03:00", "de-DE")).toContain("2026");
  });

  it("shows a dash instead of Invalid Date", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatTime("")).toBe("-");
    expect(formatDateTime("nonsense")).toBe("-");
  });
});

describe("nowIso", () => {
  it("writes ISO-8601 in UTC", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("round-trips through the parser", () => {
    const written = nowIso();
    expect(parseDbDate(written)?.toISOString()).toBe(written);
  });
});
