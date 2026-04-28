import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPlayers,
  createTournament,
  updateTournament,
  updateTeamConfig,
  updateHallConfig,
  updateTournamentVenueId,
  addPlayerToTournament,
  removePlayerFromTournament,
  getTournament,
  getTournamentPlayers,
  getTournamentPlayersDetailed,
  getSportstaetten,
  updateTournamentPhase,
  setTournamentSeeds,
} from "../lib/db";
import { getSessions, attachTournamentToSession, detachTournamentFromSession } from "../lib/sessions";
import type { Player, TournamentMode, TournamentFormat, Sportstaette, HallConfig } from "../lib/types";
import { parseHallConfig, hallConfigTotalCourts, playerDisplayName } from "../lib/types";
import { formFixedDoubleTeams, formFixedMixedTeams, recommendedSwissRounds } from "../lib/draw";
import { SCORING_MODES, getScoringModeId, type ScoringModeId } from "../lib/scoring";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/I18nContext";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useAsyncAction } from "../lib/useAsyncAction";
import TeamPairingStep from "../components/tournament/TeamPairingStep";
import SeedingStep from "../components/tournament/SeedingStep";
import FormatInfoModal from "../components/tournament/FormatInfoModal";
import ExcelImport from "../components/players/ExcelImport";

const VALID_FORMATS: Record<TournamentMode, TournamentFormat[]> = {
  singles: ["round_robin", "elimination", "swiss", "monrad", "king_of_court", "waterfall", "double_elimination", "group_ko"],
  doubles: ["round_robin", "elimination", "random_doubles", "swiss", "monrad", "king_of_court", "waterfall", "double_elimination", "group_ko"],
  mixed: ["round_robin", "elimination", "random_doubles", "swiss", "monrad", "king_of_court", "waterfall", "double_elimination", "group_ko"],
};

type GenderFilter = "all" | "m" | "f";

export default function TournamentCreate() {
  const { theme } = useTheme();
  const { t } = useT();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = !!editId;
  useDocumentTitle(isEditMode ? t.edit_tournament_title : t.nav_tournaments);
  const [editLoaded, setEditLoaded] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(
    new Set()
  );

  const generateName = (m: TournamentMode, f: TournamentFormat) => {
    const now = new Date();
    const d = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
    const modeLabels: Record<TournamentMode, string> = { singles: t.mode_singles, doubles: t.mode_doubles, mixed: t.mode_mixed };
    const fmtLabels: Record<TournamentFormat, string> = {
      round_robin: t.format_round_robin, elimination: t.format_elimination,
      random_doubles: t.format_random_doubles, group_ko: t.format_group_ko,
      swiss: t.format_swiss, double_elimination: t.format_double_elimination,
      monrad: t.format_monrad, king_of_court: t.format_king_of_court, waterfall: t.format_waterfall,
    };
    return `${d} - ${modeLabels[m]} - ${fmtLabels[f]}`;
  };

  const [mode, setMode] = useState<TournamentMode>("doubles");
  const [format, setFormat] = useState<TournamentFormat>("random_doubles");
  const [name, setName] = useState(() => generateName("doubles", "random_doubles"));
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [scoringMode, setScoringMode] = useState<ScoringModeId>("21_ext");
  const scoringPreset = SCORING_MODES.find((m) => m.id === scoringMode)!;
  const pointsPerSet = scoringPreset.points_per_set;
  const cap = scoringPreset.cap;
  const [setsToWin, setSetsToWin] = useState<number>(2); // 1 = Best of 1, 2 = Best of 3, 3 = Best of 5
  // courts is derived from selected halls. Halls now always come from the
  // picked venue (since v2.8.2 venue is mandatory) — start empty and fill
  // when the user picks a venue or when an existing tournament loads.
  const [hallConfig, setHallConfig] = useState<HallConfig[]>([]);
  const [selectedHallIndices, setSelectedHallIndices] = useState<Set<number>>(new Set());
  const selectedHalls = useMemo(() => hallConfig.filter((_, i) => selectedHallIndices.has(i)), [hallConfig, selectedHallIndices]);
  const courts = useMemo(() => Math.max(hallConfigTotalCourts(selectedHalls), 1), [selectedHalls]);
  const [sportstaetten, setSportstaetten] = useState<Sportstaette[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | "">("");
  // Session selection — optional pick for the multi-tournament-workspace
  // feature (v2.8). Tournaments without a session keep all pre-existing
  // single-tournament behavior. The list is filtered by `status="active"`
  // and venue match (or no venue) so the user only sees relevant choices.
  const [sessions, setSessions] = useState<{ id: number; name: string; venue_id: number | null; status: string }[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | "">("");
  const [numGroups, setNumGroups] = useState(2);
  const [qualifyPerGroup, setQualifyPerGroup] = useState(8);
  const [useEntryFee, setUseEntryFee] = useState(false);
  const [entryFeeSingle, setEntryFeeSingle] = useState<string>("5");
  const [entryFeeDouble, setEntryFeeDouble] = useState<string>("10");
  const [useMinRest, setUseMinRest] = useState(false);
  const [minRestMinutes, setMinRestMinutes] = useState<string>("15");
  const [useSeeding, setUseSeeding] = useState(false);
  const [seedOrder, setSeedOrder] = useState<number[]>([]); // player IDs in seed order
  const [seededPlayerIds, setSeededPlayerIds] = useState<Set<number>>(new Set()); // opt-in per player
  // Bronze playoff toggle (default ON for new tournaments). Only visible when
  // format has KO matches: elimination, group_ko, double_elimination.
  const [enableThirdPlace, setEnableThirdPlace] = useState(true);

  const [dragSeedIdx, setDragSeedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showFormatInfo, setShowFormatInfo] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);

  // Team pairing state
  const [manualTeams, setManualTeams] = useState<[number, number][]>([]);
  const [firstPick, setFirstPick] = useState<number | null>(null);
  const [createStep, setCreateStep] = useState<"settings" | "players" | "teams" | "seeding" | "create">("settings");

  // Filter state
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [clubFilter, setClubFilter] = useState<string>("all");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-save tournament settings when they change (debounced)
  useEffect(() => {
    if (!isEditMode || !editLoaded) return;
    const id = Number(editId);
    const timer = setTimeout(async () => {
      const finalName = name.trim() || generateName(mode, format);
      const feeSingle = useEntryFee ? (Number(entryFeeSingle) || 0) : 0;
      const feeDouble = useEntryFee ? (Number(entryFeeDouble) || 0) : 0;
      const rest = useMinRest ? Math.max(0, Number(minRestMinutes) || 0) : 0;
      try {
        await updateTournament(
          id, finalName, mode, format, setsToWin, pointsPerSet, courts,
          (format === "group_ko" || format === "swiss" || format === "monrad" || format === "waterfall") ? numGroups : 0,
          format === "group_ko" ? qualifyPerGroup : 0,
          feeSingle, feeDouble, cap, rest,
          enableThirdPlace && (format === "elimination" || format === "group_ko" || format === "double_elimination")
        );
      } catch (err) {
        console.error("Auto-save error:", err);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [isEditMode, editLoaded, editId, name, mode, format, setsToWin, pointsPerSet, cap, courts, numGroups, qualifyPerGroup, useEntryFee, entryFeeSingle, entryFeeDouble, useMinRest, minRestMinutes, enableThirdPlace]);

  // Auto-save player selection when it changes
  useEffect(() => {
    if (!isEditMode || !editLoaded) return;
    const id = Number(editId);
    const timer = setTimeout(async () => {
      try {
        const existingPlayers = await getTournamentPlayers(id);
        const existingIds = new Set(existingPlayers.map((p) => p.id));
        for (const ep of existingPlayers) {
          if (!selectedPlayerIds.has(ep.id)) {
            await removePlayerFromTournament(id, ep.id);
          }
        }
        for (const pid of selectedPlayerIds) {
          if (!existingIds.has(pid)) {
            await addPlayerToTournament(id, pid);
          }
        }
      } catch (err) {
        console.error("Auto-save players error:", err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [isEditMode, editLoaded, editId, selectedPlayerIds]);

  // Auto-save team config + hall config + venue when they change
  useEffect(() => {
    if (!isEditMode || !editLoaded) return;
    const id = Number(editId);
    const timer = setTimeout(async () => {
      try {
        await updateTeamConfig(id, manualTeams.length > 0 ? manualTeams : null);
        await updateHallConfig(id, selectedHalls.length > 0 ? selectedHalls : null);
        await updateTournamentVenueId(id, selectedVenueId !== "" ? selectedVenueId : null);
        // Auto-save session pick. attach/detach handle the FK.
        if (selectedSessionId !== "") {
          await attachTournamentToSession(id, Number(selectedSessionId));
        } else {
          await detachTournamentFromSession(id);
        }
      } catch (err) {
        console.error("Auto-save config error:", err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [isEditMode, editLoaded, editId, manualTeams, selectedHalls, selectedVenueId, selectedSessionId]);

  useEffect(() => {
    getPlayers().then(setPlayers);
    getSportstaetten().then(setSportstaetten);
    // Load sessions for the optional session-pick dropdown.
    getSessions().then((ss) => {
      setSessions(ss.map((s) => ({ id: s.id, name: s.name, venue_id: s.venue_id, status: s.status })));
    });
  }, []);

  // If navigated to /tournaments/new without a draft, redirect to tournaments list
  useEffect(() => {
    if (!isEditMode) {
      navigate("/tournaments", { replace: true });
    }
  }, [isEditMode, navigate]);

  // Load existing tournament data in edit mode
  useEffect(() => {
    if (!isEditMode || editLoaded) return;
    const loadTournament = async () => {
      const td = await getTournament(Number(editId));
      const tp = await getTournamentPlayers(Number(editId));
      setName(td.name);
      // Check if name was auto-generated (matches pattern "DD.MM.YYYY - Mode - Format")
      const autoName = generateName(td.mode, td.format);
      setNameManuallyEdited(td.name !== autoName);
      setMode(td.mode);
      setFormat(td.format);
      setScoringMode(getScoringModeId(td.points_per_set, td.cap));
      setSetsToWin(td.sets_to_win);
      // Load hall config from tournament
      if (td.hall_config) {
        const halls = parseHallConfig(td.hall_config);
        if (halls.length > 0) {
          setHallConfig(halls);
          setSelectedHallIndices(new Set(halls.map((_, i) => i)));
        }
      } else {
        // Fallback: single hall with tournament court count
        setHallConfig([{ name: "Halle 1", courts: td.courts }]);
        setSelectedHallIndices(new Set([0]));
      }
      setNumGroups(td.num_groups || 2);
      setQualifyPerGroup(td.qualify_per_group || 8);
      if (td.entry_fee_single > 0 || td.entry_fee_double > 0) {
        setUseEntryFee(true);
        setEntryFeeSingle(String(td.entry_fee_single));
        setEntryFeeDouble(String(td.entry_fee_double));
      }
      if (td.min_rest_minutes && td.min_rest_minutes > 0) {
        setUseMinRest(true);
        setMinRestMinutes(String(td.min_rest_minutes));
      }
      setEnableThirdPlace(td.enable_third_place === 1);
      setSelectedPlayerIds(new Set(tp.map((p) => p.id)));

      // Restore seeding state from persisted seed_rank (per migration v10)
      try {
        const detailed = await getTournamentPlayersDetailed(Number(editId));
        const seeded = detailed
          .filter((d) => d.seed_rank !== null)
          .sort((a, b) => (a.seed_rank! - b.seed_rank!))
          .map((d) => d.player.id);
        if (seeded.length > 0) {
          setUseSeeding(true);
          setSeededPlayerIds(new Set(seeded));
          setSeedOrder([
            ...seeded,
            ...detailed
              .filter((d) => d.seed_rank === null)
              .map((d) => d.player.id),
          ]);
        }
      } catch (err) {
        console.error("TournamentCreate: failed to restore seed_rank:", err);
      }

      if (td.team_config) {
        try {
          const teams = JSON.parse(td.team_config) as [number, number][];
          setManualTeams(teams);
        } catch (err) {
          console.error("TournamentCreate: failed to parse team_config JSON:", err);
        }
      }
      if (td.venue_id) setSelectedVenueId(td.venue_id);
      if (td.session_id) setSelectedSessionId(td.session_id);
      setEditLoaded(true);
    };
    loadTournament();
  }, [isEditMode, editId, editLoaded]);

  useEffect(() => {
    if (editLoaded) return; // Don't auto-correct format during edit load
    if (!VALID_FORMATS[mode].includes(format)) {
      setFormat(VALID_FORMATS[mode][0]);
    }
  }, [mode, format, editLoaded]);

  const availableClubs = useMemo(() => {
    const clubs = new Set<string>();
    for (const p of players) { if (p.club) clubs.add(p.club); }
    return Array.from(clubs).sort();
  }, [players]);

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      if (genderFilter !== "all" && p.gender !== genderFilter) return false;
      if (clubFilter !== "all") {
        if (clubFilter === "__none__") { if (p.club) return false; }
        else { if (p.club !== clubFilter) return false; }
      }
      if (search.trim() && !playerDisplayName(p).toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [players, search, genderFilter, clubFilter]);

  const selectAllFiltered = () => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredPlayers) next.add(p.id);
      return next;
    });
    setSeedOrder((s) => {
      const existing = new Set(s);
      const toAdd = filteredPlayers.filter((p) => !existing.has(p.id)).map((p) => p.id);
      return [...s, ...toAdd];
    });
  };

  const selectNoneFiltered = () => {
    const removedIds = new Set(filteredPlayers.map((p) => p.id));
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredPlayers) next.delete(p.id);
      return next;
    });
    setSeedOrder((s) => s.filter((pid) => !removedIds.has(pid)));
  };

  const selectedCount = selectedPlayerIds.size;
  const filteredSelectedCount = filteredPlayers.filter((p) =>
    selectedPlayerIds.has(p.id)
  ).length;

  const [handleCreate, creating] = useAsyncAction(async () => {
    if (selectedPlayerIds.size < minPlayers) return;
    if (needsTeamPairing && poolPlayers.length >= 2) return; // Teams not complete

    const finalName = name.trim() || generateName(mode, format);
    const feeSingle = useEntryFee ? (Number(entryFeeSingle) || 0) : 0;
    const feeDouble = useEntryFee ? (Number(entryFeeDouble) || 0) : 0;
    const rest = useMinRest ? Math.max(0, Number(minRestMinutes) || 0) : 0;

    let id: number;

    const ttp = enableThirdPlace && (format === "elimination" || format === "group_ko" || format === "double_elimination");

    if (isEditMode) {
      id = Number(editId);
      await updateTournament(
        id, finalName, mode, format, setsToWin, pointsPerSet, courts,
        (format === "group_ko" || format === "swiss" || format === "monrad" || format === "waterfall") ? numGroups : 0,
        format === "group_ko" ? qualifyPerGroup : 0,
        feeSingle, feeDouble, cap, rest,
        ttp
      );
      // Sync players: remove those no longer selected, add new ones
      const existingPlayers = await getTournamentPlayers(id);
      const existingIds = new Set(existingPlayers.map((p) => p.id));
      for (const ep of existingPlayers) {
        if (!selectedPlayerIds.has(ep.id)) {
          await removePlayerFromTournament(id, ep.id);
        }
      }
      for (const pid of selectedPlayerIds) {
        if (!existingIds.has(pid)) {
          await addPlayerToTournament(id, pid);
        }
      }
    } else {
      id = await createTournament(
        finalName, mode, format, setsToWin, pointsPerSet, courts,
        (format === "group_ko" || format === "swiss" || format === "monrad" || format === "waterfall") ? numGroups : 0,
        format === "group_ko" ? qualifyPerGroup : 0,
        feeSingle, feeDouble, cap, rest,
        ttp
      );
      for (const pid of selectedPlayerIds) {
        await addPlayerToTournament(id, pid);
      }
    }

    // Pass seed order and/or manual teams via navigation state
    const navState: Record<string, unknown> = {};
    if (useSeeding && (
      format === "elimination" ||
      format === "double_elimination" ||
      (format === "group_ko" && mode === "singles")
    )) {
      const finalSeeds = seedOrder.filter(
        (pid) => selectedPlayerIds.has(pid) && seededPlayerIds.has(pid)
      );
      if (finalSeeds.length > 0) navState.seeds = finalSeeds;
    }
    if (needsTeamPairing && manualTeams.length > 0) {
      navState.teams = manualTeams;
    }

    // Persist team config
    if (needsTeamPairing && manualTeams.length > 0) {
      await updateTeamConfig(id, manualTeams);
    } else {
      await updateTeamConfig(id, null);
    }

    // Persist seed ranks (or clear if seeding disabled / unsupported)
    if (useSeeding && (
      format === "elimination" ||
      format === "double_elimination" ||
      (format === "group_ko" && mode === "singles")
    )) {
      const finalSeeds = seedOrder.filter(
        (pid) => selectedPlayerIds.has(pid) && seededPlayerIds.has(pid)
      );
      await setTournamentSeeds(id, finalSeeds);
    } else {
      await setTournamentSeeds(id, []);
    }

    // Persist hall config + venue
    await updateHallConfig(id, selectedHalls.length > 0 ? selectedHalls : null);
    await updateTournamentVenueId(id, selectedVenueId !== "" ? selectedVenueId : null);
    // Persist session attachment (multi-tournament-workspace)
    if (selectedSessionId !== "") {
      await attachTournamentToSession(id, Number(selectedSessionId));
    } else {
      await detachTournamentFromSession(id);
    }

    // Mark wizard as completed
    await updateTournamentPhase(id, "ready");

    if (isEditMode) navState.savedSuccess = true;
    navigate(`/tournaments/${id}`, { state: Object.keys(navState).length > 0 ? navState : undefined });
  });

  const moveSeed = (idx: number, direction: -1 | 1) => {
    const seededList = seedOrder.filter(
      (pid) => selectedPlayerIds.has(pid) && seededPlayerIds.has(pid)
    );
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= seededList.length) return;

    const newSeeded = [...seededList];
    [newSeeded[idx], newSeeded[newIdx]] = [newSeeded[newIdx], newSeeded[idx]];
    const unseededRest = seedOrder.filter(
      (pid) => selectedPlayerIds.has(pid) && !seededPlayerIds.has(pid)
    );
    setSeedOrder([...newSeeded, ...unseededRest]);
  };

  const handleSeedDrop = (dropIdx: number) => {
    if (dragSeedIdx === null || dragSeedIdx === dropIdx) return;
    const seededList = seedOrder.filter(
      (pid) => selectedPlayerIds.has(pid) && seededPlayerIds.has(pid)
    );
    const newSeeded = [...seededList];
    const [moved] = newSeeded.splice(dragSeedIdx, 1);
    newSeeded.splice(dropIdx, 0, moved);
    const unseededRest = seedOrder.filter(
      (pid) => selectedPlayerIds.has(pid) && !seededPlayerIds.has(pid)
    );
    setSeedOrder([...newSeeded, ...unseededRest]);
    setDragSeedIdx(null);
    setDragOverIdx(null);
  };

  const toggleSeeded = (playerId: number) => {
    setSeededPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
    setSeedOrder((s) => (s.includes(playerId) ? s : [...s, playerId]));
  };

  // Keep seedOrder in sync when players are added/removed
  const togglePlayer = (id: number) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSeedOrder((s) => s.filter((pid) => pid !== id));
        setSeededPlayerIds((s) => {
          if (!s.has(id)) return s;
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      } else {
        next.add(id);
        setSeedOrder((s) => s.includes(id) ? s : [...s, id]);
      }
      return next;
    });
    // Re-focus search field so user can continue searching immediately
    setTimeout(() => { searchInputRef.current?.focus(); searchInputRef.current?.select(); }, 0);
  };

  const minPlayers = mode === "singles" ? 2 : 4;
  const formatsWithoutTeamPairing: TournamentFormat[] = ["random_doubles", "swiss", "monrad", "king_of_court", "waterfall"];
  const needsTeamPairing = (mode === "doubles" || mode === "mixed") && !formatsWithoutTeamPairing.includes(format);

  // Team pairing helpers
  const pairedIds = useMemo(() => {
    const s = new Set<number>();
    for (const [a, b] of manualTeams) { s.add(a); s.add(b); }
    return s;
  }, [manualTeams]);

  const poolPlayers = useMemo(() => {
    return players.filter((p) => selectedPlayerIds.has(p.id) && !pairedIds.has(p.id));
  }, [players, selectedPlayerIds, pairedIds]);

  const handlePoolClick = (playerId: number) => {
    if (firstPick === null) {
      setFirstPick(playerId);
    } else if (firstPick === playerId) {
      setFirstPick(null); // Deselect
    } else {
      // Mixed: validate m+f
      if (mode === "mixed") {
        const p1 = players.find((p) => p.id === firstPick);
        const p2 = players.find((p) => p.id === playerId);
        if (p1 && p2 && p1.gender === p2.gender) return; // Same gender not allowed in mixed
      }
      setManualTeams((prev) => [...prev, [firstPick, playerId]]);
      setFirstPick(null);
    }
  };

  const removeTeam = (idx: number) => {
    setManualTeams((prev) => prev.filter((_, i) => i !== idx));
  };

  const autoAssignRemaining = () => {
    const remaining = players.filter((p) => selectedPlayerIds.has(p.id) && !pairedIds.has(p.id));
    const autoTeams = mode === "mixed"
      ? formFixedMixedTeams(remaining)
      : formFixedDoubleTeams(remaining);
    setManualTeams((prev) => [...prev, ...autoTeams]);
  };

  // Remove teams with deselected players
  useEffect(() => {
    if (!editLoaded && isEditMode) return;
    setManualTeams((prev) =>
      prev.filter(([a, b]) => selectedPlayerIds.has(a) && selectedPlayerIds.has(b))
    );
  }, [selectedPlayerIds, editLoaded, isEditMode]);

  const settingsValid = name.trim().length > 0;
  const playersValid = selectedPlayerIds.size >= minPlayers;
  const teamsValid = !needsTeamPairing || (manualTeams.length > 0 && poolPlayers.length < 2);

  const showSeedingStep = useSeeding && (
    format === "elimination" ||
    format === "double_elimination" ||
    (format === "group_ko" && mode === "singles")
  );
  // Seeding step is always valid — 0 seeded players = fully random draw (opt-out)
  const seedingValid = true;

  const steps = [
    { key: "settings" as const, label: t.tournament_step_settings, icon: "⚙️", valid: settingsValid },
    { key: "players" as const, label: t.tournament_step_players, icon: "👥", valid: playersValid },
    ...(needsTeamPairing ? [{ key: "teams" as const, label: t.tournament_step_teams, icon: "🤝", valid: teamsValid }] : []),
    ...(showSeedingStep ? [{ key: "seeding" as const, label: t.tournament_step_seeding, icon: "🎯", valid: seedingValid }] : []),
    { key: "create" as const, label: t.tournament_step_create, icon: "🏆", valid: false },
  ];

  const currentStepIdx = steps.findIndex((s) => s.key === createStep);
  const nextStep = steps[currentStepIdx + 1]?.key;

  return (
    <div>
      {/* Header */}
      <div className="mb-2 flex justify-between items-center">
        <h1 className={`text-2xl font-extrabold ${theme.textPrimary} tracking-tight`}>
          {isEditMode ? t.tournament_edit_title : t.tournament_create_title}
        </h1>
      </div>

      {/* Step Tabs */}
      <div className={`flex border-b-2 ${theme.inputBorder} mb-5`}>
        {steps.map((step) => (
          <button
            key={step.key}
            onClick={() => setCreateStep(step.key)}
            className={`px-6 py-3 text-sm font-semibold transition-all duration-200 relative rounded-t-lg ${
              createStep === step.key
                ? `${theme.textPrimary}`
                : `${theme.textMuted} hover:${theme.textPrimary} hover:bg-black/[0.03]`
            }`}
          >
            <span className="mr-1.5">{step.icon}</span>
            {step.label}
            {step.valid && createStep !== step.key && (
              <span className="ml-1.5 text-green-500">✓</span>
            )}
            {createStep === step.key ? (
              <span className={`absolute bottom-0 left-0 right-0 h-[3px] ${theme.primaryBg} rounded-t-full`} />
            ) : (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-transparent rounded-t-full transition-all" />
            )}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {/* Step: Settings */}
        {createStep === "settings" && (
          <>
            <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} p-5`}>
              <div className="space-y-4">
                <div>
                  <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                    {t.tournament_name}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value); setNameManuallyEdited(true); }}
                      maxLength={200}
                      className={`flex-1 ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                      placeholder={t.tournament_name_placeholder}
                    />
                    {nameManuallyEdited && (
                      <button
                        onClick={() => { setName(generateName(mode, format)); setNameManuallyEdited(false); }}
                        className={`${theme.textMuted} hover:text-emerald-600 px-3 py-2.5 rounded-xl border ${theme.inputBorder} ${theme.cardHoverBorder} transition-all text-sm`}
                        title={t.tournament_restore_suggestion}
                      >
                        ↻
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                      {t.tournament_mode}
                    </label>
                    <select
                      value={mode}
                      onChange={(e) => {
                        const newMode = e.target.value as TournamentMode;
                        setMode(newMode);
                        setManualTeams([]); setFirstPick(null);
                        if (!nameManuallyEdited) {
                          const newFormat = VALID_FORMATS[newMode].includes(format) ? format : VALID_FORMATS[newMode][0];
                          setName(generateName(newMode, newFormat));
                        }
                      }}
                      className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                    >
                      {Object.entries({ singles: t.mode_singles, doubles: t.mode_doubles, mixed: t.mode_mixed }).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`flex items-center gap-1.5 text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                      {t.tournament_format}
                      <button
                        type="button"
                        onClick={() => setShowFormatInfo(true)}
                        className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] leading-none ${theme.inputBg} border ${theme.inputBorder} ${theme.textMuted} hover:${theme.textSecondary} transition-colors`}
                        title={t.format_info_title}
                      >
                        i
                      </button>
                    </label>
                    <select
                      value={format}
                      onChange={(e) => {
                        const newFormat = e.target.value as TournamentFormat;
                        setFormat(newFormat);
                        setManualTeams([]); setFirstPick(null);
                        if (newFormat === "swiss" || newFormat === "monrad" || newFormat === "waterfall") setNumGroups(recommendedSwissRounds(selectedPlayerIds.size));
                        if (!nameManuallyEdited) setName(generateName(mode, newFormat));
                      }}
                      className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                    >
                      {VALID_FORMATS[mode].map((f) => {
                        const fmtLabels: Record<string, string> = { round_robin: t.format_round_robin, elimination: t.format_elimination, random_doubles: t.format_random_doubles, group_ko: t.format_group_ko, swiss: t.format_swiss, double_elimination: t.format_double_elimination, monrad: t.format_monrad, king_of_court: t.format_king_of_court, waterfall: t.format_waterfall };
                        return (
                        <option key={f} value={f}>
                          {fmtLabels[f]}
                        </option>
                      );})}
                    </select>
                    <p className={`text-xs ${theme.textMuted} mt-1.5`}>
                      {format === "round_robin" ? t.format_desc_round_robin
                        : format === "elimination" ? t.format_desc_elimination
                        : format === "random_doubles" ? t.format_desc_random_doubles
                        : format === "group_ko" ? t.format_desc_group_ko
                        : format === "swiss" ? t.format_desc_swiss
                        : format === "double_elimination" ? t.format_desc_double_elimination
                        : format === "monrad" ? t.format_desc_monrad
                        : format === "king_of_court" ? t.format_desc_king_of_court
                        : format === "waterfall" ? t.format_desc_waterfall
                        : ""}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                      {t.scoring_mode}
                    </label>
                    <select
                      value={scoringMode}
                      onChange={(e) => setScoringMode(e.target.value as ScoringModeId)}
                      className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                    >
                      {SCORING_MODES.map((m) => (
                        <option key={m.id} value={m.id}>{t[`scoring_mode_${m.id}` as keyof typeof t] as string}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                      {t.scoring_sets_to_win}
                    </label>
                    <select
                      value={setsToWin}
                      onChange={(e) => setSetsToWin(Number(e.target.value))}
                      className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                    >
                      <option value={1}>{t.best_of_1}</option>
                      <option value={2}>{t.best_of_3}</option>
                      <option value={3}>{t.best_of_5}</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                      {t.tournament_venue}
                    </label>
                    <select
                      value={selectedVenueId}
                      onChange={(e) => {
                        const venueId = e.target.value ? Number(e.target.value) : "";
                        setSelectedVenueId(venueId);
                        if (venueId) {
                          const venue = sportstaetten.find((s) => s.id === venueId);
                          if (venue) {
                            const venueHalls = parseHallConfig(venue.halls);
                            const halls = venueHalls.length > 0
                              ? venueHalls
                              : [{ name: "Halle 1", courts: venue.courts }];
                            setHallConfig(halls);
                            setSelectedHallIndices(new Set(halls.map((_, i) => i)));
                          }
                        } else {
                          // Venue cleared — wipe halls. Save will be blocked
                          // until a venue is picked again (mandatory).
                          setHallConfig([]);
                          setSelectedHallIndices(new Set());
                        }
                      }}
                      required
                      className={`w-full ${theme.inputBg} ${theme.inputText} border ${selectedVenueId === "" ? "border-rose-300" : theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                    >
                      <option value="">{t.tournament_venue_pick_placeholder}</option>
                      {sportstaetten.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.courts} {s.courts === 1 ? t.common_field : t.common_fields})
                        </option>
                      ))}
                    </select>
                    {selectedVenueId === "" && (
                      <p className="text-xs text-rose-600 mt-1 font-medium">
                        ⚠ {t.tournament_venue_required}
                      </p>
                    )}
                    {sportstaetten.length === 0 && (
                      <div className={`mt-2 ${theme.cardBg} border border-amber-200 rounded-xl px-3 py-2 text-xs ${theme.textSecondary}`}>
                        <p className="font-medium text-amber-700 mb-1">
                          ⚠ {t.tournament_venue_no_venues_title}
                        </p>
                        <p>{t.tournament_venue_no_venues_message}</p>
                        <button
                          type="button"
                          onClick={() => navigate("/sportstaetten")}
                          className={`mt-2 ${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} px-3 py-1.5 rounded-lg text-xs font-semibold transition-all`}
                        >
                          {t.tournament_venue_create_first} →
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Session picker — only when sessions exist. Filters by venue
                      match (or no venue) so the dropdown stays focused. */}
                  {sessions.length > 0 && (
                    <div>
                      <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                        🔗 {t.tournament_create_session_label}
                      </label>
                      <select
                        value={selectedSessionId}
                        onChange={(e) => setSelectedSessionId(e.target.value ? Number(e.target.value) : "")}
                        className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                      >
                        <option value="">{t.tournament_create_session_none}</option>
                        {sessions
                          .filter((s) => {
                            if (s.status !== "active") return false;
                            // Show sessions matching the venue (or sessions
                            // without a venue, which accept any tournament).
                            if (s.venue_id == null) return true;
                            if (selectedVenueId === "") return true;
                            return s.venue_id === selectedVenueId;
                          })
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                      <p className={`text-xs ${theme.textMuted} mt-1`}>
                        {t.tournament_create_session_hint}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                      {t.tournament_halls_courts}
                    </label>
                    {hallConfig.length > 0 && (
                      <div className={`${theme.inputBg} border ${theme.inputBorder} rounded-xl px-3 py-2 space-y-1`}>
                        {/* Checkbox is only meaningful when the venue has 2+
                            halls — picking a subset of the available halls
                            for this tournament. With a single hall the
                            checkbox would be a no-op (unchecking it
                            produces 0 courts → tournament breaks), so we
                            render plain info text in that case. v2.8.10. */}
                        {hallConfig.map((hall, idx) => (
                          hallConfig.length > 1 ? (
                            <label key={idx} className="flex items-center gap-2 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={selectedHallIndices.has(idx)}
                                onChange={() => {
                                  setSelectedHallIndices((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(idx)) next.delete(idx);
                                    else next.add(idx);
                                    // Defensive: never let the user end
                                    // up with 0 selected halls — that
                                    // bricks the wizard. Re-add this idx
                                    // if it would empty the set.
                                    if (next.size === 0) next.add(idx);
                                    return next;
                                  });
                                }}
                                className="rounded"
                              />
                              <span className={theme.textPrimary}>
                                {hall.name} ({hall.courts} {hall.courts === 1 ? t.common_field : t.common_fields})
                              </span>
                            </label>
                          ) : (
                            <div key={idx} className={`text-sm ${theme.textPrimary} flex items-center gap-2`}>
                              <span>🏟</span>
                              <span>
                                {hall.name} ({hall.courts} {hall.courts === 1 ? t.common_field : t.common_fields})
                              </span>
                            </div>
                          )
                        ))}
                        <div className={`text-xs ${theme.textMuted} pt-1 border-t ${theme.cardBorder}`}>
                          {t.tournament_courts_selected.replace("{count}", String(courts))}
                        </div>
                      </div>
                    )}
                    {/* "Why isn't this editable?" — surfaces the link to
                        the venue and provides a one-click shortcut to
                        edit it. The hall layout is owned by the venue
                        (every sessioned tournament shares it), so any
                        structural change has to happen there. v2.8.9. */}
                    {selectedVenueId !== "" && (() => {
                      const venue = sportstaetten.find((s) => s.id === selectedVenueId);
                      if (!venue) return null;
                      return (
                        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                          <span className={`text-xs ${theme.textMuted} italic`}>
                            {t.tournament_halls_synced_from_venue.replace("{name}", venue.name)}
                          </span>
                          <button
                            type="button"
                            onClick={() => navigate(`/sportstaetten?edit=${venue.id}`)}
                            className={`text-xs font-medium ${theme.activeBadgeText} hover:opacity-80 transition-colors whitespace-nowrap`}
                          >
                            {t.tournament_halls_edit_venue_link}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Group settings - only for group_ko */}
                {format === "group_ko" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                        {t.tournament_num_groups}
                      </label>
                      <select
                        value={numGroups}
                        onChange={(e) => setNumGroups(Number(e.target.value))}
                        className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                      >
                        {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <option key={n} value={n}>
                            {t.groups_count.replace("{count}", String(n))}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                        {t.tournament_ko_size}
                      </label>
                      {(() => {
                        const possibleSizes = [4, 8, 16, 32];
                        const koSize = possibleSizes.includes(qualifyPerGroup) ? qualifyPerGroup : 8;
                        const perGroup = Math.floor(koSize / numGroups);
                        const wildcards = koSize - (perGroup * numGroups);
                        return (
                          <>
                            <select
                              value={koSize}
                              onChange={(e) => setQualifyPerGroup(Number(e.target.value))}
                              className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                            >
                              {possibleSizes.map((n) => (
                                <option key={n} value={n}>
                                  {t.tournament_qualify_ko_count.replace("{count}", String(n))}
                                </option>
                              ))}
                            </select>
                            <div className={`text-xs ${theme.textMuted} mt-1`}>
                              {t.tournament_ko_size_hint
                                .replace("{perGroup}", String(perGroup))
                                .replace("{wildcards}", String(wildcards))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Swiss / Monrad / Waterfall round settings */}
                {(format === "swiss" || format === "monrad" || format === "waterfall") && (
                  <div>
                    <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
                      {t.tournament_swiss_rounds}
                    </label>
                    <select
                      value={numGroups || recommendedSwissRounds(selectedPlayerIds.size)}
                      onChange={(e) => setNumGroups(Number(e.target.value))}
                      className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                    >
                      {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <p className={`text-xs ${theme.textMuted} mt-1`}>
                      {t.tournament_swiss_rounds_hint.replace("{count}", String(recommendedSwissRounds(selectedPlayerIds.size))).replace("{players}", String(selectedPlayerIds.size))}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Seeding Toggle - for elimination and double_elimination */}
            {(format === "elimination" || format === "double_elimination" ||
              (format === "group_ko" && mode === "singles")) && (
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${theme.cardBorder} ${useSeeding ? theme.selectedBg : ''}`}>
                <input
                  type="checkbox"
                  checked={useSeeding}
                  onChange={(e) => {
                    setUseSeeding(e.target.checked);
                    if (e.target.checked) {
                      const existing = seedOrder.filter((pid) => selectedPlayerIds.has(pid));
                      const existingSet = new Set(existing);
                      const missing = players
                        .filter((p) => selectedPlayerIds.has(p.id) && !existingSet.has(p.id))
                        .map((p) => p.id);
                      setSeedOrder([...existing, ...missing]);
                    }
                  }}
                  className="rounded accent-emerald-600"
                />
                <div>
                  <span className={`text-sm font-medium ${theme.textPrimary}`}>🎯 {t.tournament_seeding_enable}</span>
                  <p className={`text-xs ${theme.textMuted}`}>{t.tournament_seeding_hint}</p>
                </div>
              </div>
            )}

            {/* Third-place playoff toggle - any KO format */}
            {(format === "elimination" || format === "group_ko" || format === "double_elimination") && (
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${theme.cardBorder} ${enableThirdPlace ? theme.selectedBg : ''}`}>
                <input
                  type="checkbox"
                  checked={enableThirdPlace}
                  onChange={(e) => setEnableThirdPlace(e.target.checked)}
                  className="rounded accent-emerald-600"
                />
                <div>
                  <span className={`text-sm font-medium ${theme.textPrimary}`}>🥉 {t.tournament_enable_third_place}</span>
                  <p className={`text-xs ${theme.textMuted}`}>{t.tournament_enable_third_place_hint}</p>
                </div>
              </div>
            )}

            {/* Minimum Rest Time Toggle + Field */}
            <div className={`flex items-start gap-3 p-3 rounded-xl border ${theme.cardBorder} ${useMinRest ? theme.selectedBg : ''}`}>
              <input
                type="checkbox"
                checked={useMinRest}
                onChange={(e) => setUseMinRest(e.target.checked)}
                className="rounded accent-emerald-600 mt-1"
              />
              <div className="flex-1">
                <span className={`text-sm font-medium ${theme.textPrimary}`}>⏱️ {t.tournament_min_rest_enable}</span>
                <p className={`text-xs ${theme.textMuted}`}>{t.tournament_min_rest_hint}</p>
                {useMinRest && (
                  <div className="mt-3">
                    <label className={`block text-xs font-medium ${theme.textSecondary} mb-1`}>
                      {t.tournament_min_rest_label} ({t.tournament_min_rest_unit})
                    </label>
                    <input
                      type="number"
                      value={minRestMinutes}
                      onChange={(e) => setMinRestMinutes(e.target.value)}
                      className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-lg px-3 py-2 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                      min={0}
                      max={120}
                      step="1"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Entry Fee Toggle + Fields */}
            <div className={`flex items-start gap-3 p-3 rounded-xl border ${theme.cardBorder} ${useEntryFee ? theme.selectedBg : ''}`}>
              <input
                type="checkbox"
                checked={useEntryFee}
                onChange={(e) => setUseEntryFee(e.target.checked)}
                className="rounded accent-emerald-600 mt-1"
              />
              <div className="flex-1">
                <span className={`text-sm font-medium ${theme.textPrimary}`}>💰 {t.tournament_entry_fee_enable}</span>
                <p className={`text-xs ${theme.textMuted}`}>{(() => {
                  const fixedFmts: TournamentFormat[] = ["elimination", "group_ko", "double_elimination"];
                  const isFixed = mode !== "singles" && fixedFmts.includes(format);
                  return isFixed ? t.tournament_entry_fee_hint_team : t.tournament_entry_fee_hint_person;
                })()}</p>
                {useEntryFee && (() => {
                  const fixedTeamFormats: TournamentFormat[] = ["elimination", "group_ko", "double_elimination"];
                  const isFixedTeam = mode !== "singles" && fixedTeamFormats.includes(format);
                  const feeLabel = mode === "singles"
                    ? t.tournament_entry_fee_per_person
                    : isFixedTeam
                    ? t.tournament_entry_fee_per_team
                    : t.tournament_entry_fee_per_person;
                  return (
                  <div className="mt-3">
                    <div>
                      <label className={`block text-xs font-medium ${theme.textSecondary} mb-1`}>
                        {feeLabel}
                      </label>
                      <input
                        type="number"
                        value={mode === "singles" ? entryFeeSingle : entryFeeDouble}
                        onChange={(e) => mode === "singles" ? setEntryFeeSingle(e.target.value) : setEntryFeeDouble(e.target.value)}
                        className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-lg px-3 py-2 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                        min={0}
                        max={10000}
                        step="0.5"
                      />
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>

            {nextStep && (
              <button
                onClick={() => setCreateStep(nextStep)}
                disabled={selectedVenueId === ""}
                title={selectedVenueId === "" ? t.tournament_venue_required : undefined}
                className={`w-full ${theme.primaryBg} text-white px-5 py-3 rounded-2xl ${theme.primaryHoverBg} shadow-sm hover:shadow-md transition-all font-medium text-sm mt-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {t.tournament_continue_to.replace("{icon}", steps.find((s) => s.key === nextStep)?.icon || "").replace("{label}", steps.find((s) => s.key === nextStep)?.label || "")} →
              </button>
            )}
          </>
        )}

        {/* Step: Players */}
        {createStep === "players" && (
          <>
            <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} p-5`}>
              {/* Header */}
              <div className="flex justify-between items-center mb-3">
                <h2 className={`font-semibold ${theme.textPrimary}`}>
                  {t.tournament_select_players}{" "}
                  <span className={`${theme.activeBadgeText} font-normal`}>
                    ({t.common_selected.replace("{count}", String(selectedCount))})
                  </span>
                </h2>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setShowExcelImport(true)}
                    className={`${theme.primaryBg} text-white text-xs px-3 py-1.5 rounded-lg ${theme.primaryHoverBg} transition-colors font-medium`}
                  >
                    📥 {t.common_import}
                  </button>
                  <button
                    onClick={selectAllFiltered}
                    className={`${theme.activeBadgeText} text-sm font-medium`}
                  >
                    {genderFilter !== "all" || clubFilter !== "all" || search ? t.tournament_select_filtered : t.tournament_select_all}
                  </button>
                  <button
                    onClick={selectNoneFiltered}
                    className="text-gray-400 hover:text-gray-600 text-sm"
                  >
                    {genderFilter !== "all" || clubFilter !== "all" || search ? t.tournament_deselect_filtered : t.tournament_deselect_all}
                  </button>
                </div>
              </div>

              {/* Search + Filter */}
              <div className="flex gap-2 mb-3">
                <div className="flex-1 relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t.players_search_placeholder}
                    className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl pl-9 pr-4 py-2 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    🔍
                  </span>
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className={`flex rounded-xl border ${theme.inputBorder} overflow-hidden text-sm`}>
                  {([
                    { value: "all", label: t.common_all },
                    { value: "m", label: t.players_filter_men },
                    { value: "f", label: t.players_filter_women },
                  ] as { value: GenderFilter; label: string }[]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setGenderFilter(opt.value)}
                      className={`px-3 py-2 transition-colors font-medium ${
                        genderFilter === opt.value
                          ? `${theme.primaryBg} text-white`
                          : `${theme.textSecondary} hover:opacity-80`
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {availableClubs.length > 0 && (
                  <select
                    value={clubFilter}
                    onChange={(e) => setClubFilter(e.target.value)}
                    className={`${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-3 py-2 text-sm ${theme.focusBorder} outline-none`}
                  >
                    <option value="all">{t.common_all}</option>
                    {availableClubs.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__none__">{t.stats_no_club}</option>
                  </select>
                )}
              </div>

              {/* Info bar */}
              {(genderFilter !== "all" || clubFilter !== "all" || search) && (
                <div className="text-xs text-gray-400 mb-2">
                  {t.tournament_players_shown.replace("{shown}", String(filteredPlayers.length)).replace("{total}", String(players.length))}
                  {filteredSelectedCount > 0 && (
                    <span className={`${theme.activeBadgeText} ml-1`}>
                      {t.tournament_players_selected_of.replace("{count}", String(filteredSelectedCount))}
                    </span>
                  )}
                </div>
              )}

              {/* Selected players chips */}
              {selectedPlayerIds.size > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {players.filter(p => selectedPlayerIds.has(p.id)).map(p => (
                    <span
                      key={p.id}
                      onClick={() => togglePlayer(p.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all hover:opacity-80 ${
                        p.gender === "m" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                      }`}
                    >
                      {playerDisplayName(p)}
                      <span className="text-[10px] opacity-60">✕</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Player List */}
              {players.length === 0 ? (
                <p className="text-gray-400 text-sm py-4">
                  {t.tournament_no_players_yet}
                </p>
              ) : filteredPlayers.length === 0 ? (
                <p className="text-gray-400 text-sm py-4">
                  {t.tournament_no_filter_results}
                </p>
              ) : (
                <div className={`max-h-72 overflow-y-auto rounded-xl border ${theme.cardBorder}`}>
                  {filteredPlayers.map((p, i) => (
                    <div
                      key={p.id}
                      onClick={() => togglePlayer(p.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm transition-all duration-150 select-none ${
                        i > 0 ? `border-t ${theme.cardBorder}` : ""
                      } ${
                        selectedPlayerIds.has(p.id)
                          ? theme.selectedBg
                          : "hover:opacity-80 hover:bg-white/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlayerIds.has(p.id)}
                        onChange={() => {}}
                        tabIndex={-1}
                        className="rounded accent-emerald-600 shrink-0 pointer-events-none"
                      />
                      <span className={`font-medium ${theme.textPrimary} flex-1`}>{playerDisplayName(p)}</span>
                      {p.club && (
                        <span className={`text-[10px] ${theme.textMuted} truncate max-w-[120px]`}>{p.club}</span>
                      )}
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                          p.gender === "m"
                            ? "bg-blue-50 text-blue-500"
                            : "bg-pink-50 text-pink-500"
                        }`}
                      >
                        {p.gender === "m" ? t.common_gender_male : t.common_gender_female}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {nextStep && (
              <button
                onClick={() => setCreateStep(nextStep)}
                className={`w-full ${theme.primaryBg} text-white px-5 py-3 rounded-2xl ${theme.primaryHoverBg} shadow-sm hover:shadow-md transition-all font-medium text-sm mt-2`}
              >
                {t.tournament_continue_to.replace("{icon}", steps.find((s) => s.key === nextStep)?.icon || "").replace("{label}", steps.find((s) => s.key === nextStep)?.label || "")} →
              </button>
            )}
          </>
        )}

        {/* Step: Teams */}
        {createStep === "teams" && needsTeamPairing && (
          <>
            <TeamPairingStep
              mode={mode}
              players={players}
              poolPlayers={poolPlayers}
              manualTeams={manualTeams}
              firstPick={firstPick}
              theme={theme}
              onPoolClick={handlePoolClick}
              onAutoAssign={autoAssignRemaining}
              onRemoveTeam={removeTeam}
              onClearAll={() => { setManualTeams([]); setFirstPick(null); }}
            />

            {nextStep && (
              <button
                onClick={() => setCreateStep(nextStep)}
                className={`w-full ${theme.primaryBg} text-white px-5 py-3 rounded-2xl ${theme.primaryHoverBg} shadow-sm hover:shadow-md transition-all font-medium text-sm mt-4`}
              >
                {t.tournament_continue_to.replace("{icon}", steps.find((s) => s.key === nextStep)?.icon || "").replace("{label}", steps.find((s) => s.key === nextStep)?.label || "")} →
              </button>
            )}
          </>
        )}

        {/* Step: Seeding */}
        {createStep === "seeding" && showSeedingStep && (
          <>
            <SeedingStep
              seedOrder={seedOrder}
              selectedPlayerIds={selectedPlayerIds}
              seededPlayerIds={seededPlayerIds}
              players={players}
              theme={theme}
              dragSeedIdx={dragSeedIdx}
              dragOverIdx={dragOverIdx}
              onSeedDrop={handleSeedDrop}
              onMoveSeed={moveSeed}
              onToggleSeeded={toggleSeeded}
              onDragStart={(idx, e) => {
                setDragSeedIdx(idx);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(idx));
              }}
              onDragEnd={() => { setDragSeedIdx(null); setDragOverIdx(null); }}
              onDragOver={(idx, e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIdx(idx); }}
              onDragLeave={(idx) => { if (dragOverIdx === idx) setDragOverIdx(null); }}
            />

            {nextStep && (
              <button
                onClick={() => setCreateStep(nextStep)}
                className={`w-full ${theme.primaryBg} text-white px-5 py-3 rounded-2xl ${theme.primaryHoverBg} shadow-sm hover:shadow-md transition-all font-medium text-sm mt-4`}
              >
                {t.tournament_continue_to.replace("{icon}", steps.find((s) => s.key === nextStep)?.icon || "").replace("{label}", steps.find((s) => s.key === nextStep)?.label || "")} →
              </button>
            )}
          </>
        )}

        {/* Step: Create */}
        {createStep === "create" && (
          <>
            {/* Summary */}
            <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${theme.cardBorder} p-5`}>
              <h2 className={`font-semibold ${theme.textPrimary} mb-3`}>{t.tournament_summary}</h2>
              <div className={`text-sm ${theme.textSecondary} space-y-1.5`}>
                <div><span className={`font-medium ${theme.textPrimary}`}>{t.tournament_summary_name}</span> {name || "—"}</div>
                <div><span className={`font-medium ${theme.textPrimary}`}>{t.tournament_summary_mode}</span> {({singles: t.mode_singles, doubles: t.mode_doubles, mixed: t.mode_mixed} as Record<string, string>)[mode]} · {({round_robin: t.format_round_robin, elimination: t.format_elimination, random_doubles: t.format_random_doubles, group_ko: t.format_group_ko, swiss: t.format_swiss, double_elimination: t.format_double_elimination, monrad: t.format_monrad, king_of_court: t.format_king_of_court, waterfall: t.format_waterfall} as Record<string, string>)[format]}</div>
                {(format === "swiss" || format === "monrad" || format === "waterfall") && (
                  <div><span className={`font-medium ${theme.textPrimary}`}>{t.tournament_swiss_rounds}:</span> {numGroups}</div>
                )}
                <div><span className={`font-medium ${theme.textPrimary}`}>{t.tournament_summary_rules}</span> {t[`scoring_mode_${scoringMode}` as keyof typeof t] as string} · {setsToWin === 1 ? t.best_of_1 : setsToWin === 2 ? t.best_of_3 : t.best_of_5} · {courts} {courts === 1 ? t.common_field : t.common_fields}</div>
                <div><span className={`font-medium ${theme.textPrimary}`}>{t.tournament_summary_players}</span> {t.common_selected.replace("{count}", String(selectedPlayerIds.size))} {selectedPlayerIds.size < minPlayers && <span className="text-orange-500">{t.tournament_min_players.replace("{count}", String(minPlayers))}</span>}</div>
                {needsTeamPairing && (
                  <div><span className={`font-medium ${theme.textPrimary}`}>{t.tournament_summary_teams}</span> {manualTeams.length} {poolPlayers.length > 1 && <span className="text-orange-500">{t.tournament_teams_open.replace("{count}", String(poolPlayers.length))}</span>}</div>
                )}
                <div><span className={`font-medium ${theme.textPrimary}`}>{t.tournament_summary_entry_fee}</span> {useEntryFee ? (() => {
                  const fixedFmts: TournamentFormat[] = ["elimination", "group_ko", "double_elimination"];
                  const isFixed = mode !== "singles" && fixedFmts.includes(format);
                  const amount = mode === "singles" ? entryFeeSingle : entryFeeDouble;
                  const label = isFixed ? t.tournament_entry_fee_per_team : t.tournament_entry_fee_per_person;
                  return `${amount} EUR (${label.replace(" (EUR)", "")})`;
                })() : "—"}</div>
                <div><span className={`font-medium ${theme.textPrimary}`}>⏱️ {t.tournament_min_rest_label}:</span> {useMinRest && Number(minRestMinutes) > 0 ? `${Number(minRestMinutes) || 0} ${t.tournament_min_rest_unit}` : "—"}</div>
              </div>
            </div>

            {/* Create button */}
            <button
              onClick={handleCreate}
              disabled={creating || selectedVenueId === "" || selectedPlayerIds.size < minPlayers || (needsTeamPairing && poolPlayers.length >= 2)}
              title={selectedVenueId === "" ? t.tournament_venue_required : undefined}
              className={`w-full ${theme.primaryBg} text-white px-5 py-3.5 rounded-2xl ${theme.primaryHoverBg} shadow-sm hover:shadow-lg transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none font-semibold text-base`}
            >
              {creating
                ? `⏳ ${t.common_saving}`
                : isEditMode
                ? `💾 ${t.tournament_save_changes}`
                : `🏆 ${t.tournament_create_button}`}
              {!creating && selectedVenueId === "" && (
                <span className="text-sm font-normal ml-2 opacity-70">
                  ({t.tournament_venue_required})
                </span>
              )}
              {!creating && selectedVenueId !== "" && selectedPlayerIds.size < minPlayers && (
                <span className="text-sm font-normal ml-2 opacity-70">
                  {t.tournament_min_players.replace("{count}", String(minPlayers))}
                </span>
              )}
              {!creating && selectedVenueId !== "" && needsTeamPairing && poolPlayers.length >= 2 && (
                <span className="text-sm font-normal ml-2 opacity-70">
                  ({t.tournament_teams_open.replace("{count}", String(poolPlayers.length))})
                </span>
              )}
            </button>
          </>
        )}
      </div>

      {showFormatInfo && (
        <FormatInfoModal
          format={format}
          theme={theme}
          onClose={() => setShowFormatInfo(false)}
        />
      )}

      {showExcelImport && (
        <ExcelImport
          onImportDone={async () => {
            const freshPlayers = await getPlayers();
            setPlayers(freshPlayers);
            // Auto-select ALL players after import
            setSelectedPlayerIds(new Set(freshPlayers.map(p => p.id)));
          }}
          onClose={() => setShowExcelImport(false)}
        />
      )}

    </div>
  );
}
