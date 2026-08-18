import { useState, useRef, useEffect } from "react";
// Type-only: the library itself is fetched when a file is picked, so the
// ~800 KB stay out of the start bundle (REVIEW-BACKLOG.md E1).
import type ExcelJS from "exceljs";
import { createPlayer, getPlayers } from "../../lib/db";
import type { Gender, Player } from "../../lib/types";
import { playerDisplayName } from "../../lib/types";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/I18nContext";

interface ExcelImportProps {
  onImportDone: () => void;
  onClose: () => void;
}

type Step = "upload" | "mapping" | "preview" | "done";

const GENDER_MAP: Record<string, Gender> = {
  m: "m",
  M: "m",
  herr: "m",
  Herr: "m",
  mann: "m",
  Mann: "m",
  male: "m",
  Male: "m",
  maennlich: "m",
  männlich: "m",
  Männlich: "m",
  h: "m",
  H: "m",
  f: "f",
  F: "f",
  dame: "f",
  Dame: "f",
  frau: "f",
  Frau: "f",
  female: "f",
  Female: "f",
  weiblich: "f",
  Weiblich: "f",
  w: "f",
  W: "f",
  d: "f",
  D: "f",
};

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function findFuzzyMatch(name: string, existingNames: { lower: string; original: string }[], threshold = 0.75): string | null {
  const lower = name.toLowerCase();
  let bestMatch: string | null = null;
  let bestScore = 0;
  for (const existing of existingNames) {
    if (existing.lower === lower) continue; // exact match handled separately
    const score = similarity(lower, existing.lower);
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestMatch = existing.original;
    }
  }
  return bestMatch;
}

function parseGender(val: unknown): Gender | null {
  if (val == null) return null;
  const str = String(val).trim();
  return GENDER_MAP[str] ?? null;
}

export default function ExcelImport({ onImportDone, onClose }: ExcelImportProps) {
  const { theme } = useTheme();
  const { t } = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);

  // Mapping
  const [firstNameCol, setFirstNameCol] = useState("");
  const [lastNameCol, setLastNameCol] = useState("");
  const [genderCol, setGenderCol] = useState("");
  const [birthDateCol, setBirthDateCol] = useState("");
  const [clubCol, setClubCol] = useState("");
  const [defaultGender, setDefaultGender] = useState<Gender>("m");

  // Existing players for duplicate check
  const [existingPlayers, setExistingPlayers] = useState<Player[]>([]);

  // Preview
  const [previewRows, setPreviewRows] = useState<
    { firstName: string; lastName: string; gender: Gender; birthDate: string | null; club: string | null; valid: boolean; duplicate: boolean; fuzzyMatch: string | null; skipFuzzy: boolean }[]
  >([]);
  const [importCount, setImportCount] = useState(0);
  const [importing, setImporting] = useState(false);

  // Workbook ref for sheet switching
  const workbookRef = useRef<ExcelJS.Workbook | null>(null);

  useEffect(() => {
    getPlayers().then(setExistingPlayers);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const arrayBuffer = evt.target?.result as ArrayBuffer;
      const { default: ExcelJSRuntime } = await import("exceljs");
      const wb = new ExcelJSRuntime.Workbook();
      await wb.xlsx.load(arrayBuffer);
      workbookRef.current = wb;

      const sheetNames = wb.worksheets.map((ws) => ws.name);
      setSheets(sheetNames);
      if (sheetNames.length > 0) {
        loadSheet(wb, sheetNames[0]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  function worksheetToJson(ws: ExcelJS.Worksheet): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const headers: string[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // Header row
        row.eachCell((cell, colNumber) => {
          headers[colNumber] = cell.value != null ? String(cell.value) : `Column${colNumber}`;
        });
        return;
      }
      const obj: Record<string, unknown> = {};
      row.eachCell((cell, colNumber) => {
        const key = headers[colNumber] ?? `Column${colNumber}`;
        obj[key] = cell.value instanceof Date ? cell.value : cell.value;
      });
      // Only add row if it has at least one non-empty value
      if (Object.keys(obj).length > 0) {
        rows.push(obj);
      }
    });
    return rows;
  }

  const loadSheet = (wb: ExcelJS.Workbook, sheetName: string) => {
    setSelectedSheet(sheetName);
    const ws = wb.getWorksheet(sheetName);
    if (!ws) return;
    const json = worksheetToJson(ws);
    setRawData(json);

    if (json.length > 0) {
      const cols = Object.keys(json[0]);
      setColumns(cols);

      // Auto-detect by header name — no data manipulation, just header matching
      const find = (keywords: string[]) =>
        cols.find((c) => keywords.some((k) => c.trim().toLowerCase() === k)) ?? "";

      setFirstNameCol(find(["vorname", "firstname", "first name", "first_name", "fname", "givenname", "given name", "given_name", "prenom", "nome"]));
      setLastNameCol(find(["nachname", "lastname", "last name", "last_name", "lname", "surname", "familienname", "family name", "family_name", "nom"]));
      setGenderCol(find(["geschlecht", "gender", "sex", "sexe", "genero"]));
      setBirthDateCol(find(["geburtsdatum", "geburtstag", "birthdate", "birth date", "birth_date", "dob", "date of birth", "datum", "alter", "age", "jahrgang", "birth year", "birthyear"]));
      setClubCol(find(["verein", "club", "team", "organisation", "organization", "mannschaft"]));
    }

    setStep("mapping");
  };

  const handleSheetChange = (sheetName: string) => {
    if (workbookRef.current) {
      loadSheet(workbookRef.current, sheetName);
    }
  };

  const handlePreview = () => {
    const existingNames = new Set(
      existingPlayers.map((p) => playerDisplayName(p).toLowerCase().trim())
    );
    const existingNameList = existingPlayers.map((p) => ({
      lower: playerDisplayName(p).toLowerCase().trim(),
      original: playerDisplayName(p),
    }));
    const seenInImport = new Set<string>();

    const rows = rawData.map((row) => {
      let firstName = "";
      let lastName = "";
      if (firstNameCol) {
        const rawFirst = row[firstNameCol];
        firstName = rawFirst != null ? String(rawFirst).trim() : "";
      }
      if (lastNameCol) {
        const rawLast = row[lastNameCol];
        lastName = rawLast != null ? String(rawLast).trim() : "";
      }

      const displayName = lastName ? `${firstName} ${lastName}` : firstName;
      const nameLower = displayName.toLowerCase();

      let gender: Gender;
      if (genderCol && row[genderCol] != null) {
        gender = parseGender(row[genderCol]) ?? defaultGender;
      } else {
        gender = defaultGender;
      }

      const duplicate =
        firstName.length > 0 &&
        (existingNames.has(nameLower) || seenInImport.has(nameLower));

      // Fuzzy match only if not an exact duplicate
      const fuzzyMatch = !duplicate && firstName.length > 0
        ? findFuzzyMatch(displayName, existingNameList)
        : null;

      if (firstName.length > 0) seenInImport.add(nameLower);

      const rawBirthDate = birthDateCol ? row[birthDateCol] : null;
      let birthDate: string | null = null;
      if (rawBirthDate != null) {
        const raw = rawBirthDate;
        if (raw instanceof Date) {
          // XLSX may return JS Date objects
          birthDate = raw.toISOString().split("T")[0];
        } else if (typeof raw === "number") {
          if (raw > 59000 && raw < 100000) {
            // Excel serial date number: convert to JS date
            // Excel epoch is 1900-01-01, but off by 1 due to Lotus 1-2-3 bug
            const excelEpoch = new Date(1899, 11, 30);
            const d = new Date(excelEpoch.getTime() + raw * 86400000);
            birthDate = d.toISOString().split("T")[0];
          } else if (raw > 1900 && raw < 2100) {
            // Birth year only: convert to YYYY-01-01
            birthDate = `${raw}-01-01`;
          } else if (raw > 0 && raw < 200) {
            // Age: convert to birth year, then YYYY-01-01
            const year = new Date().getFullYear() - raw;
            birthDate = `${year}-01-01`;
          }
        } else {
          const str = String(raw).trim();
          // Try DD.MM.YYYY or DD/MM/YYYY (European format)
          const euMatch = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
          if (euMatch) {
            const [, day, month, year] = euMatch;
            birthDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
          } else {
            // Try YYYY-MM-DD (ISO format)
            const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
            if (isoMatch) {
              birthDate = str;
            } else {
              // Try MM/DD/YYYY (US format)
              const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
              if (usMatch) {
                const [, month, day, year] = usMatch;
                birthDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
              } else {
                // Try generic JS Date parsing
                const parsed = new Date(str);
                if (!isNaN(parsed.getTime()) && str.length > 4) {
                  birthDate = parsed.toISOString().split("T")[0];
                } else {
                  // Try as number (year or age)
                  const num = Number(str);
                  if (num > 1900 && num < 2100) {
                    birthDate = `${num}-01-01`;
                  } else if (num > 0 && num < 200) {
                    const year = new Date().getFullYear() - num;
                    birthDate = `${year}-01-01`;
                  }
                }
              }
            }
          }
        }
      }
      const rawClub = clubCol ? row[clubCol] : null;
      const club = rawClub != null ? String(rawClub).trim() || null : null;

      return { firstName, lastName, gender, birthDate, club, valid: firstName.length > 0, duplicate, fuzzyMatch, skipFuzzy: false };
    });

    setPreviewRows(rows);
    setStep("preview");
  };

  const handleImport = async () => {
    setImporting(true);
    let count = 0;

    for (const row of previewRows) {
      if (!row.valid || row.duplicate || (row.fuzzyMatch && row.skipFuzzy)) continue;
      try {
        await createPlayer(row.firstName, row.lastName || "", row.gender, row.birthDate || null, row.club || null);
        count++;
      } catch (err) {
        console.error("Import error for", row.firstName, row.lastName, ":", err);
      }
    }

    setImportCount(count);
    setImporting(false);
    setStep("done");
    onImportDone();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`${theme.cardBg} rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border ${theme.cardBorder} overflow-hidden`}>
        {/* Header */}
        <div className="px-5 py-4 border-b flex justify-between items-center">
          <h2 className={`font-semibold text-lg ${theme.textPrimary}`}>{t.import_title}</h2>
          <button
            onClick={onClose}
            className={`${theme.textMuted} hover:opacity-80 text-xl leading-none`}
          >
            ×
          </button>
        </div>

        {/* Steps indicator */}
        <div className={`px-5 py-3 border-b ${theme.cardBorder} ${theme.headerGradient} flex gap-4 text-xs`}>
          {(["upload", "mapping", "preview", "done"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-1.5 ${
                step === s
                  ? `${theme.activeBadgeText} font-semibold`
                  : previewRows.length > 0 || i < ["upload", "mapping", "preview", "done"].indexOf(step)
                  ? theme.textSecondary
                  : theme.textMuted
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  step === s
                    ? `${theme.primaryBg} text-white`
                    : i < ["upload", "mapping", "preview", "done"].indexOf(step)
                    ? "bg-gray-500/70 text-white"
                    : `bg-gray-500/20 ${theme.textMuted}`
                }`}
              >
                {i + 1}
              </span>
              {s === "upload"
                ? t.import_step_file
                : s === "mapping"
                ? t.import_step_mapping
                : s === "preview"
                ? t.import_step_preview
                : t.import_step_done}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="text-center py-8">
              <div className={`mb-4 ${theme.textSecondary}`}>
                {t.import_file_hint}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className={`${theme.primaryBg} text-white px-6 py-3 rounded ${theme.primaryHoverBg} transition-colors`}
              >
                {t.import_choose_file}
              </button>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === "mapping" && (
            <div className="space-y-4">
              {sheets.length > 1 && (
                <div>
                  <label className={`block text-sm ${theme.textSecondary} mb-1`}>
                    {t.import_sheet}
                  </label>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className={`w-full border rounded px-3 py-2 text-sm ${theme.inputBg} ${theme.inputBorder} ${theme.inputText}`}
                  >
                    {sheets.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={`${theme.activeBadgeBg} border ${theme.cardBorder} rounded p-3 text-sm ${theme.activeBadgeText}`}>
                {t.import_rows_found.replace("{count}", String(rawData.length))}
              </div>

              <div>
                <label className={`block text-sm ${theme.textSecondary} mb-1`}>
                  {t.import_column_first_name} *
                </label>
                <select
                  value={firstNameCol}
                  onChange={(e) => setFirstNameCol(e.target.value)}
                  className={`w-full border rounded px-3 py-2 text-sm ${theme.inputBg} ${theme.inputBorder} ${theme.inputText}`}
                >
                  <option value="">{t.import_please_select}</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm ${theme.textSecondary} mb-1`}>
                  {t.import_column_last_name}
                </label>
                <select
                  value={lastNameCol}
                  onChange={(e) => setLastNameCol(e.target.value)}
                  className={`w-full border rounded px-3 py-2 text-sm ${theme.inputBg} ${theme.inputBorder} ${theme.inputText}`}
                >
                  <option value="">{t.import_not_available}</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm ${theme.textSecondary} mb-1`}>
                  {t.import_column_gender}
                </label>
                <select
                  value={genderCol}
                  onChange={(e) => setGenderCol(e.target.value)}
                  className={`w-full border rounded px-3 py-2 text-sm ${theme.inputBg} ${theme.inputBorder} ${theme.inputText}`}
                >
                  <option value="">{t.import_not_available}</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm ${theme.textSecondary} mb-1`}>
                  {t.import_column_age}
                </label>
                <select
                  value={birthDateCol}
                  onChange={(e) => setBirthDateCol(e.target.value)}
                  className={`w-full border rounded px-3 py-2 text-sm ${theme.inputBg} ${theme.inputBorder} ${theme.inputText}`}
                >
                  <option value="">{t.import_not_available}</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm ${theme.textSecondary} mb-1`}>
                  {t.import_column_club}
                </label>
                <select
                  value={clubCol}
                  onChange={(e) => setClubCol(e.target.value)}
                  className={`w-full border rounded px-3 py-2 text-sm ${theme.inputBg} ${theme.inputBorder} ${theme.inputText}`}
                >
                  <option value="">{t.import_not_available}</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {!genderCol && (
                <div>
                  <label className={`block text-sm ${theme.textSecondary} mb-1`}>
                    {t.import_default_gender}
                  </label>
                  <select
                    value={defaultGender}
                    onChange={(e) => setDefaultGender(e.target.value as Gender)}
                    className={`w-full border rounded px-3 py-2 text-sm ${theme.inputBg} ${theme.inputBorder} ${theme.inputText}`}
                  >
                    <option value="m">{t.common_gender_male}</option>
                    <option value="f">{t.common_gender_female}</option>
                  </select>
                </div>
              )}

              {/* Live preview of first rows */}
              {firstNameCol && rawData.length > 0 && (
                <div>
                  <div className={`text-sm ${theme.textSecondary} mb-2`}>
                    {t.import_preview_first_rows}
                  </div>
                  <table className={`w-full text-xs border ${theme.cardBorder} ${theme.inputText}`}>
                    <thead>
                      <tr className={theme.headerGradient}>
                        <th className={`px-2 py-1 text-left border ${theme.cardBorder}`}>{t.common_first_name}</th>
                        {lastNameCol && <th className={`px-2 py-1 text-left border ${theme.cardBorder}`}>{t.common_last_name}</th>}
                        <th className={`px-2 py-1 text-left border ${theme.cardBorder}`}>{t.common_gender}</th>
                        {birthDateCol && <th className={`px-2 py-1 text-left border ${theme.cardBorder}`}>{t.common_birth_date}</th>}
                        {clubCol && <th className={`px-2 py-1 text-left border ${theme.cardBorder}`}>{t.common_club}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 5).map((row, i) => {
                        const fn = firstNameCol && row[firstNameCol] ? String(row[firstNameCol]).trim() : "";
                        const ln = lastNameCol && row[lastNameCol] ? String(row[lastNameCol]).trim() : "";
                        const gender = genderCol
                          ? parseGender(row[genderCol]) ?? defaultGender
                          : defaultGender;
                        const rawBirth = birthDateCol ? row[birthDateCol] : null;
                        const birthStr = rawBirth != null ? String(rawBirth).trim() : "";
                        const rawClub = clubCol ? row[clubCol] : null;
                        const clubStr = rawClub != null ? String(rawClub).trim() : "";
                        return (
                          <tr key={i} className={`border-t ${theme.cardBorder}`}>
                            <td className={`px-2 py-1 border ${theme.cardBorder}`}>
                              {fn || <span className={theme.textMuted}>{t.import_empty}</span>}
                            </td>
                            {lastNameCol && (
                              <td className={`px-2 py-1 border ${theme.cardBorder}`}>
                                {ln || <span className={theme.textMuted}>-</span>}
                              </td>
                            )}
                            <td className={`px-2 py-1 border ${theme.cardBorder}`}>
                              {gender === "m" ? t.common_gender_male : t.common_gender_female}
                            </td>
                            {birthDateCol && <td className={`px-2 py-1 border ${theme.cardBorder}`}>{birthStr || "-"}</td>}
                            {clubCol && <td className={`px-2 py-1 border ${theme.cardBorder}`}>{clubStr || "-"}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && (
            <div>
              <div className={`mb-3 text-sm ${theme.textSecondary}`}>
                {t.import_will_import
                  .replace("{count}", String(previewRows.filter((r) => r.valid && !r.duplicate && !(r.fuzzyMatch && r.skipFuzzy)).length))
                  .replace("{total}", String(previewRows.length))}
                {previewRows.some((r) => !r.valid) && (
                  <span className="text-danger-text ml-1">
                    ({previewRows.filter((r) => !r.valid).length} {t.import_no_name})
                  </span>
                )}
                {previewRows.some((r) => r.duplicate) && (
                  <span className="text-orange-500 ml-1">
                    ({previewRows.filter((r) => r.duplicate).length} {t.import_duplicate})
                  </span>
                )}
                {previewRows.some((r) => r.fuzzyMatch) && (
                  <span className="text-warning-text ml-1">
                    ({t.import_fuzzy_count.replace("{count}", String(previewRows.filter((r) => r.fuzzyMatch).length))})
                  </span>
                )}
              </div>
              <div className="max-h-60 overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className={`${theme.headerGradient} sticky top-0`}>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs">#</th>
                      <th className="px-3 py-2 text-left text-xs">{t.common_first_name}</th>
                      {previewRows.some(r => r.lastName) && <th className="px-3 py-2 text-left text-xs">{t.common_last_name}</th>}
                      <th className="px-3 py-2 text-left text-xs">{t.common_gender}</th>
                      {previewRows.some(r => r.birthDate) && <th className="px-3 py-2 text-left text-xs">{t.common_birth_date}</th>}
                      {previewRows.some(r => r.club) && <th className="px-3 py-2 text-left text-xs">{t.common_club}</th>}
                      <th className="px-3 py-2 text-left text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-t ${
                          !row.valid
                            ? `bg-danger/10 ${theme.textMuted}`
                            : row.duplicate
                            ? `bg-orange-500/10 ${theme.textMuted}`
                            : row.fuzzyMatch
                            ? `bg-warning/10`
                            : ""
                        }`}
                      >
                        <td className={`px-3 py-1.5 ${theme.textMuted}`}>{i + 1}</td>
                        <td className="px-3 py-1.5">
                          <div>{row.firstName || <em>{t.import_empty}</em>}</div>
                          {row.fuzzyMatch && (
                            <div className="text-[10px] text-warning-text mt-0.5">
                              {t.import_fuzzy_match.replace("{name}", row.fuzzyMatch)}
                            </div>
                          )}
                        </td>
                        {previewRows.some(r => r.lastName) && (
                          <td className="px-3 py-1.5">{row.lastName || <span className={theme.textMuted}>-</span>}</td>
                        )}
                        <td className="px-3 py-1.5">
                          {row.gender === "m" ? t.common_gender_male : t.common_gender_female}
                        </td>
                        {previewRows.some(r => r.birthDate) && (
                          <td className={`px-3 py-1.5 ${theme.textMuted} text-xs`}>{row.birthDate || "-"}</td>
                        )}
                        {previewRows.some(r => r.club) && (
                          <td className={`px-3 py-1.5 ${theme.textMuted} text-xs`}>{row.club || "-"}</td>
                        )}
                        <td className="px-3 py-1.5">
                          {row.duplicate ? (
                            <span className="text-orange-500 text-xs">
                              {t.import_duplicate}
                            </span>
                          ) : row.fuzzyMatch ? (
                            <button
                              onClick={() => {
                                setPreviewRows(prev => prev.map((r, idx) =>
                                  idx === i ? { ...r, skipFuzzy: !r.skipFuzzy } : r
                                ));
                              }}
                              className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                                row.skipFuzzy
                                  ? "bg-danger/20 text-danger-text"
                                  : "bg-emerald-500/20 text-emerald-600"
                              }`}
                            >
                              {row.skipFuzzy ? t.import_fuzzy_skip : t.import_fuzzy_keep}
                            </button>
                          ) : row.valid ? (
                            <span className="text-green-600 text-xs">OK</span>
                          ) : (
                            <span className="text-danger-text text-xs">
                              {t.import_no_name}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✓</div>
              <div className={`text-lg font-medium ${theme.activeBadgeText}`}>
                {t.import_players_imported.replace("{count}", String(importCount))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t ${theme.cardBorder} ${theme.headerGradient} flex justify-between`}>
          <button
            onClick={
              step === "done"
                ? onClose
                : step === "preview"
                ? () => setStep("mapping")
                : step === "mapping"
                ? () => {
                    setStep("upload");
                    setRawData([]);
                    setColumns([]);
                  }
                : onClose
            }
            className={`px-4 py-2 text-sm ${theme.textSecondary} hover:opacity-80`}
          >
            {step === "done" ? t.common_close : t.common_back}
          </button>

          {step === "mapping" && (
            <button
              onClick={handlePreview}
              disabled={!firstNameCol}
              className={`${theme.primaryBg} text-white px-4 py-2 rounded text-sm ${theme.primaryHoverBg} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {t.import_continue_preview}
            </button>
          )}
          {step === "preview" && (
            <button
              onClick={handleImport}
              disabled={importing || previewRows.filter((r) => r.valid && !r.duplicate).length === 0}
              className={`${theme.primaryBg} text-white px-4 py-2 rounded text-sm ${theme.primaryHoverBg} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {importing ? t.import_importing : t.import_import_button}
            </button>
          )}
          {step === "done" && (
            <button
              onClick={onClose}
              className={`${theme.primaryBg} text-white px-4 py-2 rounded text-sm ${theme.primaryHoverBg}`}
            >
              {t.common_done}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
