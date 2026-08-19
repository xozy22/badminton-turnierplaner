import type { Match, Round, GameSet, TournamentStatus } from "../../lib/types";
import Icon from "../../components/ui/Icon";
import { isSetComplete } from "../../lib/scoring";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/I18nContext";
import RestIndicator from "../players/RestIndicator";

interface BracketViewProps {
  rounds: Round[];
  matchesByRound: Map<number, Match[]>;
  setsByMatch: Map<number, GameSet[]>;
  playerName: (id: number | null) => string;
  pointsPerSet: number;
  cap: number | null;
  /** All tournament matches (flat). Enables the ⏱ rest indicator next to names. */
  allMatches?: Match[];
  minRestMinutes?: number;
  tournamentStatus?: TournamentStatus;
}

// getRoundLabel is now inside the component to access translations

function getExpectedRounds(firstRoundMatchCount: number): number {
  // 4 matches -> 3 rounds (VF, HF, F), 2 matches -> 2 rounds (HF, F), 1 -> 1 (F)
  return Math.ceil(Math.log2(firstRoundMatchCount * 2));
}

const MATCH_HEIGHT = 58;
const MATCH_WIDTH = 200;
const ROUND_GAP = 40;
const MATCH_MARGIN = 8;

export default function BracketView({
  rounds,
  matchesByRound,
  setsByMatch,
  playerName,
  pointsPerSet,
  cap,
  allMatches,
  minRestMinutes = 0,
  tournamentStatus,
}: BracketViewProps) {
  const { theme } = useTheme();
  const { t } = useT();

  const getRoundLabel = (expectedTotalRounds: number, roundIdx: number): string => {
    const remaining = expectedTotalRounds - roundIdx;
    if (remaining === 1) return t.bracket_final;
    if (remaining === 2) return t.bracket_semifinal;
    if (remaining === 3) return t.bracket_quarterfinal;
    if (remaining === 4) return t.bracket_round_of_16;
    return t.bracket_round.replace("{n}", String(roundIdx + 1));
  };

  if (rounds.length === 0) return null;

  const actualRounds = rounds.length;
  const firstRoundCount = matchesByRound.get(rounds[0].id)?.length || 1;
  const expectedTotal = getExpectedRounds(firstRoundCount);
  const totalColumns = Math.max(actualRounds, expectedTotal);

  // Build column data: actual rounds + placeholder future rounds
  interface ColumnData {
    roundId: number | null; // null = placeholder
    matches: Match[];
    matchCount: number;
    label: string;
  }
  const columns: ColumnData[] = [];
  for (let ci = 0; ci < totalColumns; ci++) {
    if (ci < actualRounds) {
      const round = rounds[ci];
      const matches = matchesByRound.get(round.id) || [];
      columns.push({
        roundId: round.id,
        matches,
        matchCount: matches.length,
        label: getRoundLabel(expectedTotal, ci),
      });
    } else {
      // Placeholder: expected matches halve each round
      const prevCount = columns[ci - 1]?.matchCount || 1;
      const count = Math.max(Math.floor(prevCount / 2), 1);
      columns.push({
        roundId: null,
        matches: [],
        matchCount: count,
        label: getRoundLabel(expectedTotal, ci),
      });
    }
  }

  // Calculate positions for each match/placeholder
  const matchPositions = new Map<string, { x: number; y: number }>();
  const totalHeight = firstRoundCount * (MATCH_HEIGHT + MATCH_MARGIN * 2);
  const totalWidth = (totalColumns + 1) * (MATCH_WIDTH + ROUND_GAP) + 20;

  for (let ci = 0; ci < totalColumns; ci++) {
    const col = columns[ci];
    const x = ci * (MATCH_WIDTH + ROUND_GAP);
    const count = col.roundId ? col.matches.length : col.matchCount;

    if (ci === 0) {
      const spacing = totalHeight / count;
      for (let mi = 0; mi < count; mi++) {
        const y = mi * spacing + (spacing - MATCH_HEIGHT) / 2;
        matchPositions.set(`col${ci}-${mi}`, { x, y });
      }
    } else {
      for (let mi = 0; mi < count; mi++) {
        const p1Pos = matchPositions.get(`col${ci - 1}-${mi * 2}`);
        const p2Pos = matchPositions.get(`col${ci - 1}-${mi * 2 + 1}`);

        if (p1Pos && p2Pos) {
          const y = (p1Pos.y + p2Pos.y) / 2;
          matchPositions.set(`col${ci}-${mi}`, { x, y });
        } else if (p1Pos) {
          matchPositions.set(`col${ci}-${mi}`, { x, y: p1Pos.y });
        } else {
          const spacing = totalHeight / count;
          const y = mi * spacing + (spacing - MATCH_HEIGHT) / 2;
          matchPositions.set(`col${ci}-${mi}`, { x, y });
        }
      }
    }
  }

  // Connector lines between all columns (including placeholders)
  const lines: { x1: number; y1: number; x2: number; y2: number; highlight: boolean }[] = [];
  for (let ci = 1; ci < totalColumns; ci++) {
    const col = columns[ci];
    const count = col.roundId ? col.matches.length : col.matchCount;
    const hasReal = !!col.roundId;

    for (let mi = 0; mi < count; mi++) {
      const pos = matchPositions.get(`col${ci}-${mi}`);
      if (!pos) continue;

      const p1Pos = matchPositions.get(`col${ci - 1}-${mi * 2}`);
      const p2Pos = matchPositions.get(`col${ci - 1}-${mi * 2 + 1}`);
      const targetX = pos.x;
      const targetY = pos.y + MATCH_HEIGHT / 2;

      if (p1Pos) {
        const srcX = p1Pos.x + MATCH_WIDTH;
        const srcY = p1Pos.y + MATCH_HEIGHT / 2;
        const midX = srcX + ROUND_GAP / 2;
        lines.push({ x1: srcX, y1: srcY, x2: midX, y2: srcY, highlight: hasReal });
        lines.push({ x1: midX, y1: srcY, x2: midX, y2: targetY, highlight: hasReal });
        lines.push({ x1: midX, y1: targetY, x2: targetX, y2: targetY, highlight: hasReal });
      }
      if (p2Pos) {
        const srcX = p2Pos.x + MATCH_WIDTH;
        const srcY = p2Pos.y + MATCH_HEIGHT / 2;
        const midX = srcX + ROUND_GAP / 2;
        lines.push({ x1: srcX, y1: srcY, x2: midX, y2: srcY, highlight: hasReal });
        lines.push({ x1: midX, y1: srcY, x2: midX, y2: targetY, highlight: hasReal });
      }
    }
  }

  // Find final match (last column with a real match)
  const finalCol = columns[totalColumns - 1];
  const finalMatch = finalCol.roundId ? finalCol.matches[0] : null;
  const finalPos = matchPositions.get(`col${totalColumns - 1}-0`);

  return (
    <div className={`${theme.cardBg} rounded-lg shadow-sm border ${theme.cardBorder} p-5 pt-8 mb-5 overflow-x-auto`}>
      <div className="relative" style={{ width: totalWidth, height: totalHeight + 20 }}>
        {/* SVG connector lines */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={totalWidth}
          height={totalHeight + 20}
        >
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1} y1={l.y1 + 16} x2={l.x2} y2={l.y2 + 16}
              stroke={l.highlight ? "#d1d5db" : "#e5e7eb"}
              strokeWidth={2}
              strokeDasharray={l.highlight ? undefined : "4 4"}
            />
          ))}
          {/* Line from final to winner */}
          {finalMatch?.winner_team && finalPos && (
            <line
              x1={finalPos.x + MATCH_WIDTH}
              y1={finalPos.y + MATCH_HEIGHT / 2 + 16}
              x2={finalPos.x + MATCH_WIDTH + ROUND_GAP}
              y2={finalPos.y + MATCH_HEIGHT / 2 + 16}
              stroke="#f59e0b"
              strokeWidth={3}
            />
          )}
        </svg>

        {/* Column headers */}
        {columns.map((col, ci) => {
          const x = ci * (MATCH_WIDTH + ROUND_GAP);
          const isFinal = ci === totalColumns - 1;
          const isPlaceholder = !col.roundId;
          return (
            <div
              key={`header-${ci}`}
              className={`absolute text-xs font-bold uppercase tracking-wide ${
                isFinal ? "text-warning-text" : isPlaceholder ? `${theme.textMuted}` : `${theme.textMuted}`
              }`}
              style={{ left: x, top: -2, width: MATCH_WIDTH }}
            >
              {col.label}
            </div>
          );
        })}

        {/* Winner header */}
        {finalMatch?.winner_team && finalPos && (
          <div
            className="absolute text-xs font-bold uppercase tracking-wide text-warning-text"
            style={{ left: totalColumns * (MATCH_WIDTH + ROUND_GAP), top: -2 }}
          >
            {t.bracket_winner}
          </div>
        )}

        {/* Match boxes + placeholders */}
        {columns.map((col, ci) => {
          const count = col.roundId ? col.matches.length : col.matchCount;
          const isFinal = ci === totalColumns - 1;

          return Array.from({ length: count }, (_, mi) => {
            const pos = matchPositions.get(`col${ci}-${mi}`);
            if (!pos) return null;

            if (col.roundId && col.matches[mi]) {
              // Real match
              return (
                <div
                  key={`match-${col.roundId}-${mi}`}
                  className="absolute"
                  style={{ left: pos.x, top: pos.y + 16, width: MATCH_WIDTH }}
                >
                  <BracketMatch
                    match={col.matches[mi]}
                    sets={setsByMatch.get(col.matches[mi].id) || []}
                    playerName={playerName}
                    pointsPerSet={pointsPerSet}
                    cap={cap}
                    isFinal={isFinal}
                    allMatches={allMatches}
                    minRestMinutes={minRestMinutes}
                    tournamentStatus={tournamentStatus}
                  />
                </div>
              );
            } else {
              // Placeholder - show possible/confirmed participants from parent matches
              const prevCol = ci > 0 ? columns[ci - 1] : null;
              const parent1 = prevCol?.matches?.[mi * 2];
              const parent2 = prevCol?.matches?.[mi * 2 + 1];

              const getSlotLabel = (parentMatch: Match | undefined): { label: string; confirmed: boolean } => {
                if (!parentMatch) return { label: "—", confirmed: false };
                if (parentMatch.winner_team) {
                  // Winner is confirmed
                  const wId = parentMatch.winner_team === 1 ? parentMatch.team1_p1 : parentMatch.team2_p1;
                  const wP2 = parentMatch.winner_team === 1 ? parentMatch.team1_p2 : parentMatch.team2_p2;
                  const name = wP2 ? `${playerName(wId)} / ${playerName(wP2)}` : playerName(wId);
                  return { label: name, confirmed: true };
                }
                // Show both possible players
                const t1 = parentMatch.team1_p2
                  ? `${playerName(parentMatch.team1_p1)} / ${playerName(parentMatch.team1_p2)}`
                  : playerName(parentMatch.team1_p1);
                const t2 = parentMatch.team2_p2
                  ? `${playerName(parentMatch.team2_p1)} / ${playerName(parentMatch.team2_p2)}`
                  : playerName(parentMatch.team2_p1);
                return { label: `${t1} / ${t2}`, confirmed: false };
              };

              const slot1 = getSlotLabel(parent1);
              const slot2 = getSlotLabel(parent2);

              return (
                <div
                  key={`placeholder-${ci}-${mi}`}
                  className="absolute"
                  style={{ left: pos.x, top: pos.y + 16, width: MATCH_WIDTH }}
                >
                  <div className={`border-2 border-dashed ${theme.cardBorder} rounded-sm overflow-hidden ${theme.cardBg} opacity-30`}>
                    <div className={`px-2.5 py-1.5 text-2xs border-b border-dashed ${theme.cardBorder} truncate ${
                      slot1.confirmed ? `${theme.textPrimary} font-semibold ${theme.cardBg}` : `${theme.textMuted} italic`
                    }`}>
                      {slot1.label}
                    </div>
                    <div className={`px-2.5 py-1.5 text-2xs truncate ${
                      slot2.confirmed ? `${theme.textPrimary} font-semibold ${theme.cardBg}` : `${theme.textMuted} italic`
                    }`}>
                      {slot2.label}
                    </div>
                  </div>
                </div>
              );
            }
          });
        })}

        {/* Winner box */}
        {finalMatch?.winner_team && finalPos && (() => {
          const winnerId = finalMatch.winner_team === 1 ? finalMatch.team1_p1 : finalMatch.team2_p1;
          const winnerP2 = finalMatch.winner_team === 1 ? finalMatch.team1_p2 : finalMatch.team2_p2;
          const winnerLabel = winnerP2
            ? `${playerName(winnerId)} / ${playerName(winnerP2)}`
            : playerName(winnerId);

          return (
            <div
              className="absolute"
              style={{
                left: totalColumns * (MATCH_WIDTH + ROUND_GAP),
                top: finalPos.y + 16,
                width: 150,
              }}
            >
              <div className="bg-gradient-to-r from-amber-50 to-amber-100 border-2 border-warning rounded-md px-3 py-2.5 text-center">
                <div className="text-xl mb-0.5"><Icon name="trophy" /></div>
                <div className="font-bold text-warning-text text-xs leading-tight">
                  {winnerLabel}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export function BracketMatch({
  match,
  sets,
  playerName,
  pointsPerSet,
  cap,
  isFinal,
  allMatches,
  minRestMinutes,
  tournamentStatus,
}: {
  match: Match;
  sets: GameSet[];
  playerName: (id: number | null) => string;
  pointsPerSet: number;
  cap: number | null;
  isFinal: boolean;
  allMatches?: Match[];
  minRestMinutes: number;
  tournamentStatus?: TournamentStatus;
}) {
  const { theme } = useTheme();
  const { t } = useT();

  const team1Label = match.team1_p2
    ? `${playerName(match.team1_p1)} / ${playerName(match.team1_p2)}`
    : playerName(match.team1_p1);
  // A bye has no opponent at all — label it instead of rendering "-".
  const team2Label = match.team2_p1 === null
    ? t.common_bye
    : match.team2_p2
      ? `${playerName(match.team2_p1)} / ${playerName(match.team2_p2)}`
      : playerName(match.team2_p1);

  // JSX renderer with inline ⏱ rest indicator. Only active non-completed
  // matches get the icon; placeholder slots already skip this path.
  const showRestIcons =
    tournamentStatus === "active" &&
    minRestMinutes > 0 &&
    match.status !== "completed" &&
    !!allMatches;
  const renderTeam = (p1: number | null, p2: number | null) =>
    p1 === null ? (
      <span className="italic opacity-70">{t.common_bye}</span>
    ) : (
    <>
      <span>{playerName(p1)}</span>
      {showRestIcons && (
        <RestIndicator
          playerId={p1}
          matches={allMatches!}
          minRestMinutes={minRestMinutes}
          excludeMatchId={match.id}
        />
      )}
      {p2 != null && (
        <>
          <span className="mx-1 text-muted">/</span>
          <span>{playerName(p2)}</span>
          {showRestIcons && (
            <RestIndicator
              playerId={p2}
              matches={allMatches!}
              minRestMinutes={minRestMinutes}
              excludeMatchId={match.id}
            />
          )}
        </>
      )}
    </>
  );

  let t1Sets = 0, t2Sets = 0;
  for (const s of sets) {
    if (isSetComplete(s, pointsPerSet, cap)) {
      if (s.team1_score > s.team2_score) t1Sets++;
      else t2Sets++;
    }
  }

  const isCompleted = match.status === "completed";
  const borderColor = isFinal
    ? "border-warning"
    : isCompleted
    ? "border-emerald-300"
    : `${theme.cardBorder}`;

  return (
    <div className={`border-2 ${borderColor} rounded-sm overflow-hidden ${theme.cardBg} shadow-sm`}>
      <div
        className={`flex items-center justify-between px-2.5 py-1.5 text-2xs border-b ${theme.cardBorder} ${
          match.winner_team === 1
            ? "bg-emerald-50 font-bold text-emerald-800"
            : match.winner_team === 2
            ? `${theme.textMuted}`
            : `${theme.textPrimary}`
        }`}
      >
        <span className="truncate flex-1 mr-1">
          {showRestIcons ? renderTeam(match.team1_p1, match.team1_p2) : team1Label}
        </span>
        {(t1Sets > 0 || t2Sets > 0) && (
          <span className="font-mono font-bold shrink-0 text-xs">{t1Sets}</span>
        )}
      </div>
      <div
        className={`flex items-center justify-between px-2.5 py-1.5 text-2xs ${
          match.winner_team === 2
            ? "bg-emerald-50 font-bold text-emerald-800"
            : match.winner_team === 1
            ? `${theme.textMuted}`
            : `${theme.textPrimary}`
        }`}
      >
        <span className="truncate flex-1 mr-1">
          {showRestIcons ? renderTeam(match.team2_p1, match.team2_p2) : team2Label}
        </span>
        {(t1Sets > 0 || t2Sets > 0) && (
          <span className="font-mono font-bold shrink-0 text-xs">{t2Sets}</span>
        )}
      </div>
    </div>
  );
}
