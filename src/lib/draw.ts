import type { Player, Match, StandingEntry, TeamStandingEntry } from "./types";

// Re-export shuffle for use in TournamentView
export function shufflePlayers<T>(arr: T[]): T[] {
  return shuffle(arr);
}

/**
 * Uniform random integer in [0, maxExclusive).
 *
 * `random % max` is subtly biased towards the lower values whenever max is
 * not a divisor of 2^32 — for a draw that decides who plays whom, "subtly
 * biased" is an argument nobody should have to have. Rejection sampling
 * discards the values in the incomplete final block instead.
 */
function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % maxExclusive;
}

/** Fisher-Yates shuffle on a copy of the input. */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Crypto-secure random number in [0, 1) — replacement for Math.random() */
function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / (0xFFFFFFFF + 1);
}

// --- Round Robin (Singles) ---
// Generates all rounds where each player plays against every other player.
export function generateRoundRobinSingles(
  players: Player[]
): { team1_p1: number; team2_p1: number }[][] {
  const ids = players.map((p) => p.id);
  const n = ids.length;
  const list = [...ids];

  // If odd number of players, add a "bye" (-1)
  if (n % 2 !== 0) list.push(-1);

  const totalRounds = list.length - 1;
  const half = list.length / 2;
  const rounds: { team1_p1: number; team2_p1: number }[][] = [];

  for (let r = 0; r < totalRounds; r++) {
    const roundMatches: { team1_p1: number; team2_p1: number }[] = [];
    for (let i = 0; i < half; i++) {
      const p1 = list[i];
      const p2 = list[list.length - 1 - i];
      if (p1 !== -1 && p2 !== -1) {
        roundMatches.push({ team1_p1: p1, team2_p1: p2 });
      }
    }
    rounds.push(roundMatches);
    // Rotate: fix first element, rotate rest
    const last = list.pop()!;
    list.splice(1, 0, last);
  }

  return rounds;
}

// --- Round Robin (Doubles with fixed teams) ---
export function generateRoundRobinDoubles(
  teams: [number, number][]
): { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[][] {
  const n = teams.length;
  const list = [...teams];

  if (n % 2 !== 0) list.push([-1, -1]);

  const totalRounds = list.length - 1;
  const half = list.length / 2;
  const rounds: { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[][] = [];

  for (let r = 0; r < totalRounds; r++) {
    const roundMatches: { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[] = [];
    for (let i = 0; i < half; i++) {
      const t1 = list[i];
      const t2 = list[list.length - 1 - i];
      if (t1[0] !== -1 && t2[0] !== -1) {
        roundMatches.push({
          team1_p1: t1[0], team1_p2: t1[1],
          team2_p1: t2[0], team2_p2: t2[1],
        });
      }
    }
    rounds.push(roundMatches);
    const last = list.pop()!;
    list.splice(1, 0, last);
  }

  return rounds;
}

// --- Random Doubles (new partners each round) ---
// Returns matches for ONE round with random partner assignment.
// previousPairings: Set of "id1-id2" strings to avoid repeating partnerships.
// matchCounts: Map of playerId -> number of matches played so far (for fair bye rotation)
// pairingCounts: Map of "id1-id2" -> count of times paired (for weighted pairing avoidance)
/** A drawn round plus the players who sit it out. */
export interface DrawnRound {
  matches: { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[];
  /** Everyone left over this round — up to three players in doubles. */
  byePlayers: number[];
}

export function generateRandomDoublesRound(
  players: Player[],
  previousPairings: Set<string>,
  matchCounts?: Map<number, number>,
  pairingCounts?: Map<string, number>
): DrawnRound {
  const ids = shuffle(players.map((p) => p.id));
  const byePlayers: number[] = [];

  // Doubles needs groups of 4. Remove players until count is divisible by 4.
  // Pick players with the MOST matches to sit out (fair rotation).
  const active = [...ids];
  const byeCount = active.length % 4;
  if (byeCount > 0) {
    if (matchCounts && matchCounts.size > 0) {
      // Sort candidates by match count descending (most matches sit out first)
      const sorted = [...active].sort((a, b) => {
        const ca = matchCounts.get(a) ?? 0;
        const cb = matchCounts.get(b) ?? 0;
        if (cb !== ca) return cb - ca;
        return cryptoRandom() - 0.5;
      });
      for (let i = 0; i < byeCount; i++) {
        const pid = sorted[i];
        byePlayers.push(pid);
        active.splice(active.indexOf(pid), 1);
      }
    } else {
      for (let i = 0; i < byeCount; i++) {
        byePlayers.push(active.pop()!);
      }
    }
  }

  // Need at least 4 for one doubles match
  if (active.length < 4) return { matches: [], byePlayers: [...ids] };

  // Try to find pairings that haven't been used before (or least repeated)
  const bestPairing = findBestPairing(active, previousPairings, pairingCounts);

  // Group into matches (pairs of teams) — active.length is divisible by 4
  const matches: { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[] = [];
  for (let i = 0; i < bestPairing.length - 1; i += 2) {
    matches.push({
      team1_p1: bestPairing[i][0],
      team1_p2: bestPairing[i][1],
      team2_p1: bestPairing[i + 1][0],
      team2_p2: bestPairing[i + 1][1],
    });
  }

  // Up to three players sit out a doubles round. Reporting only the first
  // of them (the old behaviour) meant the UI could not name them all.
  return { matches, byePlayers };
}

function pairingKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

function findBestPairing(
  players: number[],
  previousPairings: Set<string>,
  pairingCountsInput?: Map<string, number>
): [number, number][] {
  const available = [...players];

  // Use provided counts, or fall back to Set (each entry = 1)
  const pairingCounts = pairingCountsInput ?? new Map<string, number>();
  if (!pairingCountsInput) {
    for (const key of previousPairings) {
      pairingCounts.set(key, 1);
    }
  }

  let bestPairs: [number, number][] = [];
  let bestScore = Infinity; // lower is better

  // More attempts for better results
  const maxAttempts = Math.min(300, Math.max(100, available.length * 20));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(available);
    const currentPairs: [number, number][] = [];
    let score = 0;

    for (let i = 0; i < shuffled.length - 1; i += 2) {
      const pair: [number, number] = [shuffled[i], shuffled[i + 1]];
      currentPairs.push(pair);
      const key = pairingKey(pair[0], pair[1]);
      // Each repeat adds to the score - more repeats = worse
      const count = pairingCounts.get(key) ?? 0;
      if (count > 0) {
        score += count * count; // Quadratic penalty: 2x repeat is 4x as bad as 1x
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestPairs = currentPairs;
      if (score === 0) break; // Perfect: no repeats at all
    }
  }

  return bestPairs;
}

// --- Elimination (KO) ---

/**
 * One first-round slot pairing. `team2_p1 === null` marks a bye: the
 * participant in team 1 advances without playing.
 */
export interface BracketMatch {
  team1_p1: number;
  team1_p2: number | null;
  team2_p1: number | null;
  team2_p2: number | null;
}

// --- Club separation -------------------------------------------------------
//
// Tournament regulations ask for club-mates to be kept apart in the first
// round, and a club tournament with several guest clubs wants the same. The
// club is recorded per player and went unused (FEATURE-BACKLOG.md C2).
//
// It is a preference, not a rule: seeded positions are fixed, and a field
// where one club supplies most of the entries cannot be separated at all.
// So the draw is made as before and then improved by swapping unseeded
// entries, accepting only swaps that reduce the number of club clashes.
// Nothing is ever forced, and the result stays random among the draws that
// separate equally well.

/** Which club a player belongs to; null or empty when none is recorded. */
export type ClubLookup = (playerId: number) => string | null;

/**
 * The clubs behind one entry. A doubles pair can bring two, and an entry
 * with no club recorded brings none -- those never clash with anything,
 * which is the right reading: an unknown club is not evidence of sameness.
 */
function clubsOf(entry: readonly (number | null)[], clubOf: ClubLookup): string[] {
  const out: string[] = [];
  for (const id of entry) {
    if (id === null) continue;
    const club = clubOf(id);
    if (club && club.trim() !== "") out.push(club.trim().toLowerCase());
  }
  return out;
}

/** True when two entries share at least one club. */
function shareClub(
  a: readonly (number | null)[],
  b: readonly (number | null)[],
  clubOf: ClubLookup,
): boolean {
  const ca = clubsOf(a, clubOf);
  if (ca.length === 0) return false;
  const cb = new Set(clubsOf(b, clubOf));
  return ca.some((c) => cb.has(c));
}

/**
 * Swaps entries between positions until no swap reduces the clash count.
 *
 * `movable` lists the positions that may be touched -- everything else is
 * seeded and stays where the seeding put it. `clashes` counts the clashes
 * of a whole arrangement; the caller defines what "together" means, which
 * is a first-round pairing for a bracket and a shared group for a group
 * stage.
 *
 * Only strict improvements are accepted, so the loop always terminates:
 * the clash count is a non-negative integer that falls with every step.
 */
function reduceClashes<T>(
  slots: T[],
  movable: number[],
  clashes: (arrangement: T[]) => number,
): void {
  let current = clashes(slots);
  // One pass per clash at most: each accepted swap removes at least one.
  for (let guard = current; guard > 0 && current > 0; guard--) {
    let improved = false;
    // Random order, so equally good draws stay equally likely.
    for (const i of shuffle(movable)) {
      for (const j of shuffle(movable)) {
        if (i === j) continue;
        [slots[i], slots[j]] = [slots[j], slots[i]];
        const after = clashes(slots);
        if (after < current) {
          current = after;
          improved = true;
          break;
        }
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      if (improved) break;
    }
    if (!improved) return;
  }
}

/** A participant in a knockout bracket: one player, or a doubles team. */
type Participant = [number, number | null];

/**
 * Builds the first round of a knockout bracket.
 *
 * Participants are ordered (seeds first, unseeded shuffled) and placed on
 * standard bracket positions, so the top seeds can only meet in the final.
 * When the field is not a power of two, the missing slots become byes and
 * are given to the highest seeds — the usual tournament convention.
 *
 * The returned list is in bracket order and contains every participant
 * exactly once: matches to play plus byes. Winners of these entries, byes
 * included, form the next round — which is why a bye is a first-class
 * entry here rather than a skipped one (see REVIEW-BACKLOG.md A2).
 */
function buildBracket(
  ordered: Participant[],
  /** Entries at rank < this stay on their seeded slot. */
  seededCount = 0,
  clubOf?: ClubLookup,
): BracketMatch[] {
  const size = nextPowerOf2(ordered.length);

  // `seedForSlot[i]` is the rank that belongs on slot i, zero-based. Read
  // the other way round — "which slot does rank i go to" — the pairings
  // come out inverted: the top seed would meet the middle of the field in
  // round one instead of the bottom (REVIEW-BACKLOG.md A3).
  const seedForSlot = generateSeedOrder(size);

  // A slot whose rank is past the end of the field stays empty, and that
  // empty slot is the bye for its neighbour. No separate bookkeeping is
  // needed: the highest ranks are paired with the top seeds by
  // construction, so the byes land where the convention wants them.
  const slots: (Participant | null)[] = seedForSlot.map(
    (rank) => ordered[rank] ?? null,
  );

  if (clubOf) {
    // Only the unseeded slots may move, and an empty slot stays empty: it
    // is the bye for the top seeds and moving it would hand the bye to
    // somebody else.
    const movable = slots
      .map((entry, i) => ({ i, rank: seedForSlot[i], entry }))
      .filter(({ rank, entry }) => entry !== null && rank >= seededCount)
      .map(({ i }) => i);

    reduceClashes(slots, movable, (arrangement) => {
      let n = 0;
      for (let i = 0; i < arrangement.length; i += 2) {
        const a = arrangement[i];
        const b = arrangement[i + 1];
        if (a && b && shareClub(a, b, clubOf)) n++;
      }
      return n;
    });
  }

  const matches: BracketMatch[] = [];
  for (let i = 0; i < size; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    if (a && b) {
      matches.push({ team1_p1: a[0], team1_p2: a[1], team2_p1: b[0], team2_p2: b[1] });
    } else if (a) {
      matches.push({ team1_p1: a[0], team1_p2: a[1], team2_p1: null, team2_p2: null });
    } else if (b) {
      matches.push({ team1_p1: b[0], team1_p2: b[1], team2_p1: null, team2_p2: null });
    }
  }
  return matches;
}

/**
 * Singles knockout bracket. `seeds` holds player ids in seed order (best
 * first); everyone else is drawn at random.
 */
export function generateEliminationBracket(
  players: Player[],
  seeds?: number[]
): BracketMatch[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const seeded = (seeds ?? []).filter((id) => byId.has(id));
  const seededSet = new Set(seeded);
  const unseeded = shuffle(players.filter((p) => !seededSet.has(p.id))).map((p) => p.id);

  const ordered: Participant[] = [...seeded, ...unseeded].map((id) => [id, null]);
  return buildBracket(ordered, seeded.length, (id) => byId.get(id)?.club ?? null);
}

/**
 * Doubles/mixed knockout bracket. `seedTeams` holds teams in seed order;
 * teams not listed are drawn at random. Seeding used to be ignored here
 * entirely (REVIEW-BACKLOG.md A3).
 */
export function generateEliminationBracketDoubles(
  teams: [number, number][],
  seedTeams?: [number, number][],
  clubOf?: ClubLookup
): BracketMatch[] {
  const key = (t: [number, number]) => pairingKey(t[0], t[1]);
  const known = new Map(teams.map((t) => [key(t), t]));

  const seeded: [number, number][] = [];
  const seenSeeds = new Set<string>();
  for (const t of seedTeams ?? []) {
    const k = key(t);
    const match = known.get(k);
    if (match && !seenSeeds.has(k)) {
      seeded.push(match);
      seenSeeds.add(k);
    }
  }
  const unseeded = shuffle(teams.filter((t) => !seenSeeds.has(key(t))));

  const ordered: Participant[] = [...seeded, ...unseeded].map((t) => [t[0], t[1]]);
  return buildBracket(ordered, seeded.length, clubOf);
}

/**
 * Generates standard tournament seed positions.
 * For 8 players: [0, 7, 3, 4, 1, 6, 2, 5]
 * Seed 1 at pos 0, Seed 2 at pos 7 (opposite end),
 * Seed 3 at pos 3 (bottom of top half), Seed 4 at pos 4 (top of bottom half), etc.
 */
function generateSeedOrder(size: number): number[] {
  let round = [0, 1];

  while (round.length < size) {
    const next: number[] = [];
    const len = round.length * 2;
    for (const pos of round) {
      next.push(pos);
      next.push(len - 1 - pos);
    }
    round = next;
  }

  return round;
}

// --- Mixed Doubles (random, gender-balanced) ---
/**
 * Mixed round: every team is one man and one woman.
 *
 * Uses the same fairness inputs as the doubles draw — who has played the
 * fewest matches goes first when the field does not divide evenly, and
 * repeated partnerships are weighted rather than merely counted. Before
 * that, whoever happened to be at the end of the shuffled list sat out,
 * round after round (REVIEW-BACKLOG.md B10).
 */
export function generateMixedDoublesRound(
  players: Player[],
  previousPairings: Set<string>,
  matchCounts?: Map<number, number>,
  pairingCounts?: Map<string, number>
): DrawnRound {
  const playedCount = (id: number) => matchCounts?.get(id) ?? 0;
  // Fewest matches first, ties broken at random.
  const byNeed = (list: Player[]) =>
    shuffle(list).sort((a, b) => playedCount(a.id) - playedCount(b.id));

  const males = byNeed(players.filter((p) => p.gender === "m"));
  const females = byNeed(players.filter((p) => p.gender === "f"));

  // Each match needs two teams, so the number of pairs must be even.
  const pairCount = Math.min(males.length, females.length);
  const usablePairs = pairCount - (pairCount % 2);
  if (usablePairs < 2) {
    return { matches: [], byePlayers: players.map((p) => p.id) };
  }

  const playingMales = males.slice(0, usablePairs);
  const playingFemales = females.slice(0, usablePairs);
  const byePlayers = [
    ...males.slice(usablePairs).map((p) => p.id),
    ...females.slice(usablePairs).map((p) => p.id),
  ];

  // Search for the partner assignment with the fewest repeats, weighting a
  // second repeat higher than a first one.
  const repeatCost = (a: number, b: number) => {
    const key = pairingKey(a, b);
    const count = pairingCounts?.get(key) ?? (previousPairings.has(key) ? 1 : 0);
    return count * count;
  };

  let bestTeams: [number, number][] = [];
  let bestCost = Infinity;

  for (let attempt = 0; attempt < 50; attempt++) {
    const mShuffled = attempt === 0 ? playingMales : shuffle(playingMales);
    const fShuffled = attempt === 0 ? playingFemales : shuffle(playingFemales);
    const teams: [number, number][] = [];
    let cost = 0;

    for (let i = 0; i < usablePairs; i++) {
      const pair: [number, number] = [mShuffled[i].id, fShuffled[i].id];
      teams.push(pair);
      cost += repeatCost(pair[0], pair[1]);
    }

    if (cost < bestCost) {
      bestCost = cost;
      bestTeams = teams;
      if (cost === 0) break;
    }
  }

  const matches: { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[] = [];
  for (let i = 0; i < bestTeams.length; i += 2) {
    matches.push({
      team1_p1: bestTeams[i][0],
      team1_p2: bestTeams[i][1],
      team2_p1: bestTeams[i + 1][0],
      team2_p2: bestTeams[i + 1][1],
    });
  }

  return { matches, byePlayers };
}

export function getPreviousPairings(matches: Match[]): Set<string> {
  const pairings = new Set<string>();
  for (const m of matches) {
    if (m.team1_p2) pairings.add(pairingKey(m.team1_p1, m.team1_p2));
    if (m.team2_p1 !== null && m.team2_p2) pairings.add(pairingKey(m.team2_p1, m.team2_p2));
  }
  return pairings;
}

/** Returns a Map counting how often each partner pairing has occurred */
export function getPreviousPairingCounts(matches: Match[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of matches) {
    if (m.team1_p2) {
      const key = pairingKey(m.team1_p1, m.team1_p2);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (m.team2_p1 !== null && m.team2_p2) {
      const key = pairingKey(m.team2_p1, m.team2_p2);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

// --- Fixed Team Formation ---
// Forms random doubles teams from players
export function formFixedDoubleTeams(
  players: Player[]
): [number, number][] {
  const shuffled = shuffle(players);
  const teams: [number, number][] = [];
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    teams.push([shuffled[i].id, shuffled[i + 1].id]);
  }
  return teams;
}

// Forms mixed doubles teams (1m + 1f each)
export function formFixedMixedTeams(
  players: Player[]
): [number, number][] {
  const males = shuffle(players.filter((p) => p.gender === "m"));
  const females = shuffle(players.filter((p) => p.gender === "f"));
  const count = Math.min(males.length, females.length);
  const teams: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    teams.push([males[i].id, females[i].id]);
  }
  return teams;
}

// Splits teams into numGroups groups (evenly distributed)
/**
 * Splits teams into groups, mirroring {@link splitIntoGroups} for singles:
 * seeded teams are distributed snake-style (G1, G2, …, GN, GN, …, G1) so the
 * strongest teams end up in different groups, the rest is drawn at random.
 * Seeding used to be ignored here entirely (REVIEW-BACKLOG.md B9).
 */

/**
 * Spreads club-mates across groups, on the same terms as the bracket: only
 * unseeded entries move, and only when the swap reduces the number of pairs
 * of club-mates sharing a group (FEATURE-BACKLOG.md C2).
 *
 * `groups` is modified in place. `isSeeded` marks the entries the seeding
 * placed, which stay in the group they were snaked into.
 */
function separateClubsAcrossGroups<T extends readonly (number | null)[]>(
  groups: T[][],
  isSeeded: (entry: T) => boolean,
  clubOf: ClubLookup,
): void {
  // Flatten to one array so a swap is a plain index exchange, remembering
  // which group each position belongs to.
  const flat: T[] = [];
  const groupOfPos: number[] = [];
  groups.forEach((members, g) => {
    for (const m of members) {
      flat.push(m);
      groupOfPos.push(g);
    }
  });

  const movable = flat
    .map((entry, i) => ({ i, entry }))
    .filter(({ entry }) => !isSeeded(entry))
    .map(({ i }) => i);

  reduceClashes(flat, movable, (arrangement) => {
    let n = 0;
    for (let i = 0; i < arrangement.length; i++) {
      for (let j = i + 1; j < arrangement.length; j++) {
        if (groupOfPos[i] !== groupOfPos[j]) continue;
        if (shareClub(arrangement[i], arrangement[j], clubOf)) n++;
      }
    }
    return n;
  });

  // Write the improved arrangement back into the groups.
  let pos = 0;
  groups.forEach((members) => {
    for (let k = 0; k < members.length; k++) members[k] = flat[pos++];
  });
}

export function splitTeamsIntoGroups(
  teams: [number, number][],
  numGroups: number,
  seedTeams?: [number, number][],
  clubOf?: ClubLookup
): [number, number][][] {
  const groups: [number, number][][] = Array.from({ length: numGroups }, () => []);
  const key = (t: [number, number]) => pairingKey(t[0], t[1]);

  const known = new Map(teams.map((t) => [key(t), t]));
  const seeded: [number, number][] = [];
  const seenSeeds = new Set<string>();
  for (const t of seedTeams ?? []) {
    const k = key(t);
    const match = known.get(k);
    if (match && !seenSeeds.has(k)) {
      seeded.push(match);
      seenSeeds.add(k);
    }
  }

  const rest = seeded.length > 0
    ? shuffle(teams.filter((t) => !seenSeeds.has(key(t))))
    : teams;

  seeded.forEach((team, i) => {
    const round = Math.floor(i / numGroups);
    const posInRound = i % numGroups;
    const groupIdx = round % 2 === 0 ? posInRound : numGroups - 1 - posInRound;
    groups[groupIdx].push(team);
  });
  rest.forEach((team, i) => groups[i % numGroups].push(team));

  if (clubOf) {
    separateClubsAcrossGroups(groups, (t) => seenSeeds.has(key(t)), clubOf);
  }

  return groups;
}

// --- Group Phase ---
// Splits players into numGroups groups.
// If seeds (player IDs, best first) are provided, seeded players are distributed
// snake/serpentine across groups: first pass forward (seed 1 → G1, seed 2 → G2, …),
// second pass backward (seed N+1 → GN, seed N+2 → GN-1, …), third pass forward, etc.
// Example: 4 groups + 8 seeds → G1=[1,8], G2=[2,7], G3=[3,6], G4=[4,5].
// This ensures the strongest seeds are spread evenly and top seeds don't meet early.
// Unseeded players are shuffled and filled round-robin afterwards.
export function splitIntoGroups(
  players: Player[],
  numGroups: number,
  seeds?: number[]
): Player[][] {
  const groups: Player[][] = Array.from({ length: numGroups }, () => []);
  const seededIdsForClubs = new Set(seeds ?? []);

  if (seeds && seeds.length > 0) {
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const seeded = seeds.filter((id) => playerMap.has(id)).map((id) => playerMap.get(id)!);
    const seededIds = new Set(seeded.map((p) => p.id));
    const rest = shuffle(players.filter((p) => !seededIds.has(p.id)));

    // Snake/serpentine: forward on even rounds, backward on odd rounds
    seeded.forEach((p, i) => {
      const round = Math.floor(i / numGroups);
      const posInRound = i % numGroups;
      const groupIdx = round % 2 === 0 ? posInRound : numGroups - 1 - posInRound;
      groups[groupIdx].push(p);
    });
    rest.forEach((p, i) => groups[i % numGroups].push(p));
  } else {
    const shuffled = shuffle(players);
    shuffled.forEach((p, i) => groups[i % numGroups].push(p));
  }

  // Player objects rather than ids here, so the swap works on a projection
  // and is written back by position.
  const ids = groups.map((g) => g.map((p) => [p.id, null] as [number, null]));
  separateClubsAcrossGroups(
    ids,
    (entry) => seededIdsForClubs.has(entry[0]!),
    (id) => players.find((p) => p.id === id)?.club ?? null,
  );
  const byId = new Map(players.map((p) => [p.id, p]));
  ids.forEach((group, g) => {
    groups[g] = group.map((entry) => byId.get(entry[0]!)!);
  });

  return groups;
}

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// --- Swiss System ---

/** Returns the recommended number of rounds for a Swiss tournament. */
export function recommendedSwissRounds(playerCount: number): number {
  return Math.max(3, Math.ceil(Math.log2(playerCount)));
}

/** Generates the first round of a Swiss singles tournament (random pairing). */
export function generateSwissFirstRound(
  players: Player[]
): { team1_p1: number; team2_p1: number }[] {
  const shuffled = shuffle(players);
  const ids = shuffled.map((p) => p.id);

  // If odd count, last player gets a bye (excluded from matches)
  if (ids.length % 2 !== 0) ids.pop();

  const matches: { team1_p1: number; team2_p1: number }[] = [];
  for (let i = 0; i < ids.length - 1; i += 2) {
    matches.push({ team1_p1: ids[i], team2_p1: ids[i + 1] });
  }
  return matches;
}

/**
 * Pairs a ranked list so that no pairing repeats, preferring opponents who
 * are close in the ranking.
 *
 * The straight greedy walk this replaces took the first legal opponent for
 * the top player, which could strand a later player with nothing but a
 * rematch — even when a rematch-free round existed (REVIEW-BACKLOG.md B2).
 * Backtracking explores the alternatives instead. `null` means no
 * rematch-free pairing exists at all; the caller then has to allow repeats.
 */
function pairWithoutRematch(
  ids: number[],
  previousMatchups: Set<string>,
): [number, number][] | null {
  const used = new Array(ids.length).fill(false);
  const result: [number, number][] = [];
  // Safety valve: the search is exponential in theory. Club fields are
  // small, but a pathological history should degrade to "allow rematches"
  // rather than freeze the app.
  let steps = 0;
  const MAX_STEPS = 200_000;

  const solve = (): boolean => {
    if (++steps > MAX_STEPS) return false;

    const i = used.indexOf(false);
    if (i === -1) return true; // everyone paired

    used[i] = true;
    for (let j = i + 1; j < ids.length; j++) {
      if (used[j]) continue;
      if (previousMatchups.has(pairingKey(ids[i], ids[j]))) continue;

      used[j] = true;
      result.push([ids[i], ids[j]]);
      if (solve()) return true;
      result.pop();
      used[j] = false;
    }
    used[i] = false;
    return false;
  };

  return solve() ? result : null;
}

/** Greedy fallback that accepts rematches, used when nothing else fits. */
function pairAllowingRematch(ids: number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) {
    pairs.push([ids[i], ids[i + 1]]);
  }
  return pairs;
}

/**
 * Picks who sits out an odd Swiss round: the lowest-ranked player who has
 * not had a bye yet. Previously it was always the last in the table, so the
 * same player could sit out every single round (REVIEW-BACKLOG.md B2).
 */
export function pickByePlayer(
  standings: StandingEntry[],
  byesSoFar: Map<number, number>,
): number | null {
  if (standings.length % 2 === 0) return null;

  let candidate: number | null = null;
  let fewestByes = Infinity;

  // Walk from the bottom of the table upwards: among the players with the
  // fewest byes so far, the lowest-ranked one gets it.
  for (let i = standings.length - 1; i >= 0; i--) {
    const id = standings[i].player.id;
    const byes = byesSoFar.get(id) ?? 0;
    if (byes < fewestByes) {
      fewestByes = byes;
      candidate = id;
      if (byes === 0) break; // cannot do better than never having sat out
    }
  }

  return candidate;
}

/**
 * Generates a Swiss round from the current standings.
 *
 * `byePlayer` (see {@link pickByePlayer}) is excluded from the pairing; the
 * caller stores their bye as a completed match so it counts as a win and
 * shows up in the history.
 */
export function generateSwissRound(
  standings: StandingEntry[],
  previousMatchups: Set<string>,
  byePlayer?: number | null,
): { team1_p1: number; team2_p1: number }[] {
  const ids = standings
    .map((s) => s.player.id)
    .filter((id) => id !== byePlayer);

  // Without a designated bye, an odd field still has to drop someone.
  if (ids.length % 2 !== 0) ids.pop();
  if (ids.length === 0) return [];

  const pairs = pairWithoutRematch(ids, previousMatchups) ?? pairAllowingRematch(ids);
  return pairs.map(([a, b]) => ({ team1_p1: a, team2_p1: b }));
}

/** Generates the first round of a Swiss doubles tournament (random pairing). */
export function generateSwissFirstRoundDoubles(
  teams: [number, number][]
): { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[] {
  const shuffled = shuffle(teams);

  // If odd count, last team gets a bye
  const active = shuffled.length % 2 !== 0 ? shuffled.slice(0, -1) : shuffled;

  const matches: { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[] = [];
  for (let i = 0; i < active.length - 1; i += 2) {
    matches.push({
      team1_p1: active[i][0], team1_p2: active[i][1],
      team2_p1: active[i + 1][0], team2_p2: active[i + 1][1],
    });
  }
  return matches;
}

/**
 * Generates a Swiss doubles round based on current team standings and previous matchups.
 * Matchup key: sorted team keys joined by "-".
 */
export function generateSwissRoundDoubles(
  standings: TeamStandingEntry[],
  previousMatchups: Set<string>
): { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[] {
  const teamKeys = standings.map((s) => s.teamKey);

  // If odd count, remove last (lowest-ranked) team for bye
  if (teamKeys.length % 2 !== 0) teamKeys.pop();

  // Build a lookup from teamKey -> standing entry
  const lookup = new Map<string, TeamStandingEntry>();
  for (const s of standings) lookup.set(s.teamKey, s);

  // Same backtracking search as the singles variant, over team keys.
  const indexOf = new Map(teamKeys.map((k, i) => [k, i]));
  const asNumbers = teamKeys.map((_, i) => i);
  const numericHistory = new Set<string>();
  for (let i = 0; i < teamKeys.length; i++) {
    for (let j = i + 1; j < teamKeys.length; j++) {
      const parts = [teamKeys[i], teamKeys[j]].sort();
      if (previousMatchups.has(`${parts[0]}-${parts[1]}`)) {
        numericHistory.add(pairingKey(i, j));
      }
    }
  }

  const pairs =
    pairWithoutRematch(asNumbers, numericHistory) ?? pairAllowingRematch(asNumbers);

  const matches: { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[] = [];
  for (const [a, b] of pairs) {
    const t1 = lookup.get(teamKeys[a])!;
    const t2 = lookup.get(teamKeys[b])!;
    matches.push({
      team1_p1: t1.player1.id, team1_p2: t1.player2.id,
      team2_p1: t2.player1.id, team2_p2: t2.player2.id,
    });
  }

  void indexOf;
  return matches;
}

// --- Monrad System ---
// Pairs strictly by ranking (#1 vs #2, #3 vs #4). Unlike Swiss it does not
// try to spread the field, but it must not repeat a matchup either: with an
// unchanged table, strict rank pairing reproduces the identical round over
// and over (REVIEW-BACKLOG.md B3). When a pairing has already been played,
// the partner is shifted by one position — the classic Monrad correction.

/**
 * Generates a Monrad round: rank-adjacent pairings, shifted where needed to
 * avoid a repeat. `byePlayer` is excluded like in Swiss.
 */
export function generateMonradRound(
  standings: StandingEntry[],
  previousMatchups: Set<string> = new Set(),
  byePlayer?: number | null,
): { team1_p1: number; team2_p1: number }[] {
  const ids = standings
    .map((s) => s.player.id)
    .filter((id) => id !== byePlayer);

  if (ids.length % 2 !== 0) ids.pop();
  if (ids.length === 0) return [];

  const pairs = pairWithoutRematch(ids, previousMatchups) ?? pairAllowingRematch(ids);
  return pairs.map(([a, b]) => ({ team1_p1: a, team2_p1: b }));
}

/** Monrad doubles round — same rules as the singles variant, over teams. */
export function generateMonradRoundDoubles(
  standings: TeamStandingEntry[],
  previousMatchups: Set<string> = new Set(),
): { team1_p1: number; team1_p2: number; team2_p1: number; team2_p2: number }[] {
  return generateSwissRoundDoubles(standings, previousMatchups);
}

// --- King of the Court ---
// Winner stays on court, loser goes to the back of the queue. One match at
// a time; the queue is the whole state of the format.

/** Generates ONE King of the Court match from the front of the queue. */
export function generateKingOfCourtMatch(
  queue: number[],
): { team1_p1: number; team2_p1: number; remainingQueue: number[] } {
  if (queue.length < 2) throw new Error("Need at least 2 players in queue");
  const [king, challenger, ...rest] = queue;
  return {
    team1_p1: king,
    team2_p1: challenger,
    remainingQueue: rest,
  };
}

/**
 * Advances the queue after a match: the winner stays at the front, the
 * loser goes to the back, everyone else keeps their relative order and
 * moves up.
 *
 * This rotation is the entire point of the format, and it needs the actual
 * previous queue. Rebuilding it from the (alphabetically sorted) player
 * list each round — the old behaviour — meant the same challenger stepped
 * up every time while the rest of the field never played
 * (REVIEW-BACKLOG.md B5).
 */
export function advanceKingOfCourtQueue(
  queue: number[],
  winner: number,
  loser: number,
  activePlayers?: Set<number>,
): number[] {
  const waiting = queue.filter((id) => id !== winner && id !== loser);
  const next = [winner, ...waiting, loser];

  // Drop players who left the tournament, append ones who joined late.
  if (activePlayers) {
    const kept = next.filter((id) => activePlayers.has(id));
    const known = new Set(kept);
    for (const id of activePlayers) {
      if (!known.has(id)) kept.push(id);
    }
    return kept;
  }
  return next;
}

// --- Waterfall ---
// Multiple courts, numbered 1 to N. Each round all courts play simultaneously.
// Winners move up one court, losers move down one court. Court 1 is the "King" court.

/**
 * Builds one Waterfall round from the current ladder.
 *
 * `courts` caps how many matches run at once — the hall does not grow just
 * because more players showed up. Whoever cannot be seated sits the round
 * out, and `restCounts` decides who that is: the players who have rested
 * least so far take their turn, ties broken by ladder position (lowest
 * first). Without that bookkeeping the bottom of the ladder sat out every
 * single round (REVIEW-BACKLOG.md B6).
 */
export function generateWaterfallRound(
  courtAssignments: number[],
  courts?: number,
  restCounts?: Map<number, number>,
): { matches: { court: number; team1_p1: number; team2_p1: number }[]; byePlayers: number[] } {
  const maxByCourts = courts && courts > 0 ? courts : Number.POSITIVE_INFINITY;
  const seats = Math.min(Math.floor(courtAssignments.length / 2), maxByCourts) * 2;
  const restingCount = courtAssignments.length - seats;

  let byePlayers: number[] = [];
  if (restingCount > 0) {
    const ladderPos = new Map(courtAssignments.map((id, i) => [id, i]));
    byePlayers = [...courtAssignments]
      .sort((a, b) => {
        const restDiff = (restCounts?.get(a) ?? 0) - (restCounts?.get(b) ?? 0);
        if (restDiff !== 0) return restDiff; // fewest rests take their turn
        return (ladderPos.get(b) ?? 0) - (ladderPos.get(a) ?? 0); // then from the bottom
      })
      .slice(0, restingCount);
  }

  const resting = new Set(byePlayers);
  const playing = courtAssignments.filter((id) => !resting.has(id));

  const matches: { court: number; team1_p1: number; team2_p1: number }[] = [];
  for (let i = 0; i + 1 < playing.length; i += 2) {
    matches.push({
      court: i / 2 + 1,
      team1_p1: playing[i],
      team2_p1: playing[i + 1],
    });
  }

  return { matches, byePlayers };
}

/** Advances waterfall court assignments based on results.
 * Winners move up (lower index), losers move down (higher index).
 * Court 1 winner stays, Court 1 loser goes to court 2.
 * Players who sat the round out keep their place in the ladder.
 * Returns new court assignments array.
 */
export function advanceWaterfall(
  courtAssignments: number[],
  results: { court: number; winner: number; loser: number }[],
): number[] {
  const sorted = [...results].sort((a, b) => a.court - b.court);
  const numCourts = sorted.length;

  if (numCourts === 0) return courtAssignments;

  const winners: number[] = sorted.map((r) => r.winner);
  const losers: number[] = sorted.map((r) => r.loser);

  const reordered: number[] = [];

  for (let c = 0; c < numCourts; c++) {
    if (c === 0) {
      // Court 1: its winner stays, the court-2 winner moves up
      reordered.push(winners[0]);
      if (numCourts > 1) {
        reordered.push(winners[1]);
      }
    } else if (c === numCourts - 1) {
      // Last court: the previous court's loser drops in, this court's loser stays
      reordered.push(losers[c - 1]);
      reordered.push(losers[c]);
    } else {
      // Middle court: previous court's loser drops in, next court's winner moves up
      reordered.push(losers[c - 1]);
      reordered.push(winners[c + 1]);
    }
  }

  // Put the reordered players back into the ladder slots they came from, so
  // players who sat the round out neither climb nor fall for not playing.
  const played = new Set<number>();
  for (const r of results) {
    played.add(r.winner);
    played.add(r.loser);
  }

  const next: number[] = [];
  let take = 0;
  for (const id of courtAssignments) {
    if (played.has(id)) {
      next.push(reordered[take++]);
    } else {
      next.push(id);
    }
  }

  // Anyone in the results who was not on the ladder before (shouldn't
  // happen, but keeps the function total) is appended.
  for (const id of reordered.slice(take)) {
    if (!next.includes(id)) next.push(id);
  }

  return next;
}
