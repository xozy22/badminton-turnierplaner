import { describe, it, expect, beforeEach } from "vitest";
import {
  SCORING_MODES,
  getScoringModeId,
  isSetWon,
  isSetComplete,
  isScoreValid,
  autoFillOpponentScore,
  getMaxScore,
  determineMatchWinner,
  calculateStandings,
  calculateTeamStandings,
  rankAcrossGroups,
  limitStandingsToTopN,
  limitTeamStandingsToTopN,
} from "./scoring";
import {
  makePlayer,
  makeMatch,
  makeCompleted,
  makeSet,
  setsByMatch,
  resetIds,
  SCORING_TABLE,
} from "../test/factories";

beforeEach(resetIds);

describe("SCORING_MODES", () => {
  it("matches the documented five modes", () => {
    expect(SCORING_MODES.map((m) => m.id)).toEqual([
      "11_hard",
      "11_ext",
      "15_hard",
      "15_ext",
      "21_ext",
    ]);
  });

  it("resolves every (points, cap) pair back to its mode id", () => {
    for (const mode of SCORING_TABLE) {
      expect(getScoringModeId(mode.pointsPerSet, mode.cap)).toBe(mode.id);
    }
  });

  it("falls back to 21_ext for unknown combinations", () => {
    expect(getScoringModeId(9, 99)).toBe("21_ext");
  });
});

describe("isSetWon", () => {
  describe("modes with extension (cap)", () => {
    it("accepts a clean win at the target score", () => {
      expect(isSetWon(21, 15, 21, 30)).toBe(true);
      expect(isSetWon(11, 4, 11, 20)).toBe(true);
      expect(isSetWon(15, 9, 15, 25)).toBe(true);
    });

    it("rejects a one-point lead below the cap", () => {
      expect(isSetWon(21, 20, 21, 30)).toBe(false);
      expect(isSetWon(11, 10, 11, 20)).toBe(false);
    });

    it("requires exactly two points of lead in extension", () => {
      expect(isSetWon(22, 20, 21, 30)).toBe(true);
      expect(isSetWon(23, 21, 21, 30)).toBe(true);
    });

    it("accepts a single point of lead at the cap", () => {
      expect(isSetWon(30, 29, 21, 30)).toBe(true);
      expect(isSetWon(20, 19, 11, 20)).toBe(true);
      expect(isSetWon(25, 24, 15, 25)).toBe(true);
    });

    it("rejects scores below the target and ties", () => {
      expect(isSetWon(20, 15, 21, 30)).toBe(false);
      expect(isSetWon(21, 21, 21, 30)).toBe(false);
    });
  });

  describe("hard-cap modes (no extension)", () => {
    it("accepts first-to-N even with a one point lead", () => {
      expect(isSetWon(11, 10, 11, null)).toBe(true);
      expect(isSetWon(15, 14, 15, null)).toBe(true);
    });

    it("rejects anything below the target", () => {
      expect(isSetWon(10, 3, 11, null)).toBe(false);
    });
  });

  it("is permissive on its own — isSetComplete adds the plausibility check", () => {
    // 30:20 passes isSetWon (score == cap, lead >= 1) but is not a
    // reachable badminton score. The guard lives in isScoreValid, which
    // isSetComplete consults. Documents the division of responsibility.
    expect(isSetWon(30, 20, 21, 30)).toBe(true);
    expect(isSetComplete(makeSet({ team1_score: 30, team2_score: 20 }), 21, 30)).toBe(false);
  });
});

describe("isScoreValid", () => {
  it("accepts an in-progress score below the target", () => {
    expect(isScoreValid(0, 0, 21, 30).valid).toBe(true);
    expect(isScoreValid(18, 12, 21, 30).valid).toBe(true);
  });

  it("accepts 21:20 as a legal in-progress score after deuce", () => {
    // Reachable: 20:20 then one rally won. Not a win (needs two points
    // clear), but the input must not be flagged as an error.
    expect(isScoreValid(21, 20, 21, 30).valid).toBe(true);
    expect(isSetComplete(makeSet({ team1_score: 21, team2_score: 20 }), 21, 30)).toBe(false);
  });

  it("rejects negative scores", () => {
    expect(isScoreValid(-1, 5, 21, 30).valid).toBe(false);
  });

  it("rejects scores above the maximum", () => {
    expect(isScoreValid(31, 20, 21, 30).valid).toBe(false);
    expect(isScoreValid(12, 5, 11, null).valid).toBe(false);
  });

  it("rejects a draw at or above the target", () => {
    expect(isScoreValid(21, 21, 21, 30).valid).toBe(false);
    expect(isScoreValid(11, 11, 11, null).valid).toBe(false);
  });

  it("rejects extension scores with the wrong gap", () => {
    expect(isScoreValid(25, 20, 21, 30).valid).toBe(false); // gap of 5
    expect(isScoreValid(25, 23, 21, 30).valid).toBe(true); // gap of 2
  });

  it("rejects a cap score with an impossible opponent score", () => {
    expect(isScoreValid(30, 27, 21, 30).valid).toBe(false);
    expect(isScoreValid(30, 28, 21, 30).valid).toBe(true);
    expect(isScoreValid(30, 29, 21, 30).valid).toBe(true);
    expect(isScoreValid(30, 30, 21, 30).valid).toBe(false);
  });

  it("returns an explanatory error message for every rejection", () => {
    const rejected = [
      isScoreValid(-1, 5, 21, 30),
      isScoreValid(31, 20, 21, 30),
      isScoreValid(21, 21, 21, 30),
      isScoreValid(25, 20, 21, 30),
      isScoreValid(30, 27, 21, 30),
    ];
    for (const r of rejected) {
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
    }
  });
});

describe("isSetComplete", () => {
  it("treats 0:0 as untouched", () => {
    expect(isSetComplete(makeSet({ team1_score: 0, team2_score: 0 }), 21, 30)).toBe(false);
  });

  it("accepts a finished set for either side", () => {
    expect(isSetComplete(makeSet({ team1_score: 21, team2_score: 15 }), 21, 30)).toBe(true);
    expect(isSetComplete(makeSet({ team1_score: 15, team2_score: 21 }), 21, 30)).toBe(true);
  });

  it("rejects an unfinished set", () => {
    expect(isSetComplete(makeSet({ team1_score: 18, team2_score: 12 }), 21, 30)).toBe(false);
  });
});

describe("autoFillOpponentScore", () => {
  it("suggests the target score for a fresh low entry", () => {
    expect(autoFillOpponentScore(15, 21, 30, true)).toBe(21);
    expect(autoFillOpponentScore(5, 11, null, true)).toBe(11);
  });

  it("suggests nothing for a low entry when the field is not fresh", () => {
    expect(autoFillOpponentScore(15, 21, 30, false)).toBeNull();
  });

  it("suggests the extension score when the entry is one below the target", () => {
    expect(autoFillOpponentScore(20, 21, 30, true)).toBe(22);
    expect(autoFillOpponentScore(10, 11, 20, true)).toBe(12);
    expect(autoFillOpponentScore(14, 15, 25, true)).toBe(16);
  });

  it("suggests a two-point gap inside the extension range", () => {
    expect(autoFillOpponentScore(24, 21, 30, true)).toBe(22);
    expect(autoFillOpponentScore(29, 21, 30, true)).toBe(27);
  });

  it("suggests cap-1 at the cap", () => {
    expect(autoFillOpponentScore(30, 21, 30, true)).toBe(29);
    expect(autoFillOpponentScore(20, 11, 20, true)).toBe(19);
  });

  it("suggests nothing when the entry is the target itself (ambiguous)", () => {
    expect(autoFillOpponentScore(21, 21, 30, true)).toBeNull();
    expect(autoFillOpponentScore(11, 11, null, true)).toBeNull();
  });

  it("suggests nothing for zero or negative entries", () => {
    expect(autoFillOpponentScore(0, 21, 30, true)).toBeNull();
    expect(autoFillOpponentScore(-3, 21, 30, true)).toBeNull();
  });

  it("never suggests a score the validator would reject", () => {
    for (const mode of SCORING_TABLE) {
      const max = getMaxScore(mode.pointsPerSet, mode.cap);
      for (let entered = 1; entered <= max; entered++) {
        const other = autoFillOpponentScore(entered, mode.pointsPerSet, mode.cap, true);
        if (other === null) continue;
        const check = isScoreValid(entered, other, mode.pointsPerSet, mode.cap);
        expect(
          check.valid,
          `${mode.id}: ${entered}:${other} was suggested but rejected (${check.error})`,
        ).toBe(true);
      }
    }
  });
});

describe("determineMatchWinner", () => {
  it("needs setsToWin finished sets", () => {
    const oneSet = [makeSet({ team1_score: 21, team2_score: 15 })];
    expect(determineMatchWinner(oneSet, 2, 21, 30)).toBeNull();
    expect(determineMatchWinner(oneSet, 1, 21, 30)).toBe(1);
  });

  it("decides a best-of-three that goes the distance", () => {
    const sets = [
      makeSet({ set_number: 1, team1_score: 21, team2_score: 15 }),
      makeSet({ set_number: 2, team1_score: 18, team2_score: 21 }),
      makeSet({ set_number: 3, team1_score: 22, team2_score: 20 }),
    ];
    expect(determineMatchWinner(sets, 2, 21, 30)).toBe(1);
  });

  it("ignores unfinished sets", () => {
    const sets = [
      makeSet({ set_number: 1, team1_score: 21, team2_score: 15 }),
      makeSet({ set_number: 2, team1_score: 19, team2_score: 12 }),
    ];
    expect(determineMatchWinner(sets, 2, 21, 30)).toBeNull();
  });

  it("reports team 2 as the winner", () => {
    const sets = [
      makeSet({ set_number: 1, team1_score: 15, team2_score: 21 }),
      makeSet({ set_number: 2, team1_score: 12, team2_score: 21 }),
    ];
    expect(determineMatchWinner(sets, 2, 21, 30)).toBe(2);
  });
});

describe("calculateStandings", () => {
  it("counts wins, losses, sets and points", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const { match, sets } = makeCompleted(a.id, b.id, [
      [21, 15],
      [21, 18],
    ]);
    const table = calculateStandings([a, b], [match], setsByMatch(sets));

    expect(table[0].player.id).toBe(a.id);
    expect(table[0]).toMatchObject({ wins: 1, losses: 0, setsWon: 2, setsLost: 0, pointsWon: 42, pointsLost: 33 });
    expect(table[1]).toMatchObject({ wins: 0, losses: 1, setsWon: 0, setsLost: 2, pointsWon: 33, pointsLost: 42 });
  });

  it("ignores matches that are not completed", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const { match, sets } = makeCompleted(a.id, b.id, [[21, 15]], { status: "active", winner_team: null });
    const table = calculateStandings([a, b], [match], setsByMatch(sets));
    expect(table.every((e) => e.wins === 0 && e.losses === 0)).toBe(true);
  });

  it("does not count a bye as a win", () => {
    // A2: a bye advances the player but was never played, so it must not
    // appear in wins, sets or points.
    const [a, b] = [makePlayer(), makePlayer()];
    const bye = makeMatch({
      team1_p1: a.id,
      team2_p1: null,
      winner_team: 1,
      status: "completed",
      completed_at: "2026-01-01T12:00:00.000Z",
    });
    const table = calculateStandings([a, b], [bye], new Map());
    expect(table.every((e) => e.wins === 0 && e.losses === 0)).toBe(true);
  });

  it("lists players without matches", () => {
    const players = [makePlayer(), makePlayer(), makePlayer()];
    const table = calculateStandings(players, [], new Map());
    expect(table).toHaveLength(3);
  });

  // --- Ranking rule, see REVIEW-BACKLOG.md B1 ---------------------------

  it("ranks by wins, not by win rate", () => {
    const strong = makePlayer(); // 5 wins, 1 loss
    const lucky = makePlayer(); // 1 win, 0 losses
    const filler = makePlayer();

    const matches = [];
    const sets = [];
    for (let i = 0; i < 5; i++) {
      const r = makeCompleted(strong.id, filler.id, [[21, 10], [21, 10]]);
      matches.push(r.match);
      sets.push(...r.sets);
    }
    const lost = makeCompleted(filler.id, strong.id, [[21, 10], [21, 10]]);
    matches.push(lost.match);
    sets.push(...lost.sets);

    const won = makeCompleted(lucky.id, filler.id, [[21, 19], [21, 19]]);
    matches.push(won.match);
    sets.push(...won.sets);

    const table = calculateStandings([strong, lucky, filler], matches, setsByMatch(sets));
    expect(table[0].player.id).toBe(strong.id);
  });

  it("breaks a tie by head-to-head result", () => {
    const a = makePlayer();
    const b = makePlayer();
    const c = makePlayer();
    const d = makePlayer();

    // a and b both go 1-1; a beat b directly, so a must rank above b.
    const r1 = makeCompleted(a.id, b.id, [[21, 19], [21, 19]]);
    const r2 = makeCompleted(c.id, a.id, [[21, 10], [21, 10]]);
    const r3 = makeCompleted(b.id, d.id, [[21, 5], [21, 5]]);

    const matches = [r1.match, r2.match, r3.match];
    const sets = [...r1.sets, ...r2.sets, ...r3.sets];
    const table = calculateStandings([a, b, c, d], matches, setsByMatch(sets));

    const posA = table.findIndex((e) => e.player.id === a.id);
    const posB = table.findIndex((e) => e.player.id === b.id);
    expect(posA).toBeLessThan(posB);
  });

  it("falls back to set difference when head-to-head says nothing", () => {
    // a and b never met; both won once. a won 2:0, b won 2:1.
    const a = makePlayer();
    const b = makePlayer();
    const c = makePlayer();
    const d = makePlayer();

    const r1 = makeCompleted(a.id, c.id, [[21, 10], [21, 10]]);
    const r2 = makeCompleted(b.id, d.id, [[21, 10], [10, 21], [21, 10]]);

    const table = calculateStandings(
      [a, b, c, d],
      [r1.match, r2.match],
      setsByMatch([...r1.sets, ...r2.sets]),
    );

    const posA = table.findIndex((e) => e.player.id === a.id);
    const posB = table.findIndex((e) => e.player.id === b.id);
    expect(posA).toBeLessThan(posB);
  });

  it("falls back to point difference when sets are level", () => {
    const a = makePlayer();
    const b = makePlayer();
    const c = makePlayer();
    const d = makePlayer();

    const r1 = makeCompleted(a.id, c.id, [[21, 2], [21, 2]]); // +38
    const r2 = makeCompleted(b.id, d.id, [[21, 19], [21, 19]]); // +4

    const table = calculateStandings(
      [a, b, c, d],
      [r1.match, r2.match],
      setsByMatch([...r1.sets, ...r2.sets]),
    );

    const posA = table.findIndex((e) => e.player.id === a.id);
    const posB = table.findIndex((e) => e.player.id === b.id);
    expect(posA).toBeLessThan(posB);
  });

  it("resolves a three-way tie through the mini table", () => {
    // a beats b, b beats c, c beats a — all 1-1 after also losing/winning
    // elsewhere. Set difference inside the group decides.
    const a = makePlayer();
    const b = makePlayer();
    const c = makePlayer();

    const r1 = makeCompleted(a.id, b.id, [[21, 10], [21, 10]]); // a +2
    const r2 = makeCompleted(b.id, c.id, [[21, 10], [15, 21], [21, 19]]); // b +1
    const r3 = makeCompleted(c.id, a.id, [[21, 10], [15, 21], [21, 19]]); // c +1

    const table = calculateStandings(
      [a, b, c],
      [r1.match, r2.match, r3.match],
      setsByMatch([...r1.sets, ...r2.sets, ...r3.sets]),
    );

    // Everyone is 1-1 with one mini-table win, so the set difference inside
    // the group decides: a won 2:0 and lost 1:2 → +1; b won 2:1, lost 0:2 → -1;
    // c won 2:1, lost 1:2 → 0.
    expect(table.map((e) => e.player.id)).toEqual([a.id, c.id, b.id]);
  });

  it("produces a stable order for identical records", () => {
    const players = [makePlayer(), makePlayer(), makePlayer()];
    const first = calculateStandings(players, [], new Map()).map((e) => e.player.id);
    const second = calculateStandings([...players].reverse(), [], new Map()).map((e) => e.player.id);
    expect(second).toEqual(first);
  });

  it("keeps a walkover out of sets and points but counts the win", () => {
    // B8: a retirement is awarded without play.
    const winner = makePlayer();
    const retired = makePlayer();
    const wo = makeMatch({
      team1_p1: winner.id,
      team2_p1: retired.id,
      winner_team: 1,
      status: "completed",
      walkover: 1,
      completed_at: "2026-01-01T12:00:00.000Z",
    });

    const table = calculateStandings([winner, retired], [wo], new Map());
    const w = table.find((e) => e.player.id === winner.id)!;
    expect(w.wins).toBe(1);
    expect(w.setsWon + w.setsLost).toBe(0);
    expect(w.pointsWon + w.pointsLost).toBe(0);
  });

  it("ignores stray sets attached to a walkover", () => {
    const winner = makePlayer();
    const retired = makePlayer();
    const wo = makeMatch({
      team1_p1: winner.id,
      team2_p1: retired.id,
      winner_team: 1,
      status: "completed",
      walkover: 1,
      completed_at: "2026-01-01T12:00:00.000Z",
    });
    const strays = setsByMatch([
      makeSet({ match_id: wo.id, set_number: 1, team1_score: 21, team2_score: 0 }),
    ]);

    const table = calculateStandings([winner, retired], [wo], strays);
    expect(table.every((e) => e.setsWon + e.setsLost === 0)).toBe(true);
  });
});

describe("calculateTeamStandings", () => {
  it("aggregates per team regardless of side", () => {
    const [p1, p2, p3, p4] = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    const { match, sets } = makeCompleted(p1.id, p3.id, [
      [21, 15],
      [21, 18],
    ], { team1_p2: p2.id, team2_p2: p4.id });

    const table = calculateTeamStandings([p1, p2, p3, p4], [match], setsByMatch(sets));
    expect(table).toHaveLength(2);
    expect(table[0]).toMatchObject({ wins: 1, losses: 0, setsWon: 2, setsLost: 0 });
    expect(table[0].teamKey).toBe(`${Math.min(p1.id, p2.id)}-${Math.max(p1.id, p2.id)}`);
  });

  it("keeps a team identity independent of player order", () => {
    const [p1, p2, p3, p4] = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    const first = makeCompleted(p1.id, p3.id, [[21, 15], [21, 15]], { team1_p2: p2.id, team2_p2: p4.id });
    // Same pairing, players swapped within the team and sides reversed.
    const second = makeCompleted(p3.id, p2.id, [[21, 15], [21, 15]], { team1_p2: p4.id, team2_p2: p1.id });

    const table = calculateTeamStandings(
      [p1, p2, p3, p4],
      [first.match, second.match],
      setsByMatch([...first.sets, ...second.sets]),
    );
    expect(table).toHaveLength(2);
    expect(table.every((e) => e.wins + e.losses === 2)).toBe(true);
  });
});

describe("rankAcrossGroups", () => {
  const entry = (id: number, wins: number, sets: [number, number], points: [number, number]) => ({
    id,
    wins,
    setsWon: sets[0],
    setsLost: sets[1],
    pointsWon: points[0],
    pointsLost: points[1],
  });

  it("ranks by wins first", () => {
    const ranked = rankAcrossGroups(
      [entry(1, 1, [2, 2], [80, 40]), entry(2, 2, [4, 0], [42, 20])],
      (e) => e.id,
    );
    expect(ranked.map((e) => e.id)).toEqual([2, 1]);
  });

  it("uses set difference on equal wins", () => {
    const ranked = rankAcrossGroups(
      [entry(1, 2, [4, 2], [90, 80]), entry(2, 2, [4, 0], [84, 40])],
      (e) => e.id,
    );
    expect(ranked.map((e) => e.id)).toEqual([2, 1]);
  });

  it("uses point difference when sets are level", () => {
    const ranked = rankAcrossGroups(
      [entry(1, 2, [4, 0], [84, 60]), entry(2, 2, [4, 0], [84, 20])],
      (e) => e.id,
    );
    expect(ranked.map((e) => e.id)).toEqual([2, 1]);
  });

  it("falls back to the stable key", () => {
    const ranked = rankAcrossGroups(
      [entry(7, 1, [2, 0], [42, 20]), entry(3, 1, [2, 0], [42, 20])],
      (e) => e.id,
    );
    expect(ranked.map((e) => e.id)).toEqual([3, 7]);
  });

  it("does not mutate the input", () => {
    const input = [entry(1, 1, [2, 0], [42, 20]), entry(2, 3, [6, 0], [63, 30])];
    const before = input.map((e) => e.id);
    rankAcrossGroups(input, (e) => e.id);
    expect(input.map((e) => e.id)).toEqual(before);
  });
});

describe("limitStandingsToTopN", () => {
  it("returns the table unchanged when it is already small enough", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const r = makeCompleted(a.id, b.id, [[21, 10], [21, 10]]);
    const table = calculateStandings([a, b], [r.match], setsByMatch(r.sets));
    expect(limitStandingsToTopN(table, [r.match], setsByMatch(r.sets), 3)).toBe(table);
  });

  it("drops the results against the bottom-placed players", () => {
    // B11: a group of three compared against groups of two. The results
    // against the third-placed player must not count.
    const [a, b, c] = [makePlayer(), makePlayer(), makePlayer()];
    const ab = makeCompleted(a.id, b.id, [[21, 19], [21, 19]]);
    const ac = makeCompleted(a.id, c.id, [[21, 2], [21, 2]]); // dropped
    const bc = makeCompleted(b.id, c.id, [[21, 5], [21, 5]]); // dropped

    const matches = [ab.match, ac.match, bc.match];
    const sets = setsByMatch([...ab.sets, ...ac.sets, ...bc.sets]);
    const full = calculateStandings([a, b, c], matches, sets);
    expect(full[0].wins).toBe(2); // a beat both

    const limited = limitStandingsToTopN(full, matches, sets, 2);
    const limitedA = limited.find((e) => e.player.id === a.id)!;
    expect(limited).toHaveLength(2);
    expect(limitedA.wins).toBe(1); // only the match against b counts
    expect(limitedA.pointsWon).toBe(42);
  });
});

describe("Swiss standings options", () => {
  it("counts a bye as a win when asked to", () => {
    const player = makePlayer();
    const bye = makeMatch({
      team1_p1: player.id,
      team2_p1: null,
      winner_team: 1,
      status: "completed",
      completed_at: "2026-01-01T12:00:00.000Z",
    });

    const knockout = calculateStandings([player], [bye], new Map());
    expect(knockout[0].wins).toBe(0); // a bye is only an advance in a KO

    const swiss = calculateStandings([player], [bye], new Map(), { byesCountAsWins: true });
    expect(swiss[0].wins).toBe(1); // in Swiss it has to keep up with the field
    expect(swiss[0].setsWon + swiss[0].setsLost).toBe(0);
  });

  it("computes Buchholz from the opponents' wins", () => {
    const [a, b, c] = [makePlayer(), makePlayer(), makePlayer()];
    // a beat b; b beat c. a's opponent (b) has one win → Buchholz 1.
    const ab = makeCompleted(a.id, b.id, [[21, 10], [21, 10]]);
    const bc = makeCompleted(b.id, c.id, [[21, 10], [21, 10]]);

    const table = calculateStandings(
      [a, b, c],
      [ab.match, bc.match],
      setsByMatch([...ab.sets, ...bc.sets]),
      { withBuchholz: true },
    );

    const byId = new Map(table.map((e) => [e.player.id, e]));
    expect(byId.get(a.id)!.buchholz).toBe(1); // faced b (1 win)
    expect(byId.get(c.id)!.buchholz).toBe(1); // faced b (1 win)
    expect(byId.get(b.id)!.buchholz).toBe(1); // faced a (1 win) and c (0)
  });

  it("ranks by Buchholz before head-to-head", () => {
    const [a, b, weak, strong] = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    // a and b each have one win. a beat `strong` (who also won a match),
    // b beat `weak` (who never won) — so a faced the stronger field.
    const strongWin = makeCompleted(strong.id, weak.id, [[21, 10], [21, 10]]);
    const aWin = makeCompleted(a.id, strong.id, [[21, 10], [21, 10]]);
    const bWin = makeCompleted(b.id, weak.id, [[21, 10], [21, 10]]);

    const table = calculateStandings(
      [a, b, weak, strong],
      [strongWin.match, aWin.match, bWin.match],
      setsByMatch([...strongWin.sets, ...aWin.sets, ...bWin.sets]),
      { withBuchholz: true },
    );

    const posA = table.findIndex((e) => e.player.id === a.id);
    const posB = table.findIndex((e) => e.player.id === b.id);
    expect(posA).toBeLessThan(posB);
  });

  it("leaves Buchholz undefined when it was not requested", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const r = makeCompleted(a.id, b.id, [[21, 10], [21, 10]]);
    const table = calculateStandings([a, b], [r.match], setsByMatch(r.sets));
    expect(table.every((e) => e.buchholz === undefined)).toBe(true);
  });
});

describe("limitTeamStandingsToTopN", () => {
  it("returns the table unchanged when it is already small enough", () => {
    const [p1, p2, p3, p4] = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    const r = makeCompleted(p1.id, p3.id, [[21, 10], [21, 10]], { team1_p2: p2.id, team2_p2: p4.id });
    const players = [p1, p2, p3, p4];
    const table = calculateTeamStandings(players, [r.match], setsByMatch(r.sets));
    expect(limitTeamStandingsToTopN(table, players, [r.match], setsByMatch(r.sets), 5)).toBe(table);
  });

  it("drops the matches against the bottom-placed team", () => {
    const players = Array.from({ length: 6 }, () => makePlayer());
    const [a1, a2, b1, b2, c1, c2] = players;

    // Team A beat B and C, team B beat C. Limited to the top two teams,
    // only the A-versus-B match may count.
    const ab = makeCompleted(a1.id, b1.id, [[21, 19], [21, 19]], { team1_p2: a2.id, team2_p2: b2.id });
    const ac = makeCompleted(a1.id, c1.id, [[21, 2], [21, 2]], { team1_p2: a2.id, team2_p2: c2.id });
    const bc = makeCompleted(b1.id, c1.id, [[21, 5], [21, 5]], { team1_p2: b2.id, team2_p2: c2.id });

    const matches = [ab.match, ac.match, bc.match];
    const sets = setsByMatch([...ab.sets, ...ac.sets, ...bc.sets]);
    const full = calculateTeamStandings(players, matches, sets);
    expect(full[0].wins).toBe(2);

    const limited = limitTeamStandingsToTopN(full, players, matches, sets, 2);
    expect(limited).toHaveLength(2);
    expect(limited[0].wins).toBe(1);
  });
});

describe("team standings details", () => {
  it("counts a walkover as a win without sets", () => {
    const [p1, p2, p3, p4] = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    const wo = makeMatch({
      team1_p1: p1.id, team1_p2: p2.id,
      team2_p1: p3.id, team2_p2: p4.id,
      winner_team: 1, status: "completed", walkover: 1,
      completed_at: "2026-01-01T12:00:00.000Z",
    });

    const table = calculateTeamStandings([p1, p2, p3, p4], [wo], new Map());
    expect(table[0].wins).toBe(1);
    expect(table[0].setsWon + table[0].setsLost).toBe(0);
  });

  it("ignores a bye", () => {
    const [p1, p2] = [makePlayer(), makePlayer()];
    const bye = makeMatch({
      team1_p1: p1.id, team1_p2: p2.id,
      team2_p1: null, team2_p2: null,
      winner_team: 1, status: "completed",
      completed_at: "2026-01-01T12:00:00.000Z",
    });
    const table = calculateTeamStandings([p1, p2], [bye], new Map());
    expect(table.every((e) => e.wins === 0)).toBe(true);
  });

  it("breaks a team tie by head-to-head", () => {
    const players = Array.from({ length: 8 }, () => makePlayer());
    const [a1, a2, b1, b2, c1, c2, d1, d2] = players;

    // Teams A and B both finish 1-1; A beat B directly.
    const ab = makeCompleted(a1.id, b1.id, [[21, 19], [21, 19]], { team1_p2: a2.id, team2_p2: b2.id });
    const ca = makeCompleted(c1.id, a1.id, [[21, 10], [21, 10]], { team1_p2: c2.id, team2_p2: a2.id });
    const bd = makeCompleted(b1.id, d1.id, [[21, 5], [21, 5]], { team1_p2: b2.id, team2_p2: d2.id });

    const table = calculateTeamStandings(
      players,
      [ab.match, ca.match, bd.match],
      setsByMatch([...ab.sets, ...ca.sets, ...bd.sets]),
    );

    const keyOf = (x: number, y: number) => `${Math.min(x, y)}-${Math.max(x, y)}`;
    const posA = table.findIndex((e) => e.teamKey === keyOf(a1.id, a2.id));
    const posB = table.findIndex((e) => e.teamKey === keyOf(b1.id, b2.id));
    expect(posA).toBeLessThan(posB);
  });
});
