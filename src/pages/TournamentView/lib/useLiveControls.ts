// src/pages/TournamentView/lib/useLiveControls.ts
//
// Turning live results on, pausing them, pushing now, and stopping.
//
// Four pieces of state, two effects and four handlers that belong together
// and to nothing else in the view — including the privacy notice that has
// to appear before a member's name reaches a public website
// (REVIEW-BACKLOG.md I3, D1).

import { useEffect, useState } from "react";
import { getAppSetting } from "../../../lib/db";
import {
  LIVE_PUBLISH_SETTING_KEY,
  isTournamentLive,
  isTournamentPaused,
  pushDelete,
  setTournamentLive,
  setTournamentPaused,
} from "../../../lib/livePublish";
import { triggerImmediatePush, usePushStatus } from "../../../lib/useLivePublisher";
import { useT } from "../../../lib/I18nContext";
import { useToast } from "../../../lib/ToastContext";
import type { ConfirmRequest } from "../../../components/ui/ConfirmDialog";
import type { LivePublishConfig } from "../../../lib/types";

interface Args {
  tournamentId: number;
  /** From useConfirm() in the view — the notice needs a dialog to live in. */
  askConfirm: (request: ConfirmRequest) => Promise<boolean>;
}

export function useLiveControls({ tournamentId, askConfirm }: Args) {
  const { t } = useT();
  const { showSuccess, showError } = useToast();

  // Whether THIS tournament is currently opted into live publishing.
  // Default off — only flips on when user clicks "Live aktivieren".
  const [liveActive, setLiveActive] = useState(false);
  // Whether THIS tournament is currently paused (opt-in still in place,
  // pushes suppressed). Mutually exclusive UI-wise with the inactive state.
  const [livePaused, setLivePaused] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  // Live push status (lastPushAt, lastError, backoff state) for the inline
  // indicator next to the Live button. Updates in-place when the global
  // publisher pushes / fails.
  const livePushStatus = usePushStatus(tournamentId);
  // Tick once per second so the inline "Push 12s ago" / "Fehler vor X Min"
  // text refreshes without waiting for an actual push event.
  const [liveStatusNow, setLiveStatusNow] = useState(() => Date.now());
  useEffect(() => {
    if (!liveActive) return;
    const id = setInterval(() => setLiveStatusNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [liveActive]);
  // Load opt-in state on mount + whenever the tournament id changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [on, paused] = await Promise.all([
          isTournamentLive(tournamentId),
          isTournamentPaused(tournamentId),
        ]);
        if (cancelled) return;
        setLiveActive(on);
        setLivePaused(paused);
      } catch (err) {
        console.error("isTournamentLive/Paused failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  /**
   * Opt this tournament into live publishing. Just registers intent in
   * app_settings — the global LivePublisherHost picks it up on its next
   * 30s discovery tick and starts pushing snapshots. Errors out with a
   * helpful message if no connection is configured yet.
   */
  const handleEnableLive = async () => {
    setLiveBusy(true);
    try {
      const raw = await getAppSetting(LIVE_PUBLISH_SETTING_KEY);
      if (!raw) {
        showError(t.tournament_live_publish_no_config);
        return;
      }
      const config = JSON.parse(raw) as LivePublishConfig;
      if (!config.endpoint || !config.secret) {
        showError(t.tournament_live_publish_no_config);
        return;
      }
      // Names and clubs of club members are about to appear on a public
      // website. Whoever runs the tournament should see that stated
      // before it happens, not find out afterwards.
      const level = config.privacyLevel ?? "full";
      const ok = await askConfirm({
        title: t.live_privacy_title,
        message:
          level === "full"
            ? t.live_privacy_notice_full
            : level === "abbreviated"
              ? t.live_privacy_notice_abbreviated
              : t.live_privacy_notice_no_club,
        icon: "globe",
        tone: "warning",
        confirmLabel: t.tournament_live_publish_enable,
      });
      if (!ok) return;
      await setTournamentLive(tournamentId, true);
      setLiveActive(true);
      showSuccess(t.tournament_live_publish_enabled);
    } catch (err) {
      showError(String(err));
    } finally {
      setLiveBusy(false);
    }
  };

  /**
   * Pause / resume live publishing for this tournament. Pause keeps the
   * opt-in in place so the user can quickly resume without re-enabling
   * from scratch. The publisher's discovery loop (~30s) drops paused
   * tournaments from its active set, so the next push happens on resume.
   */
  const handleTogglePause = async () => {
    setLiveBusy(true);
    try {
      const next = !livePaused;
      await setTournamentPaused(tournamentId, next);
      setLivePaused(next);
    } catch (err) {
      showError(String(err));
    } finally {
      setLiveBusy(false);
    }
  };

  /**
   * Force an immediate push regardless of debounce / heartbeat / backoff.
   * No-op when no Publisher is currently running (tournament not active+
   * opted-in+unpaused, or discovery hasn't picked it up yet).
   */
  const handlePushNow = () => {
    const triggered = triggerImmediatePush(tournamentId);
    if (triggered) {
      showSuccess(t.tournament_live_publish_pushed_now);
    }
  };

  /**
   * Stop publishing this tournament: remove it from the opt-in set AND
   * send a delete-request so the WP page also drops the snapshot. Local
   * data is untouched. The confirm step is owned by `<UnpublishModal />`.
   */
  const handleUnpublish = async () => {
    try {
      // Always drop from opt-in first — even if the WP delete fails, the
      // user clearly wants this tournament off, and we don't want the
      // publisher to keep pushing. Clear paused state too so re-enabling
      // later doesn't carry over a stale pause.
      await setTournamentLive(tournamentId, false);
      await setTournamentPaused(tournamentId, false);
      setLiveActive(false);
      setLivePaused(false);

      const raw = await getAppSetting(LIVE_PUBLISH_SETTING_KEY);
      if (!raw) {
        // No connection saved — nothing to delete remotely. Still counts
        // as "off" locally, no error shown.
        showSuccess(t.tournament_unpublish_done);
        return;
      }
      const config = JSON.parse(raw) as LivePublishConfig;
      if (!config.endpoint || !config.secret) {
        showSuccess(t.tournament_unpublish_done);
        return;
      }
      const result = await pushDelete(config, tournamentId);
      if (result.ok) {
        showSuccess(t.tournament_unpublish_done);
      } else {
        showError(t.tournament_unpublish_failed.replace("{error}", result.error));
      }
    } catch (err) {
      showError(t.tournament_unpublish_failed.replace("{error}", String(err)));
    }
  };
  return {
    liveActive,
    livePaused,
    liveBusy,
    liveStatusNow,
    livePushStatus,
    handleEnableLive,
    handleTogglePause,
    handlePushNow,
    handleUnpublish,
  };
}
