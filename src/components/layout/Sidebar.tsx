import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../../lib/ThemeContext";
import Icon from "../ui/Icon";
import { useT } from "../../lib/I18nContext";
import { getCustomLogo } from "../../pages/settings/LogoSettings";
import { getAppSetting } from "../../lib/db";

const COLLAPSED_KEY = "turnierplaner_sidebar_collapsed";

export default function Sidebar() {
  const { theme } = useTheme();
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === "true"; } catch (err) { console.error("Sidebar: failed to read collapsed state from localStorage:", err); return false; }
  });
  const [customLogo, setCustomLogo] = useState<string | null>(() => getCustomLogo());

  // Load logo from DB on mount + listen for changes
  useEffect(() => {
    // Load from DB and update cache
    getAppSetting("custom_logo").then((dbLogo) => {
      if (dbLogo) {
        localStorage.setItem("turnierplaner_logo_cache", dbLogo);
        setCustomLogo(dbLogo);
      }
    });
    const handler = () => setCustomLogo(getCustomLogo());
    window.addEventListener("logo-changed", handler);
    return () => window.removeEventListener("logo-changed", handler);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  };

  const links = [
    { to: "/", label: t.nav_home, icon: "home" as const },
    { to: "/sportstaetten", label: t.nav_venues, icon: "building" as const },
    { to: "/players", label: t.nav_players, icon: "users" as const },
    { to: "/tournaments", label: t.nav_tournaments, icon: "trophy" as const },
    { to: "/sessions", label: t.nav_sessions, icon: "link" as const },
    { to: "/statistics", label: t.nav_statistics, icon: "chart" as const },
  ];

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-60"} ${theme.sidebarBg} text-white min-h-screen flex flex-col shrink-0 transition-all duration-200`}
    >
      {/* Branding */}
      <div className={`${collapsed ? "p-3" : "p-5"} border-b ${theme.sidebarBorder}`}>
        {collapsed ? (
          <div className="text-2xl text-center flex justify-center">
            <img src={customLogo || "/logo.webp"} alt="Logo" className="w-14 h-14 object-contain" />
          </div>
        ) : customLogo ? (
          <div className="flex items-center gap-3">
            <img src={customLogo} alt="Logo" className="w-14 h-14 object-contain shrink-0" />
            <div>
              <div className="text-base font-bold tracking-tight text-white">
                BOSS
              </div>
              <div className={`text-[8px] font-medium ${theme.sidebarAccent} tracking-wide uppercase leading-tight`}>
                Badminton Operating<br/>and Scheduling System
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <img src="/logo.webp" alt="Logo" className="w-40 object-contain" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            title={collapsed ? link.label : undefined}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-4"} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? `${theme.sidebarActiveBg} text-white shadow-lg ${theme.sidebarActiveShadow}`
                  : `${theme.sidebarText} ${theme.sidebarHoverBg} hover:text-white`
              }`
            }
          >
            <Icon name={link.icon} size={collapsed ? 22 : 18} />
            {!collapsed && link.label}
          </NavLink>
        ))}
      </nav>

      {/* Settings + Toggle - bottom */}
      <div className={`p-2 border-t ${theme.sidebarBorder} space-y-1`}>
        <NavLink
          to="/settings"
          title={collapsed ? t.nav_settings : undefined}
          className={({ isActive }) =>
            `flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-4"} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              isActive
                ? `${theme.sidebarActiveBg} text-white shadow-lg ${theme.sidebarActiveShadow}`
                : `${theme.sidebarText} ${theme.sidebarHoverBg} hover:text-white`
            }`
          }
        >
          <Icon name="settings" size={collapsed ? 22 : 18} />
          {!collapsed && t.nav_settings}
        </NavLink>

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className={`w-full flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-4"} py-2 rounded-lg text-xs transition-all duration-200 ${theme.sidebarText} ${theme.sidebarHoverBg} hover:text-white`}
          title={collapsed ? t.nav_expand_sidebar : t.nav_collapse_sidebar}
        >
          <span className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}>
            «
          </span>
          {!collapsed && <span>{t.nav_collapse}</span>}
        </button>

        {/* Version */}
        {!collapsed && (
          <div className={`text-[10px] ${theme.sidebarText} text-center pt-1 opacity-50 leading-relaxed`}>
            <div>v{__APP_VERSION__}</div>
            <div className="mt-0.5">Idee und Umsetzung</div>
            <div>Felix Blasshofer &amp; Dennis Kobiolka</div>
          </div>
        )}
      </div>
    </aside>
  );
}
