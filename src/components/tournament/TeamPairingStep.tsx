import type { ThemeColors } from "../../lib/theme";
import Icon from "../../components/ui/Icon";
import type { Player, TournamentMode } from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import { useT } from "../../lib/I18nContext";

interface TeamPairingStepProps {
  mode: TournamentMode;
  players: Player[];
  poolPlayers: Player[];
  manualTeams: [number, number][];
  firstPick: number | null;
  theme: ThemeColors;
  onPoolClick: (playerId: number) => void;
  onAutoAssign: () => void;
  onRemoveTeam: (idx: number) => void;
  onClearAll: () => void;
}

export default function TeamPairingStep({
  mode,
  players,
  poolPlayers,
  manualTeams,
  firstPick,
  theme,
  onPoolClick,
  onAutoAssign,
  onRemoveTeam,
  onClearAll,
}: TeamPairingStepProps) {
  const { t } = useT();
  const firstPickGender = firstPick !== null ? players.find((pl) => pl.id === firstPick)?.gender : null;
  const isMixed = mode === "mixed";
  const poolMale = poolPlayers.filter((p) => p.gender === "m").sort((a, b) => playerDisplayName(a).localeCompare(playerDisplayName(b)));
  const poolFemale = poolPlayers.filter((p) => p.gender === "f").sort((a, b) => playerDisplayName(a).localeCompare(playerDisplayName(b)));
  const poolSorted = isMixed ? [...poolFemale, ...poolMale] : [...poolPlayers].sort((a, b) => playerDisplayName(a).localeCompare(playerDisplayName(b)));

  const renderPlayer = (p: Player) => {
    const isFirst = firstPick === p.id;
    const isMixedBlocked = isMixed && firstPick !== null && firstPickGender === p.gender;
    return (
      <button
        key={p.id}
        onClick={() => !isMixedBlocked && onPoolClick(p.id)}
        disabled={!!isMixedBlocked}
        className={`px-3 py-2 rounded-md text-sm font-medium transition-all border ${
          isFirst
            ? `${theme.primaryBg} text-white shadow-sm`
            : isMixedBlocked
            ? `${theme.cardBg} ${theme.textMuted} border-line-strong opacity-30 cursor-not-allowed`
            : `${theme.cardBg} ${theme.textPrimary} ${theme.cardBorder} ${theme.cardHoverBorder} hover:shadow-sm cursor-pointer`
        }`}
      >
        {playerDisplayName(p)}
        {!isMixed && (
          <span className={`ml-1.5 text-2xs px-1.5 py-0.5 rounded-full ${
            p.gender === "m" ? "bg-blue-500/10 text-blue-500" : "bg-pink-500/10 text-pink-500"
          }`}>
            {p.gender === "m" ? t.common_gender_male_short : t.common_gender_female_short}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className={`${theme.cardBg} rounded-lg shadow-sm border ${theme.cardBorder} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`font-semibold ${theme.textPrimary}`}>
          <span aria-hidden="true"><Icon name="handshake" /></span> {t.teams_title}
          <span className={`ml-2 text-xs font-normal ${theme.textSecondary}`}>
            {manualTeams.length > 0
              ? t.teams_count_info.replace("{teams}", String(manualTeams.length)).replace("{open}", String(poolPlayers.length))
              : t.teams_players_available.replace("{count}", String(poolPlayers.length))}
          </span>
        </h2>
        <div className="flex gap-2">
          {poolPlayers.length >= 2 && (
            <button
              onClick={onAutoAssign}
              className={`text-xs font-medium ${theme.activeBadgeText} ${theme.activeBadgeBg} px-3 py-1.5 rounded-sm transition-colors`}
            >
              {t.teams_auto_assign}
            </button>
          )}
          {manualTeams.length > 0 && (
            <button
              onClick={onClearAll}
              className={`text-xs ${theme.textMuted} hover:text-danger-text transition-colors`}
            >
              {t.teams_clear_all}
            </button>
          )}
        </div>
      </div>

      {/* Pool: ungepaarte Spieler */}
      {poolPlayers.length > 0 && (
        <div className="mb-4">
          <div className={`text-xs font-medium ${theme.textMuted} uppercase tracking-wide mb-2`}>
            {t.teams_available.replace("{count}", String(poolPlayers.length))} {firstPick !== null && `— ${t.teams_choose_partner}`}
          </div>
          {isMixed ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className={`text-2xs font-bold uppercase tracking-wide mb-1.5 px-1 ${firstPickGender === "f" ? theme.textMuted + " opacity-40" : "text-pink-500"}`}>
                  {t.teams_women.replace("{count}", String(poolFemale.length))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {poolFemale.map(renderPlayer)}
                </div>
              </div>
              <div>
                <div className={`text-2xs font-bold uppercase tracking-wide mb-1.5 px-1 ${firstPickGender === "m" ? theme.textMuted + " opacity-40" : "text-blue-500"}`}>
                  {t.teams_men.replace("{count}", String(poolMale.length))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {poolMale.map(renderPlayer)}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {poolSorted.map(renderPlayer)}
            </div>
          )}
        </div>
      )}

      {/* Gebildete Teams */}
      {manualTeams.length > 0 && (
        <div>
          <div className={`text-xs font-medium ${theme.textMuted} uppercase tracking-wide mb-2`}>
            {t.teams_label.replace("{count}", String(manualTeams.length))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {manualTeams.map(([id1, id2], idx) => {
              const p1 = players.find((p) => p.id === id1);
              const p2 = players.find((p) => p.id === id2);
              return (
                <div
                  key={idx}
                  className={`${theme.selectedBg} border ${theme.cardBorder} rounded-md px-3 py-2 flex items-center justify-between group`}
                >
                  <div className="text-sm">
                    <span className={`font-medium ${theme.textPrimary}`}>{p1 ? playerDisplayName(p1) : "?"}</span>
                    <span className={`${theme.textMuted} mx-1.5`}>/</span>
                    <span className={`font-medium ${theme.textPrimary}`}>{p2 ? playerDisplayName(p2) : "?"}</span>
                  </div>
                  <button
                    onClick={() => onRemoveTeam(idx)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-danger-text hover:text-danger-text transition-all ml-2"
                    title={t.teams_remove_title}
                  >
                    <Icon name="x" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status */}
      {poolPlayers.length > 0 && poolPlayers.length < 2 && (
        <div className={`text-xs ${theme.textMuted} mt-3`}>
          <Icon name="alert" /> {t.teams_player_leftover}
        </div>
      )}
      {poolPlayers.length === 0 && manualTeams.length > 0 && (
        <div className={`text-xs text-green-600 mt-3`}>
          <Icon name="check" /> {t.teams_all_assigned}
        </div>
      )}
    </div>
  );
}
