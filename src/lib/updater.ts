// src/lib/updater.ts
//
// One place that talks to the updater plugin.
//
// The banner on startup and the button in Settings each called `check()`
// on their own, and `installUpdate` called it a third time to get back a
// handle it had already held. Three network round-trips for one question,
// and the feed could change between them -- the version shown in the
// dialog was not necessarily the one installed.
//
// The `Update` object is a Rust-side resource with a `close()`. Nothing
// called it, so every check left one behind.
//
// The pure parts -- when to check again, which version was dismissed --
// are separated out and tested. They are the kind of logic that fails
// quietly: a wrong comparison means the check never runs again, and
// nobody notices until a release goes unnoticed for months.

/** What the interface needs to know about a pending update. */
export interface AvailableUpdate {
  version: string;
  /** Release notes from the feed. Empty when the release had none. */
  notes: string;
}

/** How long a check stays good. A day is often enough for a desktop app. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const LAST_CHECK_KEY = "boss_update_last_check";
const DISMISSED_KEY = "boss_update_dismissed";

// ------------------------------------------------------------------- pure

/**
 * Whether enough time has passed to ask the server again.
 *
 * A missing or unparsable timestamp means "never checked", which is a
 * reason to check rather than a reason to skip.
 */
export function shouldCheck(
  lastCheck: string | null,
  now: number,
  intervalMs: number = CHECK_INTERVAL_MS,
): boolean {
  if (!lastCheck) return true;
  const then = Number(lastCheck);
  if (!Number.isFinite(then)) return true;
  // A timestamp in the future means the clock moved backwards. Checking is
  // the safe reading -- waiting would strand the user until it catches up.
  if (then > now) return true;
  return now - then >= intervalMs;
}

/**
 * Whether the banner for this version was dismissed.
 *
 * Dismissal is per version: saying "later" to 2.9.1 must not hide 2.10.0.
 */
export function isDismissed(version: string, dismissed: string | null): boolean {
  return dismissed !== null && dismissed === version;
}

// ------------------------------------------------------------ persistence

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode, or storage disabled. Treat it as "nothing stored":
    // the app checks more often than it needs to, which is harmless.
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do -- the state is a convenience, not data.
  }
}

export function markChecked(now: number = Date.now()): void {
  write(LAST_CHECK_KEY, String(now));
}

export function lastCheckedAt(): string | null {
  return read(LAST_CHECK_KEY);
}

export function dismissVersion(version: string): void {
  write(DISMISSED_KEY, version);
}

export function dismissedVersion(): string | null {
  return read(DISMISSED_KEY);
}

// -------------------------------------------------------------- the plugin

/**
 * The handle from the last successful check, kept so the install does not
 * have to ask again, and so it can be closed when it is replaced.
 */
let held: { update: unknown; info: AvailableUpdate } | null = null;
let inFlight: Promise<AvailableUpdate | null> | null = null;

type UpdateHandle = {
  version: string;
  body?: string;
  close: () => Promise<void>;
  downloadAndInstall: (
    onEvent?: (event: {
      event: "Started" | "Progress" | "Finished";
      data: { contentLength?: number; chunkLength?: number };
    }) => void,
  ) => Promise<void>;
};

async function releaseHeld(): Promise<void> {
  if (!held) return;
  const handle = held.update as UpdateHandle;
  held = null;
  try {
    await handle.close();
  } catch (err) {
    // A handle the backend already dropped. Nothing is broken by this.
    console.debug("updater: closing the previous handle failed:", err);
  }
}

/**
 * Asks the update server, or reuses the answer from this session.
 *
 * `force` is for the button in Settings: somebody pressing "check now"
 * means it, and an answer from six hours ago is not what they asked for.
 * The startup check passes `false` and respects {@link CHECK_INTERVAL_MS}.
 *
 * Returns null when the application is current, or when the updater is
 * not available at all -- a browser build, or a check that failed. The
 * caller that needs to tell those apart uses {@link checkForUpdateStrict}.
 */
export async function checkForUpdate(force: boolean): Promise<AvailableUpdate | null> {
  if (!force) {
    if (held) return held.info;
    if (!shouldCheck(lastCheckedAt(), Date.now())) return null;
  }
  try {
    return await checkForUpdateStrict();
  } catch (err) {
    console.debug("updater: check skipped:", err);
    return null;
  }
}

/**
 * Same check, but errors propagate -- Settings shows them, the startup
 * banner swallows them.
 */
export async function checkForUpdateStrict(): Promise<AvailableUpdate | null> {
  // Two callers arriving together share one round-trip.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    markChecked();

    await releaseHeld();
    if (!update) return null;

    const info: AvailableUpdate = {
      version: update.version,
      notes: update.body ?? "",
    };
    held = { update, info };
    return info;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * Downloads and installs the update found by the last check.
 *
 * Throws when there is no held handle: that means the caller skipped the
 * check, and installing "whatever is current now" is not what any button
 * in this application promises.
 */
export async function installHeldUpdate(
  onProgress: (percent: number) => void,
): Promise<void> {
  if (!held) throw new Error("No update has been checked for");
  const handle = held.update as UpdateHandle;

  let total = 0;
  let received = 0;
  await handle.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      received += event.data.chunkLength ?? 0;
      // Without a content length there is no percentage to report; the
      // caller shows an indeterminate bar rather than a stuck zero.
      if (total > 0) onProgress(Math.min(100, Math.round((received / total) * 100)));
    } else if (event.event === "Finished") {
      onProgress(100);
    }
  });
}

/** Whether the last check produced a content length, for the progress bar. */
export function hasHeldUpdate(): boolean {
  return held !== null;
}

/** Test seam: drops the held handle without touching the backend. */
export function resetForTests(): void {
  held = null;
  inFlight = null;
}
