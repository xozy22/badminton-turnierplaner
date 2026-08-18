import { describe, it, expect } from "vitest";
import {
  validateTournamentSetup,
  canStart,
  minimumPlayers,
  usesFixedTeams,
  type TournamentSetup,
} from "./tournamentValidation";
import type { Gender } from "./types";

/** `genders(6)` → six men; `genders(4, 2)` → four men and two women. */
function genders(men: number, women = 0): Gender[] {
  return [...Array(men).fill("m"), ...Array(women).fill("f")] as Gender[];
}

function setup(overrides: Partial<TournamentSetup> = {}): TournamentSetup {
  return {
    mode: "singles",
    format: "round_robin",
    genders: genders(8),
    ...overrides,
  };
}

const errorKeys = (issues: ReturnType<typeof validateTournamentSetup>) =>
  issues.filter((i) => i.level === "error").map((i) => i.key);
const warningKeys = (issues: ReturnType<typeof validateTournamentSetup>) =>
  issues.filter((i) => i.level === "warning").map((i) => i.key);

describe("minimumPlayers", () => {
  it("needs two for a singles match", () => {
    expect(minimumPlayers("singles", "round_robin")).toBe(2);
  });

  it("needs three for King of the Court so the court can change hands", () => {
    expect(minimumPlayers("singles", "king_of_court")).toBe(3);
  });

  it("needs four for a waterfall ladder", () => {
    expect(minimumPlayers("singles", "waterfall")).toBe(4);
  });

  it("always needs two teams in doubles", () => {
    expect(minimumPlayers("doubles", "round_robin")).toBe(4);
    expect(minimumPlayers("mixed", "elimination")).toBe(4);
  });
});

describe("usesFixedTeams", () => {
  it("is false for singles and for rotating partners", () => {
    expect(usesFixedTeams("singles", "elimination")).toBe(false);
    expect(usesFixedTeams("doubles", "random_doubles")).toBe(false);
  });

  it("is true for doubles formats with fixed pairings", () => {
    expect(usesFixedTeams("doubles", "elimination")).toBe(true);
    expect(usesFixedTeams("mixed", "group_ko")).toBe(true);
  });
});

describe("player count", () => {
  it("rejects a field below the format minimum", () => {
    const issues = validateTournamentSetup(setup({ genders: genders(1) }));
    expect(errorKeys(issues)).toContain("validation_min_players");
    expect(canStart(issues)).toBe(false);
  });

  it("rejects King of the Court with two players", () => {
    const issues = validateTournamentSetup(setup({ format: "king_of_court", genders: genders(2) }));
    expect(canStart(issues)).toBe(false);
  });

  it("accepts a plain field", () => {
    expect(canStart(validateTournamentSetup(setup()))).toBe(true);
  });
});

describe("doubles and mixed", () => {
  it("blocks fixed-team doubles with an odd field", () => {
    const issues = validateTournamentSetup(
      setup({ mode: "doubles", format: "elimination", genders: genders(7) }),
    );
    expect(errorKeys(issues)).toContain("validation_doubles_odd_players");
  });

  it("only warns for rotating partners with an odd field", () => {
    const issues = validateTournamentSetup(
      setup({ mode: "doubles", format: "random_doubles", genders: genders(7) }),
    );
    expect(errorKeys(issues)).not.toContain("validation_doubles_odd_players");
    expect(warningKeys(issues)).toContain("validation_doubles_odd_players");
  });

  it("blocks mixed without two of each gender", () => {
    const issues = validateTournamentSetup(
      setup({ mode: "mixed", format: "round_robin", genders: genders(6, 1) }),
    );
    expect(errorKeys(issues)).toContain("validation_mixed_needs_two_each");
    expect(canStart(issues)).toBe(false);
  });

  it("warns when mixed genders are unbalanced but playable", () => {
    const issues = validateTournamentSetup(
      setup({ mode: "mixed", format: "round_robin", genders: genders(4, 2), teamCount: 2 }),
    );
    expect(canStart(issues)).toBe(true);
    expect(warningKeys(issues)).toContain("validation_mixed_unbalanced");
  });

  it("blocks incomplete team pairings", () => {
    const issues = validateTournamentSetup(
      setup({ mode: "doubles", format: "elimination", genders: genders(8), teamCount: 3 }),
    );
    expect(errorKeys(issues)).toContain("validation_teams_incomplete");
  });
});

describe("knockout", () => {
  it("warns about byes for a non-power-of-two field", () => {
    const issues = validateTournamentSetup(setup({ format: "elimination", genders: genders(6) }));
    const warning = issues.find((i) => i.key === "validation_ko_byes");
    expect(warning?.params).toMatchObject({ byes: 2, bracket: 8 });
    expect(canStart(issues)).toBe(true); // byes are fine, just worth knowing
  });

  it("says nothing about byes for a full bracket", () => {
    const issues = validateTournamentSetup(setup({ format: "elimination", genders: genders(8) }));
    expect(warningKeys(issues)).not.toContain("validation_ko_byes");
  });
});

describe("group stage", () => {
  it("blocks more groups than participants can fill", () => {
    const issues = validateTournamentSetup(
      setup({ format: "group_ko", genders: genders(5), numGroups: 4, koSize: 4 }),
    );
    expect(errorKeys(issues)).toContain("validation_groups_too_many");
  });

  it("blocks a single group", () => {
    const issues = validateTournamentSetup(
      setup({ format: "group_ko", genders: genders(8), numGroups: 1, koSize: 4 }),
    );
    expect(errorKeys(issues)).toContain("validation_groups_min");
  });

  it("blocks a KO bracket larger than the field", () => {
    const issues = validateTournamentSetup(
      setup({ format: "group_ko", genders: genders(6), numGroups: 2, koSize: 8 }),
    );
    expect(errorKeys(issues)).toContain("validation_ko_size_too_large");
  });

  it("accepts a sound group setup", () => {
    const issues = validateTournamentSetup(
      setup({ format: "group_ko", genders: genders(16), numGroups: 4, koSize: 8 }),
    );
    expect(canStart(issues)).toBe(true);
  });
});

describe("swiss and monrad", () => {
  it("blocks a round count below one", () => {
    const issues = validateTournamentSetup(
      setup({ format: "swiss", genders: genders(8), plannedRounds: 0 }),
    );
    expect(errorKeys(issues)).toContain("validation_rounds_min");
  });

  it("warns when more rounds than possible opponents are planned", () => {
    const issues = validateTournamentSetup(
      setup({ format: "swiss", genders: genders(6), plannedRounds: 8 }),
    );
    const warning = issues.find((i) => i.key === "validation_rounds_exceed_opponents");
    expect(warning?.params).toMatchObject({ maxRounds: 5 });
    expect(canStart(issues)).toBe(true);
  });

  it("accepts the recommended round count", () => {
    const issues = validateTournamentSetup(
      setup({ format: "monrad", genders: genders(16), plannedRounds: 4 }),
    );
    expect(issues).toHaveLength(0);
  });
});

describe("waterfall and king of the court", () => {
  it("warns when the hall cannot seat everyone", () => {
    const issues = validateTournamentSetup(
      setup({ format: "waterfall", genders: genders(12), plannedRounds: 5, courts: 2 }),
    );
    const warning = issues.find((i) => i.key === "validation_waterfall_sit_out");
    expect(warning?.params).toMatchObject({ sittingOut: 8, courts: 2 });
  });

  it("says nothing when every player fits on a court", () => {
    const issues = validateTournamentSetup(
      setup({ format: "waterfall", genders: genders(8), plannedRounds: 5, courts: 4 }),
    );
    expect(issues).toHaveLength(0);
  });

  it("warns that King of the Court only uses one court", () => {
    const issues = validateTournamentSetup(
      setup({ format: "king_of_court", genders: genders(8), courts: 3 }),
    );
    expect(warningKeys(issues)).toContain("validation_kotc_single_court");
  });
});

describe("round robin", () => {
  it("warns about very long schedules", () => {
    const issues = validateTournamentSetup(setup({ genders: genders(14) })); // 91 matches
    const warning = issues.find((i) => i.key === "validation_round_robin_long");
    expect(warning?.params).toMatchObject({ matches: 91 });
  });

  it("stays quiet for a normal club field", () => {
    expect(validateTournamentSetup(setup({ genders: genders(8) }))).toHaveLength(0);
  });
});

describe("random doubles", () => {
  it("warns when the field does not divide into fours", () => {
    const issues = validateTournamentSetup(
      setup({ mode: "doubles", format: "random_doubles", genders: genders(10) }),
    );
    const warning = issues.find((i) => i.key === "validation_random_doubles_remainder");
    expect(warning?.params).toMatchObject({ sittingOut: 2 });
  });
});
