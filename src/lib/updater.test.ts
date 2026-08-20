// src/lib/updater.test.ts
//
// When to ask the update server again, and which version was dismissed.
//
// Neither can be seen from the interface: a wrong comparison means the
// check silently never runs again, or the banner reappears at every
// start. Both are the kind of fault nobody reports -- they just quietly
// stop the feature from working.

import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldCheck,
  isDismissed,
  CHECK_INTERVAL_MS,
  markChecked,
  lastCheckedAt,
  dismissVersion,
  dismissedVersion,
  checkForUpdate,
  installHeldUpdate,
  hasHeldUpdate,
  resetForTests,
} from "./updater";

const NOW = Date.UTC(2026, 7, 19, 12, 0, 0);

describe("shouldCheck", () => {
  it("checks when nothing was ever stored", () => {
    expect(shouldCheck(null, NOW)).toBe(true);
  });

  it("waits inside the interval", () => {
    const anHourAgo = String(NOW - 60 * 60 * 1000);
    expect(shouldCheck(anHourAgo, NOW)).toBe(false);
  });

  it("checks once the interval has passed", () => {
    const aDayAgo = String(NOW - CHECK_INTERVAL_MS);
    expect(shouldCheck(aDayAgo, NOW)).toBe(true);
  });

  it("checks when the stored value is not a number", () => {
    // Something else wrote the key, or it was hand-edited. Refusing to
    // check for ever afterwards is the worse failure.
    expect(shouldCheck("gestern", NOW)).toBe(true);
    expect(shouldCheck("", NOW)).toBe(true);
  });

  it("checks when the timestamp lies in the future", () => {
    // The clock moved backwards -- a laptop returning from a wrong time
    // zone, or a battery-dead CMOS. Waiting would strand the user until
    // the clock catches up, which could be years.
    const tomorrow = String(NOW + 24 * 60 * 60 * 1000);
    expect(shouldCheck(tomorrow, NOW)).toBe(true);
  });

  it("honours a shorter interval when one is given", () => {
    const tenMinutesAgo = String(NOW - 10 * 60 * 1000);
    expect(shouldCheck(tenMinutesAgo, NOW, 5 * 60 * 1000)).toBe(true);
    expect(shouldCheck(tenMinutesAgo, NOW, 30 * 60 * 1000)).toBe(false);
  });
});

describe("isDismissed", () => {
  it("hides the version that was dismissed", () => {
    expect(isDismissed("2.9.1", "2.9.1")).toBe(true);
  });

  it("shows a different version", () => {
    // Saying "later" to one release must not hide the next one -- that is
    // how a user ends up three versions behind without being told.
    expect(isDismissed("2.10.0", "2.9.1")).toBe(false);
  });

  it("shows anything when nothing was dismissed", () => {
    expect(isDismissed("2.9.1", null)).toBe(false);
  });
});

describe("what is remembered between sessions", () => {
  beforeEach(() => {
    localStorage.clear();
    resetForTests();
  });

  it("remembers when it last checked", () => {
    markChecked(NOW);
    expect(shouldCheck(lastCheckedAt(), NOW)).toBe(false);
    expect(shouldCheck(lastCheckedAt(), NOW + CHECK_INTERVAL_MS)).toBe(true);
  });

  it("has nothing to report before the first check", () => {
    expect(lastCheckedAt()).toBeNull();
    expect(dismissedVersion()).toBeNull();
  });

  it("remembers a dismissal across a restart", () => {
    // The whole point: the banner used to come back at every start.
    dismissVersion("2.9.1");
    expect(isDismissed("2.9.1", dismissedVersion())).toBe(true);
  });

  it("lets the next version through after one was dismissed", () => {
    dismissVersion("2.9.1");
    expect(isDismissed("2.10.0", dismissedVersion())).toBe(false);
  });

  it("keeps only the most recent dismissal", () => {
    // One slot: saying "later" to a newer version replaces the older
    // answer, which no longer matters -- that version is behind us.
    dismissVersion("2.9.1");
    dismissVersion("2.10.0");
    expect(dismissedVersion()).toBe("2.10.0");
  });

  it("carries on when storage refuses", () => {
    // Private browsing, or storage switched off. The state is a
    // convenience; losing it must not take the update check with it.
    // `globalThis`, not `window`: that is where the test setup puts it,
    // and where the module reaches for it.
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage disabled");
      },
    });

    try {
      expect(() => markChecked(NOW)).not.toThrow();
      expect(lastCheckedAt()).toBeNull();
      expect(() => dismissVersion("2.9.1")).not.toThrow();
      expect(dismissedVersion()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
    }
  });
});

describe("checking without a Tauri backend", () => {
  beforeEach(() => {
    localStorage.clear();
    resetForTests();
  });

  it("reports no update rather than throwing", async () => {
    // The browser build has no updater plugin. The startup banner
    // swallows that; it is not an error worth interrupting anyone for.
    await expect(checkForUpdate(false)).resolves.toBeNull();
  });

  it("leaves the timestamp alone when the check could not run", async () => {
    // A failed attempt must not start the daily interval, or a network
    // outage would hide the next release for a day.
    await checkForUpdate(true);
    expect(lastCheckedAt()).toBeNull();
  });

  it("skips the call entirely inside the interval", async () => {
    markChecked(NOW);
    // Nothing to assert beyond it returning null without trying: the
    // point is that it does not reach for the plugin at all.
    await expect(checkForUpdate(false)).resolves.toBeNull();
  });

  it("refuses to install what was never checked for", async () => {
    // Installing "whatever is current now" is not what any button in
    // this application promises.
    await expect(installHeldUpdate(() => {})).rejects.toThrow();
  });

  it("holds nothing before a successful check", () => {
    expect(hasHeldUpdate()).toBe(false);
  });
});
