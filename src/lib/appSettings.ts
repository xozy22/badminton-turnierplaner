// src/lib/appSettings.ts
//
// One home for the user's preferences.
//
// They used to live in two places: timer thresholds, theme, language and the
// logo cache in `localStorage`, live-publish configuration and logo in the
// `app_settings` table. A database backup therefore captured half the
// configuration, and restoring it on another machine silently lost the rest
// (REVIEW-BACKLOG.md C4).
//
// Everything now lives in `app_settings`. `localStorage` keeps a synchronous
// mirror, because theme and language are needed during the very first render
// — before any async read could return — and because it is where the values
// used to be, so existing installations migrate themselves on first load.

import { getAppSetting, setAppSetting } from "./db";

export const SETTINGS_KEY = "turnierplaner_settings";

export interface AppSettings {
  /** Court timer turns amber after this many minutes. */
  timerWarningMin: number;
  /** Court timer turns red after this many minutes. */
  timerDangerMin: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  timerWarningMin: 20,
  timerDangerMin: 30,
};

function coerce(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const value = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
  return {
    timerWarningMin: num(value.timerWarningMin, DEFAULT_SETTINGS.timerWarningMin),
    timerDangerMin: num(value.timerDangerMin, DEFAULT_SETTINGS.timerDangerMin),
  };
}

/**
 * Synchronous read from the local mirror. Used by components that need a
 * value while rendering (the court timer colours, for instance).
 */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? coerce(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch (err) {
    console.error("loadSettings: failed to read the local mirror:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

/** Writes to the database and refreshes the local mirror. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  const serialized = JSON.stringify(settings);
  try {
    localStorage.setItem(SETTINGS_KEY, serialized);
  } catch (err) {
    console.error("saveSettings: failed to update the local mirror:", err);
  }
  await setAppSetting(SETTINGS_KEY, serialized);
}

/**
 * Reads the authoritative copy from the database and refreshes the mirror.
 * On first run after the change the database has no entry yet, so whatever
 * is in `localStorage` is adopted and written through — that is the
 * migration path for existing installations.
 */
export async function syncSettingsFromDb(): Promise<AppSettings> {
  try {
    const stored = await getAppSetting(SETTINGS_KEY);
    if (stored) {
      const settings = coerce(JSON.parse(stored));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return settings;
    }
    // Nothing in the database yet: adopt the local values and persist them.
    const local = loadSettings();
    await saveSettings(local);
    return local;
  } catch (err) {
    console.error("syncSettingsFromDb: falling back to the local mirror:", err);
    return loadSettings();
  }
}
