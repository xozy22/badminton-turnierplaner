export type ThemeId = "green" | "blue" | "orange" | "dark";

export interface ThemeColors {
  // Sidebar
  sidebarBg: string;
  sidebarBorder: string;
  sidebarActiveBg: string;
  sidebarActiveShadow: string;
  sidebarText: string;
  sidebarHoverBg: string;
  sidebarAccent: string; // "TURNIERPLANER" text

  // Page background
  pageBg: string;

  // Primary action buttons
  primaryBg: string;
  primaryHoverBg: string;
  primaryText: string;

  // Cards & Borders
  cardBg: string;
  cardBorder: string;
  cardHoverBorder: string;
  headerGradient: string; // table headers etc

  // Focus rings
  focusBorder: string;
  focusRing: string;

  // Selected / Active states
  selectedBg: string;
  selectedText: string;
  selectedRing: string;

  // Stat cards on home
  statCard1: string;
  statCard2: string; // amber stays same
  statCard3: string; // violet stays same

  // Round tabs
  roundActiveBg: string;
  roundActiveText: string;

  // Standings
  standingsHeaderBg: string;
  standingsHeaderText: string;

  // Scrollbar
  scrollbarThumb: string;
  scrollbarThumbHover: string;

  // Court accent (for active court border + badge)
  courtBorder: string;
  courtBadgeBg: string;
  courtBadgeText: string;

  // Completed match border
  completedBorder: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Badge (gender, status)
  activeBadgeBg: string;
  activeBadgeText: string;

  // Input
  inputBg: string;
  inputBorder: string;
  inputText: string;

  // Body bg (for dark mode)
  bodyBg: string;
}

/**
 * The one class table.
 *
 * Every value is a Tailwind utility built on a design token from
 * index.css, so switching themes is a matter of the `data-theme` attribute
 * repainting the variables — nothing here changes. Four hand-maintained
 * tables lived here before, one per theme, which is why new components
 * routinely arrived dressed for one theme only (REVIEW-BACKLOG.md F1, F2).
 */
const tokenTheme: ThemeColors = {
  // Sidebar
  sidebarBg: "bg-sidebar",
  sidebarBorder: "border-sidebar",
  sidebarActiveBg: "bg-accent",
  sidebarActiveShadow: "shadow-black/30",
  sidebarText: "text-sidebar-text",
  sidebarHoverBg: "hover-sidebar",
  sidebarAccent: "text-sidebar-accent",

  // Page
  pageBg: "bg-page",

  // Primary action
  primaryBg: "bg-accent",
  primaryHoverBg: "hover:bg-accent-hover",
  primaryText: "text-accent-fg",

  // Cards
  cardBg: "bg-surface",
  cardBorder: "border-line",
  cardHoverBorder: "hover:border-accent-border",
  headerGradient: "bg-header-wash",

  // Focus
  focusBorder: "focus:border-accent",
  focusRing: "focus:ring-accent-ring",

  // Selection
  selectedBg: "bg-accent-subtle",
  selectedText: "text-accent-subtle-fg",
  selectedRing: "ring-accent-ring",

  // Stat cards
  statCard1: "bg-stat-1",
  statCard2: "bg-stat-2",
  statCard3: "bg-stat-3",

  // Round tabs
  roundActiveBg: "bg-accent",
  roundActiveText: "text-accent-fg",

  // Standings
  standingsHeaderBg: "bg-header-wash",
  standingsHeaderText: "text-accent-subtle-fg",

  // Courts
  courtBorder: "border-accent-border",
  courtBadgeBg: "bg-accent",
  courtBadgeText: "text-accent-fg",

  // Scrollbar — read by ThemeContext, which writes the CSS variable. Kept
  // as a value rather than a class because it is not one.
  scrollbarThumb: "var(--scrollbar-thumb)",
  scrollbarThumbHover: "var(--scrollbar-thumb-hover)",

  completedBorder: "border-l-accent",

  // Text
  textPrimary: "text-primary",
  textSecondary: "text-secondary",
  textMuted: "text-muted",

  // Badges
  activeBadgeBg: "bg-accent-subtle",
  activeBadgeText: "text-accent-subtle-fg",

  // Inputs
  inputBg: "bg-surface-input",
  inputBorder: "border-line-strong",
  inputText: "text-primary",

  bodyBg: "",
};

export interface PrintColors {
  accent: string;       // Hauptakzent (Ueberschriften, Gewinner, Headerline)
  accentLight: string;  // Heller Hintergrund (Tabellen-Header, Highlight-Karten)
  accentBorder: string; // Rand fuer Highlight-Karten
  winColor: string;     // Siege-Farbe
  lossColor: string;    // Niederlagen-Farbe
}

export const PRINT_COLORS: Record<ThemeId, PrintColors> = {
  green:  { accent: "#047857", accentLight: "#ecfdf5", accentBorder: "#d1fae5", winColor: "#047857", lossColor: "#b91c1c" },
  blue:   { accent: "#1d4ed8", accentLight: "#eff6ff", accentBorder: "#bfdbfe", winColor: "#1d4ed8", lossColor: "#b91c1c" },
  orange: { accent: "#c2410c", accentLight: "#fff7ed", accentBorder: "#fed7aa", winColor: "#c2410c", lossColor: "#b91c1c" },
  // Print is always on white paper, so dark uses the light accent too.
  dark:   { accent: "#047857", accentLight: "#ecfdf5", accentBorder: "#d1fae5", winColor: "#047857", lossColor: "#b91c1c" },
};

/**
 * A theme is now a name and a swatch. Its colours live in index.css under
 * `[data-theme="..."]`, so adding one means adding a variable block there
 * and an entry here — no class table to fill in.
 */
export const THEMES: Record<ThemeId, { label: string; colors: ThemeColors; preview: string }> = {
  green: { label: "Smaragd (Standard)", colors: tokenTheme, preview: "#047857" },
  blue: { label: "Saphir", colors: tokenTheme, preview: "#1d4ed8" },
  orange: { label: "Bernstein", colors: tokenTheme, preview: "#c2410c" },
  dark: { label: "Dunkel", colors: tokenTheme, preview: "#111827" },
};

// Font size
export type FontSizeId = "xxs" | "xs" | "s" | "m" | "l" | "xl" | "xxl";

export const FONT_SIZES: Record<FontSizeId, { label: string; factor: number }> = {
  xxs: { label: "XXS", factor: 0.75 },
  xs:  { label: "XS",  factor: 0.85 },
  s:   { label: "S",   factor: 0.925 },
  m:   { label: "M",   factor: 1.0 },
  l:   { label: "L",   factor: 1.075 },
  xl:  { label: "XL",  factor: 1.15 },
  xxl: { label: "XXL", factor: 1.25 },
};

const FONTSIZE_KEY = "turnierplaner_fontsize";

export function loadFontSize(): FontSizeId {
  try {
    const stored = localStorage.getItem(FONTSIZE_KEY);
    if (stored && stored in FONT_SIZES) return stored as FontSizeId;
  } catch (err) {
    console.error("loadFontSize: failed to read font size from localStorage:", err);
  }
  return "m";
}

export function saveFontSize(id: FontSizeId): void {
  localStorage.setItem(FONTSIZE_KEY, id);
}

// Font family
export type FontFamilyId = "inter" | "nunito" | "roboto" | "poppins" | "montserrat";

export const FONT_FAMILIES: Record<FontFamilyId, { label: string; family: string }> = {
  inter:      { label: "Inter",      family: "'Inter', system-ui, -apple-system, sans-serif" },
  nunito:     { label: "Nunito",     family: "'Nunito', system-ui, -apple-system, sans-serif" },
  roboto:     { label: "Roboto",     family: "'Roboto', system-ui, -apple-system, sans-serif" },
  poppins:    { label: "Poppins",    family: "'Poppins', system-ui, -apple-system, sans-serif" },
  montserrat: { label: "Montserrat", family: "'Montserrat', system-ui, -apple-system, sans-serif" },
};

const FONTFAMILY_KEY = "boss_fontfamily";

export function loadFontFamily(): FontFamilyId {
  try {
    const stored = localStorage.getItem(FONTFAMILY_KEY);
    if (stored && stored in FONT_FAMILIES) return stored as FontFamilyId;
  } catch (err) {
    console.error("loadFontFamily: failed to read font family from localStorage:", err);
  }
  return "inter";
}

export function saveFontFamily(id: FontFamilyId): void {
  localStorage.setItem(FONTFAMILY_KEY, id);
}

const THEME_KEY = "turnierplaner_theme";

export function loadThemeId(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored && stored in THEMES) return stored as ThemeId;
  } catch (err) {
    console.error("loadThemeId: failed to read theme from localStorage:", err);
  }
  return "green";
}

export function saveThemeId(id: ThemeId): void {
  localStorage.setItem(THEME_KEY, id);
}

export function getTheme(id?: ThemeId): ThemeColors {
  return THEMES[id ?? loadThemeId()].colors;
}
