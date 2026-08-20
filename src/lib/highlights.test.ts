// src/lib/highlights.test.ts
//
// The "notable moments" block on the printed tournament report: the
// closest match, the most one-sided, the longest, who scored most.
//
// Nobody checks these against the results by hand, which is exactly why
// they are worth testing: a wrong "closest match" on a sheet handed out
// at the end of the evening is not something anyone would catch.

import { describe, it, expect, beforeEach } from "vitest";
import { calculateHighlights } from "./highlights";
import { makePlayer, makeMatch, resetIds } from "../test/factories";
import type { GameSet, Match, Player } from "./types";

beforeEach(resetIds);

const teamLabel = (m: Match): [string, string] => [`T${m.team1_p1}`, `T${m.team2_p1}`];
const playerName = (id: number | null) => `P${id}`;

/** A finished match plus its sets, ready for the calculator. */
function finished(
  a: Player,
  b: Player,
  scores: [number, number][],
): { match: Match; sets: GameSet[] } {
  let aSets = 0;
  let bSets = 0;
  for (const [x, y] of scores) {
    if (x > y) aSets++;
    else bSets++;
  }
  const match = makeMatch({
    team1_p1: a.id,
    team2_p1: b.id,
    status: "completed",
    winner_team: aSets > bSets ? 1 : 2,
  });
  const sets = scores.map(([x, y], i) => ({
    id: match.id * 100 + i,
    match_id: match.id,
    set_number: i + 1,
    team1_score: x,
    team2_score: y,
  }));
  return { match, sets };
}

const run = (
  players: Player[],
  entries: { match: Match; sets: GameSet[] }[],
  pointsPerSet = 21,
) =>
  calculateHighlights(
    players,
    entries.map((e) => e.match),
    new Map(entries.map((e) => [e.match.id, e.sets])),
    pointsPerSet,
    playerName,
    teamLabel,
    30,
  );

describe("calculateHighlights", () => {
  it("reports nothing for a tournament that has not started", () => {
    const highlights = run([makePlayer()], []);
    expect(highlights).toMatchObject({
      closestMatch: null,
      biggestWin: null,
      topScorer: null,
      mostWins: null,
      totalMatches: 0,
      completedMatches: 0,
    });
  });

  it("counts matches, sets and points", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const highlights = run([a, b], [finished(a, b, [[21, 15], [21, 18]])]);

    expect(highlights.completedMatches).toBe(1);
    expect(highlights.totalSets).toBe(2);
    expect(highlights.totalPoints).toBe(21 + 15 + 21 + 18);
  });

  it("finds the closest match by total point difference", () => {
    const [a, b, c, d] = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    const wide = finished(a, b, [[21, 5], [21, 7]]);
    const close = finished(c, d, [[22, 20], [19, 21], [21, 19]]);

    const highlights = run([a, b, c, d], [wide, close]);

    expect(highlights.closestMatch?.match.id).toBe(close.match.id);
    expect(highlights.biggestWin?.match.id).toBe(wide.match.id);
  });

  it("finds the highest-scoring match", () => {
    const [a, b, c, d] = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    const short = finished(a, b, [[21, 5], [21, 7]]);
    const long = finished(c, d, [[30, 28], [28, 30], [30, 29]]);

    expect(run([a, b, c, d], [short, long]).highestScoringMatch?.match.id).toBe(long.match.id);
  });

  it("finds the match that went the most sets", () => {
    const [a, b, c, d] = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    const two = finished(a, b, [[21, 5], [21, 7]]);
    const three = finished(c, d, [[21, 5], [5, 21], [21, 19]]);

    const highlights = run([a, b, c, d], [two, three]);
    expect(highlights.mostSetsMatch?.match.id).toBe(three.match.id);
    expect(highlights.mostSetsMatch?.setsPlayed).toBe(3);
  });

  it("names the player with the most points", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const highlights = run([a, b], [finished(a, b, [[21, 15], [21, 18]])]);

    expect(highlights.topScorer?.player.id).toBe(a.id);
    expect(highlights.topScorer?.totalPoints).toBe(42);
  });

  it("names the player with the most wins", () => {
    const [a, b, c] = [makePlayer(), makePlayer(), makePlayer()];
    const highlights = run([a, b, c], [
      finished(a, b, [[21, 10], [21, 12]]),
      finished(a, c, [[21, 11], [21, 13]]),
      finished(b, c, [[21, 14], [21, 15]]),
    ]);

    expect(highlights.mostWins?.player.id).toBe(a.id);
    expect(highlights.mostWins?.wins).toBe(2);
  });

  it("leaves unfinished matches out of the counts", () => {
    const [a, b] = [makePlayer(), makePlayer()];
    const done = finished(a, b, [[21, 15], [21, 18]]);
    const running = {
      match: makeMatch({ team1_p1: a.id, team2_p1: b.id, status: "active" }),
      sets: [],
    };

    const highlights = run([a, b], [done, running]);
    expect(highlights.totalMatches).toBe(2);
    expect(highlights.completedMatches).toBe(1);
  });

  it("survives a completed match with no sets recorded", () => {
    // A walkover: finished and won, but nothing was played.
    const [a, b] = [makePlayer(), makePlayer()];
    const walkover = {
      match: makeMatch({
        team1_p1: a.id,
        team2_p1: b.id,
        status: "completed",
        winner_team: 1,
        walkover: 1,
      }),
      sets: [],
    };

    const highlights = run([a, b], [walkover]);
    expect(highlights.completedMatches).toBe(1);
    expect(highlights.totalSets).toBe(0);
  });

  it("handles a doubles pair as two scorers", () => {
    const [a, b, c, d] = [makePlayer(), makePlayer(), makePlayer(), makePlayer()];
    const match = makeMatch({
      team1_p1: a.id,
      team1_p2: b.id,
      team2_p1: c.id,
      team2_p2: d.id,
      status: "completed",
      winner_team: 1,
    });
    const sets: GameSet[] = [
      { id: 1, match_id: match.id, set_number: 1, team1_score: 21, team2_score: 15 },
    ];

    const highlights = run([a, b, c, d], [{ match, sets }]);
    // Both winners scored the same, so whoever is reported is one of them.
    expect([a.id, b.id]).toContain(highlights.topScorer?.player.id);
    expect(highlights.topScorer?.totalPoints).toBe(21);
  });
});
