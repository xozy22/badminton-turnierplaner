import type { Tournament, Match, GameSet, Player, TournamentFormat, TournamentMode } from "./types";
import { calculateAge } from "./types";
import { dbDateToMillis } from "./datetime";

// ===== Tournament Stats =====
export interface TournamentStats {
  total: number;
  byStatus: { draft: number; active: number; completed: number; archived: number };
  byFormat: { format: TournamentFormat; count: number }[];
  byMode: { mode: TournamentMode; count: number }[];
}

export function calculateTournamentStats(tournaments: Tournament[]): TournamentStats {
  const byStatus = { draft: 0, active: 0, completed: 0, archived: 0 };
  const formatMap = new Map<TournamentFormat, number>();
  const modeMap = new Map<TournamentMode, number>();

  for (const t of tournaments) {
    byStatus[t.status]++;
    formatMap.set(t.format, (formatMap.get(t.format) || 0) + 1);
    modeMap.set(t.mode, (modeMap.get(t.mode) || 0) + 1);
  }

  const byFormat = Array.from(formatMap.entries())
    .map(([format, count]) => ({ format, count }))
    .sort((a, b) => b.count - a.count);

  const byMode = Array.from(modeMap.entries())
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count);

  return { total: tournaments.length, byStatus, byFormat, byMode };
}

// ===== Match Stats =====
export interface MatchStats {
  totalCompleted: number;
  avgDurationMinutes: number | null;
  longestMatch: { durationMinutes: number; matchId: number } | null;
  shortestMatch: { durationMinutes: number; matchId: number } | null;
  avgPointsPerSet: number;
  closestMatch: { delta: number; matchId: number } | null;
  totalSets: number;
  totalPoints: number;
}

export function calculateMatchStats(matches: Match[], sets: Map<number, GameSet[]>): MatchStats {
  const completed = matches.filter((m) => m.status === "completed");

  // Duration calculations
  const durations: { matchId: number; minutes: number }[] = [];
  for (const m of completed) {
    if (m.started_at && m.completed_at) {
      // Through the shared parser: these may be SQLite's zoneless UTC.
      const start = dbDateToMillis(m.started_at);
      const end = dbDateToMillis(m.completed_at);
      if (start === null || end === null) continue;
      const minutes = (end - start) / 60000;
      if (minutes > 0) {
        durations.push({ matchId: m.id, minutes });
      }
    }
  }

  const avgDurationMinutes =
    durations.length > 0
      ? Math.round((durations.reduce((s, d) => s + d.minutes, 0) / durations.length) * 10) / 10
      : null;

  let longestMatch: MatchStats["longestMatch"] = null;
  let shortestMatch: MatchStats["shortestMatch"] = null;
  if (durations.length > 0) {
    const sorted = [...durations].sort((a, b) => a.minutes - b.minutes);
    const shortest = sorted[0];
    const longest = sorted[sorted.length - 1];
    longestMatch = { durationMinutes: Math.round(longest.minutes * 10) / 10, matchId: longest.matchId };
    shortestMatch = { durationMinutes: Math.round(shortest.minutes * 10) / 10, matchId: shortest.matchId };
  }

  // Points and sets calculations
  let totalSets = 0;
  let totalPoints = 0;
  let closestMatch: MatchStats["closestMatch"] = null;

  for (const m of completed) {
    const matchSets = sets.get(m.id) || [];
    let matchDelta = 0;
    for (const s of matchSets) {
      totalSets++;
      totalPoints += s.team1_score + s.team2_score;
      matchDelta += Math.abs(s.team1_score - s.team2_score);
    }
    if (matchSets.length > 0) {
      if (closestMatch === null || matchDelta < closestMatch.delta) {
        closestMatch = { delta: matchDelta, matchId: m.id };
      }
    }
  }

  const avgPointsPerSet = totalSets > 0 ? Math.round((totalPoints / totalSets) * 10) / 10 : 0;

  return {
    totalCompleted: completed.length,
    avgDurationMinutes,
    longestMatch,
    shortestMatch,
    avgPointsPerSet,
    closestMatch,
    totalSets,
    totalPoints,
  };
}

// ===== Court Stats =====
export interface CourtStats {
  totalCourtsUsed: number;
  matchesPerCourt: { court: number; count: number }[];
  avgMatchesPerCourt: number;
  avgDurationPerCourt: { court: number; avgMinutes: number }[];
}

export function calculateCourtStats(matches: Match[]): CourtStats {
  const completed = matches.filter((m) => m.status === "completed" && m.court !== null);

  const courtCounts = new Map<number, number>();
  const courtDurations = new Map<number, number[]>();

  for (const m of completed) {
    const court = m.court!;
    courtCounts.set(court, (courtCounts.get(court) || 0) + 1);

    if (m.started_at && m.completed_at) {
      const startMs = dbDateToMillis(m.started_at);
      const endMs = dbDateToMillis(m.completed_at);
      if (startMs === null || endMs === null) continue;
      const minutes = (endMs - startMs) / 60000;
      if (minutes > 0) {
        const arr = courtDurations.get(court) || [];
        arr.push(minutes);
        courtDurations.set(court, arr);
      }
    }
  }

  const matchesPerCourt = Array.from(courtCounts.entries())
    .map(([court, count]) => ({ court, count }))
    .sort((a, b) => a.court - b.court);

  const totalCourtsUsed = matchesPerCourt.length;
  const avgMatchesPerCourt =
    totalCourtsUsed > 0
      ? Math.round((completed.length / totalCourtsUsed) * 10) / 10
      : 0;

  const avgDurationPerCourt = Array.from(courtDurations.entries())
    .map(([court, durations]) => ({
      court,
      avgMinutes: Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10,
    }))
    .sort((a, b) => a.court - b.court);

  return { totalCourtsUsed, matchesPerCourt, avgMatchesPerCourt, avgDurationPerCourt };
}

// ===== Player Demographics =====
export interface DemoStats {
  totalPlayers: number;
  genderSplit: { male: number; female: number };
  ageGroups: { label: string; count: number }[];
  topClubs: { club: string; count: number }[];
  noClub: number;
}

export function calculatePlayerDemographics(players: Player[]): DemoStats {
  let male = 0;
  let female = 0;
  const ageBuckets: Record<string, number> = { "<18": 0, "18-30": 0, "31-45": 0, "46-60": 0, "60+": 0 };
  const clubCounts = new Map<string, number>();
  let noClub = 0;

  for (const p of players) {
    if (p.gender === "m") male++;
    else female++;

    const age = calculateAge(p.birth_date);
    if (age !== null) {
      if (age < 18) ageBuckets["<18"]++;
      else if (age <= 30) ageBuckets["18-30"]++;
      else if (age <= 45) ageBuckets["31-45"]++;
      else if (age <= 60) ageBuckets["46-60"]++;
      else ageBuckets["60+"]++;
    }

    if (p.club) {
      clubCounts.set(p.club, (clubCounts.get(p.club) || 0) + 1);
    } else {
      noClub++;
    }
  }

  const ageGroups = Object.entries(ageBuckets).map(([label, count]) => ({ label, count }));

  const topClubs = Array.from(clubCounts.entries())
    .map(([club, count]) => ({ club, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalPlayers: players.length,
    genderSplit: { male, female },
    ageGroups,
    topClubs,
    noClub,
  };
}

// ===== Player Rankings (cross-tournament) =====
export interface PlayerRankingEntry {
  player: Player;
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPointsWon: number;
  totalPointsLost: number;
  avgPointsPerMatch: number;
}

export function calculatePlayerRankings(
  matches: Match[],
  sets: Map<number, GameSet[]>,
  players: Player[]
): PlayerRankingEntry[] {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const stats = new Map<
    number,
    { wins: number; losses: number; pointsWon: number; pointsLost: number }
  >();

  const completed = matches.filter((m) => m.status === "completed" && m.winner_team !== null);

  for (const m of completed) {
    const team1Players = [m.team1_p1, m.team1_p2].filter((id): id is number => id !== null);
    const team2Players = [m.team2_p1, m.team2_p2].filter((id): id is number => id !== null);
    const winners = m.winner_team === 1 ? team1Players : team2Players;
    const losers = m.winner_team === 1 ? team2Players : team1Players;

    const matchSets = sets.get(m.id) || [];

    for (const pid of winners) {
      const s = stats.get(pid) || { wins: 0, losses: 0, pointsWon: 0, pointsLost: 0 };
      s.wins++;
      stats.set(pid, s);
    }
    for (const pid of losers) {
      const s = stats.get(pid) || { wins: 0, losses: 0, pointsWon: 0, pointsLost: 0 };
      s.losses++;
      stats.set(pid, s);
    }

    for (const gs of matchSets) {
      for (const pid of team1Players) {
        const s = stats.get(pid) || { wins: 0, losses: 0, pointsWon: 0, pointsLost: 0 };
        s.pointsWon += gs.team1_score;
        s.pointsLost += gs.team2_score;
        stats.set(pid, s);
      }
      for (const pid of team2Players) {
        const s = stats.get(pid) || { wins: 0, losses: 0, pointsWon: 0, pointsLost: 0 };
        s.pointsWon += gs.team2_score;
        s.pointsLost += gs.team1_score;
        stats.set(pid, s);
      }
    }
  }

  const result: PlayerRankingEntry[] = [];

  for (const [pid, s] of stats) {
    const player = playerMap.get(pid);
    if (!player) continue;

    const totalMatches = s.wins + s.losses;
    if (totalMatches === 0) continue;

    result.push({
      player,
      totalMatches,
      wins: s.wins,
      losses: s.losses,
      winRate: Math.round((s.wins / totalMatches) * 1000) / 10,
      totalPointsWon: s.pointsWon,
      totalPointsLost: s.pointsLost,
      avgPointsPerMatch: Math.round((s.pointsWon / totalMatches) * 10) / 10,
    });
  }

  result.sort((a, b) => {
    // 1. Match win percentage
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    // 2. Point win percentage
    const ptPctA = (a.totalPointsWon + a.totalPointsLost) > 0 ? a.totalPointsWon / (a.totalPointsWon + a.totalPointsLost) : 0;
    const ptPctB = (b.totalPointsWon + b.totalPointsLost) > 0 ? b.totalPointsWon / (b.totalPointsWon + b.totalPointsLost) : 0;
    if (ptPctB !== ptPctA) return ptPctB - ptPctA;
    // 3. Total wins as final tiebreaker
    return b.wins - a.wins;
  });

  return result;
}
