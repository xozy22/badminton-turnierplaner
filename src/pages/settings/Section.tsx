// src/pages/settings/Section.tsx
//
// The collapsible card every settings block sits in. Its own file because
// both Settings.tsx and DatabaseSettings.tsx need it, and passing a
// component down as a prop to share it reads like a workaround for exactly
// the missing file (REVIEW-BACKLOG.md D5).

import { useState } from "react";
import Icon, { type IconName } from "../../components/ui/Icon";
import { useTheme } from "../../lib/ThemeContext";

export function Section({
  title,
  icon,
  children,
  defaultOpen = false,
  borderColor,
}: {
  title: string;
  icon: IconName;
  children: React.ReactNode;
  defaultOpen?: boolean;
  borderColor?: string;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const border = borderColor || theme.cardBorder;
  return (
    <div className={`${theme.cardBg} rounded-lg shadow-sm border ${border} overflow-hidden mb-4`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:opacity-80 transition-colors"
        aria-expanded={open}
      >
        <span className={`font-semibold ${theme.textPrimary}`}>
          <Icon name={icon} /> {title}
        </span>
        <span
          className={`${theme.textMuted} transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <Icon name="chevronDown" />
        </span>
      </button>
      {open && <div className={`px-6 pb-5 border-t ${theme.cardBorder} pt-4`}>{children}</div>}
    </div>
  );
}

export default Section;
