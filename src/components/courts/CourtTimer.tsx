import { useTimer } from "../../hooks/useTimer";
import Icon from "../../components/ui/Icon";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/I18nContext";
import { loadSettings } from "../../lib/appSettings";

function getThresholds(): { warningMin: number; dangerMin: number } {
  // Read synchronously while rendering — the mirror is kept in step by
  // appSettings (REVIEW-BACKLOG.md C4).
  const settings = loadSettings();
  return { warningMin: settings.timerWarningMin, dangerMin: settings.timerDangerMin };
}

interface Props {
  assignedAt: string | null;
  completed?: boolean;
}

export function CourtTimer({ assignedAt, completed }: Props) {
  const { theme } = useTheme();
  const { t } = useT();
  const { display, totalSeconds } = useTimer(completed ? null : assignedAt);

  if (!assignedAt) return null;

  const thresholds = getThresholds();
  const elapsedMin = totalSeconds / 60;

  // Use distinct colors that work across all themes (incl. Bernstein/Orange)
  let colorClass: string;
  if (completed) {
    colorClass = "bg-surface-sunken text-muted";
  } else if (elapsedMin >= thresholds.dangerMin) {
    colorClass = "bg-danger text-white animate-pulse";
  } else if (elapsedMin >= thresholds.warningMin) {
    colorClass = "bg-yellow-400 text-yellow-900 animate-pulse";
  } else {
    colorClass = `${theme.activeBadgeBg} ${theme.activeBadgeText}`;
  }

  return (
    <span
      className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md ${colorClass}`}
      title={`${t.court_timer_started.replace("{time}", new Date(assignedAt).toLocaleTimeString("de-DE"))}${
        !completed && elapsedMin >= thresholds.warningMin
          ? ` (${elapsedMin >= thresholds.dangerMin ? t.court_timer_critical : t.court_timer_warning})`
          : ""
      }`}
    >
      <Icon name="clock" /> {display || "00:00"}
    </span>
  );
}
