// src/components/tournament/SchedulePreview.tsx
//
// How many matches, and how long that will take.
//
// The question before every club night -- "we have the hall until ten,
// we are eleven and have three courts, which format fits?" -- was
// answered from experience and often wrongly. BOSS has been measuring
// the answer all along without ever using it (FEATURE-BACKLOG.md H8).
//
// What it says depends on what it knows. With no history it says so and
// falls back to a rough figure; with a few evenings behind it, it is
// reading this club's own pace off its own timestamps.

import Icon from "../ui/Icon";
import { useT } from "../../lib/I18nContext";
import { fill } from "../../lib/i18n/format";
import { engineFor } from "../../lib/formats";
import { forecastSchedule, type DurationBasis } from "../../lib/duration";
import type { EstimateSetup } from "../../lib/formats/estimate";
import type { ThemeColors } from "../../lib/theme";
import type { TournamentFormat } from "../../lib/types";

/** Whole hours and minutes, e.g. "2 h 40 min" or "45 min". */
function formatSpan(minutes: number, hourLabel: string, minuteLabel: string): string {
  const rounded = Math.round(minutes / 5) * 5;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m} ${minuteLabel}`;
  if (m === 0) return `${h} ${hourLabel}`;
  return `${h} ${hourLabel} ${m} ${minuteLabel}`;
}

export default function SchedulePreview({
  format,
  setup,
  basis,
  theme,
}: {
  format: TournamentFormat;
  setup: EstimateSetup;
  basis: DurationBasis;
  theme: ThemeColors;
}) {
  const { t } = useT();

  // Nothing to say before anybody is selected.
  if (setup.playerCount < 2) return null;

  const estimate = engineFor(format).estimate(setup);

  // A format that runs until somebody stops it has no length to report.
  // Inventing one on a planning screen would be worse than saying nothing.
  if (estimate.matches === null) {
    return (
      <div className={`rounded-md border ${theme.cardBorder} bg-surface-sunken px-4 py-2.5`}>
        <p className="text-xs text-secondary">
          <Icon name="clock" size={12} /> {t.forecast_open_ended}
        </p>
      </div>
    );
  }

  if (estimate.matches === 0) return null;

  const forecast = forecastSchedule(estimate.matches, setup.courts, basis);
  const span = formatSpan(forecast.minutes, t.common_hours_short, t.common_minutes_short);

  return (
    <div className={`rounded-md border ${theme.cardBorder} bg-surface-sunken px-4 py-3`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-sm font-medium text-primary">
          <Icon name="clock" size={13} />{" "}
          {estimate.approximate
            ? fill(t.forecast_matches_about, { count: String(estimate.matches) })
            : fill(t.forecast_matches, { count: String(estimate.matches) })}
        </span>
        <span className="text-sm text-secondary">
          {fill(t.forecast_duration, { span })}
        </span>
      </div>
      <p className="mt-1 text-2xs text-muted">
        {basis.estimated
          ? t.forecast_basis_guess
          : fill(t.forecast_basis_measured, {
              minutes: String(basis.minutes),
              count: String(basis.sampleSize),
            })}
        {setup.courts > 1 && ` · ${fill(t.forecast_courts, { courts: String(setup.courts) })}`}
      </p>
    </div>
  );
}
