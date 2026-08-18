import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { ensureFontFamily } from "./fonts";
import { type ThemeId, type ThemeColors, THEMES, loadThemeId, saveThemeId, type FontSizeId, FONT_SIZES, loadFontSize, saveFontSize, type FontFamilyId, FONT_FAMILIES, loadFontFamily, saveFontFamily } from "./theme";

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeColors;
  setThemeId: (id: ThemeId) => void;
  isDark: boolean;
  fontSizeId: FontSizeId;
  setFontSize: (id: FontSizeId) => void;
  fontFamilyId: FontFamilyId;
  setFontFamily: (id: FontFamilyId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: "green",
  theme: THEMES.green.colors,
  setThemeId: () => {},
  isDark: false,
  fontSizeId: "m",
  setFontSize: () => {},
  fontFamilyId: "inter",
  setFontFamily: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(loadThemeId);
  const [fontSizeId, setFontSizeState] = useState<FontSizeId>(loadFontSize);
  const [fontFamilyId, setFontFamilyState] = useState<FontFamilyId>(loadFontFamily);

  const setThemeId = (id: ThemeId) => {
    setThemeIdState(id);
    saveThemeId(id);
  };

  const setFontSize = (id: FontSizeId) => {
    setFontSizeState(id);
    saveFontSize(id);
  };

  const setFontFamily = (id: FontFamilyId) => {
    setFontFamilyState(id);
    saveFontFamily(id);
  };

  const theme = THEMES[themeId].colors;
  const isDark = themeId === "dark";

  // Apply scrollbar colors via CSS custom properties
  useEffect(() => {
    document.documentElement.style.setProperty("--scrollbar-thumb", theme.scrollbarThumb);
    document.documentElement.style.setProperty("--scrollbar-thumb-hover", theme.scrollbarThumbHover);

    // Toggle dark class on body for global dark mode styles
    if (isDark) {
      document.documentElement.classList.add("dark-mode");
    } else {
      document.documentElement.classList.remove("dark-mode");
    }
  }, [themeId, theme, isDark]);

  // Apply font size
  useEffect(() => {
    const factor = FONT_SIZES[fontSizeId].factor;
    document.documentElement.style.fontSize = `${factor * 16}px`;
  }, [fontSizeId]);

  // Apply font family
  useEffect(() => {
    document.documentElement.style.fontFamily = FONT_FAMILIES[fontFamilyId].family;
    // Fetches the files unless this is the bundled default, or already
    // loaded. Applying the family first means the switch is visible as soon
    // as the download lands (REVIEW-BACKLOG.md E2).
    void ensureFontFamily(fontFamilyId);
  }, [fontFamilyId]);

  return (
    <ThemeContext.Provider value={{ themeId, theme, setThemeId, isDark, fontSizeId, setFontSize, fontFamilyId, setFontFamily }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
