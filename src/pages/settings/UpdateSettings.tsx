// src/pages/settings/UpdateSettings.tsx
//
// Checks for and installs application updates.
// Extracted from the 1483-line Settings page (REVIEW-BACKLOG.md D5).

import { useState } from "react";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/I18nContext";

export function UpdateChecker() {
  const { theme } = useTheme();
  const { t } = useT();
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; notes: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "uptodate" | "available" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const currentVersion = __APP_VERSION__;

  const checkForUpdates = async () => {
    setChecking(true);
    setStatus("idle");
    setErrorMsg("");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setUpdateInfo({ version: update.version, notes: update.body || "" });
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
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const update = await check();
      if (!update) return;

      let totalBytes = 0;
      let downloadedBytes = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgress(Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));
          }
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });

      // Restart after install
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
          <div className="text-xs text-gray-400 mt-0.5">
            {t.settings_check_updates_hint}
          </div>
        </div>
        <button
          onClick={checkForUpdates}
          disabled={checking || downloading}
          className={`${theme.primaryBg} text-white px-4 py-2 rounded-xl ${theme.primaryHoverBg} shadow-sm transition-all text-sm font-medium disabled:opacity-50`}
        >
          {checking ? t.settings_checking : `🔄 ${t.settings_check_updates}`}
        </button>
      </div>

      {status === "uptodate" && (
        <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl px-4 py-3 text-sm">
          ✅ {t.settings_up_to_date.replace("{version}", currentVersion)}
        </div>
      )}

      {status === "available" && updateInfo && (
        <div className={`${theme.cardBg} border ${theme.cardBorder} rounded-xl p-4`}>
          <div className={`text-sm font-semibold ${theme.textPrimary} mb-1`}>
            🎉 {t.settings_new_version.replace("{version}", "")} <span className="font-mono">{updateInfo.version}</span>
          </div>
          {updateInfo.notes && (
            <div className={`text-xs ${theme.textSecondary} mb-3 whitespace-pre-line max-h-32 overflow-y-auto`}>
              {updateInfo.notes}
            </div>
          )}
          {downloading ? (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-gray-500">{progress}%</span>
              </div>
              <div className="text-xs text-gray-400">
                {t.settings_downloading}
              </div>
            </div>
          ) : (
            <button
              onClick={installUpdate}
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 shadow-sm transition-all text-sm font-medium"
            >
              ⬇️ {t.settings_install_update}
            </button>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-xl px-4 py-3 text-sm">
          ❌ {errorMsg || t.settings_update_failed}
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
