// src/pages/settings/LivePublishSettings.tsx
//
// Connection to the WordPress plugin, plus the rolling push log.
// Extracted from the 1483-line Settings page (REVIEW-BACKLOG.md D5).

import { useEffect, useState } from "react";
import { usePolling } from "../../lib/usePolling";
import { getAppSetting, setAppSetting } from "../../lib/db";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/I18nContext";
import { useToast } from "../../lib/ToastContext";
import type { LivePublishConfig } from "../../lib/types";
import {
  LIVE_PUBLISH_SETTING_KEY,
  testConnection,
  getPushLog,
  clearPushLog,
  type PushLogEntry,
} from "../../lib/livePublish";
import { usePushStatuses } from "../../lib/useLivePublisher";

export function LivePublishSettings() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showSuccess, showError } = useToast();
  const statuses = usePushStatuses();

  const [config, setConfig] = useState<LivePublishConfig>({
    endpoint: "",
    secret: "",
  });
  const [showSecret, setShowSecret] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing config on mount.
  useEffect(() => {
    (async () => {
      try {
        const raw = await getAppSetting(LIVE_PUBLISH_SETTING_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as LivePublishConfig;
          setConfig({
            endpoint: parsed.endpoint ?? "",
            secret: parsed.secret ?? "",
            lastPushAt: parsed.lastPushAt,
            lastError: parsed.lastError,
          });
        }
      } catch (err) {
        console.error("LivePublishSettings: load failed:", err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Strip transient diagnostic fields before persisting; LivePublisherHost
      // will write fresh lastPushAt/lastError on its own.
      const toSave: LivePublishConfig = {
        endpoint: config.endpoint.trim(),
        secret: config.secret,
      };
      if (config.lastPushAt) toSave.lastPushAt = config.lastPushAt;
      if (config.lastError) toSave.lastError = config.lastError;
      await setAppSetting(LIVE_PUBLISH_SETTING_KEY, JSON.stringify(toSave));
      showSuccess(t.settings_live_publish_saved);
    } catch (err) {
      showError(`${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.endpoint || !config.secret) {
      showError(t.settings_live_publish_test_fail.replace("{error}", "URL/Secret"));
      return;
    }
    setTesting(true);
    try {
      const result = await testConnection(config.endpoint.trim(), config.secret);
      if (result.ok) {
        showSuccess(t.settings_live_publish_test_ok);
      } else {
        showError(t.settings_live_publish_test_fail.replace("{error}", result.error));
      }
    } catch (err) {
      showError(t.settings_live_publish_test_fail.replace("{error}", String(err)));
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) {
    return <div className={`text-sm ${theme.textMuted}`}>{t.common_loading}</div>;
  }

  // Aggregate per-tournament status badges.
  const okCount = statuses.filter((s) => s.lastError === null).length;
  const errCount = statuses.filter((s) => s.lastError !== null).length;

  const configured = !!config.endpoint && !!config.secret;

  return (
    <div className="space-y-4">
      {/* Help text */}
      <div className={`text-xs ${theme.textMuted} leading-relaxed`}>
        {t.settings_live_publish_help}
      </div>

      {/* Endpoint URL */}
      <div>
        <label className={`block text-xs font-medium ${theme.textSecondary} mb-1.5 uppercase tracking-wide`}>
          {t.settings_live_publish_url}
        </label>
        <input
          type="url"
          value={config.endpoint}
          onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
          placeholder={t.settings_live_publish_url_placeholder}
          className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-3 py-2 text-sm font-mono ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
        />
      </div>

      {/* Secret */}
      <div>
        <label className={`block text-xs font-medium ${theme.textSecondary} mb-1.5 uppercase tracking-wide`}>
          {t.settings_live_publish_secret}
        </label>
        <div className="flex gap-2">
          <input
            type={showSecret ? "text" : "password"}
            value={config.secret}
            onChange={(e) => setConfig({ ...config, secret: e.target.value })}
            placeholder={t.settings_live_publish_secret_placeholder}
            className={`flex-1 ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-3 py-2 text-sm font-mono ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-3 py-2 rounded-xl hover:opacity-80 transition-all text-xs font-medium`}
          >
            {showSecret ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      {/* Save + Test buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`${theme.primaryBg} text-white px-4 py-2 rounded-xl ${theme.primaryHoverBg} shadow-sm transition-all text-sm font-medium disabled:opacity-50`}
        >
          {saving ? `⏳ ${t.common_loading}` : t.settings_live_publish_save}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !config.endpoint || !config.secret}
          className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2 rounded-xl hover:opacity-80 transition-all text-sm font-medium disabled:opacity-50`}
        >
          {testing ? `⏳ ${t.common_loading}` : `🔌 ${t.settings_live_publish_test}`}
        </button>
      </div>

      {/* Status section — shown once a connection is configured. Whether
          any tournament is being pushed depends on per-tournament opt-in
          via TournamentView, not a global toggle. */}
      {configured && (
        <div className={`pt-3 border-t ${theme.cardBorder}`}>
          <div className={`text-xs font-medium ${theme.textSecondary} mb-2 uppercase tracking-wide`}>
            Status
          </div>
          <div className={`text-sm ${theme.textPrimary} mb-1`}>
            {t.settings_live_publish_status_running}
          </div>
          {statuses.length > 0 ? (
            <div className={`text-xs ${theme.textSecondary} mb-2`}>
              {okCount > 0 && <span className="text-emerald-600">✓ {okCount} OK</span>}
              {okCount > 0 && errCount > 0 && <span> / </span>}
              {errCount > 0 && <span className="text-danger-text">✗ {errCount} Fehler</span>}
            </div>
          ) : (
            <div className={`text-xs ${theme.textMuted}`}>
              {t.settings_live_publish_no_tournaments}
            </div>
          )}
          <ul className="space-y-1 mt-2">
            {statuses.map((s) => (
              <li key={s.tournamentId} className={`text-xs ${theme.textSecondary} font-mono flex items-center gap-2`}>
                <span className={s.lastError ? "text-danger-text" : "text-emerald-600"}>
                  {s.lastError ? "✗" : "✓"}
                </span>
                <span className="flex-1">{s.tournamentName}</span>
                <span className={theme.textMuted}>
                  {s.lastError
                    ? s.lastError
                    : s.lastPushAt
                    ? new Date(s.lastPushAt).toLocaleTimeString()
                    : "…"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {config.lastPushAt && !configured && (
        <div className={`text-xs ${theme.textMuted}`}>
          {t.settings_live_publish_last_push}: {new Date(config.lastPushAt).toLocaleString()}
        </div>
      )}

      {/* Rolling push log — last N attempts (success + failure). Helps
          diagnose connection drops, intermittent errors, or spotting
          when the last manual push really went through. */}
      {configured && <PushLogPanel />}
    </div>
  );
}

/**
 * Settings panel showing the rolling push log. Self-loading on mount and
 * after a clear, refreshes every 5s so new entries surface without manual
 * reload. Default-collapsed to ~10 entries to keep the Settings section
 * compact; "Show all" expands to the full LIVE_PUBLISH_LOG_MAX entries.
 */
export function PushLogPanel() {
  const { theme } = useTheme();
  const { t } = useT();
  const [entries, setEntries] = useState<PushLogEntry[]>([]);
  const [showAll, setShowAll] = useState(false);

  usePolling(
    async (cancelled) => {
      const list = await getPushLog();
      if (cancelled()) return;
      setEntries(list);
    },
    { intervalMs: 5000, label: "PushLogPanel" },
  );

  const handleClear = async () => {
    await clearPushLog();
    setEntries([]);
  };

  const reasonLabel = (r: PushLogEntry["reason"]): string => {
    if (r === "manual") return t.settings_live_publish_log_reason_manual;
    if (r === "final") return t.settings_live_publish_log_reason_final;
    if (r === "heartbeat") return t.settings_live_publish_log_reason_heartbeat;
    if (r === "delete") return t.tournament_unpublish_done;
    return t.settings_live_publish_log_reason_event;
  };

  const visible = showAll ? entries : entries.slice(0, 10);

  return (
    <div className={`pt-3 border-t ${theme.cardBorder}`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`text-xs font-medium ${theme.textSecondary} uppercase tracking-wide`}>
          {t.settings_live_publish_log_title}
          {entries.length > 0 && (
            <span className={`ml-2 font-normal ${theme.textMuted}`}>({entries.length})</span>
          )}
        </div>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            className={`text-[11px] ${theme.textMuted} hover:text-danger-text transition-colors`}
          >
            {t.settings_live_publish_log_clear}
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className={`text-xs ${theme.textMuted}`}>
          {t.settings_live_publish_log_empty}
        </div>
      ) : (
        <>
          <div className={`${theme.cardBg} rounded-xl border ${theme.cardBorder} overflow-hidden`}>
            <table className="w-full text-[11px]">
              <thead>
                <tr className={`border-b ${theme.cardBorder}`}>
                  <th className={`px-2 py-1.5 text-left font-medium ${theme.textMuted} uppercase tracking-wide`}>Zeit</th>
                  <th className={`px-2 py-1.5 text-left font-medium ${theme.textMuted} uppercase tracking-wide`}>Turnier</th>
                  <th className={`px-2 py-1.5 text-left font-medium ${theme.textMuted} uppercase tracking-wide`}>Typ</th>
                  <th className={`px-2 py-1.5 text-right font-medium ${theme.textMuted} uppercase tracking-wide`}>Status</th>
                  <th className={`px-2 py-1.5 text-right font-medium ${theme.textMuted} uppercase tracking-wide`}>ms</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e, i) => (
                  <tr key={`${e.ts}-${i}`} className={`border-b ${theme.cardBorder} last:border-0`}>
                    <td className={`px-2 py-1 font-mono ${theme.textSecondary}`}>
                      {new Date(e.ts).toLocaleTimeString()}
                    </td>
                    <td className={`px-2 py-1 ${theme.textPrimary} truncate max-w-[180px]`} title={e.tournamentName}>
                      {e.tournamentName}
                    </td>
                    <td className={`px-2 py-1 ${theme.textMuted}`}>
                      {reasonLabel(e.reason)}
                    </td>
                    <td className={`px-2 py-1 text-right font-mono`}>
                      {e.ok ? (
                        <span className="text-emerald-600">✓ {e.status ?? ""}</span>
                      ) : (
                        <span className="text-danger-text" title={e.error}>
                          ✗ {(e.error ?? "").slice(0, 30)}
                        </span>
                      )}
                    </td>
                    <td className={`px-2 py-1 text-right font-mono ${theme.textMuted}`}>
                      {e.durationMs}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length > 10 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className={`mt-2 text-[11px] ${theme.textMuted} hover:opacity-80`}
            >
              {showAll
                ? t.settings_live_publish_log_collapse
                : `${t.settings_live_publish_log_show_all} (${entries.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

