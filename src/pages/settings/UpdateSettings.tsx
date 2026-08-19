// src/pages/settings/UpdateSettings.tsx
//
// Checks for and installs application updates.
// Extracted from the 1483-line Settings page (REVIEW-BACKLOG.md D5).

import { useState } from "react";
import Icon from "../../components/ui/Icon";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/I18nContext";
import { fill } from "../../lib/i18n/format";
import Markdown from "../../components/ui/Markdown";
import { checkForUpdateStrict, installHeldUpdate, type AvailableUpdate } from "../../lib/updater";

export function UpdateChecker() {
  const { theme } = useTheme();
  const { t } = useT();
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<AvailableUpdate | null>(null);
  const [status, setStatus] = useState<"idle" | "uptodate" | "available" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const currentVersion = __APP_VERSION__;

  const checkForUpdates = async () => {
    setChecking(true);
    setStatus("idle");
    setErrorMsg("");
    try {
      // `true`: somebody pressing "check now" means it, and an answer
      // cached from this morning is not what they asked for.
      const update = await checkForUpdateStrict();
      if (update) {
        setUpdateInfo(update);
        setStatus("available");
      } else {
        setStatus("uptodate");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async () => {
    setDownloading(true);
    setProgress(0);
    try {
      // The handle from the check above is reused. Asking again would be
      // a second round-trip, and the feed could have moved on between the
      // version shown in this panel and the one actually installed.
      await installHeldUpdate(setProgress);
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      setStatus("error");
      setErrorMsg(`${t.settings_update_failed}: ${err}`);
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className={`text-sm font-medium ${theme.textPrimary}`}>
            {t.settings_current_version} <span className="font-mono">{currentVersion}</span>
          </div>
          <div className="text-xs text-muted mt-0.5">
            {t.settings_check_updates_hint}
          </div>
        </div>
        <button
          onClick={checkForUpdates}
          disabled={checking || downloading}
          className={`${theme.primaryBg} text-white px-4 py-2 rounded-md ${theme.primaryHoverBg} shadow-sm transition-all text-sm font-medium disabled:opacity-50`}
        >
          {checking ? (
            t.settings_checking
          ) : (
            <>
              <Icon name="refresh" /> {t.settings_check_updates}
            </>
          )}
        </button>
      </div>

      {status === "uptodate" && (
        <div className="bg-success-subtle text-success-text border border-success rounded-md px-4 py-3 text-sm">
          <Icon name="check" /> {fill(t.settings_up_to_date, { version: currentVersion })}
        </div>
      )}

      {status === "available" && updateInfo && (
        <div className={`${theme.cardBg} border ${theme.cardBorder} rounded-md p-4`}>
          <div className={`text-sm font-semibold ${theme.textPrimary} mb-1`}>
            <span aria-hidden="true"><Icon name="party" /></span>{" "}
            {fill(t.settings_new_version, { version: "" }).trim()}{" "}
            <span className="font-mono">{updateInfo.version}</span>
          </div>
          {updateInfo.notes && (
            <div className="mb-3 max-h-48 overflow-y-auto">
              <Markdown source={updateInfo.notes} />
            </div>
          )}
          {downloading ? (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-2 bg-line-strong rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-muted">{progress}%</span>
              </div>
              <div className="text-xs text-muted">
                {t.settings_downloading}
              </div>
            </div>
          ) : (
            <button
              onClick={installUpdate}
              className="rounded-md bg-success px-4 py-2 text-sm font-medium text-success-fg shadow-sm transition-all hover:opacity-90"
            >
              <span aria-hidden="true"><Icon name="download" /></span> {t.settings_install_update}
            </button>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="bg-danger-subtle text-danger-text border border-danger rounded-md px-4 py-3 text-sm">
          <span aria-hidden="true"><Icon name="x" /></span> {errorMsg || t.settings_update_failed}
        </div>
      )}
    </div>
  );
}

/**
 * Live-Publishing settings — toggles outbound HTTP push to a WordPress
 * site running the BOSS Live Results plugin. Lives in app_settings (not
 * localStorage) because LivePublisherHost reads it from there.
 */
