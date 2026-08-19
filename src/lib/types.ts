export type Gender = "m" | "f";
export type TournamentMode = "singles" | "doubles" | "mixed";
export type TournamentFormat = "round_robin" | "elimination" | "random_doubles" | "group_ko" | "swiss" | "double_elimination" | "monrad" | "king_of_court" | "waterfall";
export type TournamentStatus = "draft" | "active" | "completed" | "archived";
export type MatchStatus = "pending" | "active" | "completed";

export interface Player {
  id: number;
  first_name: string;
  last_name: string;
  gender: Gender;
  birth_date: string | null;
  club: string | null;
  created_at: string;
  /**
   * Set when the player was archived: they disappear from the pickers but
   * stay readable in every tournament they took part in. Players without
   * history are deleted outright (REVIEW-BACKLOG.md C8). Migration v17.
   */
  archived_at?: string | null;
}

export function playerDisplayName(p: { first_name: string; last_name: string }): string {
  return p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name;
}

export function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export interface HallConfig {
  name: string;
  courts: number;
}

export function parseHallConfig(json: string | null): HallConfig[] {
  if (!json) return [];
  try { return JSON.parse(json) as HallConfig[]; } catch (err) { console.error("parseHallConfig: failed to parse hall config JSON:", err); return []; }
}

export function hallConfigTotalCourts(config: HallConfig[]): number {
  return config.reduce((sum, h) => sum + h.courts, 0);
}

/** Convert global court number to hall-local label */
export function getCourtHallLabel(courtNum: number, config: HallConfig[]): { hallName: string; localCourt: number } {
  let offset = 0;
  for (const h of config) {
    if (courtNum <= offset + h.courts) {
      return { hallName: h.name, localCourt: courtNum - offset };
    }
    offset += h.courts;
  }
  return { hallName: "", localCourt: courtNum };
}

export interface Sportstaette {
  id: number;
  name: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  courts: number;
  halls: string | null;
  created_at: string;
}

export type TournamentPhase = "group" | "ko" | "swiss" | "winners" | "losers" | "third_place" | "ready" | null;

export interface Tournament {
  id: number;
  name: string;
  mode: TournamentMode;
  format: TournamentFormat;
  sets_to_win: number;
  points_per_set: number;
  cap: number | null;
  ko_points_per_set: number | null;
  ko_sets_to_win: number | null;
  ko_cap: number | null;
  courts: number;
  num_groups: number;
  qualify_per_group: number;
  current_phase: TournamentPhase;
  entry_fee_single: number;
  entry_fee_double: number;
  team_config: string | null;
  hall_config: string | null;
  venue_id: number | null;
  min_rest_minutes: number;
  /**
   * How many rounds a Swiss / Monrad / Waterfall tournament runs. NULL for
   * every other format. Before migration v15 this number was squeezed into
   * `num_groups`, which every other reader treats as a group count
   * (REVIEW-BACKLOG.md B7).
   */
  planned_rounds: number | null;
  /**
   * 0 = no 3rd-place playoff. 1 = automatically create a "Spiel um Platz 3"
   * match (semifinal losers in elimination/group_ko, LB-final-loser vs.
   * LB-semifinal-loser in double_elimination). Persisted via migration v11.
   */
  enable_third_place: number;
  /**
   * Optional foreign key to a `sessions` row. When set, the tournament is
   * part of a multi-tournament workspace at the same venue — court pool
   * and player conflicts are shared with the other tournaments in the
   * session. NULL = standalone tournament (default behavior). Migration v13.
   */
  session_id: number | null;
  /**
   * When the tournament is played, as opposed to `created_at`, which is
   * when the row was written. NULL for tournaments set up on the spot and
   * for everything created before migration v19 — guessing a play date
   * from the creation date would be wrong for anything planned in advance
   * (FEATURE-BACKLOG.md A1).
   */
  play_date: string | null;
  /** Start time on the play date, 24-hour clock. */
  start_time: string | null;
  created_at: string;
  status: TournamentStatus;
}

/**
 * A "session" bundles multiple tournaments that run in parallel at the
 * same venue and share the physical court pool. Sessions are opt-in —
 * tournaments without a session_id keep their pre-v2.8 behavior.
 */
export type SessionStatus = "active" | "ended" | "archived";

export interface Session {
  id: number;
  venue_id: number | null;
  name: string;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
}

export type PaymentMethod = "bar" | "ueberweisung" | "paypal";
export type PaymentStatus = "unpaid" | "paid";

/*
 * MODE_LABELS, FORMAT_LABELS, STATUS_LABELS and PAYMENT_METHOD_LABELS used
 * to live here as fixed German strings, in parallel with translation keys
 * that said the same thing. Whichever a screen reached for decided whether
 * it stayed German under an English setting. See lib/i18n/labels.ts
 * (REVIEW-BACKLOG.md H4).
 */

export interface TournamentPlayer {
  tournament_id: number;
  player_id: number;
}

export interface TournamentPlayerInfo {
  player: Player;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  paid_date: string | null;
  retired: boolean;
  /**
   * Seed rank for this tournament: 1 = top seed, 2 = next, etc. NULL for
   * unseeded players or tournaments without a seed list. Persisted in
   * tournament_players.seed_rank since migration v10.
   */
  seed_rank: number | null;
}

export interface Round {
  id: number;
  tournament_id: number;
  round_number: number;
  phase: TournamentPhase;
  group_number: number | null;
}

export interface Match {
  id: number;
  round_id: number;
  court: number | null;
  court_assigned_at: string | null;
  team1_p1: number;
  team1_p2: number | null;
  /**
   * NULL means the match has no opponent: a bye. The player in team 1
   * advances without playing, and the match is stored as already completed
   * with `winner_team = 1`. Nullable since migration v14 — see
   * REVIEW-BACKLOG.md A2, where byes used to make players disappear from
   * the bracket entirely.
   */
  team2_p1: number | null;
  team2_p2: number | null;
  winner_team: 1 | 2 | null;
  status: MatchStatus;
  /**
   * 1 = awarded without play (retirement, no-show). Counts as a win for
   * the opponent but contributes no sets or points to any table — see
   * REVIEW-BACKLOG.md B8, where walkovers used to be stored as invented
   * 21:0 sets. Persisted via migration v15.
   */
  walkover: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface GameSet {
  id: number;
  match_id: number;
  set_number: number;
  team1_score: number;
  team2_score: number;
}

export interface StandingEntry {
  player: Player;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
  /**
   * Buchholz score: the sum of the wins of all opponents faced. Only
   * present for Swiss/Monrad tables, where it is the standard fine-scoring
   * (REVIEW-BACKLOG.md B2).
   */
  buchholz?: number;
}

export interface LivePublishConfig {
  // Connection details for the WordPress endpoint. Live publishing is
  // enabled per-tournament (see `live_publish_tournament_ids` in
  // app_settings) — this config only stores how to connect, not whether
  // any tournament is currently being pushed.
  endpoint: string;       // e.g. https://verein.de/wp-json/boss/v1/push
  secret: string;         // shared secret used in X-BOSS-Secret header
  /**
   * How much of a player's name reaches the public page. Absent means
   * "full", which is what installations predating this option published.
   * See PrivacyLevel in livePublish.ts.
   */
  privacyLevel?: "full" | "abbreviated" | "abbreviated_no_club";
  lastPushAt?: string;    // ISO of last successful push (any tournament)
  lastError?: string;     // last error message, cleared on next success
}

export interface TeamStandingEntry {
  teamKey: string; // "id1-id2" sorted
  player1: Player;
  player2: Player;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}

