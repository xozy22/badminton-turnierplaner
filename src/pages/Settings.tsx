import { useEffect, useState } from "react";
import Icon from "../components/ui/Icon";
import { loadSettings, saveSettings, syncSettingsFromDb, type AppSettings } from "../lib/appSettings";
import { isTauri } from "../lib/db";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/I18nContext";
import { useDocumentTitle } from "../lib/useDocumentTitle";
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
import { DatabaseSettings } from "./settings/DatabaseSettings";
import { Section } from "./settings/Section";

export default function Settings() {
  const { theme } = useTheme();
  const { t } = useT();
  useDocumentTitle(t.settings_title);
  // Values come from the database; the local mirror only bridges the first
  // render (REVIEW-BACKLOG.md C4).
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  useEffect(() => {
    syncSettingsFromDb().then(setSettings);
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  };


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
        <Section title={t.settings_updates} icon="refresh" defaultOpen={false}>
          <UpdateChecker />
        </Section>
      )}

      {/* ===== Language ===== */}
      <Section title={t.settings_language} icon="globe" defaultOpen={false}>
        <LanguageSelector />
      </Section>

      {/* ===== Design ===== */}
      <Section title={t.settings_design} icon="palette" defaultOpen={false}>
        <ThemeSelector />
        <FontFamilySelector />
        <FontSizeSelector />
        <LogoUploader />
      </Section>

      {/* ===== Voreinstellungen ===== */}
      <Section title={t.settings_defaults} icon="target" defaultOpen={false}>
        <div className="space-y-4">
          {/* Timer Thresholds — only remaining default since v2.8.2.
              The pre-v2.8 "default halls" picker was removed: every
              tournament now requires a venue, and halls come from there. */}
          <div>
            <label className={`block text-xs font-medium ${theme.textSecondary} mb-3 uppercase tracking-wide`}>
              <Icon name="clock" /> {t.settings_timer_thresholds}
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full bg-warning shrink-0"></span>
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
                    className={`w-20 ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-md px-3 py-2 text-sm text-center ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                  />
                  <span className="text-xs text-muted">{t.settings_timer_minutes}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full bg-danger shrink-0"></span>
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
                    className={`w-20 ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-md px-3 py-2 text-sm text-center ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
                  />
                  <span className="text-xs text-muted">{t.settings_timer_minutes}</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted mt-2">
              {t.settings_timer_hint}
            </div>
          </div>
        </div>
      </Section>

      {/* ===== Live-Veroeffentlichung ===== */}
      <Section title={t.settings_live_publish_section} icon="radio" defaultOpen={false}>
        <LivePublishSettings />
      </Section>

      <DatabaseSettings />

      {/* Credits */}
      <Section title={t.settings_credits} icon="medal" defaultOpen={false}>
        <div className="space-y-3">
          <div className={`rounded-md p-4 border ${theme.cardBorder} ${theme.cardBg}`}>
            <div className={`text-xs font-semibold uppercase tracking-wide ${theme.textMuted} mb-2`}>
              {t.settings_credits_idea_and_dev}
            </div>
            <div className={`text-sm font-medium ${theme.textPrimary}`}>Felix Blasshofer</div>
            <div className={`text-sm font-medium ${theme.textPrimary}`}>Dennis Kobiolka</div>
          </div>
        </div>
      </Section>

    </div>
  );
}
