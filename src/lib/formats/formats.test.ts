import { describe, it, expect, beforeEach } from "vitest";
import { engineFor, FORMAT_ENGINES } from "./index";
import { knockoutSizes } from "./knockoutFormats";
import type { FormatContext } from "./types";
import { makePlayers, makeMatch, resetIds } from "../../test/factories";
import type { Tournament, Round, Match, TournamentFormat, TournamentStatus } from "../types";

beforeEach(resetIds);

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1,
    name: "Test",
    mode: "singles",
    format: "round_robin",
    sets_to_win: 1,
    points_per_set: 21,
    cap: 30,
    ko_points_per_set: null,
    ko_sets_to_win: null,
    ko_cap: null,
    courts: 1,
    num_groups: 0,
    qualify_per_group: 0,
    current_phase: null,
    entry_fee_single: 0,
    entry_fee_double: 0,
    team_config: null,
    hall_config: null,
    venue_id: 1,
    min_rest_minutes: 0,
    enable_third_place: 0,
    session_id: null,
    play_date: null,
    start_time: null,
    planned_rounds: null,
    created_at: "2026-08-18T10:00:00.000Z",
    status: "draft",
    ...overrides,
  };
}

function makeContext(overrides: Partial<FormatContext> = {}): FormatContext {
  const players = overrides.players ?? makePlayers(8);
  return {
    tournament: makeTournament(),
    players,
    rounds: [],
    matchesByRound: new Map(),
    setsByMatch: new Map(),
    allMatches: [],
    seedOrder: [],
    teams: [],
    courtForNewMatch: 1,
    formatState: {},
    ...overrides,
  };
}

/**
 * Applies a plan to a context as the view would: rounds and matches get
 * ids, everything lands in the lookup maps. Returns the new context.
 */
function apply(
  ctx: FormatContext,
  plan: NonNullable<ReturnType<ReturnType<typeof engineFor>["start"]>>,
  decide: (m: Match) => 1 | 2 | null = () => 1,
): FormatContext {
  const rounds = [...ctx.rounds];
  const matchesByRound = new Map(ctx.matchesByRound);
  const allMatches = [...ctx.allMatches];
  let nextRoundId = rounds.length + 1;
  let nextMatchId = allMatches.length + 1;

  const grandFinalRoundIds = [...(ctx.formatState.grandFinalRoundIds ?? [])];

  for (const spec of plan.rounds) {
    const roundId = nextRoundId++;
    if (spec.isGrandFinal) grandFinalRoundIds.push(roundId);
    const round: Round = {
      id: roundId,
      tournament_id: ctx.tournament.id,
      round_number: spec.roundNumber,
      phase: (spec.phase ?? null) as Round["phase"],
      group_number: spec.groupNumber ?? null,
    };
    rounds.push(round);

    const roundMatches: Match[] = spec.matches.map((m) => {
      const match = makeMatch({
        id: nextMatchId++,
        round_id: round.id,
        team1_p1: m.team1_p1,
        team1_p2: m.team1_p2 ?? null,
        team2_p1: m.team2_p1 ?? null,
        team2_p2: m.team2_p2 ?? null,
        court: m.court ?? null,
        status: m.completed ? "completed" : "pending",
        winner_team: m.completed ? 1 : null,
      });
      if (!m.completed) {
        const winner = decide(match);
        if (winner) {
          match.status = "completed";
          match.winner_team = winner;
        }
      }
      return match;
    });

    matchesByRound.set(round.id, roundMatches);
    allMatches.push(...roundMatches);
  }

  return {
    ...ctx,
    tournament: {
      ...ctx.tournament,
      status: (plan.status ?? ctx.tournament.status) as TournamentStatus,
      current_phase: (plan.phase !== undefined
        ? plan.phase
        : ctx.tournament.current_phase) as Tournament["current_phase"],
    },
    rounds,
    matchesByRound,
    allMatches,
    formatState: { ...ctx.formatState, ...plan.stateUpdates, grandFinalRoundIds },
  };
}

const teamsOf = (count: number): [number, number][] =>
  Array.from({ length: count }, (_, i) => [i * 2 + 1, i * 2 + 2] as [number, number]);

describe("registry", () => {
  it("has an engine for every format", () => {
    const formats: TournamentFormat[] = [
      "round_robin", "elimination", "random_doubles", "group_ko", "swiss",
      "double_elimination", "monrad", "king_of_court", "waterfall",
    ];
    for (const format of formats) {
      expect(engineFor(format), format).toBeTruthy();
      expect(engineFor(format).id).toBe(format);
    }
    expect(Object.keys(FORMAT_ENGINES)).toHaveLength(formats.length);
  });
});

describe("round robin", () => {
  it("draws the complete schedule at once", () => {
    const ctx = makeContext({ players: makePlayers(4) });
    const plan = engineFor("round_robin").start(ctx)!;
    expect(plan.rounds).toHaveLength(3);
    expect(plan.status).toBe("active");
  });

  it("has nothing left to advance", () => {
    const ctx = makeContext({ players: makePlayers(4) });
    const after = apply(ctx, engineFor("round_robin").start(ctx)!);
    expect(engineFor("round_robin").canAdvance(after)).toBe(false);
  });

  it("keeps doubles teams together", () => {
    const ctx = makeContext({
      tournament: makeTournament({ mode: "doubles" }),
      teams: teamsOf(4),
    });
    const plan = engineFor("round_robin").start(ctx)!;
    for (const round of plan.rounds) {
      for (const m of round.matches) {
        expect(m.team1_p2).toBe(m.team1_p1! + 1);
      }
    }
  });
});

describe("random doubles", () => {
  it("draws one round at a time", () => {
    const ctx = makeContext({
      tournament: makeTournament({ mode: "doubles", format: "random_doubles" }),
      players: makePlayers(8),
    });
    const plan = engineFor("random_doubles").start(ctx)!;
    expect(plan.rounds).toHaveLength(1);
    expect(plan.rounds[0].matches).toHaveLength(2);
  });

  it("allows the next round once a match is finished", () => {
    const ctx = makeContext({
      tournament: makeTournament({ mode: "doubles", format: "random_doubles", status: "active" }),
      players: makePlayers(8),
    });
    const after = apply(ctx, engineFor("random_doubles").start(ctx)!);
    expect(engineFor("random_doubles").canAdvance(after)).toBe(true);
  });

  it("reports who sits out", () => {
    const ctx = makeContext({
      tournament: makeTournament({ mode: "doubles", format: "random_doubles" }),
      players: makePlayers(10),
    });
    const plan = engineFor("random_doubles").start(ctx)!;
    expect(plan.byePlayers).toHaveLength(2);
  });
});

describe("elimination", () => {
  it("opens with a full bracket", () => {
    const ctx = makeContext({ tournament: makeTournament({ format: "elimination" }) });
    const plan = engineFor("elimination").start(ctx)!;
    expect(plan.rounds[0].matches).toHaveLength(4);
  });

  it("carries byes forward instead of dropping players", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "elimination", status: "active" }),
      players: makePlayers(6),
    });
    const engine = engineFor("elimination");
    const afterStart = apply(ctx, engine.start(ctx)!);

    // Four entries: two matches, two byes.
    expect(afterStart.allMatches).toHaveLength(4);

    const next = engine.advance(afterStart)!;
    const semiFinalists = next.rounds[0].matches.flatMap((m) => [m.team1_p1, m.team2_p1]);
    expect(semiFinalists).toHaveLength(4);
    expect(new Set(semiFinalists).size).toBe(4);
  });

  it("stops after the final", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "elimination", status: "active" }),
      players: makePlayers(4),
    });
    const engine = engineFor("elimination");
    let state = apply(ctx, engine.start(ctx)!);
    state = apply(state, engine.advance(state)!); // final
    expect(engine.canAdvance(state)).toBe(false);
    expect(engine.advance(state)).toBeNull();
  });

  it("creates the bronze match with the final", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "elimination", status: "active", enable_third_place: 1 }),
      players: makePlayers(4),
    });
    const engine = engineFor("elimination");
    const afterStart = apply(ctx, engine.start(ctx)!);
    const plan = engine.advance(afterStart)!;

    expect(plan.rounds.map((r) => r.phase)).toContain("third_place");
    expect(plan.rounds).toHaveLength(2);
  });
});

describe("group stage + knockout", () => {
  const groupCtx = (overrides: Partial<Tournament> = {}) =>
    makeContext({
      tournament: makeTournament({
        format: "group_ko",
        num_groups: 2,
        qualify_per_group: 4,
        status: "active",
        current_phase: "group",
        ...overrides,
      }),
      players: makePlayers(8),
    });

  it("splits the field into groups", () => {
    const plan = engineFor("group_ko").start(groupCtx())!;
    const groups = new Set(plan.rounds.map((r) => r.groupNumber));
    expect(groups).toEqual(new Set([1, 2]));
    expect(plan.phase).toBe("group");
  });

  it("does not start the knockout while a group is unfinished", () => {
    const ctx = groupCtx();
    const engine = engineFor("group_ko");
    const plan = engine.start(ctx)!;
    // Leave every match open.
    const state = apply(ctx, plan, () => null);
    expect(engine.canAdvance(state)).toBe(false);
  });

  it("builds the knockout once the groups are done", () => {
    const ctx = groupCtx();
    const engine = engineFor("group_ko");
    const state = apply(ctx, engine.start(ctx)!);

    expect(engine.canAdvance(state)).toBe(true);
    const plan = engine.advance(state)!;
    expect(plan.phase).toBe("ko");
    expect(plan.rounds[0].matches.length).toBeGreaterThan(0);
  });
});

describe("swiss", () => {
  const swissCtx = () =>
    makeContext({
      tournament: makeTournament({ format: "swiss", status: "active", planned_rounds: 3 }),
      players: makePlayers(8),
    });

  it("opens with a random first round", () => {
    const plan = engineFor("swiss").start(swissCtx())!;
    expect(plan.rounds[0].matches).toHaveLength(4);
    expect(plan.phase).toBe("swiss");
  });

  it("draws further rounds up to the planned count", () => {
    const engine = engineFor("swiss");
    let state = apply(swissCtx(), engine.start(swissCtx())!);

    expect(engine.canAdvance(state)).toBe(true);
    state = apply(state, engine.advance(state)!);
    expect(engine.canAdvance(state)).toBe(true);
    state = apply(state, engine.advance(state)!);

    // Three rounds planned, three played.
    expect(state.rounds).toHaveLength(3);
    expect(engine.canAdvance(state)).toBe(false);
  });

  it("stores a bye for an odd field", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "swiss", status: "active", planned_rounds: 3 }),
      players: makePlayers(5),
    });
    const engine = engineFor("swiss");
    const state = apply(ctx, engine.start(ctx)!);
    const plan = engine.advance(state)!;

    const byes = plan.rounds[0].matches.filter((m) => m.team2_p1 === null);
    expect(byes).toHaveLength(1);
    expect(byes[0].completed).toBe(true);
  });

  it("reports progress", () => {
    const engine = engineFor("swiss");
    const state = apply(swissCtx(), engine.start(swissCtx())!);
    expect(engine.progress?.(state)).toEqual({ current: 1, total: 3 });
  });
});

describe("monrad", () => {
  it("does not repeat a pairing", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "monrad", status: "active", planned_rounds: 3 }),
      players: makePlayers(4),
    });
    const engine = engineFor("monrad");
    const state = apply(ctx, engine.start(ctx)!);

    const first = new Set(
      state.allMatches.map((m) => [m.team1_p1, m.team2_p1].sort().join("-")),
    );
    const plan = engine.advance(state)!;
    const second = plan.rounds[0].matches.map((m) =>
      [m.team1_p1, m.team2_p1].sort().join("-"),
    );

    expect(second.some((k) => first.has(k))).toBe(false);
  });
});

describe("king of the court", () => {
  it("stores the queue on start", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "king_of_court" }),
      players: makePlayers(6),
    });
    const plan = engineFor("king_of_court").start(ctx)!;
    expect(plan.stateUpdates?.kotcQueue).toHaveLength(6);
    expect(plan.rounds[0].matches).toHaveLength(1);
  });

  it("rotates the queue between matches", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "king_of_court", status: "active" }),
      players: makePlayers(6),
    });
    const engine = engineFor("king_of_court");
    let state = apply(ctx, engine.start(ctx)!);

    const appearances = new Map<number, number>();
    for (let round = 0; round < 6; round++) {
      const plan = engine.advance(state);
      if (!plan) break;
      for (const m of plan.rounds[0].matches) {
        appearances.set(m.team1_p1, (appearances.get(m.team1_p1) ?? 0) + 1);
        if (m.team2_p1) appearances.set(m.team2_p1, (appearances.get(m.team2_p1) ?? 0) + 1);
      }
      // Challenger wins, so the court keeps changing hands.
      state = apply(state, plan, (m) => (m.team2_p1 ? 2 : 1));
    }

    expect(appearances.size).toBeGreaterThan(2);
  });
});

describe("waterfall", () => {
  it("respects the court count", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "waterfall", courts: 2, planned_rounds: 4 }),
      players: makePlayers(10),
    });
    const plan = engineFor("waterfall").start(ctx)!;
    expect(plan.rounds[0].matches).toHaveLength(2);
    expect(plan.byePlayers).toHaveLength(6);
  });

  it("stops at the planned round count", () => {
    const ctx = makeContext({
      tournament: makeTournament({
        format: "waterfall", courts: 4, planned_rounds: 2, status: "active",
      }),
      players: makePlayers(8),
    });
    const engine = engineFor("waterfall");
    let state = apply(ctx, engine.start(ctx)!);
    expect(engine.canAdvance(state)).toBe(true);
    state = apply(state, engine.advance(state)!);
    expect(engine.canAdvance(state)).toBe(false);
  });
});

describe("double elimination", () => {
  it("opens the winners bracket", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "double_elimination" }),
      players: makePlayers(8),
    });
    const plan = engineFor("double_elimination").start(ctx)!;
    expect(plan.phase).toBe("winners");
    expect(plan.rounds[0].matches).toHaveLength(4);
  });

  it("creates the winners and losers round together", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "double_elimination", status: "active" }),
      players: makePlayers(8),
    });
    const engine = engineFor("double_elimination");
    const state = apply(ctx, engine.start(ctx)!);

    const plan = engine.advance(state)!;
    expect(plan.rounds.map((r) => r.phase).sort()).toEqual(["losers", "winners"]);
  });

  it("runs to a single champion with everyone losing twice", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "double_elimination", status: "active" }),
      players: makePlayers(8),
    });
    const engine = engineFor("double_elimination");
    let state = apply(ctx, engine.start(ctx)!);

    const defeats = new Map<number, number>();
    const record = (m: Match, winner: 1 | 2) => {
      if (m.team2_p1 === null) return;
      const loser = winner === 1 ? m.team2_p1 : m.team1_p1;
      defeats.set(loser, (defeats.get(loser) ?? 0) + 1);
    };
    for (const m of state.allMatches) {
      if (m.winner_team) record(m, m.winner_team);
    }

    for (let guard = 0; guard < 15; guard++) {
      const plan = engine.advance(state);
      if (!plan) break;
      state = apply(state, plan, (m) => {
        const winner: 1 | 2 =
          m.team2_p1 === null ? 1 : m.team1_p1 < m.team2_p1 ? 1 : 2;
        record(m, winner);
        return winner;
      });
    }

    // Player 1 wins everything, everyone else is out after two defeats.
    for (const id of [2, 3, 4, 5, 6, 7, 8]) {
      expect(defeats.get(id), `player ${id}`).toBe(2);
    }
    expect(engine.canAdvance(state)).toBe(false);
  });
});

describe("plan shape", () => {
  it("never returns a round without matches", () => {
    for (const format of Object.keys(FORMAT_ENGINES) as TournamentFormat[]) {
      const ctx = makeContext({
        tournament: makeTournament({
          format,
          mode: format === "random_doubles" ? "doubles" : "singles",
          num_groups: 2,
          qualify_per_group: 4,
          planned_rounds: 3,
          courts: 4,
        }),
        players: makePlayers(8),
        teams: teamsOf(4),
      });

      const plan = engineFor(format).start(ctx);
      if (!plan) continue;
      for (const round of plan.rounds) {
        expect(round.matches.length, `${format} produced an empty round`).toBeGreaterThan(0);
      }
    }
  });

  it("numbers rounds continuously", () => {
    const ctx = makeContext({
      tournament: makeTournament({ format: "group_ko", num_groups: 2, qualify_per_group: 4 }),
      players: makePlayers(8),
    });
    const plan = engineFor("group_ko").start(ctx)!;
    const numbers = plan.rounds.map((r) => r.roundNumber);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });
});

describe("full run", () => {
  /** Formats that end by themselves, and how they are configured. */
  const finiteFormats: [TournamentFormat, Partial<Tournament>, number][] = [
    ["round_robin", {}, 6],
    ["elimination", {}, 6],
    ["swiss", { planned_rounds: 3 }, 8],
    ["monrad", { planned_rounds: 3 }, 8],
    ["group_ko", { num_groups: 2, qualify_per_group: 4 }, 8],
    ["double_elimination", {}, 8],
    ["waterfall", { planned_rounds: 3, courts: 2 }, 8],
  ];

  /** Open-ended formats: a club evening runs until the director stops it. */
  const endlessFormats: [TournamentFormat, Partial<Tournament>, number][] = [
    ["king_of_court", {}, 6],
    ["random_doubles", { mode: "doubles" }, 8],
  ];

  const playThrough = (
    format: TournamentFormat,
    extra: Partial<Tournament>,
    playerCount: number,
    maxSteps: number,
  ) => {
    const players = makePlayers(playerCount);
    const teams = Array.from(
      { length: Math.floor(playerCount / 2) },
      (_, i) => [players[i * 2].id, players[i * 2 + 1].id] as [number, number],
    );

    let ctx = makeContext({
      tournament: makeTournament({ format, ...extra }),
      players,
      teams,
      courtForNewMatch: null,
    });

    const engine = engineFor(format);
    const startPlan = engine.start(ctx);
    if (!startPlan) return { ctx, steps: 0, started: false };
    ctx = apply(ctx, startPlan, (m) =>
      m.team2_p1 === null ? 1 : m.team1_p1 < m.team2_p1 ? 1 : 2,
    );

    let steps = 0;
    while (engine.canAdvance(ctx) && steps < maxSteps) {
      const plan = engine.advance(ctx);
      if (!plan) break;
      ctx = apply(ctx, plan, (m) =>
        m.team2_p1 === null ? 1 : m.team1_p1 < m.team2_p1 ? 1 : 2,
      );
      steps++;
    }
    return { ctx, steps, started: true };
  };

  it.each(finiteFormats)("%s runs to an end", (format, extra, playerCount) => {
    const { ctx, steps, started } = playThrough(format, extra, playerCount, 25);
    expect(started, `${format} could not be started`).toBe(true);
    expect(steps, `${format} never stopped`).toBeLessThan(25);
    expect(ctx.allMatches.length).toBeGreaterThan(0);
    expect(engineFor(format).canAdvance(ctx)).toBe(false);
  });

  it.each(endlessFormats)("%s keeps going as long as it is asked to", (format, extra, playerCount) => {
    const { ctx, steps, started } = playThrough(format, extra, playerCount, 10);
    expect(started).toBe(true);
    // Deliberately open-ended: still offering another round after ten is
    // the expected behaviour, not a runaway loop.
    expect(steps).toBe(10);
    expect(ctx.rounds.length).toBe(11);
  });
});

describe("knockoutSizes — what qualify_per_group actually means", () => {
  it("reads a power of two as the whole KO field", () => {
    // Two groups, KO field of eight → four advance per group. The group
    // table used to highlight eight rows in each group.
    expect(knockoutSizes({ num_groups: 2, qualify_per_group: 8 })).toEqual({
      koSize: 8,
      perGroup: 4,
    });
  });

  it("splits a KO field of eight across four groups", () => {
    expect(knockoutSizes({ num_groups: 4, qualify_per_group: 8 })).toEqual({
      koSize: 8,
      perGroup: 2,
    });
  });

  it("reads a small number as the old per-group count", () => {
    // 2 is not >= 4, so it is a pre-v2.6 tournament: two per group, four
    // in the KO round.
    expect(knockoutSizes({ num_groups: 2, qualify_per_group: 2 })).toEqual({
      koSize: 4,
      perGroup: 2,
    });
  });

  it("reads a non-power-of-two as per-group, however large", () => {
    // 6 across three groups is 18 — a KO field that size cannot be a
    // bracket, but the reading has to stay consistent with what the draw
    // does, not with what would be sensible.
    expect(knockoutSizes({ num_groups: 3, qualify_per_group: 6 })).toEqual({
      koSize: 18,
      perGroup: 6,
    });
  });

  it("falls back to defaults on zero", () => {
    expect(knockoutSizes({ num_groups: 0, qualify_per_group: 0 })).toEqual({
      koSize: 4,
      perGroup: 2,
    });
  });
});

describe("display properties — what D2 was actually about", () => {
  it("every registered format declares how it wants to be shown", () => {
    // The point of the criterion "one file plus a registry entry": if a new
    // engine could omit this, the view would fall back to a default and the
    // format would render wrongly rather than fail to compile.
    for (const [id, engine] of Object.entries(FORMAT_ENGINES)) {
      expect(engine.display, `${id} has no display block`).toBeDefined();
      for (const key of [
        "hasBracket",
        "hasGroupPhase",
        "usesBuchholz",
        "usesQueue",
        "reshufflesPartners",
        "usesGrandFinal",
      ] as const) {
        expect(typeof engine.display[key], `${id}.display.${key}`).toBe("boolean");
      }
    }
  });

  it("the bracket formats are the knockout ones", () => {
    const withBracket = Object.entries(FORMAT_ENGINES)
      .filter(([, e]) => e.display.hasBracket)
      .map(([id]) => id)
      .sort();
    expect(withBracket).toEqual(["double_elimination", "elimination", "group_ko"]);
  });

  it("only group_ko has a group phase", () => {
    // round_robin puts its rounds in phase "group" too, but that is the
    // storage phase, not a group stage feeding a knockout.
    const withGroups = Object.entries(FORMAT_ENGINES)
      .filter(([, e]) => e.display.hasGroupPhase)
      .map(([id]) => id);
    expect(withGroups).toEqual(["group_ko"]);
  });

  it("Buchholz belongs to Swiss and Monrad", () => {
    const withBuchholz = Object.entries(FORMAT_ENGINES)
      .filter(([, e]) => e.display.usesBuchholz)
      .map(([id]) => id)
      .sort();
    expect(withBuchholz).toEqual(["monrad", "swiss"]);
  });

  it("a format that reshuffles partners cannot use fixed teams", () => {
    // The two are opposites; a format claiming both would break the team
    // pairing screen.
    for (const [id, engine] of Object.entries(FORMAT_ENGINES)) {
      if (engine.display.reshufflesPartners) {
        expect(engine.usesFixedTeams, `${id} claims both`).toBe(false);
      }
    }
  });
  it("only double elimination keeps a grand final", () => {
    // Stated per engine rather than derived from hasBracket: single
    // elimination has a bracket and no grand final.
    const withGrandFinal = Object.entries(FORMAT_ENGINES)
      .filter(([, e]) => e.display.usesGrandFinal)
      .map(([id]) => id);
    expect(withGrandFinal).toEqual(["double_elimination"]);
  });

  it("only king of the court uses a queue", () => {
    const withQueue = Object.entries(FORMAT_ENGINES)
      .filter(([, e]) => e.display.usesQueue)
      .map(([id]) => id);
    expect(withQueue).toEqual(["king_of_court"]);
  });
});

describe("group stage + knockout — who reaches the bracket", () => {
  /**
   * Two groups of four, played out so the standings are unambiguous, then
   * the knockout drawn from them.
   *
   * The existing test checked that a bracket appears. It did not check who
   * is in it, which is how an inverted seeding order survived: all group
   * winners were landing in the same half (REVIEW-BACKLOG.md A3).
   */
  const playedGroups = () => {
    const players = makePlayers(8);
    const ctx = makeContext({
      tournament: makeTournament({
        format: "group_ko",
        num_groups: 2,
        qualify_per_group: 4, // total KO field of four → two per group
        status: "active",
        current_phase: "group",
      }),
      players,
    });
    const engine = engineFor("group_ko");
    // Team 1 always wins, so within each group the standings follow the
    // order the draw produced — deterministic enough to assert on.
    return { engine, state: apply(ctx, engine.start(ctx)!, () => 1), players };
  };

  it("sends exactly the qualifiers through, two per group", () => {
    const { engine, state } = playedGroups();
    const plan = engine.advance(state)!;
    const ko = plan.rounds[0].matches;

    // Four qualifiers → two semifinals.
    expect(ko).toHaveLength(2);

    const inKo = ko.flatMap((m) => [m.team1_p1, m.team2_p1]).filter((x) => x !== null);
    expect(new Set(inKo).size).toBe(4);
  });

  it("never opens the knockout with two players from the same group", () => {
    const { engine, state } = playedGroups();
    const plan = engine.advance(state)!;

    // Which group each player came from, read back off the group rounds.
    const groupOf = new Map<number, number>();
    for (const r of state.rounds) {
      if (r.phase !== "group" || r.group_number == null) continue;
      for (const m of state.matchesByRound.get(r.id) ?? []) {
        for (const pid of [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2]) {
          if (pid) groupOf.set(pid, r.group_number);
        }
      }
    }

    for (const m of plan.rounds[0].matches) {
      if (m.team1_p1 == null || m.team2_p1 == null) continue;
      expect(
        groupOf.get(m.team1_p1),
        `${m.team1_p1} vs ${m.team2_p1} come from the same group`,
      ).not.toBe(groupOf.get(m.team2_p1));
    }
  });

  it("marks the knockout rounds as such", () => {
    const { engine, state } = playedGroups();
    const plan = engine.advance(state)!;
    expect(plan.phase).toBe("ko");
    expect(plan.rounds.every((r) => r.phase === "ko" || r.phase === "third_place")).toBe(true);
  });
});
