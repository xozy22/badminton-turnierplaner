// src/lib/usePolling.ts
//
// One polling primitive for the four loops that used to carry their own.
//
// Session context, live publishing, the push log and the discovery scan
// each wrote the same twenty lines: a `cancelled` flag, a try/catch that
// logs, an immediate first tick, `setInterval`, and a cleanup that has to
// clear both. Four copies means four chances to forget the flag — and a
// forgotten flag writes state into an unmounted component
// (REVIEW-BACKLOG.md D8).

import { useEffect, useRef } from "react";

export interface PollingOptions {
  /** Milliseconds between ticks. */
  intervalMs: number;
  /**
   * When true, the first tick still runs but no interval is scheduled.
   * The session dashboard uses this to stop polling data that cannot
   * change while still rendering a populated view.
   */
  paused?: boolean;
  /** Skips everything, including the first tick. */
  disabled?: boolean;
  /** Prefix for the console message when a tick throws. */
  label?: string;
}

export type PollingTick = (cancelled: () => boolean) => void | Promise<void>;

/**
 * Starts a poll loop and returns its teardown.
 *
 * Separate from the hook so the behaviour can be tested directly rather
 * than through a copy of it: everything interesting — the first tick, the
 * interval, pausing, the cancelled flag, error handling — lives here, and
 * `usePolling` only ties it to a component's lifetime.
 */
export function startPolling(tick: PollingTick, options: PollingOptions): () => void {
  const { intervalMs, paused = false, disabled = false, label = "usePolling" } = options;
  if (disabled) return () => {};

  let cancelled = false;
  const isCancelled = () => cancelled;

  const run = async () => {
    try {
      await tick(isCancelled);
    } catch (err) {
      console.error(`${label}: poll failed:`, err);
    }
  };

  // Always one immediate tick, so a paused poller still has data.
  void run();

  if (paused) {
    return () => {
      cancelled = true;
    };
  }

  const id = setInterval(() => void run(), intervalMs);
  return () => {
    cancelled = true;
    clearInterval(id);
  };
}

/**
 * Runs `tick` immediately and then on an interval, for as long as the
 * component is mounted.
 *
 * `tick` receives a function that reports whether the effect has been torn
 * down since it started. Anything awaited inside must check it before
 * touching state:
 *
 *   usePolling(async (cancelled) => {
 *     const data = await load();
 *     if (cancelled()) return;
 *     setData(data);
 *   }, { intervalMs: 5000 });
 *
 * `tick` is read from a ref, so a fresh closure on every render does not
 * restart the interval — only the values in `deps` do.
 */
export function usePolling(
  tick: PollingTick,
  options: PollingOptions,
  deps: React.DependencyList = [],
): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;

  const { intervalMs, paused = false, disabled = false, label } = options;

  useEffect(
    () =>
      startPolling((cancelled) => tickRef.current(cancelled), {
        intervalMs,
        paused,
        disabled,
        label,
      }),
    // The caller decides what restarts the loop; tick itself never does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intervalMs, paused, disabled, label, ...deps],
  );
}
