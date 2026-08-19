// src/lib/updater.test.ts
//
// When to ask the update server again, and which version was dismissed.
//
// Neither can be seen from the interface: a wrong comparison means the
// check silently never runs again, or the banner reappears at every
// start. Both are the kind of fault nobody reports -- they just quietly
// stop the feature from working.

import { describe, it, expect } from "vitest";
import { shouldCheck, isDismissed, CHECK_INTERVAL_MS } from "./updater";

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
