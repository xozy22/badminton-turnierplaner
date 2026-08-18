import { useEffect, useState } from "react";
import { loadSettings, saveSettings, syncSettingsFromDb, type AppSettings } from "../lib/appSettings";
import { wipeAllPlayers, wipeAllTournaments, wipeEntireDatabase, isTauri } from "../lib/db";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/I18nContext";
import { useToast } from "../lib/ToastContext";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useAsyncAction } from "../lib/useAsyncAction";
// One file per concern since the page passed 1400 lines (D5).
import { LogoUploader } from "./settings/LogoSettings";
import {
  ThemeSelector,
  LanguageSelector,
  FontFamilySelector,
  FontSizeSelector,
} from "./settings/AppearanceSettings";
import { UpdateChecker } from "./settings/UpdateSettings";
import { LivePublishSettings } from "./settings/LivePublishSettings";

type ConfirmTarget = "players" | "tournaments" | "wipe" | null;

// Collapsible Section Component
function Section({
  title,
  icon,
  children,
  defaultOpen = false,
  borderColor,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  borderColor?: string;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const border = borderColor || theme.cardBorder;
  return (
    <div className={`${theme.cardBg} rounded-2xl shadow-sm border ${border} overflow-hidden mb-4`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full px-6 py-4 flex items-center justify-between text-left hover:opacity-80 transition-colors`}
      >
        <span className={`font-semibold ${theme.textPrimary}`}>
          {icon} {title}
        </span>
        <span
          className={`${theme.textMuted} transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      {open && <div className={`px-6 pb-5 border-t ${theme.cardBorder} pt-4`}>{children}</div>}
    </div>
  );
}

export default function Settings() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showSuccess, showError } = useToast();
  useDocumentTitle(t.settings_title);
  const [dbPath, setDbPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [confirmText, setConfirmText] = useState("");
  // Values come from the database; the local mirror only bridges the first
  // render (REVIEW-BACKLOG.md C4).
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  useEffect(() => {
    syncSettingsFromDb().then(setSettings);
  }, []);

  useEffect(() => {
    loadDbPath();
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  };

  const loadDbPath = async () => {
    if (!isTauri()) {
      setDbPath(t.settings_db_browser_mode);
      setLoading(false);
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("get_db_path");
      setDbPath(path);
    } catch (err) {
      console.error("Settings: failed to load DB path:", err);
      setDbPath(t.settings_db_path_error);
    }
    setLoading(false);
  };

  const handleOpenFolder = async () => {
    if (!isTauri()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const dir = await invoke<string>("get_db_dir");
      await invoke("open_folder", { path: dir });
    } catch (err) {
      showError(`${err}`);
    }
  };

  const handleChangeDir = async () => {
    if (!isTauri()) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: t.settings_db_choose_title,
      });
      if (!selected) return;
      setChanging(true);
      const { invoke } = await import("@tauri-apps/api/core");
      // Feedback vor dem Aufruf: der Prozess wird durch den Neustart
      // beendet, danach laeuft hier nichts mehr.
      showSuccess(t.settings_db_copied_message);
      await invoke("change_db_dir", { newDir: selected });
    } catch (err) {
      showError(`${err}`);
      setChanging(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!isTauri()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      // Der Speicherort wird beim Neustart umgestellt - solange die
      // Verbindung offen ist, schreibt die App weiter in die alte Datei.
      showSuccess(t.settings_db_reset_message);
      await invoke("reset_db_dir");
    } catch (err) {
      showError(`${err}`);
    }
  };

  const handleBackup = async () => {
    if (!isTauri()) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { invoke } = await import("@tauri-apps/api/core");
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
      const path = await save({
        defaultPath: `turnierplaner_backup_${stamp}.db`,
        filters: [
          { name: "SQLite Datenbank (*.db)", extensions: ["db"] },
          { name: "Alle Dateien (*.*)", extensions: ["*"] },
        ],
      });
      if (!path) return;
      await invoke("backup_db", { targetPath: path });
      showSuccess(t.settings_backup_success);
    } catch (err) {
      showError(`${err}`);
    }
  };

  const handleRestore = async () => {
    if (!isTauri()) return;
    try {
      const { open, ask } = await import("@tauri-apps/plugin-dialog");
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await open({
        multiple: false,
        filters: [
          { name: "SQLite Datenbank (*.db)", extensions: ["db"] },
          { name: "Alle Dateien (*.*)", extensions: ["*"] },
        ],
        title: t.settings_backup_restore,
      });
      if (!selected) return;
      const confirmed = await ask(
        t.settings_backup_restore_confirm,
        { title: t.settings_backup_restore, kind: "warning", okLabel: t.settings_backup_restore, cancelLabel: t.common_cancel }
      );
      if (!confirmed) return;
      showSuccess(t.settings_backup_restored);
      await invoke("restore_db", { sourcePath: selected });
    } catch (err) {
      showError(`${err}`);
    }
  };

  const [handleWipeConfirm, wiping] = useAsyncAction(async () => {
    if (!confirmTarget) return;
    try {
      if (confirmTarget === "players") {
        await wipeAllPlayers();
        showSuccess(t.settings_players_deleted);
      } else if (confirmTarget === "tournaments") {
        await wipeAllTournaments();
        showSuccess(t.settings_tournaments_deleted);
      } else if (confirmTarget === "wipe") {
        // Feedback BEFORE the invoke: in Tauri terminiert der Prozess während wipeEntireDatabase(),
        // ein showSuccess danach würde nie ausgeführt werden.
        showSuccess(isTauri() ? t.settings_wipe_restarting : t.settings_wipe_success);
        setConfirmTarget(null);
        setConfirmText("");
        await wipeEntireDatabase();
        return;
      }
    } catch (err) {
      showError(`${err}`);
    }
    setConfirmTarget(null);
    setConfirmText("");
  });

  const CONFIRM_WORD = confirmTarget === "players" ? t.settings_confirm_word_players : confirmTarget === "wipe" ? t.settings_confirm_word_wipe : t.settings_confirm_word_tournaments;

  if (loading) return <div>{t.common_loading}</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className={`text-2xl font-extrabold ${theme.textPrimary} tracking-tight`}>
          {t.settings_title}
        </h1>
        <p className={`text-sm ${theme.textSecondary} mt-0.5`}>
          {t.settings_subtitle}
        </p>
      </div>

      {/* ===== Updates ===== */}
      {isTauri() && (
        <Section title={t.settings_updates} icon="🔄" defaultOpen={false}>
          <UpdateChecker />
        </Section>
      )}

      {/* ===== Language ===== */}
      <Section title={t.settings_language} icon="🌐" defaultOpen={false}>
        <LanguageSelector />
      </Section>

      {/* ===== Design ===== */}
      <Section title={t.settings_design} icon="🎨" defaultOpen={false}>
        <ThemeSelector />
        <FontFamilySelector />
        <FontSizeSelector />
        <LogoUploader />
      </Section>

      {/* ===== Voreinstellungen ===== */}
      <Section title={t.settings_defaults} icon="🎯" defaultOpen={false}>
        <div className="space-y-4">
          {/* Timer Thresholds — only remaining default since v2.8.2.
              The pre-v2.8 "default halls" picker was removed: every
              tournament now requires a venue, and halls come from there. */}
          <div>
            <label className={`block text-xs font-medium ${theme.textSecondary} mb-3 uppercase tracking-wide`}>
              ⏱ {t.settings_timer_thresholds}
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0"></span>
                  <span className={`text-xs font-medium ${theme.textSecondary}`}>{t.settings_timer_warning}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={settings.timerWarningMin}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 20;
                      updateSetting("timerWarningMin", val);
                      if (val >= settings.timerDangerMin) updateSetting("timerDangerMin", val + 5);
                    }}
                    className={`w-20 ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-3 py-2 text-sm text-center ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                  />
                  <span className="text-xs text-gray-400">{t.settings_timer_minutes}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0"></span>
                  <span className={`text-xs font-medium ${theme.textSecondary}`}>{t.settings_timer_critical}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={settings.timerDangerMin}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 30;
                      updateSetting("timerDangerMin", val);
                      if (val <= settings.timerWarningMin) updateSetting("timerWarningMin", Math.max(1, val - 5));
                    }}
                    className={`w-20 ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-3 py-2 text-sm text-center ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                  />
                  <span className="text-xs text-gray-400">{t.settings_timer_minutes}</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-2">
              {t.settings_timer_hint}
            </div>
          </div>
        </div>
      </Section>

      {/* ===== Live-Veroeffentlichung ===== */}
      <Section title={t.settings_live_publish_section} icon="📡" defaultOpen={false}>
        <LivePublishSettings />
      </Section>

      {/* ===== Datenbank ===== */}
      <Section title={t.settings_database} icon="💾">
        {/* Speicherort */}
        <div className="mb-5">
          <h3 className={`text-sm font-medium ${theme.textPrimary} mb-2`}>{t.settings_db_location}</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={dbPath}
              readOnly
              className={`flex-1 border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm ${theme.inputBg} ${theme.textSecondary} font-mono select-all outline-none`}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            {isTauri() && (
              <button
                onClick={handleOpenFolder}
                className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl ${theme.cardHoverBorder} hover:shadow-sm transition-all text-sm font-medium whitespace-nowrap`}
              >
                📂 {t.settings_db_open}
              </button>
            )}
          </div>
          {isTauri() && (
            <div className="flex gap-2">
              <button
                onClick={handleChangeDir}
                disabled={changing}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 shadow-sm transition-all text-sm font-medium disabled:bg-gray-300"
              >
                {changing ? t.settings_db_changing : `📁 ${t.settings_db_change}`}
              </button>
              <button
                onClick={handleResetToDefault}
                className={`${theme.textMuted} hover:opacity-80 px-4 py-2 rounded-xl text-sm transition-colors`}
              >
                {t.settings_db_reset_default}
              </button>
            </div>
          )}
        </div>

        {/* Backup & Restore */}
        {isTauri() && (
          <div className={`mb-5 pt-4 border-t ${theme.cardBorder}`}>
            <h3 className={`text-sm font-medium ${theme.textPrimary} mb-2`}>
              {t.settings_backup_title}
            </h3>
            <div className="flex gap-3 mb-2">
              <button
                onClick={handleBackup}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 shadow-sm transition-all text-sm font-medium"
              >
                💾 {t.settings_backup_create}
              </button>
              <button
                onClick={handleRestore}
                className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2 rounded-xl hover:border-amber-300 hover:text-amber-700 transition-all text-sm font-medium`}
              >
                📥 {t.settings_backup_restore}
              </button>
            </div>
            <div className="text-xs text-gray-400 leading-relaxed">
              {t.settings_backup_hint}
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className={`pt-4 border-t ${theme.cardBorder}`}>
          <h3 className="text-sm font-medium text-rose-600 mb-3">
            {t.settings_danger_zone}
          </h3>
          <div className="space-y-2">
            <div className={`flex items-center justify-between bg-rose-500/10 rounded-xl p-3 border border-rose-500/20`}>
              <div>
                <div className={`text-sm font-medium ${theme.textPrimary}`}>{t.settings_delete_all_players}</div>
                <div className="text-xs text-gray-400">{t.settings_delete_all_players_hint}</div>
              </div>
              <button
                onClick={() => { setConfirmTarget("players"); setConfirmText(""); }}
                className={`${theme.cardBg} border border-rose-500/30 text-rose-500 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition-all text-xs font-medium whitespace-nowrap ml-3`}
              >
                {t.common_delete}
              </button>
            </div>
            <div className={`flex items-center justify-between bg-rose-500/10 rounded-xl p-3 border border-rose-500/20`}>
              <div>
                <div className={`text-sm font-medium ${theme.textPrimary}`}>{t.settings_delete_all_tournaments}</div>
                <div className="text-xs text-gray-400">{t.settings_delete_all_tournaments_hint}</div>
              </div>
              <button
                onClick={() => { setConfirmTarget("tournaments"); setConfirmText(""); }}
                className={`${theme.cardBg} border border-rose-500/30 text-rose-500 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition-all text-xs font-medium whitespace-nowrap ml-3`}
              >
                {t.common_delete}
              </button>
            </div>
            <div className={`flex items-center justify-between bg-rose-500/20 rounded-xl p-3 border border-rose-500/30`}>
              <div>
                <div className={`text-sm font-medium text-rose-600`}>{t.settings_wipe_database}</div>
                <div className="text-xs text-rose-400">{t.settings_wipe_database_hint}</div>
              </div>
              <button
                onClick={() => { setConfirmTarget("wipe"); setConfirmText(""); }}
                className="bg-rose-600 text-white px-3 py-1.5 rounded-lg hover:bg-rose-700 transition-all text-xs font-medium whitespace-nowrap ml-3"
              >
                RESET
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* Credits */}
      <Section title={t.settings_credits} icon="🏅" defaultOpen={false}>
        <div className="space-y-3">
          <div className={`rounded-xl p-4 border ${theme.cardBorder} ${theme.cardBg}`}>
            <div className={`text-xs font-semibold uppercase tracking-wide ${theme.textMuted} mb-2`}>
              {t.settings_credits_idea_and_dev}
            </div>
            <div className={`text-sm font-medium ${theme.textPrimary}`}>Felix Blasshofer</div>
            <div className={`text-sm font-medium ${theme.textPrimary}`}>Dennis Kobiolka</div>
          </div>
        </div>
      </Section>

      {/* Confirmation Modal */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`${theme.cardBg} rounded-2xl shadow-2xl w-full max-w-md p-6 border ${theme.cardBorder}`}>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className={`text-lg font-bold ${theme.textPrimary}`}>{t.settings_confirm_title}</h3>
              <p className={`text-sm ${theme.textSecondary} mt-2`}>
                {confirmTarget === "players"
                  ? t.settings_confirm_players
                  : confirmTarget === "wipe"
                  ? t.settings_confirm_wipe
                  : t.settings_confirm_tournaments}
              </p>
            </div>
            <div className="mb-5">
              <label className={`block text-xs font-medium ${theme.textSecondary} mb-1.5`}>
                {t.common_confirm_type.replace("{word}", "").trim()} <span className="font-bold text-rose-600">{CONFIRM_WORD}</span>
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-xl px-4 py-2.5 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-center font-mono tracking-widest`}
                placeholder={CONFIRM_WORD}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmTarget(null); setConfirmText(""); }}
                className={`flex-1 ${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2.5 rounded-xl hover:opacity-80 transition-all text-sm font-medium`}
              >
                {t.common_cancel}
              </button>
              <button
                onClick={handleWipeConfirm}
                disabled={confirmText !== CONFIRM_WORD || wiping}
                className="flex-1 bg-rose-600 text-white px-4 py-2.5 rounded-xl hover:bg-rose-700 transition-all text-sm font-medium disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {wiping ? `⏳ ${t.common_loading}` : t.common_delete_permanently}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
