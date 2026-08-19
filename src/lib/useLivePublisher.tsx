/**
 * Global live publisher host — runs once at app root, parallel to the router.
 *
 * Responsibilities:
 *  1. Read live_publish_config (connection params) from app_settings; reload
 *     every 30s so endpoint/secret changes in Settings take effect without
 *     an app restart.
 *  2. Read live_publish_tournament_ids (per-tournament opt-in set) and
 *     live_publish_paused_tournament_ids (per-tournament pause set) every 30s.
 *  3. Discover all tournaments with status="active" every 30s.
 *  4. The intersection of (active && opted-in && !paused) gets a
 *     <TournamentPublisher/> child that polls its own state every 5s and
 *     pushes a snapshot whenever the stable signature changes (debounced
 *     1.5s) or every 60s as a heartbeat.
 *  5. Track success/error/backoff state in a shared Map for the Settings
 *     status line + per-tournament inline indicator in TournamentView.
 *  6. Auto-backoff on persistent failures: 3+ consecutive errors throttle
 *     the next push attempt to 30s / 2min / 5min until a success resets it.
 *  7. Emit a final snapshot (`final: true`) the moment a tournament
 *     transitions from `active` to `completed`/`archived`, so the WP side
 *     captures the closing state before the publisher tears itself down.
 *
 * Default off: an empty opt-in set means nothing is pushed, even when a
 * connection is configured. Users enable live publishing per tournament
 * from the tournament detail page.
 *
 * Multi-tournament: each child has its own debounce slot keyed by tournament
 * id, so a flurry of score edits in tournament A never cancels a pending
 * push for tournament B.
 *
 * Imperative APIs exposed for TournamentView:
 *   - triggerImmediatePush(id): force a push regardless of debounce/heartbeat
 *   - usePushStatus(id):        subscribe to per-tournament status info
 */
/* eslint-disable react-refresh/only-export-components */

import { useEffect, useRef, useState } from "react";
import { usePolling } from "./usePolling";
import {
  getAppSetting,
  getTournaments,
  getTournament,
  getTournamentPlayers,
  getRounds,
  getAllMatchesByTournament,
  getAllSetsByTournament,
  setAppSetting,
} from "./db";
import {
  buildSnapshot,
  pushSnapshot,
  snapshotSignature,
  getLiveTournamentIds,
  getPausedTournamentIds,
  appendPushLogEntry,
  LIVE_PUBLISH_SETTING_KEY,
  type PushLogEntry,
} from "./livePublish";
import type { LivePublishConfig, Tournament } from "./types";

declare const __APP_VERSION__: string;

const DISCOVERY_INTERVAL_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 1_500;
/** Failures-in-a-row above this threshold trigger backoff. */
const BACKOFF_THRESHOLD = 3;
/** Backoff steps applied past the threshold (ms). Last value sticks. */
const BACKOFF_STEPS_MS = [30_000, 120_000, 300_000];

type PushReason = PushLogEntry["reason"];

/** Per-tournament push status, used by Settings + TournamentView. */
export interface TournamentPushStatus {
  tournamentId: number;
  tournamentName: string;
  lastPushAt: string | null;
  lastError: string | null;
  /** Wall-clock ms timestamp when the next push attempt is allowed,
   * or null when no backoff is active. */
  backoffUntil: number | null;
  consecutiveFailures: number;
}

const pushStatuses = new Map<number, TournamentPushStatus>();
const pushStatusListeners = new Set<() => void>();
function notifyPushStatusListeners() {
  for (const fn of pushStatusListeners) fn();
}

/** External hook for Settings page (full list across all live tournaments). */
export function usePushStatuses(): TournamentPushStatus[] {
  const [snapshot, setSnapshot] = useState<TournamentPushStatus[]>(() =>
    Array.from(pushStatuses.values()),
  );
  useEffect(() => {
    const refresh = () => setSnapshot(Array.from(pushStatuses.values()));
    pushStatusListeners.add(refresh);
    return () => {
      pushStatusListeners.delete(refresh);
    };
  }, []);
  return snapshot;
}

/** External hook for TournamentView — single tournament's status. */
export function usePushStatus(tournamentId: number | null): TournamentPushStatus | null {
  const [status, setStatus] = useState<TournamentPushStatus | null>(() =>
    tournamentId == null ? null : pushStatuses.get(tournamentId) ?? null,
  );
  useEffect(() => {
    if (tournamentId == null) {
      setStatus(null);
      return;
    }
    const refresh = () => setStatus(pushStatuses.get(tournamentId) ?? null);
    refresh();
    pushStatusListeners.add(refresh);
    return () => {
      pushStatusListeners.delete(refresh);
    };
  }, [tournamentId]);
  return status;
}

function recordPushResult(
  tournamentId: number,
  tournamentName: string,
  ok: boolean,
  opts: { error?: string; backoffUntil?: number | null; consecutiveFailures: number } = { consecutiveFailures: 0 },
) {
  const now = new Date().toISOString();
  const prev = pushStatuses.get(tournamentId);
  const entry: TournamentPushStatus = {
    tournamentId,
    tournamentName,
    lastPushAt: ok ? now : prev?.lastPushAt ?? null,
    lastError: ok ? null : opts.error ?? "unknown",
    backoffUntil: opts.backoffUntil ?? null,
    consecutiveFailures: opts.consecutiveFailures,
  };
  pushStatuses.set(tournamentId, entry);
  notifyPushStatusListeners();
}

function clearPushStatus(tournamentId: number) {
  if (pushStatuses.delete(tournamentId)) notifyPushStatusListeners();
}

// --- Imperative push trigger API -----------------------------------------

/**
 * Per-tournament push function registered by each running Publisher.
 * Used by triggerImmediatePush() to force a push from outside (e.g. the
 * "Push jetzt" button in TournamentView).
 */
const immediatePushers = new Map<number, (reason: PushReason) => Promise<void>>();

/**
 * Force an immediate push for the given tournament. Returns true when a
 * Publisher is currently running and was triggered, false otherwise (no
 * Publisher = tournament not active+opted-in+unpaused right now). The
 * actual push is fire-and-forget — caller doesn't await network round-trip.
 */
export function triggerImmediatePush(tournamentId: number): boolean {
  const fn = immediatePushers.get(tournamentId);
  if (!fn) return false;
  void fn("manual");
  return true;
}

// --- Live config loader ---------------------------------------------------

function useLiveConfig(): LivePublishConfig | null {
  const [cfg, setCfg] = useState<LivePublishConfig | null>(null);
  usePolling(
    async (cancelled) => {
      let parsed: LivePublishConfig | null = null;
      try {
        const raw = await getAppSetting(LIVE_PUBLISH_SETTING_KEY);
        if (raw) parsed = JSON.parse(raw) as LivePublishConfig;
      } catch (err) {
        // A malformed config means "not configured", not a broken app.
        console.error("useLiveConfig: failed to load config:", err);
      }
      if (cancelled()) return;
      setCfg(parsed);
    },
    { intervalMs: DISCOVERY_INTERVAL_MS, label: "useLiveConfig" },
  );
  return cfg;
}

// --- Active tournament discovery -----------------------------------------

/**
 * Returns the list of tournaments that should be currently pushed: status
 * is "active" AND user has opted them in AND they are not currently paused.
 */
function useActiveOptedInTournaments(connected: boolean): Tournament[] {
  const [list, setList] = useState<Tournament[]>([]);
  usePolling(
    async (cancelled) => {
      const [all, optedIn, paused] = await Promise.all([
        getTournaments(),
        getLiveTournamentIds(),
        getPausedTournamentIds(),
      ]);
      if (cancelled()) return;
      const optedSet = new Set(optedIn);
      const pausedSet = new Set(paused);
      const target = all.filter(
        (t) => t.status === "active" && optedSet.has(t.id) && !pausedSet.has(t.id),
      );
      // Same list, same array — so consumers do not re-render every tick.
      setList((prev) =>
        prev.length === target.length && prev.every((t, i) => t.id === target[i].id)
          ? prev
          : target,
      );
    },
    {
      intervalMs: DISCOVERY_INTERVAL_MS,
      disabled: !connected,
      label: "useActiveOptedInTournaments",
    },
    [connected],
  );
  return list;
}

// --- Per-tournament publisher --------------------------------------------

interface TournamentPublisherProps {
  tournamentId: number;
  config: LivePublishConfig;
}

function TournamentPublisher({ tournamentId, config }: TournamentPublisherProps) {
  const dataRef = useRef<{
    tournament: Tournament;
    players: import("./types").Player[];
    rounds: import("./types").Round[];
    matches: import("./types").Match[];
    sets: import("./types").GameSet[];
  } | null>(null);

  const lastSig = useRef<string>("");
  const debounceTimer = useRef<number | null>(null);
  const tournamentName = useRef<string>("");
  const consecutiveFailures = useRef(0);
  /** Wall-clock ms timestamp before which push attempts are skipped. 0 = no backoff. */
  const backoffUntil = useRef(0);
  /** Set to true after the final-snapshot has been emitted so we don't push it again. */
  const finalEmitted = useRef(false);
  /** Tracked previous status to detect the active → completed/archived transition. */
  const prevStatus = useRef<string | null>(null);

  // Push helper bound to this tournament — keeps push logic in one place.
  const doPush = useRef(async (reason: PushReason) => {
    if (!dataRef.current) return;

    // Backoff guard: skip event/heartbeat pushes during cooldown. Manual
    // and final pushes always go through (the user explicitly asked, or
    // it's the closing snapshot we don't want to lose).
    if (
      (reason === "event" || reason === "heartbeat") &&
      backoffUntil.current > 0 &&
      Date.now() < backoffUntil.current
    ) {
      return;
    }

    const isFinal = reason === "final";
    const snap = buildSnapshot(
      dataRef.current.tournament,
      dataRef.current.players,
      dataRef.current.rounds,
      dataRef.current.matches,
      dataRef.current.sets,
      __APP_VERSION__,
      { final: isFinal, privacyLevel: config.privacyLevel },
    );

    // Heartbeat dedup — only skip when no state has changed since last push.
    // Manual + final always run.
    const sig = snapshotSignature(snap);
    if (
      reason === "heartbeat" &&
      sig === lastSig.current &&
      lastSig.current !== ""
    ) {
      return;
    }
    lastSig.current = sig;

    const startedAt = Date.now();
    const result = await pushSnapshot(config, snap);
    const durationMs = Date.now() - startedAt;

    if (result.ok) {
      consecutiveFailures.current = 0;
      backoffUntil.current = 0;
      recordPushResult(tournamentId, tournamentName.current, true, {
        consecutiveFailures: 0,
        backoffUntil: null,
      });
      // Mirror "last successful push" globally for the Settings header line.
      try {
        const updated: LivePublishConfig = {
          ...config,
          lastPushAt: new Date().toISOString(),
          lastError: undefined,
        };
        await setAppSetting(LIVE_PUBLISH_SETTING_KEY, JSON.stringify(updated));
      } catch { /* non-fatal */ }
      if (isFinal) finalEmitted.current = true;
    } else {
      consecutiveFailures.current++;
      let nextBackoff = 0;
      if (consecutiveFailures.current >= BACKOFF_THRESHOLD) {
        const stepIdx = Math.min(
          consecutiveFailures.current - BACKOFF_THRESHOLD,
          BACKOFF_STEPS_MS.length - 1,
        );
        nextBackoff = Date.now() + BACKOFF_STEPS_MS[stepIdx];
        backoffUntil.current = nextBackoff;
      }
      recordPushResult(tournamentId, tournamentName.current, false, {
        error: result.error,
        consecutiveFailures: consecutiveFailures.current,
        backoffUntil: nextBackoff || null,
      });
      try {
        const updated: LivePublishConfig = { ...config, lastError: result.error };
        await setAppSetting(LIVE_PUBLISH_SETTING_KEY, JSON.stringify(updated));
      } catch { /* non-fatal */ }
    }

    // Append to rolling push log (best-effort).
    void appendPushLogEntry({
      ts: new Date().toISOString(),
      tournamentId,
      tournamentName: tournamentName.current,
      ok: result.ok,
      status: result.ok ? result.status : undefined,
      error: result.ok ? undefined : result.error,
      durationMs,
      reason,
    });
  });

  // Register/unregister the imperative push trigger keyed by tournamentId.
  useEffect(() => {
    immediatePushers.set(tournamentId, (reason: PushReason) => doPush.current(reason));
    return () => {
      immediatePushers.delete(tournamentId);
    };
  }, [tournamentId]);

  // Polling loop: reloads tournament state every 5s, kicks debounced push
  // when the signature changed. Also detects the active → completed/archived
  // transition and emits a final snapshot before the publisher unmounts.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [tournament, players, rounds, matches, sets] = await Promise.all([
          getTournament(tournamentId),
          getTournamentPlayers(tournamentId),
          getRounds(tournamentId),
          getAllMatchesByTournament(tournamentId),
          getAllSetsByTournament(tournamentId),
        ]);
        if (cancelled) return;
        dataRef.current = { tournament, players, rounds, matches, sets };
        tournamentName.current = tournament.name;

        // Final-snapshot detection: status flipped from "active" to a
        // terminal state. Discovery will unmount us within the next 30s,
        // so we get one shot — emit final NOW, then let cleanup happen.
        const wasActive = prevStatus.current === "active";
        const nowTerminal =
          tournament.status === "completed" || tournament.status === "archived";
        if (wasActive && nowTerminal && !finalEmitted.current) {
          await doPush.current("final");
        }
        prevStatus.current = tournament.status;

        if (finalEmitted.current) return;   // no further pushes after final

        // Build snapshot just to compute signature — cheap (no network).
        const snap = buildSnapshot(
          tournament,
          players,
          rounds,
          matches,
          sets,
          __APP_VERSION__,
          { privacyLevel: config.privacyLevel },
        );
        const sig = snapshotSignature(snap);
        if (sig !== lastSig.current) {
          if (debounceTimer.current !== null) {
            clearTimeout(debounceTimer.current);
          }
          debounceTimer.current = window.setTimeout(() => {
            debounceTimer.current = null;
            doPush.current("event");
          }, DEBOUNCE_MS);
        }
      } catch (err) {
        console.error(`TournamentPublisher(${tournamentId}): poll failed:`, err);
      }
    };
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
    // The privacy level belongs here: it changes the snapshot, so a change
    // has to invalidate the cached signature — otherwise switching to
    // abbreviated names would leave the full ones published until the next
    // score happened to differ.
  }, [tournamentId, config.privacyLevel]);

  // Heartbeat loop: every 60s, push regardless of changes (acts as a
  // liveness signal so the WP page can show "still active" / handles
  // downstream restarts).
  //
  // Deliberately not on usePolling: that always fires one immediate tick,
  // which would send a heartbeat the moment a publisher mounts, on top of
  // the push the snapshot loop above is already about to make. The loop
  // above stays hand-written too — it owns a debounce timer that has to be
  // cleared alongside the interval (REVIEW-BACKLOG.md D8).
  useEffect(() => {
    const id = setInterval(() => {
      if (finalEmitted.current) return;
      doPush.current("heartbeat");
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}

// --- Host component ------------------------------------------------------

/**
 * Mount once at app root. Coordinates discovery + per-tournament publishers.
 * Renders nothing visible.
 */
export default function LivePublisherHost() {
  const config = useLiveConfig();
  const connected = !!config?.endpoint && !!config?.secret;
  const active = useActiveOptedInTournaments(connected);

  // Drop status entries for tournaments that are no longer active+opted-in+unpaused.
  useEffect(() => {
    const activeIds = new Set(active.map((t) => t.id));
    for (const id of Array.from(pushStatuses.keys())) {
      if (!activeIds.has(id)) clearPushStatus(id);
    }
  }, [active]);

  if (!connected || !config) return null;

  return (
    <>
      {active.map((t) => (
        <TournamentPublisher
          key={t.id}
          tournamentId={t.id}
          config={config}
        />
      ))}
    </>
  );
}
