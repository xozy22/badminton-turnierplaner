import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import Players from "./pages/Players";
import Tournaments from "./pages/Tournaments";
import TournamentCreate from "./pages/TournamentCreate";
import TournamentView from "./pages/TournamentView";
import TvMode from "./pages/TvMode";
import Settings from "./pages/Settings";
import Sportstaetten from "./pages/Sportstaetten";
import Statistics from "./pages/Statistics";
import Sessions from "./pages/Sessions";
import SessionDetail from "./pages/SessionDetail";
import SessionDashboard from "./pages/SessionDashboard";
import { useTheme } from "./lib/ThemeContext";
import { useT } from "./lib/I18nContext";
import LivePublisherHost from "./lib/useLivePublisher";

function UpdateBanner() {
  const { theme } = useTheme();
  const { t } = useT();
  const navigate = useNavigate();
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update?.available) {
          setUpdateVersion(update.version);
        }
      } catch (err) {
        console.log("Auto-update check skipped:", err);
      }
    };
    // Delay check by 3 seconds to not slow down app startup
    const timer = setTimeout(checkUpdate, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!updateVersion || dismissed) return null;

  return (
    <div className={`${theme.primaryBg} text-white px-4 py-2 flex items-center justify-center gap-4 text-sm`}>
      <span>{t.update_available_banner.replace("{version}", updateVersion)}</span>
      <button
        onClick={() => { navigate("/settings"); setDismissed(true); }}
        className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg font-medium transition-colors"
      >
        {t.update_go_to_settings}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="hover:bg-white/20 px-2 py-1 rounded-lg transition-colors opacity-70 hover:opacity-100"
      >
        {t.update_dismiss}
      </button>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <UpdateBanner />
      <LivePublisherHost />
      <Routes>
        {/* TV-Modus: Fullscreen ohne Sidebar */}
        <Route path="/tv/:id" element={<TvMode />} />
        {/* Session-Live-Dashboard: Fullscreen ohne Sidebar */}
        <Route path="/sessions/:id/live" element={<SessionDashboard />} />
        {/* Normales Layout */}
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/players" element={<Players />} />
          <Route path="/sportstaetten" element={<Sportstaetten />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournaments/new" element={<TournamentCreate />} />
          <Route path="/tournaments/:id/edit" element={<TournamentCreate />} />
          <Route path="/tournaments/:id" element={<TournamentView />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
