// src/components/bracket/BronzeMatchPanel.tsx
//
// Compact panel rendered below the main BracketView when a tournament has
// `enable_third_place = 1` and the bronze playoff round has been created.
// The bronze round lives as a sibling of the Final (same round_number,
// phase = "third_place") and is filtered out of the main bracket layout —
// this panel renders that single match with a 🥉 accent.
//
// Reuses BracketMatch from BracketView.tsx for consistent score rendering
// and rest-time indicator handling.

import { useTheme } from "../../lib/ThemeContext";
import Icon from "../../components/ui/Icon";
import { useT } from "../../lib/I18nContext";
import type { Match, Round, GameSet, TournamentStatus } from "../../lib/types";
import { BracketMatch } from "./BracketView";

interface Props {
  bronzeRound: Round;
  matches: Match[];
  setsByMatch: Map<number, GameSet[]>;
  playerName: (id: number | null) => string;
  pointsPerSet: number;
  cap: number | null;
  allMatches?: Match[];
  minRestMinutes?: number;
  tournamentStatus?: TournamentStatus;
}

export default function BronzeMatchPanel({
  bronzeRound,
  matches,
  setsByMatch,
  playerName,
  pointsPerSet,
  cap,
  allMatches,
  minRestMinutes = 0,
  tournamentStatus,
}: Props) {
  const { theme } = useTheme();
  const { t } = useT();

  if (matches.length === 0) return null;
  // Bronze round is always exactly one match — defensive guard if more.
  const match = matches[0];

  return (
    <div
      className={`${theme.cardBg} rounded-lg shadow-sm border-2 border-warning p-5 mb-5`}
      role="region"
      aria-label={t.bracket_third_place}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon name="medal" size={20} className="text-danger-text" />
        <h3 className={`text-sm font-bold uppercase tracking-wide text-warning-text`}>
          {t.bracket_third_place}
        </h3>
      </div>
      <div className="max-w-xs">
        <BracketMatch
          match={match}
          sets={setsByMatch.get(match.id) || []}
          playerName={playerName}
          pointsPerSet={pointsPerSet}
          cap={cap}
          isFinal={false}
          allMatches={allMatches}
          minRestMinutes={minRestMinutes}
          tournamentStatus={tournamentStatus}
        />
      </div>
      {/* keep round id referenced so TS doesn't complain about unused prop */}
      <span className="hidden" data-bronze-round-id={bronzeRound.id} />
    </div>
  );
}
