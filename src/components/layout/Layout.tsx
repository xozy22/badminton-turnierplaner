import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useTheme } from "../../lib/ThemeContext";

export default function Layout() {
  const { theme } = useTheme();
  return (
    <div className={`flex h-screen ${theme.pageBg} overflow-hidden`}>
      <Sidebar />
      {/* `relative` is load-bearing: it makes this the containing block for
          anything absolutely positioned inside a page. Without it such an
          element lays itself out against the document instead, which
          stretches the page past the viewport -- and then the whole layout
          scrolls, sidebar and all, behind a strip of bare background. A
          single `sr-only` legend was enough to do it. */}
      <main className="relative flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
