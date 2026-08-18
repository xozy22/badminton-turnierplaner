import type { Player, Match, GameSet, StandingEntry, TeamStandingEntry } from "./types";
import type { Translations } from "./i18n/types";

/**
 * 5 Punktemodi (unabhaengig von Gewinnsaetzen):
 *
 * 11_hard: 11 Pkt · harter Cap       – kein Ext., Sieg bei exakt 11 Pkt
 * 11_ext:  11 Pkt · Verlaengerung bis 20
 * 15_hard: 15 Pkt · harter Cap       – kein Ext., Sieg bei exakt 15 Pkt
 * 15_ext:  15 Pkt · Verlaengerung bis 25
 * 21_ext:  21 Pkt · Verlaengerung bis 30 (Standard)
 *
 * Gewinnsaetze (Best of 1/3/5) werden separat in sets_to_win gespeichert.
 */

export type ScoringModeId = "11_hard" | "11_ext" | "15_hard" | "15_ext" | "21_ext";

export interface ScoringMode {
  id: ScoringModeId;
  points_per_set: number;
  /** null = kein Cap (harter Cap), number = max. Punkte bei Verlaengerung */
  cap: number | null;
}

export const SCORING_MODES: ScoringMode[] = [
  { id: "11_hard", points_per_set: 11, cap: null },
  { id: "11_ext",  points_per_set: 11, cap: 20   },
  { id: "15_hard", points_per_set: 15, cap: null  },
  { id: "15_ext",  points_per_set: 15, cap: 25   },
  { id: "21_ext",  points_per_set: 21, cap: 30   },
];

/** Gibt den passenden Spielmodus fuer (points_per_set, cap) zurueck. Fallback: 21_ext */
export function getScoringModeId(pointsPerSet: number, cap: number | null): ScoringModeId {
  const found = SCORING_MODES.find(
    (m) => m.points_per_set === pointsPerSet && m.cap === cap
  );
  return found?.id ?? "21_ext";
}

// ---------------------------------------------------------------------------
// Scoring-Logik
// ---------------------------------------------------------------------------

/** Prueft ob ein Score ein gueltiger Satzgewinn ist */
export function isSetWon(
  winnerScore: number,
  loserScore: number,
  pointsPerSet: number,
  cap: number | null
): boolean {
  if (winnerScore <= loserScore) return false;
  if (winnerScore < pointsPerSet) return false;

  if (cap !== null) {
    // Modi MIT Verlaengerung (11_2, 15_2, 21_2)
    const diff = winnerScore - loserScore;
    if (winnerScore === cap && diff >= 1) return true; // z.B. 30:29, 20:19, 25:24
    return diff >= 2;
  }

  // Modi OHNE Verlaengerung (11_1, 15_1): exakt Zielpunktzahl = Sieg
  return winnerScore >= pointsPerSet;
}

/** Prueft ob ein Satz vollstaendig und gueltig eingetragen ist */
export function isSetComplete(s: GameSet, pointsPerSet: number, cap?: number | null): boolean {
  // Beide muessen eingetragen sein
  if (s.team1_score <= 0 && s.team2_score <= 0) return false;

  // Score-Kombination muss regelkonform sein
  const resolvedCap = cap !== undefined ? cap : null;
  const validation = isScoreValid(s.team1_score, s.team2_score, pointsPerSet, resolvedCap);
  if (!validation.valid) return false;

  // Mindestens ein Team muss gewonnen haben
  return (
    isSetWon(s.team1_score, s.team2_score, pointsPerSet, resolvedCap) ||
    isSetWon(s.team2_score, s.team1_score, pointsPerSet, resolvedCap)
  );
}

/**
 * Ergebnis einer Punktpruefung.
 *
 * `error` ist ein Uebersetzungsschluessel, kein fertiger Satz — die
 * Meldungen standen frueher als deutscher Text in dieser Datei und
 * erschienen damit auch in der englischen Oberflaeche
 * (REVIEW-BACKLOG.md H1). `params` fuellt die Platzhalter des Schluessels.
 */
export interface ScoreValidation {
  valid: boolean;
  error?: Extract<keyof Translations, string>;
  params?: Record<string, number>;
}

/** Prueft ob ein eingegebener Score gueltig ist (zur Validierung) */
export function isScoreValid(
  score1: number,
  score2: number,
  pointsPerSet: number,
  cap: number | null
): ScoreValidation {
  if (score1 < 0 || score2 < 0) {
    return { valid: false, error: "score_error_negative" };
  }

  const maxAllowed = cap !== null ? cap : pointsPerSet;

  if (score1 > maxAllowed || score2 > maxAllowed) {
    return {
      valid: false,
      error: "score_error_max",
      params: { max: maxAllowed },
    };
  }

  if (cap !== null) {
    // Modi MIT Verlaengerung (11_2, 15_2, 21_2)
    const high = Math.max(score1, score2);
    const low = Math.min(score1, score2);
    const diff = high - low;
    const extStart = pointsPerSet - 1; // 20, 10, 14 je nach Modus

    // Beide unter Zielpunktzahl: noch laufend
    if (high < pointsPerSet) {
      return { valid: true };
    }

    // Normaler Satzgewinn: Gewinner hat genau Zielpunktzahl, Verlierer <= extStart-1
    if (high === pointsPerSet && low <= extStart - 1) {
      return { valid: true };
    }

    // Gleichstand auf oder ueber Zielpunktzahl: kein Unentschieden
    if (high >= pointsPerSet && diff === 0) {
      return { valid: false, error: "score_error_draw" };
    }

    // Verlaengerung: Beide muessen mindestens extStart (z.B. 20, 10, 14) haben
    if (high > pointsPerSet && low < extStart) {
      return {
        valid: false,
        error: "score_error_ext_min",
        params: { high, min: high - 2 },
      };
    }

    // Verlaengerung: Differenz muss genau 2 sein (ausser am Cap)
    if (high > pointsPerSet && high < cap && diff !== 2) {
      return {
        valid: false,
        error: "score_error_ext_diff",
      };
    }

    // Am Cap: Verlierer muss cap-2 oder cap-1 sein
    if (high === cap && low < cap - 2) {
      return {
        valid: false,
        error: "score_error_cap",
        params: { cap, low: cap - 2, high: cap - 1 },
      };
    }

    // cap:cap geht nicht
    if (score1 === cap && score2 === cap) {
      return { valid: false, error: "score_error_tie_impossible", params: { score: cap } };
    }
  } else {
    // Modi OHNE Verlaengerung (11_1, 15_1): first-to-N
    const high = Math.max(score1, score2);

    // Beide unter Zielpunktzahl: noch laufend
    if (high < pointsPerSet) {
      return { valid: true };
    }

    // Gleichstand auf Zielpunktzahl: unmoeoglich
    if (score1 === pointsPerSet && score2 === pointsPerSet) {
      return { valid: false, error: "score_error_tie_impossible", params: { score: pointsPerSet } };
    }

    // Verlierer darf nicht auch Zielpunktzahl haben
    if (high === pointsPerSet) {
      return { valid: true };
    }
  }

  return { valid: true };
}

/**
 * Auto-Vervollstaendigung: Berechnet den Gegner-Score wenn er eindeutig ist.
 *
 * Mit Cap (11_2, 15_2, 21_2):
 *   Eingabe 0..N-2      → Gegner hat mit N gewonnen (nur bei frischer Eingabe)
 *   Eingabe N-1         → Verlaengerung, Gegner = N+1 (z.B. 20→22, 10→12, 14→16)
 *   Eingabe N+1..cap-1  → Verlaengerung, Gegner = Eingabe - 2
 *   Eingabe cap         → Deckel, Gegner = cap - 1
 *
 * Ohne Cap (11_1, 15_1):
 *   Eingabe < N         → Gegner hat mit N gewonnen (nur bei frischer Eingabe)
 *   Eingabe = N         → nicht eindeutig, kein Auto-Fill
 */
export function autoFillOpponentScore(
  enteredScore: number,
  pointsPerSet: number,
  cap: number | null,
  onlyIfFresh: boolean
): number | null {
  if (enteredScore <= 0) return null;

  if (cap !== null) {
    const extStart = pointsPerSet - 1; // z.B. 20, 10, 14

    // Am Cap: Gegner = cap - 1 (immer eindeutig)
    if (enteredScore === cap) return cap - 1;

    // Verlaengerung N+1 bis cap-1: Gegner = Eingabe - 2
    if (enteredScore > pointsPerSet && enteredScore < cap) return enteredScore - 2;

    // Genau extStart eingegeben (z.B. 20 bei 21er, 10 bei 11er): Verlaengerung, Gegner = N+1
    if (enteredScore === extStart) return pointsPerSet + 1;

    // Frische Eingabe 1..N-2: Gegner hat mit N gewonnen
    if (onlyIfFresh && enteredScore >= 1 && enteredScore < extStart) {
      return pointsPerSet;
    }
  } else {
    // Kein Cap: nur bei frischer Eingabe < N
    if (onlyIfFresh && enteredScore >= 1 && enteredScore < pointsPerSet) {
      return pointsPerSet;
    }
  }

  return null;
}

/** Gibt die maximale erlaubte Punktzahl fuer ein Turnier zurueck */
export function getMaxScore(pointsPerSet: number, cap: number | null): number {
  return cap !== null ? cap : pointsPerSet;
}

/**
 * Beschreibt das Zaehlsystem als Text.
 *
 * Die beiden Vorlagen kommen von aussen — vorher stand hier deutscher
 * Text fest verdrahtet, der auch in der englischen Oberflaeche erschien
 * (REVIEW-BACKLOG.md H1).
 */
export function getScoringDescription(
  pointsPerSet: number,
  cap: number | null,
  texts: { ext: string; hard: string },
): string {
  if (cap !== null) {
    return texts.ext
      .replace(/\{points\}/g, String(pointsPerSet))
      .replace(/\{ext\}/g, String(pointsPerSet - 1))
      .replace(/\{cap\}/g, String(cap));
  }
  return texts.hard.replace(/\{points\}/g, String(pointsPerSet));
}


// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * One decided encounter between two ranking subjects — a player in singles
 * standings, a team in team standings. Doubles matches produce one duel per
 * winner/loser pair, so individual standings in rotating-partner formats
 * still have head-to-head data.
 */
interface Duel<K> {
  winner: K;
  loser: K;
  setsWinner: number;
  setsLoser: number;
  pointsWinner: number;
  pointsLoser: number;
}

/** The figures every ranking rule works on, independent of subject type. */
interface Rankable<K> {
  key: K;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
  /** Present only when the caller asked for Buchholz scoring. */
  buchholz?: number;
}

/**
 * Orders a standings table.
 *
 * The rule, in order:
 *   1. Wins (absolute, not a percentage)
 *   2. Head-to-head among everyone still tied — wins in the mini table
 *   3. Set difference within that mini table
 *   4. Set difference overall
 *   5. Point difference overall
 *   6. A stable fallback so the order never wobbles between renders
 *
 * Why not the win percentage that came before: with an unequal number of
 * matches played — a normal state mid-round, across groups of different
 * sizes, and after a retirement — 1 win from 1 match (100%) outranked 5
 * wins from 6 (83%). See REVIEW-BACKLOG.md B1.
 */
function rankSubjects<K>(
  entries: Rankable<K>[],
  duels: Duel<K>[],
  tiebreak: (a: Rankable<K>, b: Rankable<K>) => number,
): Rankable<K>[] {
  const setDiff = (e: Rankable<K>) => e.setsWon - e.setsLost;
  const pointDiff = (e: Rankable<K>) => e.pointsWon - e.pointsLost;

  // Stage 1: group by wins.
  const byWins = new Map<number, Rankable<K>[]>();
  for (const e of entries) {
    const bucket = byWins.get(e.wins);
    if (bucket) bucket.push(e);
    else byWins.set(e.wins, [e]);
  }

  const result: Rankable<K>[] = [];
  const winCounts = [...byWins.keys()].sort((a, b) => b - a);

  for (const wins of winCounts) {
    const tied = byWins.get(wins)!;
    if (tied.length === 1) {
      result.push(tied[0]);
      continue;
    }

    // Stage 2: mini table over the duels these subjects played against
    // each other. Everyone else's results are irrelevant here.
    const inGroup = new Set(tied.map((e) => e.key));
    const miniWins = new Map<K, number>();
    const miniSetDiff = new Map<K, number>();
    for (const e of tied) {
      miniWins.set(e.key, 0);
      miniSetDiff.set(e.key, 0);
    }
    for (const d of duels) {
      if (!inGroup.has(d.winner) || !inGroup.has(d.loser)) continue;
      miniWins.set(d.winner, (miniWins.get(d.winner) ?? 0) + 1);
      miniSetDiff.set(d.winner, (miniSetDiff.get(d.winner) ?? 0) + (d.setsWinner - d.setsLoser));
      miniSetDiff.set(d.loser, (miniSetDiff.get(d.loser) ?? 0) + (d.setsLoser - d.setsWinner));
    }

    tied.sort((a, b) => {
      // Buchholz first when it was computed: in Swiss the strength of the
      // opponents faced outranks a single head-to-head result.
      if (a.buchholz !== undefined && b.buchholz !== undefined && a.buchholz !== b.buchholz) {
        return b.buchholz - a.buchholz;
      }

      const miniWinDiff = (miniWins.get(b.key) ?? 0) - (miniWins.get(a.key) ?? 0);
      if (miniWinDiff !== 0) return miniWinDiff;

      const miniSets = (miniSetDiff.get(b.key) ?? 0) - (miniSetDiff.get(a.key) ?? 0);
      if (miniSets !== 0) return miniSets;

      const sets = setDiff(b) - setDiff(a);
      if (sets !== 0) return sets;

      const points = pointDiff(b) - pointDiff(a);
      if (points !== 0) return points;

      return tiebreak(a, b);
    });

    result.push(...tied);
  }

  return result;
}

/** Human-readable description of the ranking rule, for tooltips and docs. */
export const RANKING_CRITERIA = [
  "wins",
  "head_to_head",
  "set_difference",
  "point_difference",
] as const;

/** Options that change how a table is counted. */
export interface StandingsOptions {
  /**
   * Swiss and Monrad award a bye as a win — sitting out is not the
   * player's doing, and their score has to keep up with the field. In a
   * knockout a bye is only an advance, so it stays uncounted (the default).
   */
  byesCountAsWins?: boolean;
  /**
   * Adds the Buchholz score (sum of the opponents' wins) to each entry.
   * It is the standard fine-scoring in Swiss: whoever faced the stronger
   * field ranks higher on equal points.
   */
  withBuchholz?: boolean;
}

export function calculateStandings(
  players: Player[],
  matches: Match[],
  sets: Map<number, GameSet[]>,
  options: StandingsOptions = {},
): StandingEntry[] {
  const entries = new Map<number, StandingEntry>();

  for (const p of players) {
    entries.set(p.id, {
      player: p,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      pointsWon: 0,
      pointsLost: 0,
    });
  }

  const duels: Duel<number>[] = [];

  for (const match of matches) {
    if (match.status !== "completed" || !match.winner_team) continue;
    // A bye (no opponent) advances a player through the bracket but is not
    // a played match — counting it as a win would inflate their record and
    // skew every ratio-based tiebreak. See REVIEW-BACKLOG.md A2.
    if (match.team2_p1 === null) {
      if (options.byesCountAsWins) {
        for (const pid of [match.team1_p1, match.team1_p2]) {
          if (pid === null) continue;
          const e = entries.get(pid);
          if (e) e.wins++;
        }
      }
      continue;
    }

    // A walkover is a win, but nothing was played: no sets, no points.
    const isWalkover = match.walkover === 1;
    const matchSets = isWalkover ? [] : sets.get(match.id) || [];

    const team1Players = [match.team1_p1, match.team1_p2].filter(
      (id): id is number => id !== null
    );
    const team2Players = [match.team2_p1, match.team2_p2].filter(
      (id): id is number => id !== null
    );

    const winners = match.winner_team === 1 ? team1Players : team2Players;
    const losers = match.winner_team === 1 ? team2Players : team1Players;

    for (const pid of winners) {
      const e = entries.get(pid);
      if (e) e.wins++;
    }
    for (const pid of losers) {
      const e = entries.get(pid);
      if (e) e.losses++;
    }

    let team1SetsWon = 0;
    let team2SetsWon = 0;
    for (const s of matchSets) {
      if (s.team1_score > s.team2_score) team1SetsWon++;
      else if (s.team2_score > s.team1_score) team2SetsWon++;

      for (const pid of team1Players) {
        const e = entries.get(pid);
        if (e) {
          e.pointsWon += s.team1_score;
          e.pointsLost += s.team2_score;
        }
      }
      for (const pid of team2Players) {
        const e = entries.get(pid);
        if (e) {
          e.pointsWon += s.team2_score;
          e.pointsLost += s.team1_score;
        }
      }
    }

    for (const pid of team1Players) {
      const e = entries.get(pid);
      if (e) {
        e.setsWon += team1SetsWon;
        e.setsLost += team2SetsWon;
      }
    }
    for (const pid of team2Players) {
      const e = entries.get(pid);
      if (e) {
        e.setsWon += team2SetsWon;
        e.setsLost += team1SetsWon;
      }
    }

    // Record the encounter for the head-to-head tiebreak. In doubles every
    // winner counts as having beaten every loser.
    const winnerSets = match.winner_team === 1 ? team1SetsWon : team2SetsWon;
    const loserSets = match.winner_team === 1 ? team2SetsWon : team1SetsWon;
    let winnerPoints = 0;
    let loserPoints = 0;
    for (const s of matchSets) {
      winnerPoints += match.winner_team === 1 ? s.team1_score : s.team2_score;
      loserPoints += match.winner_team === 1 ? s.team2_score : s.team1_score;
    }
    for (const w of winners) {
      for (const l of losers) {
        duels.push({
          winner: w,
          loser: l,
          setsWinner: winnerSets,
          setsLoser: loserSets,
          pointsWinner: winnerPoints,
          pointsLoser: loserPoints,
        });
      }
    }
  }

  const result = Array.from(entries.values());

  if (options.withBuchholz) {
    // Sum of the wins of everyone a player actually faced.
    const opponents = new Map<number, number[]>();
    for (const d of duels) {
      if (!opponents.has(d.winner)) opponents.set(d.winner, []);
      if (!opponents.has(d.loser)) opponents.set(d.loser, []);
      opponents.get(d.winner)!.push(d.loser);
      opponents.get(d.loser)!.push(d.winner);
    }
    const winsById = new Map(result.map((e) => [e.player.id, e.wins]));
    for (const entry of result) {
      const faced = opponents.get(entry.player.id) ?? [];
      entry.buchholz = faced.reduce((sum, id) => sum + (winsById.get(id) ?? 0), 0);
    }
  }

  const ranked = rankSubjects(
    result.map((e) => ({
      key: e.player.id,
      buchholz: e.buchholz,
      wins: e.wins,
      losses: e.losses,
      setsWon: e.setsWon,
      setsLost: e.setsLost,
      pointsWon: e.pointsWon,
      pointsLost: e.pointsLost,
    })),
    duels,
    // Stable last resort: player id. Deterministic, so the table does not
    // reshuffle itself between renders.
    (a, b) => a.key - b.key,
  );

  const byId = new Map(result.map((e) => [e.player.id, e]));
  return ranked.map((r) => byId.get(r.key)!);
}

function teamKey(p1: number, p2: number): string {
  return `${Math.min(p1, p2)}-${Math.max(p1, p2)}`;
}

export function calculateTeamStandings(
  players: Player[],
  matches: Match[],
  sets: Map<number, GameSet[]>
): TeamStandingEntry[] {
  const entries = new Map<string, TeamStandingEntry>();
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Discover teams from matches
  for (const m of matches) {
    if (m.team1_p2) {
      const key = teamKey(m.team1_p1, m.team1_p2);
      if (!entries.has(key)) {
        entries.set(key, {
          teamKey: key,
          player1: playerMap.get(Math.min(m.team1_p1, m.team1_p2))!,
          player2: playerMap.get(Math.max(m.team1_p1, m.team1_p2))!,
          wins: 0, losses: 0, setsWon: 0, setsLost: 0, pointsWon: 0, pointsLost: 0,
        });
      }
    }
    if (m.team2_p1 !== null && m.team2_p2) {
      const key = teamKey(m.team2_p1, m.team2_p2);
      if (!entries.has(key)) {
        entries.set(key, {
          teamKey: key,
          player1: playerMap.get(Math.min(m.team2_p1, m.team2_p2))!,
          player2: playerMap.get(Math.max(m.team2_p1, m.team2_p2))!,
          wins: 0, losses: 0, setsWon: 0, setsLost: 0, pointsWon: 0, pointsLost: 0,
        });
      }
    }
  }

  const duels: Duel<string>[] = [];

  for (const m of matches) {
    if (m.status !== "completed" || !m.winner_team) continue;
    if (m.team2_p1 === null) continue; // bye — advanced, not played
    const matchSets = m.walkover === 1 ? [] : sets.get(m.id) || [];

    const t1key = m.team1_p2 ? teamKey(m.team1_p1, m.team1_p2) : null;
    const t2key = m.team2_p1 !== null && m.team2_p2 ? teamKey(m.team2_p1, m.team2_p2) : null;

    const winKey = m.winner_team === 1 ? t1key : t2key;
    const loseKey = m.winner_team === 1 ? t2key : t1key;

    if (winKey) { const e = entries.get(winKey); if (e) e.wins++; }
    if (loseKey) { const e = entries.get(loseKey); if (e) e.losses++; }

    let t1SetsWon = 0, t2SetsWon = 0;
    for (const s of matchSets) {
      if (s.team1_score > s.team2_score) t1SetsWon++;
      else if (s.team2_score > s.team1_score) t2SetsWon++;

      if (t1key) {
        const e = entries.get(t1key);
        if (e) { e.pointsWon += s.team1_score; e.pointsLost += s.team2_score; }
      }
      if (t2key) {
        const e = entries.get(t2key);
        if (e) { e.pointsWon += s.team2_score; e.pointsLost += s.team1_score; }
      }
    }
    if (t1key) { const e = entries.get(t1key); if (e) { e.setsWon += t1SetsWon; e.setsLost += t2SetsWon; } }
    if (t2key) { const e = entries.get(t2key); if (e) { e.setsWon += t2SetsWon; e.setsLost += t1SetsWon; } }

    if (winKey && loseKey) {
      let winnerPoints = 0;
      let loserPoints = 0;
      for (const s of matchSets) {
        winnerPoints += m.winner_team === 1 ? s.team1_score : s.team2_score;
        loserPoints += m.winner_team === 1 ? s.team2_score : s.team1_score;
      }
      duels.push({
        winner: winKey,
        loser: loseKey,
        setsWinner: m.winner_team === 1 ? t1SetsWon : t2SetsWon,
        setsLoser: m.winner_team === 1 ? t2SetsWon : t1SetsWon,
        pointsWinner: winnerPoints,
        pointsLoser: loserPoints,
      });
    }
  }

  const result = Array.from(entries.values());
  const ranked = rankSubjects(
    result.map((e) => ({
      key: e.teamKey,
      wins: e.wins,
      losses: e.losses,
      setsWon: e.setsWon,
      setsLost: e.setsLost,
      pointsWon: e.pointsWon,
      pointsLost: e.pointsLost,
    })),
    duels,
    (a, b) => a.key.localeCompare(b.key),
  );

  const byKey = new Map(result.map((e) => [e.teamKey, e]));
  return ranked.map((r) => byKey.get(r.key)!);
}


/**
 * Orders participants from *different* groups against each other — the
 * "best runners-up" comparison when a KO bracket has more slots than there
 * are group winners.
 *
 * Head-to-head cannot apply here (they never met), so the rule is wins,
 * then set difference, then point difference, then a stable fallback.
 * Percentages are deliberately not used: they made a 1-0 record outrank a
 * 5-1 one (REVIEW-BACKLOG.md B1/B11).
 *
 * Note that the caller has to hand over *comparable* records — see
 * {@link limitStandingsToTopN} when groups differ in size.
 */
export function rankAcrossGroups<T extends {
  wins: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}>(entries: T[], stableKey: (entry: T) => number | string): T[] {
  return [...entries].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;

    const setDiff = (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost);
    if (setDiff !== 0) return setDiff;

    const pointDiff = (b.pointsWon - b.pointsLost) - (a.pointsWon - a.pointsLost);
    if (pointDiff !== 0) return pointDiff;

    const ka = stableKey(a);
    const kb = stableKey(b);
    if (typeof ka === "number" && typeof kb === "number") return ka - kb;
    return String(ka).localeCompare(String(kb));
  });
}

/**
 * Recomputes a group table as if only its top N participants existed.
 *
 * Groups of different sizes produce records that cannot be compared
 * directly: in a group of five everyone has one more match than in a group
 * of four. The established fix is to drop the results against the
 * bottom-placed participants of the larger groups, which is what this does.
 */
export function limitStandingsToTopN(
  standings: StandingEntry[],
  matches: Match[],
  sets: Map<number, GameSet[]>,
  topN: number,
): StandingEntry[] {
  if (standings.length <= topN) return standings;

  const keep = new Set(standings.slice(0, topN).map((e) => e.player.id));
  const keptPlayers = standings.slice(0, topN).map((e) => e.player);
  const keptMatches = matches.filter((m) => {
    const ids = [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].filter(
      (id): id is number => id !== null && id > 0,
    );
    return ids.every((id) => keep.has(id));
  });

  return calculateStandings(keptPlayers, keptMatches, sets);
}

/** Team-standings counterpart of {@link limitStandingsToTopN}. */
export function limitTeamStandingsToTopN(
  standings: TeamStandingEntry[],
  players: Player[],
  matches: Match[],
  sets: Map<number, GameSet[]>,
  topN: number,
): TeamStandingEntry[] {
  if (standings.length <= topN) return standings;

  const keep = new Set(standings.slice(0, topN).map((e) => e.teamKey));
  const teamKeyOf = (p1: number, p2: number | null) =>
    p2 === null ? null : `${Math.min(p1, p2)}-${Math.max(p1, p2)}`;

  const keptMatches = matches.filter((m) => {
    const t1 = teamKeyOf(m.team1_p1, m.team1_p2);
    const t2 = m.team2_p1 === null ? null : teamKeyOf(m.team2_p1, m.team2_p2);
    return t1 !== null && t2 !== null && keep.has(t1) && keep.has(t2);
  });

  return calculateTeamStandings(players, keptMatches, sets);
}

export function determineMatchWinner(
  matchSets: GameSet[],
  setsToWin: number,
  pointsPerSet: number,
  cap?: number | null
): 1 | 2 | null {
  const resolvedCap = cap !== undefined ? cap : null;
  let team1Sets = 0;
  let team2Sets = 0;

  for (const s of matchSets) {
    if (!isSetComplete(s, pointsPerSet, resolvedCap)) continue;
    if (s.team1_score > s.team2_score) team1Sets++;
    else if (s.team2_score > s.team1_score) team2Sets++;
  }

  if (team1Sets >= setsToWin) return 1;
  if (team2Sets >= setsToWin) return 2;
  return null;
}
