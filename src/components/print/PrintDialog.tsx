import { useState, useRef } from "react";
import Icon from "../../components/ui/Icon";
import PrintView from "./PrintView";
import type { PrintMode } from "./PrintView";
import { generateCertificates } from "./CertificateGenerator";
// html2canvas and jspdf together are ~700 KB and are only needed once the
// user actually renders a PDF (REVIEW-BACKLOG.md E1).
import type {
  Tournament,
  Player,
  Round,
  Match,
  GameSet,
  StandingEntry,
} from "../../lib/types";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/I18nContext";
import { useToast } from "../../lib/ToastContext";

interface PrintDialogProps {
  tournament: Tournament;
  players: Player[];
  rounds: Round[];
  matchesByRound: Map<number, Match[]>;
  setsByMatch: Map<number, GameSet[]>;
  standings: StandingEntry[];
  activeRoundId: number | null;
  onClose: () => void;
}

export default function PrintDialog({
  tournament,
  players,
  rounds,
  matchesByRound,
  setsByMatch,
  standings,
  activeRoundId,
  onClose,
}: PrintDialogProps) {
  const { theme, themeId } = useTheme();
  const { t } = useT();
  const { showError } = useToast();
  const [mode, setMode] = useState<PrintMode>("full");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [certLoading, setCertLoading] = useState(false);

  const PRINT_OPTIONS: { value: PrintMode; label: string; desc: string }[] = [
    { value: "report", label: t.print_report, desc: t.print_report_desc },
    { value: "full", label: t.print_full, desc: t.print_full_desc },
    { value: "schedule", label: t.print_schedule, desc: t.print_schedule_desc },
    { value: "round", label: t.print_current_round, desc: t.print_current_round_desc },
    { value: "standings", label: t.print_standings, desc: t.print_standings_desc },
  ];
  const printRef = useRef<HTMLDivElement>(null);

  const handleSavePdf = async () => {
    if (!printRef.current) return;
    setPdfLoading(true);
    try {
      // Clone the print content into an off-screen container to avoid scroll/clip issues
      const offscreen = document.createElement("div");
      offscreen.style.position = "absolute";
      offscreen.style.left = "-9999px";
      offscreen.style.top = "0";
      offscreen.style.width = "800px";
      offscreen.style.background = "#ffffff";
      offscreen.style.color = "#000000";
      offscreen.innerHTML = printRef.current.innerHTML;
      document.body.appendChild(offscreen);

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(offscreen, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 800,
        windowWidth: 800,
      });

      document.body.removeChild(offscreen);

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageContentHeight = pdfHeight - 20;

      if (imgHeight <= pageContentHeight) {
        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        pdf.addImage(imgData, "JPEG", 10, 10, imgWidth, imgHeight);
      } else {
        // Multi-page: slice canvas into page-sized chunks
        const totalPages = Math.ceil(imgHeight / pageContentHeight);
        for (let page = 0; page < totalPages; page++) {
          if (page > 0) pdf.addPage();

          const sourceY = Math.round((page * pageContentHeight / imgHeight) * canvas.height);
          const sourceH = Math.round(Math.min(
            (pageContentHeight / imgHeight) * canvas.height,
            canvas.height - sourceY
          ));
          if (sourceH <= 0) break;

          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sourceH;
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH);

          const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92);
          const sliceImgH = (sourceH * imgWidth) / canvas.width;
          pdf.addImage(sliceData, "JPEG", 10, 10, imgWidth, sliceImgH);
        }
      }

      // Save via Tauri dialog
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeFile } = await import("@tauri-apps/plugin-fs");
        const path = await save({
          defaultPath: `${tournament.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}_report.pdf`,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (path) {
          await writeFile(path, new Uint8Array(pdf.output("arraybuffer")));
        }
      } catch (err) {
        console.error("PrintDialog: Tauri file save failed, falling back to browser download:", err);
        // Fallback: browser download if not in Tauri
        pdf.save(`${tournament.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}_report.pdf`);
      }
    } catch (err) {
      console.error("PDF export error:", err);
    }
    setPdfLoading(false);
  };

  const handleCertificates = async () => {
    if (standings.length < 1) return;
    setCertLoading(true);
    try {
      const modeLabel = {
        singles: t.mode_singles,
        doubles: t.mode_doubles,
        mixed: t.mode_mixed,
      }[tournament.mode];
      const formatLabel = {
        round_robin: t.format_round_robin,
        elimination: t.format_elimination,
        random_doubles: t.format_random_doubles,
        group_ko: t.format_group_ko,
        swiss: t.format_swiss,
        double_elimination: t.format_double_elimination,
        monrad: t.format_monrad,
        king_of_court: t.format_king_of_court,
        waterfall: t.format_waterfall,
      }[tournament.format];

      const pdfBytes = await generateCertificates(
        tournament,
        standings,
        t,
        modeLabel,
        formatLabel,
      );

      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeFile } = await import("@tauri-apps/plugin-fs");
        const path = await save({
          defaultPath: `${tournament.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}_certificates.pdf`,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (path) {
          await writeFile(path, pdfBytes);
        }
      } catch (err) {
        console.error("PrintDialog: Tauri certificate save failed, falling back to browser download:", err);
        // Fallback: browser download if not in Tauri
        const blob = new Blob([new Uint8Array(pdfBytes) as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${tournament.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}_certificates.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Certificate generation error:", err);
    }
    setCertLoading(false);
  };

  const handlePrint = () => {
    if (!printRef.current) return;

    const printContent = printRef.current.innerHTML;

    // Collect all stylesheets from the main document (includes bundled Inter font)
    const styleSheets = Array.from(document.styleSheets);
    let collectedStyles = "";
    for (const sheet of styleSheets) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          // Include @font-face rules and basic styles
          if (rule instanceof CSSFontFaceRule || rule.cssText.includes("font-face")) {
            collectedStyles += rule.cssText + "\n";
          }
        }
      } catch (err) {
        // Cross-origin stylesheets can't be read — skip
        console.error("PrintDialog: failed to read cross-origin stylesheet:", err);
      }
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      // Fallback: if window.open is blocked (Tauri), use PDF export instead
      showError(t.print_window_blocked);
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${tournament.name}</title>
        <style>
          ${collectedStyles}
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          @page { margin: 15mm; size: A4; }
        </style>
      </head>
      <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`${theme.cardBg} rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col border ${theme.cardBorder}`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${theme.cardBorder} flex justify-between items-center`}>
          <div>
            <h2 className={`font-bold text-lg ${theme.textPrimary}`}><Icon name="printer" /> {t.print_title}</h2>
            <p className={`text-xs ${theme.textSecondary} mt-0.5`}>{tournament.name}</p>
          </div>
          <button
            onClick={onClose} aria-label={t.common_close}
            className={`${theme.textMuted} hover:${theme.textSecondary} text-xl leading-none w-8 h-8 flex items-center justify-center rounded-sm transition-colors`}
          >
            <Icon name="x" />
          </button>
        </div>

        {/* Print Mode Selection */}
        <div className={`px-6 py-3 border-b ${theme.cardBorder}`}>
          <div className="flex gap-2">
            {PRINT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  mode === opt.value
                    ? `${theme.primaryBg} text-white shadow-sm`
                    : `${theme.cardBg} ${theme.textSecondary} border ${theme.cardBorder} hover:opacity-80`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className={`text-xs ${theme.textMuted} mt-2`}>
            {PRINT_OPTIONS.find((o) => o.value === mode)?.desc}
          </p>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto p-4 bg-gray-100 dark-mode:bg-gray-800">
          <div className="bg-white shadow-lg rounded-sm mx-auto" style={{ maxWidth: 800 }}>
            <PrintView
              ref={printRef}
              tournament={tournament}
              players={players}
              rounds={rounds}
              matchesByRound={matchesByRound}
              setsByMatch={setsByMatch}
              standings={standings}
              mode={mode}
              activeRoundId={activeRoundId}
              themeId={themeId}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t ${theme.cardBorder} flex justify-end gap-3`}>
          <button
            onClick={onClose}
            className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-5 py-2.5 rounded-md hover:opacity-80 transition-all text-sm font-medium`}
          >
            {t.common_cancel}
          </button>
          <button
            onClick={handleSavePdf}
            disabled={pdfLoading}
            className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-5 py-2.5 rounded-md hover:opacity-80 transition-all text-sm font-medium disabled:opacity-50`}
          >
            <Icon name="file" /> {pdfLoading ? t.pdf_saving : t.pdf_save}
          </button>
          <button
            onClick={handleCertificates}
            disabled={certLoading || standings.length < 1}
            className={`${theme.cardBg} border ${theme.cardBorder} ${theme.textSecondary} px-5 py-2.5 rounded-md hover:opacity-80 transition-all text-sm font-medium disabled:opacity-50`}
          >
            <Icon name="trophy" /> {certLoading ? t.pdf_saving : t.certificate_generate}
          </button>
          <button
            onClick={handlePrint}
            className={`${theme.primaryBg} text-white px-5 py-2.5 rounded-md ${theme.primaryHoverBg} shadow-sm hover:shadow-sm transition-all text-sm font-medium`}
          >
            <Icon name="printer" /> {t.print_button}
          </button>
        </div>
      </div>
    </div>
  );
}
