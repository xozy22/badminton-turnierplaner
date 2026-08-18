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

  // The whole palette hangs off this one attribute: index.css defines the
  // tokens for each value, and every component reads them through Tailwind
  // utilities. Scrollbars and the dark colour-scheme come along with it
  // (REVIEW-BACKLOG.md F1).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeId);
  }, [themeId]);

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
