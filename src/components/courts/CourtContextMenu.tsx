// src/components/courts/CourtContextMenu.tsx
//
// Floating context menu for an occupied court card. Triggered from
// CourtOverview's renderCourt via onContextMenu (right-click). The only
// action today is "🔄 Return match to queue" (clears match.court so the
// match drops back into the unassigned queue) — designed to fail-safely
// add more menu items later (swap players, jump to match card, etc.)
// without restructuring this file.
//
// Positioning: starts at the click coordinates, then a post-mount effect
// measures the rendered rect and clamps left/top so the menu fits inside
// the viewport even when the user right-clicked on a court near the
// bottom-right edge.
//
// Dismissal: click-outside (any pointerdown that isn't on the menu) and
// Escape both close. The triggering pointerup that opens the menu is
// not seen by the listener because the listener attaches *after* the
// menu mounts, on the next frame.

import { useEffect, useRef, useState } from "react";
import type { ThemeColors } from "../../lib/theme";
import type { Translations } from "../../lib/i18n/types";

interface Props {
  /** Viewport x of the right-click that opened this menu. */
  x: number;
  /** Viewport y of the right-click. */
  y: number;
  /** Header label rendered at the top of the menu — typically the
   *  formatted court label like "Halle 1 · #2" or just "#2". */
  courtLabel: string;
  /** Fired when the user picks "Return match to queue". The host is
   *  responsible for the actual DB call + reload. */
  onUnassign: () => void;
  /** Closed via click-outside, Escape, or after onUnassign. */
  onClose: () => void;
  theme: ThemeColors;
  t: Translations;
}

const MARGIN = 8; // viewport-edge breathing room

export default function CourtContextMenu({ x, y, courtLabel, onUnassign, onClose, theme, t }: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Start with the raw click coordinates so the first paint is roughly
  // correct; the effect below clamps after measuring the rendered size.
  const [pos, setPos] = useState({ left: x, top: y });

  // Clamp to viewport once the menu's real size is known. Done in a
  // useLayoutEffect-ish pattern via useEffect — we accept a one-frame
  // visual blip in exchange for not pulling in useLayoutEffect (the
  // menu is small, the blip is invisible to humans).
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width + MARGIN > vw) left = Math.max(MARGIN, vw - rect.width - MARGIN);
    if (top + rect.height + MARGIN > vh) top = Math.max(MARGIN, vh - rect.height - MARGIN);
    setPos({ left, top });
  }, [x, y]);

  // Click-outside + Escape dismissal.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer attach by a tick so the right-click that opened us doesn't
    // immediately match as a click-outside on the same event loop.
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={courtLabel}
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 50 }}
      className={`${theme.cardBg} border ${theme.cardBorder} rounded-md shadow-lg py-1 min-w-[220px]`}
    >
      <div className={`px-3 py-1.5 text-2xs font-bold uppercase tracking-wide ${theme.textMuted} border-b ${theme.cardBorder}`}>
        {courtLabel}
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={() => { onUnassign(); onClose(); }}
        className={`w-full text-left px-3 py-2 text-sm ${theme.textPrimary} hover:bg-warning-subtle hover:text-warning-text transition-colors flex items-center gap-2`}
      >
        {t.court_context_menu_unassign}
      </button>
    </div>
  );
}
