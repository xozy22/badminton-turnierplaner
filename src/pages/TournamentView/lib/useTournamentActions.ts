// src/pages/TournamentView/lib/useTournamentActions.ts
//
// The actions that change what the tournament as a whole is doing:
// complete it, reopen it, archive it, export its results, open the TV
// display.
//
// They sat at five different points in index.tsx, each added where its
// button was rather than beside the others (REVIEW-BACKLOG.md D1).

import { updateTournamentStatus, isTauri } from "../../../lib/db";
import {
  matchesToCsv,
  standingsToCsv,
  paymentsToCsv,
  toJsonExport,
  exportFileName,
} from "../../../lib/resultExport";
import { useT } from "../../../lib/I18nContext";
import { useToast } from "../../../lib/ToastContext";
import type { TournamentDialogs } from "./useTournamentDialogs";
import type {
  GameSet,
  Match,
  Player,
  Round,
  StandingEntry,
  Tournament,
  TournamentPlayerInfo,
} from "../../../lib/types";

interface Args {
  tournamentId: number;
  tournament: Tournament | null;
  players: Player[];
  rounds: Round[];
  allMatches: Match[];
  setsByMatch: Map<number, GameSet[]>;
  standings: StandingEntry[];
  paymentData: TournamentPlayerInfo[];
  dialogs: TournamentDialogs;
  loadAll: () => void | Promise<void>;
}

export function useTournamentActions({
  tournamentId,
  tournament,
  players,
  rounds,
  allMatches,
  setsByMatch,
  standings,
  paymentData,
  dialogs,
  loadAll,
}: Args) {
  const { t } = useT();
  const { showSuccess, showError } = useToast();
  const { setShowReopenConfirm } = dialogs;

  const openTvWindow = async () => {
    if (isTauri()) {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const tvWin = new WebviewWindow(`tv-${tournamentId}`, {
          url: `/tv/${tournamentId}`,
          title: `${t.tournament_view_tv_mode}: ${tournament?.name ?? ""}`,
          width: 1920,
          height: 1080,
          fullscreen: false,
          maximized: true,
          decorations: true,
          dragDropEnabled: false,
        });
        tvWin.once("tauri://error", (e) => {
          console.error("TV window error:", e);
        });
      } catch (err) {
        console.error("Failed to open TV window:", err);
      }
    } else {
      const url = `${window.location.origin}/tv/${tournamentId}`;
      window.open(url, `tv-${tournamentId}`, "width=1920,height=1080,menubar=no,toolbar=no");
    }
  };

  const handleCompleteTournament = async () => {
    await updateTournamentStatus(tournamentId, "completed");
    loadAll();
  };

  const handleReopenTournament = async () => {
    await updateTournamentStatus(tournamentId, "active");
    setShowReopenConfirm(false);
    loadAll();
  };

  /**
   * Writes one of the export files. In the packaged app a native save
   * dialog picks the location; in the browser the file is downloaded
   * (REVIEW-BACKLOG.md C9).
   */
  const handleExport = async (kind: "matches" | "standings" | "payments" | "json") => {
    if (!tournament) return;

    const allSets: GameSet[] = [];
    for (const list of setsByMatch.values()) allSets.push(...list);

    const input = {
      tournament,
      players,
      rounds,
      matches: allMatches,
      sets: allSets,
      standings,
      paymentData,
      locale: undefined,
    };

    const isJson = kind === "json";
    const content = isJson
      ? toJsonExport(input)
      : kind === "matches"
        ? matchesToCsv(input)
        : kind === "standings"
          ? standingsToCsv(input)
          : paymentsToCsv(input);
    const fileName = exportFileName(tournament, kind, isJson ? "json" : "csv");

    try {
      if (isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await save({
          defaultPath: fileName,
          filters: [{ name: isJson ? "JSON" : "CSV", extensions: [isJson ? "json" : "csv"] }],
        });
        if (!path) return;
        // BOM so Excel opens the file as UTF-8 instead of mangling umlauts.
        await writeTextFile(path, isJson ? content : `\ufeff${content}`);
      } else {
        const blob = new Blob([isJson ? content : `\ufeff${content}`], {
          type: isJson ? "application/json" : "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      }
      showSuccess(t.export_done.replace("{file}", fileName));
    } catch (err) {
      showError(t.export_failed.replace("{error}", String(err)));
    }
  };

  const handleArchive = async () => {
    await updateTournamentStatus(tournamentId, "archived");
    loadAll();
  };
  return {
    openTvWindow,
    handleCompleteTournament,
    handleReopenTournament,
    handleExport,
    handleArchive,
  };
}
