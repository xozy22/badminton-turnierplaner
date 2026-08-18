import { useState, useEffect } from "react";
import { dbDateToMillis } from "../lib/datetime";

/**
 * Zeigt die vergangene Zeit seit `startIso` als "MM:SS" oder "H:MM:SS".
 * Aktualisiert sich jede Sekunde.
 * Gibt auch die Gesamtsekunden zurueck fuer Threshold-Checks.
 *
 * Der Effekt hält nur die aktuelle Uhrzeit; Anzeige und Sekunden werden
 * daraus abgeleitet. Vorher schrieb der Effekt den formatierten Zustand —
 * einmal beim Mounten und dann im Sekundentakt, was React als kaskadierendes
 * Rendern anmahnt (REVIEW-BACKLOG.md D3).
 */
export function useTimer(startIso: string | null): { display: string; totalSeconds: number } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startIso) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startIso]);

  const start = dbDateToMillis(startIso);
  if (start === null) return { display: "", totalSeconds: 0 };

  const totalSeconds = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const display =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return { display, totalSeconds };
}
