// src/lib/resultExport.ts
//
// Exports a finished (or running) tournament as CSV or JSON.
//
// Until now results could only leave the app as a PDF or inside the `.db`
// file — neither of which a club secretary can paste into a spreadsheet or
// feed into a ranking list (REVIEW-BACKLOG.md C9).
//
// The functions here are pure: they take the data and return a string, so
// the file dialog stays in the UI layer and the formatting is testable.

import type {
  Tournament,
  Player,
  Round,
  Match,
  GameSet,
  StandingEntry,
  TournamentPlayerInfo,
  FeeItem,
} from "./types";
import { playerDisplayName } from "./types";
import { owesEntryFee } from "./fees";
import { formatDateTime } from "./datetime";

/** Escapes a value for CSV: quotes it when it contains a separator, quote or newline. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Joins rows with a semicolon separator — what German Excel expects by default. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

interface ExportInput {
  tournament: Tournament;
  players: Player[];
  rounds: Round[];
  matches: Match[];
  sets: GameSet[];
  standings: StandingEntry[];
  paymentData?: TournamentPlayerInfo[];
  /** Charges beyond the entry fee (FEATURE-BACKLOG.md E4). */
  feeItems?: FeeItem[];
  locale?: string;
}

function nameOf(players: Player[], id: number | null): string {
  if (id === null) return "";
  const player = players.find((p) => p.id === id);
  return player ? playerDisplayName(player) : `#${id}`;
}

function teamLabel(players: Player[], p1: number | null, p2: number | null): string {
  if (p1 === null) return "";
  const first = nameOf(players, p1);
  return p2 === null ? first : `${first} / ${nameOf(players, p2)}`;
}

/** Every match with round, court, participants, result and set scores. */
export function matchesToCsv(input: ExportInput): string {
  const { tournament, players, rounds, matches, sets, locale } = input;
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const setsByMatch = new Map<number, GameSet[]>();
  for (const s of sets) {
    const bucket = setsByMatch.get(s.match_id);
    if (bucket) bucket.push(s);
    else setsByMatch.set(s.match_id, [s]);
  }

  const maxSets = Math.max(1, ...[...setsByMatch.values()].map((list) => list.length));
  const header = [
    "Turnier", "Runde", "Phase", "Gruppe", "Feld",
    "Team 1", "Team 2", "Sieger", "Wertung",
    ...Array.from({ length: maxSets }, (_, i) => `Satz ${i + 1}`),
    "Beendet",
  ];

  const rows: (string | number | null)[][] = [header];
  const ordered = [...matches].sort((a, b) => {
    const ra = roundById.get(a.round_id)?.round_number ?? 0;
    const rb = roundById.get(b.round_id)?.round_number ?? 0;
    return ra - rb || a.id - b.id;
  });

  for (const m of ordered) {
    const round = roundById.get(m.round_id);
    const matchSets = (setsByMatch.get(m.id) ?? []).sort((a, b) => a.set_number - b.set_number);
    const isBye = m.team2_p1 === null;
    // "kampflos" covered every unplayed match, which lost the difference
    // between a no-show and a match neither side turned up for.
    const OUTCOME_LABEL: Record<string, string> = {
      walkover: "kampflos",
      retired: "Aufgabe",
      disqualified: "Disqualifikation",
      no_match: "kein Spiel",
    };
    const result = isBye
      ? "Freilos"
      : m.outcome
        ? OUTCOME_LABEL[m.outcome]
        : m.walkover === 1
          ? "kampflos"
          : m.status === "completed"
            ? "gespielt"
            : "offen";

    rows.push([
      tournament.name,
      round?.round_number ?? "",
      round?.phase ?? "",
      round?.group_number ?? "",
      m.court ?? "",
      teamLabel(players, m.team1_p1, m.team1_p2),
      isBye ? "" : teamLabel(players, m.team2_p1, m.team2_p2),
      m.winner_team === 1
        ? teamLabel(players, m.team1_p1, m.team1_p2)
        : m.winner_team === 2
          ? teamLabel(players, m.team2_p1, m.team2_p2)
          : "",
      result,
      ...Array.from({ length: maxSets }, (_, i) => {
        const s = matchSets[i];
        return s ? `${s.team1_score}:${s.team2_score}` : "";
      }),
      m.completed_at ? formatDateTime(m.completed_at, locale) : "",
    ]);
  }

  return toCsv(rows);
}

/** The final table, in the order the app ranks it. */
export function standingsToCsv(input: ExportInput): string {
  const { standings } = input;
  const withBuchholz = standings.some((s) => s.buchholz !== undefined);

  const header = [
    "Platz", "Spieler", "Verein", "Siege", "Niederlagen",
    "Saetze +", "Saetze -", "Punkte +", "Punkte -",
    ...(withBuchholz ? ["Buchholz"] : []),
  ];

  const rows: (string | number | null)[][] = [header];
  standings.forEach((entry, index) => {
    rows.push([
      index + 1,
      playerDisplayName(entry.player),
      entry.player.club ?? "",
      entry.wins,
      entry.losses,
      entry.setsWon,
      entry.setsLost,
      entry.pointsWon,
      entry.pointsLost,
      ...(withBuchholz ? [entry.buchholz ?? 0] : []),
    ]);
  });

  return toCsv(rows);
}

/** Entry-fee overview: who paid how, and what is still open. */
export function paymentsToCsv(input: ExportInput): string {
  const { tournament, paymentData = [], feeItems = [], locale } = input;
  const fee = tournament.mode === "singles"
    ? tournament.entry_fee_single ?? 0
    : tournament.entry_fee_double ?? 0;

  const rows: (string | number | null)[][] = [
    ["Spieler", "Verein", "Meldung", "Posten", "Status", "Methode", "Datum", "Betrag"],
  ];

  const ENTRY_LABEL: Record<string, string> = {
    entered: "gemeldet",
    waiting: "Warteliste",
    withdrawn: "abgemeldet",
  };

  for (const entry of paymentData) {
    const status = entry.entry_status ?? "entered";
    // Whoever owes nothing still belongs in the file: the accounts have
    // to show that they were there and why they are not being charged
    // (FEATURE-BACKLOG.md E2).
    const owes = owesEntryFee({ entry_status: status }, tournament.fee_due ?? "participation");
    rows.push([
      playerDisplayName(entry.player),
      entry.player.club ?? "",
      ENTRY_LABEL[status] ?? status,
      "Startgeld",
      entry.payment_status === "paid" ? "bezahlt" : "offen",
      entry.payment_method ?? "",
      entry.paid_date ? formatDateTime(entry.paid_date, locale) : "",
      owes ? fee : 0,
    ]);
  }

  for (const item of feeItems) {
    const owner = item.player_id
      ? paymentData.find((p) => p.player.id === item.player_id)
      : undefined;
    rows.push([
      owner ? playerDisplayName(owner.player) : "",
      owner?.player.club ?? "",
      "",
      item.label,
      item.paid ? "bezahlt" : "offen",
      "",
      "",
      item.amount,
    ]);
  }

  return toCsv(rows);
}

/**
 * Complete snapshot as JSON — the same shape the live publishing uses, so
 * anything that can read a published tournament can read this file too.
 */
export function toJsonExport(input: ExportInput): string {
  const { tournament, players, rounds, matches, sets, standings, paymentData } = input;
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      tournament,
      players,
      rounds,
      matches,
      sets,
      standings,
      ...(paymentData ? { payments: paymentData } : {}),
    },
    null,
    2,
  );
}

/** Suggests a file name like `2026-08-18_Sommercup_ergebnisse.csv`. */
export function exportFileName(tournament: Tournament, kind: string, extension: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = tournament.name
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "turnier";
  return `${date}_${safeName}_${kind}.${extension}`;
}
