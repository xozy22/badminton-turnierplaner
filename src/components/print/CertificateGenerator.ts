import { jsPDF } from "jspdf";
import { formatDate } from "../../lib/datetime";
import type { Tournament, StandingEntry } from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import type { Translations } from "../../lib/i18n/types";

const GOLD = "#C8A96E";
const DARK_GOLD = "#8B7339";
const TEXT_COLOR = "#1a1a1a";
const LIGHT_TEXT = "#666666";

const PAGE_W = 297;
const PAGE_H = 210;

function drawCornerOrnament(
  doc: jsPDF,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
) {
  const len = 12;
  doc.setDrawColor(DARK_GOLD);
  doc.setLineWidth(0.7);
  // horizontal arm
  doc.line(cx, cy, cx + dx * len, cy);
  // vertical arm
  doc.line(cx, cy, cx, cy + dy * len);
  // small inner accent
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.4);
  doc.line(cx + dx * 2, cy + dy * 2, cx + dx * 8, cy + dy * 2);
  doc.line(cx + dx * 2, cy + dy * 2, cx + dx * 2, cy + dy * 8);
}

function drawDecorativeLine(
  doc: jsPDF,
  y: number,
  width: number,
) {
  const cx = PAGE_W / 2;
  const half = width / 2;
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.3);
  doc.line(cx - half, y, cx + half, y);
  // small diamond in center
  const d = 1.5;
  doc.setFillColor(GOLD);
  doc.triangle(cx, y - d, cx + d, y, cx, y + d, "F");
  doc.triangle(cx, y - d, cx - d, y, cx, y + d, "F");
}

function drawCertificatePage(
  doc: jsPDF,
  place: number,
  playerName: string,
  tournament: Tournament,
  t: Translations,
  modeLabel: string,
  formatLabel: string,
) {
  // ---- Double border ----
  // Outer border
  doc.setDrawColor(DARK_GOLD);
  doc.setLineWidth(1);
  doc.rect(2, 2, PAGE_W - 4, PAGE_H - 4);

  // Inner border
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.5);
  doc.rect(6, 6, PAGE_W - 12, PAGE_H - 12);

  // ---- Corner ornaments (at inner border corners) ----
  const m = 6;
  drawCornerOrnament(doc, m, m, 1, 1); // top-left
  drawCornerOrnament(doc, PAGE_W - m, m, -1, 1); // top-right
  drawCornerOrnament(doc, m, PAGE_H - m, 1, -1); // bottom-left
  drawCornerOrnament(doc, PAGE_W - m, PAGE_H - m, -1, -1); // bottom-right

  // ---- Header area ----
  let y = 28;

  drawDecorativeLine(doc, y, 60);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(DARK_GOLD);
  doc.text("BOSS", PAGE_W / 2, y, { align: "center" });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(LIGHT_TEXT);
  doc.text("Badminton Operating & Scheduling System", PAGE_W / 2, y, {
    align: "center",
  });
  y += 10;

  // ---- Main area ----
  // Achievement title
  doc.setFont("times", "bold");
  doc.setFontSize(28);
  doc.setTextColor(DARK_GOLD);
  doc.text(t.certificate_achievement, PAGE_W / 2, y, { align: "center" });
  y += 8;

  drawDecorativeLine(doc, y, 80);
  y += 12;

  // Star/medal symbol
  const starSymbols = ["★ ★ ★", "★ ★", "★"];
  const placeLabels = [t.certificate_place_1, t.certificate_place_2, t.certificate_place_3];
  const idx = place - 1;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(GOLD);
  doc.text(starSymbols[idx], PAGE_W / 2, y, { align: "center" });
  y += 10;

  // Place label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(DARK_GOLD);
  doc.text(placeLabels[idx], PAGE_W / 2, y, { align: "center" });
  y += 14;

  // Player name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(TEXT_COLOR);
  doc.text(playerName, PAGE_W / 2, y, { align: "center" });
  y += 10;

  // Congratulations
  doc.setFont("helvetica", "italic");
  doc.setFontSize(12);
  doc.setTextColor(LIGHT_TEXT);
  doc.text(t.certificate_congratulations, PAGE_W / 2, y, { align: "center" });
  y += 14;

  // ---- Details area ----
  drawDecorativeLine(doc, y, 50);
  y += 10;

  // Tournament name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(TEXT_COLOR);
  doc.text(tournament.name, PAGE_W / 2, y, { align: "center" });
  y += 7;

  // Mode + Format
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(LIGHT_TEXT);
  doc.text(`${t.certificate_mode}: ${modeLabel}  |  ${t.certificate_format}: ${formatLabel}`, PAGE_W / 2, y, {
    align: "center",
  });
  y += 6;

  // Date
  // Parsed through the shared helper: created_at may be SQLite's
  // zoneless UTC, which `new Date()` would read as local time.
  const dateStr = formatDate(tournament.created_at);
  doc.text(`${t.certificate_date}: ${dateStr}`, PAGE_W / 2, y, {
    align: "center",
  });

  // ---- Footer / Signature ----
  const sigY = PAGE_H - 25;

  // Signature line
  doc.setDrawColor(TEXT_COLOR);
  doc.setLineWidth(0.3);
  const lineHalf = 50;
  doc.line(PAGE_W / 2 - lineHalf, sigY, PAGE_W / 2 + lineHalf, sigY);

  // Signature label
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(LIGHT_TEXT);
  doc.text(t.certificate_signature, PAGE_W / 2, sigY + 6, {
    align: "center",
  });
}

export async function generateCertificates(
  tournament: Tournament,
  standings: StandingEntry[],
  t: Translations,
  modeLabel: string,
  formatLabel: string,
): Promise<Uint8Array> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const top3 = standings.slice(0, Math.min(3, standings.length));

  for (let i = 0; i < top3.length; i++) {
    if (i > 0) doc.addPage();
    const entry = top3[i];
    const playerName = playerDisplayName(entry.player);
    drawCertificatePage(doc, i + 1, playerName, tournament, t, modeLabel, formatLabel);
  }

  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}
