import { describe, it, expect, beforeEach } from "vitest";
import {
  csvCell,
  toCsv,
  matchesToCsv,
  standingsToCsv,
  paymentsToCsv,
  toJsonExport,
  exportFileName,
} from "./resultExport";
import { makePlayer, makeCompleted, makeMatch, makeSet, resetIds } from "../test/factories";
import type { Tournament, Round, StandingEntry, TournamentPlayerInfo } from "./types";

beforeEach(resetIds);

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1,
    name: "Sommercup",
    mode: "singles",
    format: "round_robin",
    sets_to_win: 2,
    points_per_set: 21,
    cap: 30,
    ko_points_per_set: null,
    ko_sets_to_win: null,
    ko_cap: null,
    courts: 2,
    num_groups: 0,
    qualify_per_group: 0,
    current_phase: null,
    entry_fee_single: 5,
    entry_fee_double: 10,
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
    status: "completed",
    ...overrides,
  };
}

const round: Round = { id: 1, tournament_id: 1, round_number: 1, phase: null, group_number: null };

describe("csvCell", () => {
  it("passes plain values through", () => {
    expect(csvCell("Meier")).toBe("Meier");
    expect(csvCell(21)).toBe("21");
  });

  it("quotes separators, quotes and newlines", () => {
    expect(csvCell("Meier; Hans")).toBe('"Meier; Hans"');
    expect(csvCell('Sie sagte "hallo"')).toBe('"Sie sagte ""hallo"""');
    expect(csvCell("Zeile1\nZeile2")).toBe('"Zeile1\nZeile2"');
  });

  it("turns null and undefined into an empty cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("joins cells with semicolons and rows with CRLF", () => {
    expect(toCsv([["a", "b"], [1, 2]])).toBe("a;b\r\n1;2");
  });
});

describe("matchesToCsv", () => {
  it("writes one row per match with its set scores", () => {
    const [a, b] = [makePlayer({ first_name: "Anna" }), makePlayer({ first_name: "Bea" })];
    const r = makeCompleted(a.id, b.id, [[21, 15], [21, 18]], { round_id: 1 });

    const csv = matchesToCsv({
      tournament: makeTournament(),
      players: [a, b],
      rounds: [round],
      matches: [r.match],
      sets: r.sets,
      standings: [],
    });

    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Team 1");
    expect(lines[0]).toContain("Satz 2");
    expect(lines[1]).toContain("Anna");
    expect(lines[1]).toContain("Bea");
    expect(lines[1]).toContain("21:15");
    expect(lines[1]).toContain("21:18");
    expect(lines[1]).toContain("gespielt");
  });

  it("labels a bye and leaves the opponent empty", () => {
    const a = makePlayer({ first_name: "Anna" });
    const bye = makeMatch({
      round_id: 1,
      team1_p1: a.id,
      team2_p1: null,
      winner_team: 1,
      status: "completed",
    });

    const csv = matchesToCsv({
      tournament: makeTournament(),
      players: [a],
      rounds: [round],
      matches: [bye],
      sets: [],
      standings: [],
    });
    expect(csv.split("\r\n")[1]).toContain("Freilos");
  });

  it("labels a walkover", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const wo = makeMatch({
      round_id: 1,
      team1_p1: a.id,
      team2_p1: b.id,
      winner_team: 1,
      status: "completed",
      walkover: 1,
    });

    const csv = matchesToCsv({
      tournament: makeTournament(),
      players: [a, b],
      rounds: [round],
      matches: [wo],
      sets: [],
      standings: [],
    });
    expect(csv.split("\r\n")[1]).toContain("kampflos");
  });

  it("shows both partners of a doubles team", () => {
    const players = [makePlayer({ first_name: "Anna" }), makePlayer({ first_name: "Bea" }), makePlayer({ first_name: "Cem" }), makePlayer({ first_name: "Dana" })];
    const m = makeMatch({
      round_id: 1,
      team1_p1: players[0].id, team1_p2: players[1].id,
      team2_p1: players[2].id, team2_p2: players[3].id,
    });

    const csv = matchesToCsv({
      tournament: makeTournament({ mode: "doubles" }),
      players,
      rounds: [round],
      matches: [m],
      sets: [],
      standings: [],
    });
    expect(csv).toContain("Anna / Bea");
    expect(csv).toContain("Cem / Dana");
  });

  it("orders rows by round", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const second: Round = { ...round, id: 2, round_number: 2 };
    const m1 = makeMatch({ round_id: 2, team1_p1: a.id, team2_p1: b.id });
    const m2 = makeMatch({ round_id: 1, team1_p1: a.id, team2_p1: b.id });

    const csv = matchesToCsv({
      tournament: makeTournament(),
      players: [a, b],
      rounds: [round, second],
      matches: [m1, m2],
      sets: [],
      standings: [],
    });

    const lines = csv.split("\r\n");
    expect(lines[1].split(";")[1]).toBe("1");
    expect(lines[2].split(";")[1]).toBe("2");
  });
});

describe("standingsToCsv", () => {
  const table = (): StandingEntry[] => [
    { player: makePlayer({ first_name: "Anna", club: "TSV" }), wins: 2, losses: 0, setsWon: 4, setsLost: 1, pointsWon: 84, pointsLost: 60 },
    { player: makePlayer({ first_name: "Bea", club: null }), wins: 0, losses: 2, setsWon: 1, setsLost: 4, pointsWon: 60, pointsLost: 84 },
  ];

  it("numbers the places and lists the figures", () => {
    const csv = standingsToCsv({
      tournament: makeTournament(),
      players: [],
      rounds: [],
      matches: [],
      sets: [],
      standings: table(),
    });

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Platz;Spieler;Verein;Siege;Niederlagen;Saetze +;Saetze -;Punkte +;Punkte -");
    expect(lines[1]).toBe("1;Anna;TSV;2;0;4;1;84;60");
    expect(lines[2]).toBe("2;Bea;;0;2;1;4;60;84");
  });

  it("adds a Buchholz column only when the table has one", () => {
    const withBuchholz = table().map((e, i) => ({ ...e, buchholz: i }));
    const csv = standingsToCsv({
      tournament: makeTournament(),
      players: [],
      rounds: [],
      matches: [],
      sets: [],
      standings: withBuchholz,
    });
    expect(csv.split("\r\n")[0]).toContain("Buchholz");
  });
});

describe("paymentsToCsv", () => {
  it("lists status, method and amount", () => {
    const paymentData: TournamentPlayerInfo[] = [
      {
        player: makePlayer({ first_name: "Anna", club: "TSV" }),
        payment_status: "paid",
        payment_method: "bar",
        paid_date: "2026-08-18T10:00:00.000Z",
        retired: false,
        seed_rank: null,
      },
      {
        player: makePlayer({ first_name: "Bea" }),
        payment_status: "unpaid",
        payment_method: null,
        paid_date: null,
        retired: false,
        seed_rank: null,
      },
    ];

    const csv = paymentsToCsv({
      tournament: makeTournament(),
      players: [],
      rounds: [],
      matches: [],
      sets: [],
      standings: [],
      paymentData,
    });

    const lines = csv.split("\r\n");
    expect(lines[1]).toContain("bezahlt");
    expect(lines[1]).toContain("bar");
    expect(lines[1]).toContain("5");
    expect(lines[2]).toContain("offen");
  });
});

describe("toJsonExport", () => {
  it("contains the whole tournament and parses back", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const r = makeCompleted(a.id, b.id, [[21, 15], [21, 18]], { round_id: 1 });

    const json = toJsonExport({
      tournament: makeTournament(),
      players: [a, b],
      rounds: [round],
      matches: [r.match],
      sets: r.sets,
      standings: [],
    });

    const parsed = JSON.parse(json);
    expect(parsed.tournament.name).toBe("Sommercup");
    expect(parsed.players).toHaveLength(2);
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.sets).toHaveLength(2);
    expect(typeof parsed.exported_at).toBe("string");
  });
});

describe("exportFileName", () => {
  it("builds a dated, safe file name", () => {
    const name = exportFileName(makeTournament({ name: "Sommercup 2026 / Herren" }), "ergebnisse", "csv");
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}_Sommercup_2026_Herren_ergebnisse\.csv$/);
  });

  it("falls back when the name has no usable characters", () => {
    expect(exportFileName(makeTournament({ name: "///" }), "rangliste", "csv")).toContain("turnier_rangliste");
  });

  it("keeps very long names manageable", () => {
    const long = exportFileName(makeTournament({ name: "A".repeat(120) }), "x", "json");
    expect(long.length).toBeLessThan(70);
  });
});

describe("set columns", () => {
  it("sizes the header to the longest match", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const short = makeMatch({ id: 10, round_id: 1, team1_p1: a.id, team2_p1: b.id });
    const long = makeMatch({ id: 11, round_id: 1, team1_p1: a.id, team2_p1: b.id });
    const sets = [
      makeSet({ match_id: 10, set_number: 1, team1_score: 21, team2_score: 10 }),
      makeSet({ match_id: 11, set_number: 1, team1_score: 21, team2_score: 10 }),
      makeSet({ match_id: 11, set_number: 2, team1_score: 15, team2_score: 21 }),
      makeSet({ match_id: 11, set_number: 3, team1_score: 21, team2_score: 19 }),
    ];

    const csv = matchesToCsv({
      tournament: makeTournament(),
      players: [a, b],
      rounds: [round],
      matches: [short, long],
      sets,
      standings: [],
    });

    expect(csv.split("\r\n")[0]).toContain("Satz 3");
  });
});
