import { useState, useEffect, lazy, Suspense } from "react";
import { checkForUpdate, dismissVersion, dismissedVersion, isDismissed } from "./lib/updater";
import { fill } from "./lib/i18n/format";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Layout from "./components/layout/Layout";

// One chunk per page (REVIEW-BACKLOG.md E1). Home stays eager — it is what
// the window opens on, so deferring it would only add a flash of the
// fallback before the first paint.
import Home from "./pages/Home";

const Players = lazy(() => import("./pages/Players"));
const Tournaments = lazy(() => import("./pages/Tournaments"));
const TournamentCreate = lazy(() => import("./pages/TournamentCreate"));
const TournamentView = lazy(() => import("./pages/TournamentView"));
const TvMode = lazy(() => import("./pages/TvMode"));
const Settings = lazy(() => import("./pages/Settings"));
const Sportstaetten = lazy(() => import("./pages/Sportstaetten"));
const Statistics = lazy(() => import("./pages/Statistics"));
const Sessions = lazy(() => import("./pages/Sessions"));
const SessionDetail = lazy(() => import("./pages/SessionDetail"));
const SessionDashboard = lazy(() => import("./pages/SessionDashboard"));
import { useTheme } from "./lib/ThemeContext";
import { useT } from "./lib/I18nContext";
import LivePublisherHost from "./lib/useLivePublisher";
import ErrorBoundary from "./components/layout/ErrorBoundary";

/** Placeholder while a page chunk loads. */
function PageLoading() {
  return <div className="w-full h-full" aria-busy="true" />;
}

function UpdateBanner() {
  const { theme } = useTheme();
  const { t } = useT();
  const navigate = useNavigate();
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkUpdate = async () => {
      // `false`: at most one call a day, and the answer is shared with the
      // Settings page rather than fetched twice (lib/updater.ts).
      const update = await checkForUpdate(false);
      if (cancelled || !update) return;
      // "Later" on this version stays said across restarts. A newer one
      // still gets through -- otherwise one dismissal hides every release
      // that follows.
      if (isDismissed(update.version, dismissedVersion())) return;
      setUpdateVersion(update.version);
    };
    // Delayed so the check does not compete with the first render.
    const timer = setTimeout(checkUpdate, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    if (updateVersion) dismissVersion(updateVersion);
    setDismissed(true);
  };

  if (!updateVersion || dismissed) return null;

  return (
    <div className={`${theme.primaryBg} text-white px-4 py-2 flex items-center justify-center gap-4 text-sm`}>
      <span>{fill(t.update_available_banner, { version: updateVersion })}</span>
      <button
        onClick={() => { navigate("/settings"); setDismissed(true); }}
        className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-sm font-medium transition-colors"
      >
        {t.update_go_to_settings}
      </button>
      <button
        onClick={dismiss}
        className="hover:bg-white/20 px-2 py-1 rounded-sm transition-colors opacity-70 hover:opacity-100"
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
      {/* A render error in any page shows a recoverable screen instead of a
          blank window — see REVIEW-BACKLOG.md D6. */}
      <ErrorBoundary>
      {/* Chunks are served from disk by the bundled webview, so the wait is
          measured in milliseconds; the fallback exists to satisfy Suspense,
          not to be read. */}
      <Suspense fallback={<PageLoading />}>
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
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
