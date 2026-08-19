import { useEffect, useState, useMemo, useRef } from "react";
import Icon from "../components/ui/Icon";
import { Link, useSearchParams } from "react-router-dom";
import { getSportstaetten, createSportstaette, updateSportstaette, deleteSportstaette, getVenueUsage, isTauri, VenueInUseError } from "../lib/db";
import { fill } from "../lib/i18n/format";
import type { VenueUsage } from "../lib/db";
import { getSessions } from "../lib/sessions";
import type { Sportstaette, HallConfig, Session } from "../lib/types";
import { parseHallConfig, hallConfigTotalCourts } from "../lib/types";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/I18nContext";
import { useToast } from "../lib/ToastContext";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import type { Translations } from "../lib/i18n/types";
import type { ThemeColors } from "../lib/theme";

const DEFAULT_HALLS: HallConfig[] = [{ name: "Halle 1", courts: 2 }];

function HallEditor({
  halls,
  onChange,
  theme,
  t,
  compact = false,
}: {
  halls: HallConfig[];
  onChange: (h: HallConfig[]) => void;
  theme: ThemeColors;
  t: Translations;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {halls.map((hall, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={hall.name}
            onChange={(e) => {
              const next = halls.map((h, i) => i === idx ? { ...h, name: e.target.value } : h);
              onChange(next);
            }}
            className={`${compact ? "flex-1 min-w-0" : "flex-1"} ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-sm px-3 py-1.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
            placeholder={t.venues_name_placeholder}
          />
          <input
            type="number"
            value={hall.courts}
            min={1}
            max={8}
            onChange={(e) => {
              const next = halls.map((h, i) => i === idx ? { ...h, courts: Number(e.target.value) || 1 } : h);
              onChange(next);
            }}
            className={`w-16 ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-sm px-2 py-1.5 text-sm text-center ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
          />
          <span className={`text-xs ${theme.textMuted} shrink-0`}>{t.common_fields}</span>
          {halls.length > 1 && (
            <button
              onClick={() => onChange(halls.filter((_, i) => i !== idx))}
              className={`${theme.textMuted} hover:text-danger-text text-sm transition-colors px-0.5 shrink-0`}
            >
              <Icon name="x" />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onChange([...halls, { name: `${t.venues_hall} ${halls.length + 1}`, courts: 2 }])}
          className={`text-xs font-medium ${theme.activeBadgeText} hover:opacity-80 transition-colors`}
        >
          {t.venues_add_hall}
        </button>
        <span className={`text-xs ${theme.textMuted}`}>
          {hallConfigTotalCourts(halls)} {t.common_fields}
        </span>
      </div>
    </div>
  );
}

export default function Sportstaetten() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showError } = useToast();
  useDocumentTitle(t.nav_venues);
  const [sportstaetten, setSportstaetten] = useState<Sportstaette[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [halls, setHalls] = useState<HallConfig[]>([...DEFAULT_HALLS]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editZip, setEditZip] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editHalls, setEditHalls] = useState<HallConfig[]>([]);

  // Filter
  const [search, setSearch] = useState("");

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ ids: number[]; names: string[] } | null>(null);
  // Blocked-delete modal: opens when the user tries to delete a venue
  // that is referenced by an active/draft tournament or active session.
  // Replaces the regular delete-confirm in that case so the user can
  // see exactly what's blocking and resolve it before retrying.
  const [deleteBlocked, setDeleteBlocked] = useState<{ venue: Sportstaette; usage: VenueUsage } | null>(null);

  // Active sessions across all venues — used by the "Active Sessions"
  // panel that links each venue card to the live dashboard.
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);

  const load = async () => {
    const s = await getSportstaetten();
    setSportstaetten(s);
    const ss = await getSessions();
    setActiveSessions(ss.filter((sess) => sess.status === "active"));
  };

  useEffect(() => { load(); }, []);

  // Deep-link support: /sportstaetten?edit=42 opens venue 42 in edit mode
  // and scrolls its row into view. Used by the TournamentCreate hall
  // section's "Edit venue" shortcut so the TD lands directly on the
  // right row without having to scan the table. v2.8.9.
  const [searchParams, setSearchParams] = useSearchParams();
  const editRowRefs = useRef<Map<number, HTMLTableRowElement | null>>(new Map());
  useEffect(() => {
    const editIdParam = searchParams.get("edit");
    if (!editIdParam) return;
    const targetId = Number(editIdParam);
    const venue = sportstaetten.find((s) => s.id === targetId);
    if (!venue) return; // not loaded yet — re-runs when sportstaetten populates
    handleEdit(venue);
    // Scroll on next tick so the row is mounted in edit mode first.
    setTimeout(() => {
      editRowRefs.current.get(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    // Strip the param so a subsequent reload doesn't keep re-triggering.
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportstaetten, searchParams]);

  const filteredSportstaetten = useMemo(() => {
    return sportstaetten.filter((s) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || (s.city ?? "").toLowerCase().includes(q);
    });
  }, [sportstaetten, search]);

  const canAddVenue = name.trim().length > 0;

  const handleAdd = async () => {
    if (!canAddVenue) return;
    const totalCourts = hallConfigTotalCourts(halls);
    const hallsJson = JSON.stringify(halls);
    await createSportstaette(name.trim(), address.trim() || null, zip.trim() || null, city.trim() || null, totalCourts, hallsJson);
    setName("");
    setAddress("");
    setZip("");
    setCity("");
    setHalls([...DEFAULT_HALLS]);
    load();
  };

  const handleEdit = (s: Sportstaette) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditAddress(s.address ?? "");
    setEditZip(s.zip ?? "");
    setEditCity(s.city ?? "");
    const parsed = parseHallConfig(s.halls);
    setEditHalls(parsed.length > 0 ? parsed : [{ name: `${t.venues_hall} 1`, courts: s.courts }]);
  };

  const handleSave = async () => {
    if (editingId === null || !editName.trim()) return;
    const totalCourts = hallConfigTotalCourts(editHalls);
    const hallsJson = JSON.stringify(editHalls);
    await updateSportstaette(editingId, editName.trim(), editAddress.trim() || null, editZip.trim() || null, editCity.trim() || null, totalCourts, hallsJson);
    setEditingId(null);
    load();
  };

  /**
   * Pre-flight check: if the venue is referenced by any active/draft
   * tournament or active session, open the blocking modal with the list of
   * blockers instead of the regular delete-confirm. The DB layer also
   * enforces this — the UI block is just a friendlier surface.
   */
  const handleDeleteSingle = async (s: Sportstaette) => {
    try {
      const usage = await getVenueUsage(s.id);
      if (usage.activeTournaments.length > 0 || usage.activeSessions.length > 0) {
        setDeleteBlocked({ venue: s, usage });
        return;
      }
      setDeleteTarget({ ids: [s.id], names: [s.name] });
    } catch (err) {
      console.error("getVenueUsage failed:", err);
      showError(String(err));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      for (const id of deleteTarget.ids) {
        await deleteSportstaette(id);
      }
      setDeleteTarget(null);
      load();
    } catch (err) {
      // The DB-layer guard surfaces here when something changed between
      // the pre-flight check and the actual delete (rare but possible).
      console.error("deleteSportstaette failed:", err);
      if (err instanceof VenueInUseError) {
        const names = [...err.tournaments, ...err.sessions].map((x) => x.name).join(", ");
        showError(fill(t.sportstaetten_in_use_error, { names }));
      } else {
        showError(String(err));
      }
      setDeleteTarget(null);
      load();
    }
  };

  const formatHallsSummary = (s: Sportstaette): string => {
    const parsed = parseHallConfig(s.halls);
    if (parsed.length === 0) return `${s.courts} ${t.common_fields}`;
    const totalCourts = hallConfigTotalCourts(parsed);
    return t.hall_summary
      .replace("{halls}", String(parsed.length))
      .replace("{hallLabel}", parsed.length === 1 ? t.venues_hall_singular : t.venues_hall_plural)
      .replace("{courts}", String(totalCourts))
      .replace("{courtLabel}", totalCourts === 1 ? t.venues_field_singular : t.venues_field_plural);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className={`text-2xl font-extrabold ${theme.textPrimary} tracking-tight`}>
            {t.venues_title}
          </h1>
          <p className={`text-sm ${theme.textSecondary} mt-0.5`}>
            {sportstaetten.length} {sportstaetten.length === 1 ? t.venues_count_singular : t.venues_count_plural} {t.venues_registered}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const data = sportstaetten.map((s) => ({
                name: s.name,
                address: s.address,
                zip: s.zip,
                city: s.city,
                halls: s.halls ? parseHallConfig(s.halls) : [{ name: `${t.venues_hall} 1`, courts: s.courts }],
              }));
              const json = JSON.stringify(data, null, 2);

              if (isTauri()) {
                try {
                  const { save } = await import("@tauri-apps/plugin-dialog");
                  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                  const path = await save({
                    defaultPath: "sportstaetten.json",
                    filters: [{ name: "JSON (*.json)", extensions: ["json"] }],
                  });
                  if (path) await writeTextFile(path, json);
                  return;
                } catch (err) {
                  console.error("Tauri save failed, falling back to browser download", err);
                }
              }

              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "sportstaetten.json";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            disabled={sportstaetten.length === 0}
            className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2 rounded-md ${theme.cardHoverBorder} hover:shadow-sm transition-all text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Icon name="upload" /> {t.common_export}
          </button>
          <label className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2 rounded-md ${theme.cardHoverBorder} hover:shadow-sm transition-all text-sm font-medium cursor-pointer`}>
            <Icon name="download" /> {t.common_import}
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (evt) => {
                  try {
                    const imported = JSON.parse(evt.target?.result as string);
                    if (!Array.isArray(imported)) return;
                    for (const s of imported) {
                      if (!s.name) continue;
                      const h = s.halls && Array.isArray(s.halls) ? s.halls : [{ name: `${t.venues_hall} 1`, courts: s.courts || 2 }];
                      const totalCourts = h.reduce((sum: number, hall: HallConfig) => sum + hall.courts, 0);
                      await createSportstaette(s.name, s.address || null, s.zip || null, s.city || null, totalCourts, JSON.stringify(h));
                    }
                    load();
                  } catch (err) {
                    console.error("Import fehlgeschlagen:", err);
                  }
                };
                reader.readAsText(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {/* Active Sessions panel — links to live dashboards for any session
          tied to one of these venues, plus the "Start session" shortcut. */}
      {activeSessions.length > 0 && (
        <div className={`${theme.cardBg} rounded-lg shadow-sm border ${theme.cardBorder} p-5 mb-6`}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className={`font-semibold ${theme.textPrimary}`}>
              <Icon name="link" /> {t.sportstaetten_active_sessions}
            </h2>
            <Link
              to="/sessions"
              className={`text-xs font-medium ${theme.activeBadgeText} hover:opacity-80`}
            >
              {t.sessions_title} <Icon name="arrowRight" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeSessions.map((sess) => {
              const venue = sportstaetten.find((v) => v.id === sess.venue_id);
              return (
                <div
                  key={sess.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 border ${theme.inputBorder} rounded-md ${theme.cardHoverBorder} transition-all`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${theme.textPrimary} truncate text-sm`}>
                      {sess.name}
                    </div>
                    <div className={`text-xs ${theme.textMuted} truncate`}>
                      <Icon name="building" /> {venue?.name ?? "—"}
                    </div>
                  </div>
                  <Link
                    to={`/sessions/${sess.id}/live`}
                    aria-label={t.session_pill_open_dashboard}
                    className={`${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} px-3 py-1 rounded-sm text-xs font-semibold whitespace-nowrap transition-all`}
                  >
                    <Icon name="monitor" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Sportstaette */}
      <div className={`${theme.cardBg} rounded-lg shadow-sm border ${theme.cardBorder} p-5 mb-6`}>
        <h2 className={`font-semibold ${theme.textPrimary} mb-3`}>{t.venues_new}</h2>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
              {t.common_name}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              required
              maxLength={120}
              className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-md px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
              placeholder={t.venues_name_placeholder}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
              {t.venues_address}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-md px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
              placeholder={t.venues_address_placeholder}
            />
          </div>
          <div>
            <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
              {t.venues_zip}
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className={`w-24 ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-md px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
              placeholder={t.venues_zip}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className={`block text-xs font-medium ${theme.textSecondary} mb-1 uppercase tracking-wide`}>
              {t.venues_city}
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-md px-4 py-2.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
              placeholder={t.venues_city_placeholder}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!canAddVenue}
            className={`${theme.primaryBg} text-white px-5 py-2.5 rounded-md ${theme.primaryHoverBg} shadow-sm hover:shadow-sm transition-all text-sm font-medium shrink-0 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:shadow-none`}
          >
            {t.common_add}
          </button>
        </div>
        {/* Halls editor */}
        <div className="mt-4">
          <label className={`block text-xs font-medium ${theme.textSecondary} mb-1.5 uppercase tracking-wide`}>
            {t.venues_halls}
          </label>
          <HallEditor halls={halls} onChange={setHalls} theme={theme} t={t} />
        </div>
      </div>

      {/* Filter + Table */}
      <div className={`${theme.cardBg} rounded-lg shadow-sm border ${theme.cardBorder} overflow-hidden`}>
        <div className={`px-5 py-3 border-b ${theme.cardBorder} flex items-center gap-3 flex-wrap`}>
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.venues_search_placeholder}
              className={`w-full ${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-sm pl-8 pr-3 py-1.5 text-sm ${theme.focusBorder} focus:ring-2 ${theme.focusRing} outline-none transition-all`}
            />
            <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${theme.textMuted} text-xs`}><Icon name="search" /></span>
            {search && (
              <button
                onClick={() => setSearch("")}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 ${theme.textMuted} hover:opacity-80 text-xs`}
              ><Icon name="x" /></button>
            )}
          </div>
        </div>

        {/* Info bar */}
        {search && (
          <div className={`px-5 py-1.5 text-xs ${theme.textMuted} border-b ${theme.cardBorder}`}>
            {t.venues_shown_of_total.replace("{shown}", String(filteredSportstaetten.length)).replace("{total}", String(sportstaetten.length))}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${theme.cardBorder} ${theme.headerGradient}`}>
                <th scope="col" className={`text-left px-3 py-3 font-semibold ${theme.standingsHeaderText} text-xs uppercase tracking-wide align-middle`}>
                  #
                </th>
                <th scope="col" className={`text-left px-3 py-3 font-semibold ${theme.standingsHeaderText} text-xs uppercase tracking-wide`}>
                  {t.common_name}
                </th>
                <th scope="col" className={`text-left px-3 py-3 font-semibold ${theme.standingsHeaderText} text-xs uppercase tracking-wide`}>
                  {t.venues_address}
                </th>
                <th scope="col" className={`text-left px-3 py-3 font-semibold ${theme.standingsHeaderText} text-xs uppercase tracking-wide`}>
                  {t.venues_zip}
                </th>
                <th scope="col" className={`text-left px-3 py-3 font-semibold ${theme.standingsHeaderText} text-xs uppercase tracking-wide`}>
                  {t.venues_city}
                </th>
                <th scope="col" className={`text-center px-3 py-3 font-semibold ${theme.standingsHeaderText} text-xs uppercase tracking-wide`}>
                  {t.venues_halls_courts}
                </th>
                <th scope="col" className={`text-right px-5 py-3 font-semibold ${theme.standingsHeaderText} text-xs uppercase tracking-wide`}>
                  {t.common_actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSportstaetten.map((s, i) => (
                <tr
                  key={s.id}
                  ref={(el) => { editRowRefs.current.set(s.id, el); }}
                  className={`border-b ${theme.cardBorder} last:border-0 transition-colors hover:${theme.cardBg} ${editingId === s.id ? "ring-2 ring-emerald-300/40" : ""}`}
                >
                  <td className={`px-3 py-3 ${theme.textMuted} font-mono text-xs`}>
                    {i + 1}
                  </td>
                  <td className={`px-3 py-3 font-medium ${theme.textPrimary}`}>
                    {editingId === s.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSave()}
                        className={`${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-sm px-3 py-1.5 text-sm w-full focus:ring-2 ${theme.focusRing} outline-none`}
                        autoFocus
                      />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td className={`px-3 py-3 ${theme.textSecondary}`}>
                    {editingId === s.id ? (
                      <input
                        type="text"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        className={`${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-sm px-3 py-1.5 text-sm w-full`}
                        placeholder={t.venues_address_placeholder}
                      />
                    ) : (
                      <span className="text-sm">{s.address ?? "-"}</span>
                    )}
                  </td>
                  <td className={`px-3 py-3 ${theme.textSecondary}`}>
                    {editingId === s.id ? (
                      <input
                        type="text"
                        value={editZip}
                        onChange={(e) => setEditZip(e.target.value)}
                        className={`${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-sm px-2 py-1.5 text-sm w-20`}
                        placeholder={t.venues_zip}
                      />
                    ) : (
                      <span className="text-sm">{s.zip ?? "-"}</span>
                    )}
                  </td>
                  <td className={`px-3 py-3 ${theme.textSecondary}`}>
                    {editingId === s.id ? (
                      <input
                        type="text"
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        className={`${theme.inputBg} ${theme.inputText} border ${theme.inputBorder} rounded-sm px-3 py-1.5 text-sm w-full`}
                        placeholder={t.venues_city_placeholder}
                      />
                    ) : (
                      <span className="text-sm">{s.city ?? "-"}</span>
                    )}
                  </td>
                  <td className={`px-3 py-3 ${theme.textSecondary}`}>
                    {editingId === s.id ? (
                      <div className="min-w-[200px]">
                        <HallEditor halls={editHalls} onChange={setEditHalls} theme={theme} t={t} compact />
                      </div>
                    ) : (
                      <span className="text-sm text-center block">{formatHallsSummary(s)}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {editingId === s.id ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={handleSave}
                          className={`${theme.activeBadgeText} text-sm font-medium`}
                        >
                          {t.common_save}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className={`${theme.textMuted} hover:opacity-80 text-sm`}
                        >
                          {t.common_cancel}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => handleEdit(s)}
                          className={`${theme.textMuted} hover:${theme.activeBadgeText} text-sm transition-colors`}
                        >
                          {t.common_edit}
                        </button>
                        <button
                          onClick={() => handleDeleteSingle(s)}
                          className={`${theme.textMuted} hover:text-danger-text text-sm transition-colors`}
                        >
                          {t.common_delete}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filteredSportstaetten.length === 0 && (
                <tr>
                  <td colSpan={7} className={`px-5 py-12 text-center ${theme.textMuted}`}>
                    {sportstaetten.length === 0
                      ? t.venues_none_yet
                      : t.venues_no_filter_results}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`${theme.cardBg} rounded-lg shadow-lg w-full max-w-md p-6 border ${theme.cardBorder}`}>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3"><Icon name="alert" /></div>
              <h3 className={`text-lg font-bold ${theme.textPrimary}`}>
                {t.venues_delete_title}
              </h3>
              <div className={`text-sm ${theme.textSecondary} mt-3`}>
                <div className="space-y-1">
                  {deleteTarget.names.map((n, i) => (
                    <div key={i} className={`font-medium ${theme.textPrimary}`}>
                      {n}
                    </div>
                  ))}
                </div>
                <p className={`mt-3 ${theme.textMuted} text-xs`}>
                  {t.common_action_irreversible}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className={`flex-1 ${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2.5 rounded-md hover:opacity-80 transition-all text-sm font-medium`}
              >
                {t.common_cancel}
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 bg-danger text-white px-4 py-2.5 rounded-md hover:bg-danger transition-all text-sm font-medium"
              >
                {t.common_delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete blocked: venue is referenced by an active/draft tournament
          or active session. Show what's blocking + a Close-only action. */}
      {deleteBlocked && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${theme.cardBg} rounded-lg shadow-lg w-full max-w-lg p-6 border ${theme.cardBorder}`}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-3"><Icon name="lock" /></div>
              <h3 className={`text-lg font-bold ${theme.textPrimary}`}>
                {t.venues_delete_blocked_title}
              </h3>
              <p className={`text-sm ${theme.textSecondary} mt-2`}>
                <strong>{deleteBlocked.venue.name}</strong>
              </p>
              <p className={`text-sm ${theme.textSecondary} mt-2`}>
                {t.venues_delete_blocked_message}
              </p>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {deleteBlocked.usage.activeTournaments.length > 0 && (
                <div>
                  <div className={`text-xs font-bold uppercase tracking-wide ${theme.textMuted} mb-1`}>
                    <Icon name="trophy" /> {t.venues_delete_blocked_tournaments_label} ({deleteBlocked.usage.activeTournaments.length})
                  </div>
                  <ul className={`space-y-1 text-sm ${theme.textPrimary} pl-1`}>
                    {deleteBlocked.usage.activeTournaments.map((tt) => (
                      <li key={`t-${tt.id}`} className="flex items-center gap-2">
                        <span className={`text-2xs uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                          tt.status === "active" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-info-subtle text-info-text border-info"
                        }`}>
                          {tt.status}
                        </span>
                        <span className="truncate">{tt.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {deleteBlocked.usage.activeSessions.length > 0 && (
                <div>
                  <div className={`text-xs font-bold uppercase tracking-wide ${theme.textMuted} mb-1`}>
                    <Icon name="link" /> {t.venues_delete_blocked_sessions_label} ({deleteBlocked.usage.activeSessions.length})
                  </div>
                  <ul className={`space-y-1 text-sm ${theme.textPrimary} pl-1`}>
                    {deleteBlocked.usage.activeSessions.map((ss) => (
                      <li key={`s-${ss.id}`} className="truncate">{ss.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <p className={`mt-4 text-xs ${theme.textMuted} italic text-center`}>
              {t.venues_delete_blocked_resolve_hint}
            </p>

            <div className="flex justify-end mt-5">
              <button
                onClick={() => setDeleteBlocked(null)}
                className={`${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryText} px-5 py-2 rounded-md text-sm font-semibold transition-all`}
              >
                {t.common_close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
