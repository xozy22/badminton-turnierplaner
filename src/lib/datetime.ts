// src/lib/datetime.ts
//
// One place for reading and formatting the timestamps in the database.
//
// The app writes two different shapes: JavaScript writes ISO-8601 with a
// `Z` (`2026-08-18T14:03:00.000Z`), while SQLite column defaults use
// `datetime('now')`, which produces UTC *without* any zone marker
// (`2026-08-18 14:03:00`). `new Date()` reads the second form as local
// time, so every such value was off by the local UTC offset — one or two
// hours in Germany. Three pages had grown their own inline workaround, and
// the certificate generator and the sort order had none
// (REVIEW-BACKLOG.md C3).

/**
 * Parses a timestamp from the database, whichever shape it has.
 * Returns null for empty or unparseable input so callers can decide what
 * to show instead of rendering "Invalid Date".
 */
export function parseDbDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  // Already carries zone information ("…Z" or "…+02:00").
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const normalized = hasZone
    ? trimmed
    : // SQLite's "YYYY-MM-DD HH:MM:SS" is UTC by definition.
      `${trimmed.replace(" ", "T")}Z`;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Milliseconds since the epoch, or null. Handy for sorting and durations. */
export function dbDateToMillis(value: string | null | undefined): number | null {
  return parseDbDate(value)?.getTime() ?? null;
}

/**
 * Comparator for sorting by a database timestamp, newest first.
 * Rows without a usable timestamp sort last.
 */
export function byNewest(a: string | null | undefined, b: string | null | undefined): number {
  const ta = dbDateToMillis(a);
  const tb = dbDateToMillis(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return tb - ta;
}

/** Locale-aware date, e.g. "18.08.2026" in German. */
export function formatDate(
  value: string | null | undefined,
  locale?: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const date = parseDbDate(value);
  return date ? date.toLocaleDateString(locale, options) : "-";
}

/** Locale-aware time, e.g. "14:03". */
export function formatTime(
  value: string | null | undefined,
  locale?: string,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  const date = parseDbDate(value);
  return date ? date.toLocaleTimeString(locale, options) : "-";
}

/** Locale-aware date and time. */
export function formatDateTime(
  value: string | null | undefined,
  locale?: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const date = parseDbDate(value);
  return date ? date.toLocaleString(locale, options) : "-";
}

/**
 * The timestamp format to *write*: ISO-8601 in UTC. Everything the app
 * stores from TypeScript goes through here, so reading stays unambiguous.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
