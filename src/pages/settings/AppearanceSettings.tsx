// src/pages/settings/AppearanceSettings.tsx
//
// Theme, language, font family and font size.
// Extracted from the 1483-line Settings page (REVIEW-BACKLOG.md D5).

import { useTheme } from "../../lib/ThemeContext";
import Icon from "../../components/ui/Icon";
import { useT } from "../../lib/I18nContext";
import type { Lang } from "../../lib/I18nContext";
import {
  THEMES,
  type ThemeId,
  FONT_SIZES,
  type FontSizeId,
  FONT_FAMILIES,
  type FontFamilyId,
} from "../../lib/theme";

export function ThemeSelector() {
  const { themeId, theme, setThemeId } = useTheme();
  const { t } = useT();

  return (
    <div>
      <label className={`block text-xs font-medium ${theme.textSecondary} mb-3 uppercase tracking-wide`}>
        {t.settings_color_scheme}
      </label>
      <div className="grid grid-cols-2 gap-3">
        {(Object.entries(THEMES) as [ThemeId, typeof THEMES[ThemeId]][]).map(
          ([id, { label, preview }]) => {
            const isActive = themeId === id;
            const isDarkTheme = id === "dark";
            return (
              <button
                key={id}
                onClick={() => setThemeId(id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all duration-200 ${
                  isActive
                    ? "shadow-lg"
                    : `${theme.inputBorder} hover:opacity-80 hover:shadow-sm`
                }`}
                style={isActive ? { borderColor: id === "dark" ? "#10b981" : preview, boxShadow: `0 0 0 3px ${id === "dark" ? "#10b981" : preview}40, 0 0 12px ${id === "dark" ? "#10b981" : preview}20` } : {}}
              >
                {/* Color swatch */}
                <div
                  className="w-10 h-10 rounded-xl shrink-0 shadow-inner flex items-center justify-center"
                  style={{ background: isDarkTheme ? `linear-gradient(135deg, #111827, #1f2937)` : `linear-gradient(135deg, ${preview}, ${preview}dd)` }}
                >
                  {isDarkTheme && <span className="text-lg">🌙</span>}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${theme.textPrimary}`}>
                    {label}
                  </div>
                  <div className={`text-[10px] ${theme.textMuted} uppercase tracking-wide mt-0.5`}>
                    {id === "green" ? t.theme_emerald : id === "blue" ? t.theme_sapphire : id === "orange" ? t.theme_amber : t.theme_night}
                  </div>
                </div>
                {isActive && (
                  <span className="ml-auto text-sm font-bold" style={{ color: id === "dark" ? "#10b981" : preview }}>
                    <Icon name="check" />
                  </span>
                )}
              </button>
            );
          }
        )}
      </div>
    </div>
  );
}

export function LanguageSelector() {
  const { theme } = useTheme();
  const { t, lang, setLang } = useT();

  const LANGS: { id: Lang; label: string }[] = [
    { id: "en", label: "English" },
    { id: "de", label: "Deutsch" },
  ];

  return (
    <div className="mt-5">
      <label className={`block text-xs font-medium ${theme.textSecondary} mb-3 uppercase tracking-wide`}>
        {t.settings_language}
      </label>
      <div className="flex gap-2">
        {LANGS.map(({ id, label }) => {
          const isActive = lang === id;
          return (
            <button
              key={id}
              onClick={() => setLang(id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border-2 ${
                isActive
                  ? `${theme.roundActiveBg} ${theme.roundActiveText} border-transparent shadow-md`
                  : `${theme.cardBg} ${theme.textSecondary} ${theme.inputBorder} hover:opacity-80`
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FontFamilySelector() {
  const { fontFamilyId, theme, setFontFamily } = useTheme();
  const { t } = useT();

  return (
    <div className="mt-5">
      <label className={`block text-xs font-medium ${theme.textSecondary} mb-3 uppercase tracking-wide`}>
        {t.settings_font_family}
      </label>
      <div className="flex gap-2">
        {(Object.entries(FONT_FAMILIES) as [FontFamilyId, typeof FONT_FAMILIES[FontFamilyId]][]).map(
          ([id, { label, family }]) => {
            const isActive = fontFamilyId === id;
            return (
              <button
                key={id}
                onClick={() => setFontFamily(id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border-2 ${
                  isActive
                    ? `${theme.roundActiveBg} ${theme.roundActiveText} border-transparent shadow-md`
                    : `${theme.cardBg} ${theme.textSecondary} ${theme.inputBorder} hover:opacity-80`
                }`}
                style={{ fontFamily: family }}
              >
                {label}
              </button>
            );
          }
        )}
      </div>
    </div>
  );
}

export function FontSizeSelector() {
  const { fontSizeId, theme, setFontSize } = useTheme();
  const { t } = useT();

  return (
    <div className="mt-5">
      <label className={`block text-xs font-medium ${theme.textSecondary} mb-3 uppercase tracking-wide`}>
        {t.settings_font_size}
      </label>
      <div className="flex gap-2">
        {(Object.entries(FONT_SIZES) as [FontSizeId, typeof FONT_SIZES[FontSizeId]][]).map(
          ([id, { label }]) => {
            const isActive = fontSizeId === id;
            return (
              <button
                key={id}
                onClick={() => setFontSize(id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border-2 ${
                  isActive
                    ? `${theme.roundActiveBg} ${theme.roundActiveText} border-transparent shadow-md`
                    : `${theme.cardBg} ${theme.textSecondary} ${theme.inputBorder} hover:opacity-80`
                }`}
              >
                {label}
              </button>
            );
          }
        )}
      </div>
    </div>
  );
}
