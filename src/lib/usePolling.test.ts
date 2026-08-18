// Behaviour of the shared polling loop. startPolling holds everything the
// hook does apart from binding it to a component's lifetime, so these tests
// drive the real code rather than a re-implementation of it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startPolling } from "./usePolling";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startPolling", () => {
  it("ticks once immediately", () => {
    const tick = vi.fn();
    const stop = startPolling(tick, { intervalMs: 1000 });

    expect(tick).toHaveBeenCalledTimes(1);
    stop();
  });

  it("keeps ticking on the interval", () => {
    const tick = vi.fn();
    const stop = startPolling(tick, { intervalMs: 1000 });

    vi.advanceTimersByTime(3000);

    expect(tick).toHaveBeenCalledTimes(4); // one immediate + three
    stop();
  });

  it("stops when torn down", () => {
    const tick = vi.fn();
    const stop = startPolling(tick, { intervalMs: 1000 });

    vi.advanceTimersByTime(1000);
    stop();
    vi.advanceTimersByTime(5000);

    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("runs the first tick but no interval when paused", () => {
    const tick = vi.fn();
    const stop = startPolling(tick, { intervalMs: 1000, paused: true });

    vi.advanceTimersByTime(10_000);

    expect(tick).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does nothing at all when disabled", () => {
    const tick = vi.fn();
    const stop = startPolling(tick, { intervalMs: 1000, disabled: true });

    vi.advanceTimersByTime(10_000);

    expect(tick).not.toHaveBeenCalled();
    stop();
  });

  it("reports cancellation to a tick that is still awaiting", async () => {
    let seenAfterAwait: boolean | null = null;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stop = startPolling(async (cancelled) => {
      await gate;
      seenAfterAwait = cancelled();
    }, { intervalMs: 1000 });

    stop(); // teardown while the tick is still suspended
    release();
    await gate;
    await Promise.resolve();

    expect(seenAfterAwait).toBe(true);
  });

  it("logs a failing tick and keeps going", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const stop = startPolling(async () => {
      calls++;
      throw new Error("nope");
    }, { intervalMs: 1000, label: "useThing" });

    await vi.advanceTimersByTimeAsync(2000);

    expect(calls).toBe(3);
    expect(error).toHaveBeenCalledWith("useThing: poll failed:", expect.any(Error));
    stop();
  });
});
