// src/lib/tournamentValidation.ts
//
// Format-specific checks for a tournament configuration.
//
// The wizard used to enforce exactly one rule — "at least 2 players in
// singles, at least 4 otherwise" — which let through configurations that
// cannot work: a knockout with 3 players, four groups for five
// participants (groups of one are silently skipped), a mixed tournament
// with six men and one woman, or more Swiss rounds than there are possible
// opponents. Those failed after the start, or not visibly at all
// (REVIEW-BACKLOG.md B13).
//
// Errors block the start; warnings are worth showing but the tournament
// director may know better.

import type { TournamentFormat, TournamentMode, Gender } from "./types";

export type IssueLevel = "error" | "warning";

export interface ValidationIssue {
  level: IssueLevel;
  /** i18n key; the message may contain {placeholders}. */
  key: string;
  params?: Record<string, string | number>;
}

export interface TournamentSetup {
  mode: TournamentMode;
  format: TournamentFormat;
  /** Genders of the selected participants — length is the player count. */
  genders: Gender[];
  /** Number of groups, only meaningful for group_ko. */
  numGroups?: number;
  /** Total KO bracket size for group_ko. */
  koSize?: number;
  /** Planned rounds for swiss / monrad / waterfall. */
  plannedRounds?: number;
  /** Courts available at the venue. */
  courts?: number;
  /** Manually formed teams, if the format uses fixed pairings. */
  teamCount?: number;
}

/** Formats where participants are fixed teams rather than individuals. */
export function usesFixedTeams(mode: TournamentMode, format: TournamentFormat): boolean {
  if (mode === "singles") return false;
  return format !== "random_doubles";
}

/** Minimum number of players a format needs to run at all. */
export function minimumPlayers(mode: TournamentMode, format: TournamentFormat): number {
  if (mode === "singles") {
    switch (format) {
      case "king_of_court":
        return 3; // two players would just replay each other forever
      case "waterfall":
        return 4; // a ladder needs at least two courts' worth of players
      default:
        return 2;
    }
  }
  // Doubles and mixed always need two teams.
  return 4;
}

export function validateTournamentSetup(setup: TournamentSetup): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const playerCount = setup.genders.length;
  const men = setup.genders.filter((g) => g === "m").length;
  const women = setup.genders.filter((g) => g === "f").length;
  const isDoubles = setup.mode !== "singles";

  const min = minimumPlayers(setup.mode, setup.format);
  if (playerCount < min) {
    issues.push({ level: "error", key: "validation_min_players", params: { count: min } });
    // Everything below assumes a workable field; stop piling on.
    return issues;
  }

  // --- Team formation ------------------------------------------------------
  if (isDoubles) {
    if (setup.mode === "mixed") {
      if (men < 2 || women < 2) {
        issues.push({ level: "error", key: "validation_mixed_needs_two_each" });
      } else if (men !== women) {
        issues.push({
          level: "warning",
          key: "validation_mixed_unbalanced",
          params: { men, women, sittingOut: Math.abs(men - women) },
        });
      }
    } else if (playerCount % 2 !== 0) {
      issues.push({
        level: usesFixedTeams(setup.mode, setup.format) ? "error" : "warning",
        key: "validation_doubles_odd_players",
      });
    }
  }

  const participantCount = isDoubles ? Math.floor(playerCount / 2) : playerCount;

  // --- Format specifics ----------------------------------------------------
  switch (setup.format) {
    case "elimination":
    case "double_elimination": {
      if (participantCount < 2) {
        issues.push({ level: "error", key: "validation_ko_needs_two" });
      } else if ((participantCount & (participantCount - 1)) !== 0) {
        const bracket = 1 << Math.ceil(Math.log2(participantCount));
        issues.push({
          level: "warning",
          key: "validation_ko_byes",
          params: { byes: bracket - participantCount, bracket },
        });
      }
      break;
    }

    case "group_ko": {
      const groups = setup.numGroups ?? 2;
      if (groups < 2) {
        issues.push({ level: "error", key: "validation_groups_min" });
      }
      if (participantCount < groups * 2) {
        issues.push({
          level: "error",
          key: "validation_groups_too_many",
          params: { groups, participants: participantCount },
        });
      }
      const koSize = setup.koSize ?? 0;
      if (koSize > participantCount) {
        issues.push({
          level: "error",
          key: "validation_ko_size_too_large",
          params: { koSize, participants: participantCount },
        });
      }
      break;
    }

    case "swiss":
    case "monrad": {
      const rounds = setup.plannedRounds ?? 0;
      if (rounds < 1) {
        issues.push({ level: "error", key: "validation_rounds_min" });
      } else if (rounds > participantCount - 1) {
        // Beyond that everyone has met everyone and repeats are unavoidable.
        issues.push({
          level: "warning",
          key: "validation_rounds_exceed_opponents",
          params: { rounds, maxRounds: Math.max(1, participantCount - 1) },
        });
      }
      break;
    }

    case "waterfall": {
      const rounds = setup.plannedRounds ?? 0;
      if (rounds < 1) {
        issues.push({ level: "error", key: "validation_rounds_min" });
      }
      const courts = setup.courts ?? 1;
      const seated = Math.min(Math.floor(participantCount / 2), courts) * 2;
      if (seated < participantCount) {
        issues.push({
          level: "warning",
          key: "validation_waterfall_sit_out",
          params: { sittingOut: participantCount - seated, courts },
        });
      }
      break;
    }

    case "king_of_court": {
      // One match at a time by definition, so extra courts stay empty.
      if ((setup.courts ?? 1) > 1) {
        issues.push({ level: "warning", key: "validation_kotc_single_court" });
      }
      break;
    }

    case "round_robin": {
      const matches = (participantCount * (participantCount - 1)) / 2;
      if (matches > 60) {
        issues.push({
          level: "warning",
          key: "validation_round_robin_long",
          params: { matches },
        });
      }
      break;
    }

    case "random_doubles": {
      if (playerCount % 4 !== 0) {
        issues.push({
          level: "warning",
          key: "validation_random_doubles_remainder",
          params: { sittingOut: playerCount % 4 },
        });
      }
      break;
    }
  }

  // --- Fixed teams must actually be complete -------------------------------
  if (usesFixedTeams(setup.mode, setup.format) && setup.teamCount !== undefined) {
    const expected = setup.mode === "mixed" ? Math.min(men, women) : Math.floor(playerCount / 2);
    if (setup.teamCount < expected) {
      issues.push({
        level: "error",
        key: "validation_teams_incomplete",
        params: { formed: setup.teamCount, expected },
      });
    }
  }

  return issues;
}

/** True when nothing blocks the tournament from starting. */
export function canStart(issues: ValidationIssue[]): boolean {
  return !issues.some((i) => i.level === "error");
}
