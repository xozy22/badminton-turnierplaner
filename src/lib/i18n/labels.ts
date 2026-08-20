// src/lib/i18n/labels.ts
//
// One home for the labels of the enum-like values: tournament mode,
// format, status, payment method.
//
// These used to exist twice — as hard-coded German constants in types.ts
// (MODE_LABELS, FORMAT_LABELS, STATUS_LABELS, PAYMENT_METHOD_LABELS) and
// as translation keys. Whichever a screen happened to reach for decided
// whether it stayed German under an English setting, so the home page and
// the printed sheet said "Jeder gegen Jeden" while the rest of the
// interface said "Round robin" (REVIEW-BACKLOG.md H4).
//
// Only the translations remain. The mapping lives here rather than in each
// screen so that a new format is added in one place.

import type { Translations } from "./types";
import type {
  PaymentMethod,
  TournamentFormat,
  TournamentMode,
  TournamentStatus,
} from "../types";

export function modeLabel(t: Translations, mode: TournamentMode): string {
  switch (mode) {
    case "singles": return t.mode_singles;
    case "doubles": return t.mode_doubles;
    case "mixed": return t.mode_mixed;
  }
}

export function formatLabel(t: Translations, format: TournamentFormat): string {
  switch (format) {
    case "round_robin": return t.format_round_robin;
    case "elimination": return t.format_elimination;
    case "random_doubles": return t.format_random_doubles;
    case "group_ko": return t.format_group_ko;
    case "swiss": return t.format_swiss;
    case "double_elimination": return t.format_double_elimination;
    case "monrad": return t.format_monrad;
    case "king_of_court": return t.format_king_of_court;
    case "waterfall": return t.format_waterfall;
  }
}

export function statusLabel(t: Translations, status: TournamentStatus): string {
  switch (status) {
    case "draft": return t.status_draft;
    case "active": return t.status_active;
    case "completed": return t.status_completed;
    case "archived": return t.status_archived;
  }
}

export function paymentMethodLabel(t: Translations, method: PaymentMethod): string {
  switch (method) {
    case "bar": return t.payment_cash;
    case "ueberweisung": return t.payment_transfer;
    case "paypal": return t.payment_paypal;
  }
}

/**
 * The modes and formats in the order they are offered, for the pickers.
 *
 * The same two literal maps were written out eight times across six files
 * — including twice in one file — because there was nowhere to put them.
 * A new format had to be added to each of them (REVIEW-BACKLOG.md H4).
 */
export const MODES: TournamentMode[] = ["singles", "doubles", "mixed"];

export const FORMATS: TournamentFormat[] = [
  "round_robin",
  "elimination",
  "random_doubles",
  "group_ko",
  "swiss",
  "double_elimination",
  "monrad",
  "king_of_court",
  "waterfall",
];

/** `[value, label]` pairs for a mode picker, in offering order. */
export function modeOptions(t: Translations): [TournamentMode, string][] {
  return MODES.map((m) => [m, modeLabel(t, m)]);
}

/** `[value, label]` pairs for a format picker, in offering order. */
export function formatOptions(t: Translations): [TournamentFormat, string][] {
  return FORMATS.map((f) => [f, formatLabel(t, f)]);
}
