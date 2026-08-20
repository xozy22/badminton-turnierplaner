// src/pages/TournamentView/components/SecondaryTabs.tsx
//
// Groups, the two bracket views, standings, and management.
//
// Each is already a component; what lived in index.tsx was the
// `viewTab === "x"` condition around it and the props. Gathering them puts
// the question "which tab is showing" in one file rather than five places
// in a long one (REVIEW-BACKLOG.md D1).

import GruppenTab from "../../../components/tournament/GruppenTab";
import BracketView from "../../../components/bracket/BracketView";
import BronzeMatchPanel from "../../../components/bracket/BronzeMatchPanel";
import RanglisteTab from "../../../components/tournament/RanglisteTab";
import VerwaltungTab from "../../../components/tournament/VerwaltungTab";
import { useT } from "../../../lib/I18nContext";
import { useTheme } from "../../../lib/ThemeContext";
import type { useCourtDerivations } from "../lib/useCourtDerivations";
import type {
  GameSet,
  Match,
  Player,
  Round,
  StandingEntry,
  Tournament,
  TournamentPlayerInfo,
  EntryStatus,
  FeeDue,
  FeeItem,
} from "../../../lib/types";

interface Props {
  viewTab: string;
  tournament: Tournament;
  players: Player[];
  allPlayers: Player[];
  rounds: Round[];
  allMatches: Match[];
  matchesByRound: Map<number, Match[]>;
  setsByMatch: Map<number, GameSet[]>;
  standings: StandingEntry[];
  paymentData: TournamentPlayerInfo[];
  setPaymentData: (data: TournamentPlayerInfo[]) => void;
  collapsedClubs: Set<string>;
  setCollapsedClubs: React.Dispatch<React.SetStateAction<Set<string>>>;
  showAddPlayer: boolean;
  setShowAddPlayer: (show: boolean) => void;
  setRetireTarget: (target: { player: Player; partnerNote: string } | null) => void;
  isGroupKo: boolean;
  isElimination: boolean;
  isDoubleElimination: boolean;
  koRoundsForBracket: Round[];
  winnersRounds: Round[];
  losersRounds: Round[];
  derived: ReturnType<typeof useCourtDerivations>;
  getGroupData: (groupNumber: number) => {
    gMatches: Match[];
    gSets: Map<number, GameSet[]>;
    pIds: Set<number>;
  };
  playerName: (id: number | null) => string;
  onAddPlayer: (playerId: number) => void;
  onRemovePlayer: (playerId: number) => void;
  onUnretire: (playerId: number) => void;
  feeItems: FeeItem[];
  onEntryStatusChange: (playerId: number, status: EntryStatus) => void | Promise<void>;
  onPromoteWaiting: () => void | Promise<void>;
  onFeeItemAdd: (playerId: number | null, label: string, amount: number) => void | Promise<void>;
  onFeeItemPaid: (itemId: number, paid: boolean) => void | Promise<void>;
  onFeeItemDelete: (itemId: number) => void | Promise<void>;
  onFeeDueChange: (value: FeeDue) => void | Promise<void>;
}

export default function SecondaryTabs({
  viewTab,
  tournament,
  players,
  allPlayers,
  rounds,
  allMatches,
  matchesByRound,
  setsByMatch,
  standings,
  paymentData,
  setPaymentData,
  collapsedClubs,
  setCollapsedClubs,
  showAddPlayer,
  setShowAddPlayer,
  setRetireTarget,
  isGroupKo,
  isElimination,
  isDoubleElimination,
  koRoundsForBracket,
  winnersRounds,
  losersRounds,
  derived,
  getGroupData,
  playerName,
  onAddPlayer: handleAddPlayer,
  onRemovePlayer: handleRemovePlayer,
  onUnretire: handlePlayerUnretire,
  feeItems,
  onEntryStatusChange,
  onPromoteWaiting,
  onFeeItemAdd,
  onFeeItemPaid,
  onFeeItemDelete,
  onFeeDueChange,
}: Props) {
  const { t } = useT();
  const { theme } = useTheme();

  return (
    <>
  {/* Tab: Gruppen */}
  {viewTab === "gruppen" && isGroupKo && (
    <GruppenTab
      tournament={tournament}
      players={players}
      theme={theme}
      rounds={rounds}
      getGroupData={getGroupData}
      seedRankByPlayer={derived.seedRankByPlayer}
    />
  )}

  {/* Tab: Bracket */}
  {viewTab === "bracket" && koRoundsForBracket.length > 0 && (isElimination || (isGroupKo && tournament.current_phase === "ko")) && (
    <>
      <BracketView
        rounds={koRoundsForBracket}
        matchesByRound={matchesByRound}
        setsByMatch={setsByMatch}
        playerName={playerName}
        pointsPerSet={isGroupKo && tournament.ko_points_per_set != null ? tournament.ko_points_per_set : tournament.points_per_set}
        cap={isGroupKo && tournament.ko_points_per_set != null ? tournament.ko_cap : tournament.cap}
        allMatches={allMatches}
        minRestMinutes={tournament.min_rest_minutes}
        tournamentStatus={tournament.status}
      />
      {derived.thirdPlaceRound && (
        <BronzeMatchPanel
          bronzeRound={derived.thirdPlaceRound}
          matches={matchesByRound.get(derived.thirdPlaceRound.id) || []}
          setsByMatch={setsByMatch}
          playerName={playerName}
          pointsPerSet={isGroupKo && tournament.ko_points_per_set != null ? tournament.ko_points_per_set : tournament.points_per_set}
          cap={isGroupKo && tournament.ko_points_per_set != null ? tournament.ko_cap : tournament.cap}
          allMatches={allMatches}
          minRestMinutes={tournament.min_rest_minutes}
          tournamentStatus={tournament.status}
        />
      )}
    </>
  )}

  {/* Tab: Bracket (Double Elimination) */}
  {viewTab === "bracket" && isDoubleElimination && (winnersRounds.length > 0 || losersRounds.length > 0) && (
    <div>
      {winnersRounds.length > 0 && (
        <>
          <h3 className={`text-lg font-bold ${theme.textPrimary} mb-3`}>{t.bracket_winners_bracket}</h3>
          <BracketView
            rounds={winnersRounds}
            matchesByRound={matchesByRound}
            setsByMatch={setsByMatch}
            playerName={playerName}
            pointsPerSet={tournament.points_per_set}
            cap={tournament.cap}
            allMatches={allMatches}
            minRestMinutes={tournament.min_rest_minutes}
            tournamentStatus={tournament.status}
          />
        </>
      )}
      {losersRounds.length > 0 && (
        <>
          <h3 className={`text-lg font-bold ${theme.textPrimary} mb-3 mt-6`}>{t.bracket_losers_bracket}</h3>
          <BracketView
            rounds={losersRounds}
            matchesByRound={matchesByRound}
            setsByMatch={setsByMatch}
            playerName={playerName}
            pointsPerSet={tournament.points_per_set}
            cap={tournament.cap}
            allMatches={allMatches}
            minRestMinutes={tournament.min_rest_minutes}
            tournamentStatus={tournament.status}
          />
        </>
      )}
      {derived.thirdPlaceRound && (
        <BronzeMatchPanel
          bronzeRound={derived.thirdPlaceRound}
          matches={matchesByRound.get(derived.thirdPlaceRound.id) || []}
          setsByMatch={setsByMatch}
          playerName={playerName}
          pointsPerSet={tournament.points_per_set}
          cap={tournament.cap}
          allMatches={allMatches}
          minRestMinutes={tournament.min_rest_minutes}
          tournamentStatus={tournament.status}
        />
      )}
    </div>
  )}

  {/* Tab: Rangliste */}
  {viewTab === "rangliste" && (
    <RanglisteTab
      tournament={tournament}
      players={players}
      standings={standings}
      theme={theme}
    />
  )}

  {/* Tab: Verwaltung (Teilnehmer + Startgeld kombiniert) */}
  {viewTab === "verwaltung" && tournament && (
    <VerwaltungTab
      tournament={tournament}
      players={players}
      allPlayers={allPlayers}
      paymentData={paymentData}
      theme={theme}
      collapsedClubs={collapsedClubs}
      showAddPlayer={showAddPlayer}
      allMatches={allMatches}
      setShowAddPlayer={setShowAddPlayer}
      handleAddPlayer={handleAddPlayer}
      handleRemovePlayer={handleRemovePlayer}
      setPaymentData={setPaymentData}
      setCollapsedClubs={setCollapsedClubs}
      setRetireTarget={setRetireTarget}
      onUnretire={handlePlayerUnretire}
      feeItems={feeItems}
      onEntryStatusChange={onEntryStatusChange}
      onPromoteWaiting={onPromoteWaiting}
      onFeeItemAdd={onFeeItemAdd}
      onFeeItemPaid={onFeeItemPaid}
      onFeeItemDelete={onFeeItemDelete}
      onFeeDueChange={onFeeDueChange}
      playerName={playerName}
    />
  )}
    </>
  );
}
