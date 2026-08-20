// src/pages/settings/LogoSettings.tsx
//
// Club logo: upload, crop to a square, store in the database.
// Extracted from the 1483-line Settings page (REVIEW-BACKLOG.md D5).

import { useEffect, useState, useRef } from "react";
import Icon from "../../components/ui/Icon";
import { getAppSetting, setAppSetting, deleteAppSetting } from "../../lib/db";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/I18nContext";
import { useToast } from "../../lib/ToastContext";

const LOGO_KEY = "custom_logo";
const LOGO_CACHE_KEY = "turnierplaner_logo_cache"; // localStorage cache for sync access

// Sync getter (uses localStorage cache, populated from DB on load)
export function getCustomLogo(): string | null {
  try { return localStorage.getItem(LOGO_CACHE_KEY); } catch (err) { console.error("getCustomLogo: failed to read logo from localStorage:", err); return null; }
}

// Async: load from DB and update cache
async function loadLogoFromDb(): Promise<string | null> {
  const logo = await getAppSetting(LOGO_KEY);
  if (logo) {
    localStorage.setItem(LOGO_CACHE_KEY, logo);
  } else {
    localStorage.removeItem(LOGO_CACHE_KEY);
  }
  return logo;
}

// Save to DB + cache
async function saveLogoToDb(dataUrl: string): Promise<void> {
  await setAppSetting(LOGO_KEY, dataUrl);
  localStorage.setItem(LOGO_CACHE_KEY, dataUrl);
}

// Delete from DB + cache
async function deleteLogoFromDb(): Promise<void> {
  await deleteAppSetting(LOGO_KEY);
  localStorage.removeItem(LOGO_CACHE_KEY);
}

function LogoCropper({
  imageSrc,
  onSave,
  onCancel,
}: {
  imageSrc: string;
  onSave: (croppedDataUrl: string) => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const OUTPUT_SIZE = 256; // final image px (1:1 square)

  const [imgLoaded, setImgLoaded] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, size: 100 });
  const [dragging, setDragging] = useState<"move" | "resize" | null>(null);
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, bx: 0, by: 0, bs: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;

      // Fit image into container (max 400px)
      const maxW = 400;
      const maxH = 400;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const dw = Math.round(img.width * scale);
      const dh = Math.round(img.height * scale);
      setDisplaySize({ w: dw, h: dh });

      // Initial crop box: centered square, as large as possible
      const initSize = Math.min(dw, dh) * 0.8;
      setCropBox({
        x: (dw - initSize) / 2,
        y: (dh - initSize) / 2,
        size: initSize,
      });
      setImgLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Draw overlay
  useEffect(() => {
    if (!imgLoaded || !canvasRef.current || !imgRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    const { w, h } = displaySize;
    canvasRef.current.width = w;
    canvasRef.current.height = h;

    // Draw image
    ctx.drawImage(imgRef.current, 0, 0, w, h);

    // Dark overlay outside crop
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);

    // Clear crop area (show original image)
    ctx.clearRect(cropBox.x, cropBox.y, cropBox.size, cropBox.size);
    ctx.drawImage(
      imgRef.current,
      0, 0, imgRef.current.width, imgRef.current.height,
      0, 0, w, h
    );
    // Re-darken outside
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    // Top
    ctx.fillRect(0, 0, w, cropBox.y);
    // Bottom
    ctx.fillRect(0, cropBox.y + cropBox.size, w, h - cropBox.y - cropBox.size);
    // Left
    ctx.fillRect(0, cropBox.y, cropBox.x, cropBox.size);
    // Right
    ctx.fillRect(cropBox.x + cropBox.size, cropBox.y, w - cropBox.x - cropBox.size, cropBox.size);

    // Crop border
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(cropBox.x, cropBox.y, cropBox.size, cropBox.size);

    // Corner handles
    const hs = 8;
    ctx.fillStyle = "#fff";
    // Bottom-right resize handle
    ctx.fillRect(cropBox.x + cropBox.size - hs, cropBox.y + cropBox.size - hs, hs, hs);
  }, [imgLoaded, cropBox, displaySize]);

  const getPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { mx: 0, my: 0 };
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const { mx, my } = getPos(e);
    const { x, y, size } = cropBox;
    const hs = 12;

    // Check resize handle (bottom-right)
    if (mx >= x + size - hs && mx <= x + size + 4 && my >= y + size - hs && my <= y + size + 4) {
      setDragging("resize");
      setDragStart({ mx, my, bx: x, by: y, bs: size });
      return;
    }

    // Check inside crop = move
    if (mx >= x && mx <= x + size && my >= y && my <= y + size) {
      setDragging("move");
      setDragStart({ mx, my, bx: x, by: y, bs: size });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const { mx, my } = getPos(e);
    const dx = mx - dragStart.mx;
    const dy = my - dragStart.my;
    const { w, h } = displaySize;
    const minSize = 40;

    if (dragging === "move") {
      const newX = Math.max(0, Math.min(w - cropBox.size, dragStart.bx + dx));
      const newY = Math.max(0, Math.min(h - cropBox.size, dragStart.by + dy));
      setCropBox((b) => ({ ...b, x: newX, y: newY }));
    } else if (dragging === "resize") {
      // Keep aspect 1:1, use diagonal distance
      const delta = Math.max(dx, dy);
      let newSize = Math.max(minSize, dragStart.bs + delta);
      // Clamp to container
      newSize = Math.min(newSize, w - cropBox.x, h - cropBox.y);
      setCropBox((b) => ({ ...b, size: newSize }));
    }
  };

  const handleMouseUp = () => setDragging(null);

  const handleSave = () => {
    if (!imgRef.current) return;
    const { w, h } = displaySize;
    const img = imgRef.current;

    // Convert display coords to original image coords
    const scaleX = img.width / w;
    const scaleY = img.height / h;
    const sx = cropBox.x * scaleX;
    const sy = cropBox.y * scaleY;
    const ss = cropBox.size * Math.min(scaleX, scaleY);

    // Draw cropped area to output canvas
    const out = document.createElement("canvas");
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(img, sx, sy, ss, ss, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    onSave(out.toDataURL("image/png", 0.9));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`${theme.cardBg} rounded-lg shadow-lg border ${theme.cardBorder} p-6 max-w-lg w-full`}>
        <h3 className={`text-lg font-bold ${theme.textPrimary} mb-1`}>{t.settings_logo_crop_title}</h3>
        <p className={`text-xs ${theme.textMuted} mb-4`}>
          {t.settings_logo_crop_hint}
        </p>

        {/* Canvas */}
        <div ref={containerRef} className="flex justify-center mb-4">
          <canvas
            ref={canvasRef}
            width={displaySize.w || 400}
            height={displaySize.h || 400}
            className="rounded-sm cursor-crosshair select-none"
            style={{ maxWidth: "100%" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className={`${theme.cardBg} border ${theme.inputBorder} ${theme.textSecondary} px-4 py-2 rounded-md hover:opacity-80 transition-all text-sm font-medium`}
          >
            {t.common_cancel}
          </button>
          <button
            onClick={handleSave}
            className={`${theme.primaryBg} text-white px-4 py-2 rounded-md ${theme.primaryHoverBg} shadow-sm transition-all text-sm font-medium`}
          >
            {t.settings_logo_crop_save}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LogoUploader() {
  const { theme } = useTheme();
  const { t } = useT();
  const { showError } = useToast();
  const [logo, setLogo] = useState<string | null>(() => getCustomLogo());
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load from DB on mount (updates cache)
  useEffect(() => {
    loadLogoFromDb().then((dbLogo) => {
      setLogo(dbLogo);
    });
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max 10MB for source (will be cropped+compressed to ~256x256 PNG)
    if (file.size > 10 * 1024 * 1024) {
      showError(t.settings_logo_too_large);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleCropSave = async (croppedDataUrl: string) => {
    // Limit cropped data URI to 500KB to prevent localStorage quota issues
    if (croppedDataUrl.length > 500_000) {
      showError(t.settings_logo_cropped_too_large);
      return;
    }
    await saveLogoToDb(croppedDataUrl);
    setLogo(croppedDataUrl);
    setCropSrc(null);
    window.dispatchEvent(new Event("logo-changed"));
  };

  const handleRemove = async () => {
    await deleteLogoFromDb();
    setLogo(null);
    window.dispatchEvent(new Event("logo-changed"));
  };

  return (
    <div className={`mt-5 pt-5 border-t ${theme.cardBorder}`}>
      <label className={`block text-xs font-medium ${theme.textSecondary} mb-3 uppercase tracking-wide`}>
        {t.settings_club_logo}
      </label>
      <div className="flex items-center gap-4">
        {/* Preview */}
        <div
          className={`w-16 h-16 rounded-md border-2 border-dashed ${theme.inputBorder} flex items-center justify-center overflow-hidden shrink-0 ${
            logo ? "border-solid" : ""
          }`}
        >
          {logo ? (
            <img src={logo} alt="Logo" className="w-full h-full object-contain" />
          ) : (
            <span className="text-muted" aria-hidden="true">
              <Icon name="file" size={28} />
            </span>
          )}
        </div>

        <div className="flex-1">
          <div className="flex gap-2 mb-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              className={`${theme.primaryBg} text-white px-3 py-1.5 rounded-sm ${theme.primaryHoverBg} transition-all text-xs font-medium`}
            >
              {logo ? t.settings_logo_change : t.settings_logo_upload}
            </button>
            {logo && (
              <button
                onClick={handleRemove}
                className="text-danger-text hover:text-danger-text px-3 py-1.5 rounded-sm text-xs font-medium transition-colors"
              >
                {t.settings_logo_remove}
              </button>
            )}
          </div>
          <div className={`text-2xs ${theme.textMuted}`}>
            {t.settings_logo_hint}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={handleFile}
            className="hidden"
          />
        </div>
      </div>

      {/* Cropper Modal */}
      {cropSrc && (
        <LogoCropper
          imageSrc={cropSrc}
          onSave={handleCropSave}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}
