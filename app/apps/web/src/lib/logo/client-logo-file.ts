import { WORKSPACE_LOGO_MAX_DATAURL_CHARS } from "@/lib/logo/workspace-logo";

/**
 * Client-side only — rasterizes a user-picked logo file into a small data
 * URL ready for PUT /api/settings/workspace. Always re-encodes through a
 * canvas: strips EXIF, neutralizes SVG scripts, and bounds the stored size
 * regardless of what the user picked.
 */

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export const LOGO_FILE_ACCEPT = ACCEPTED_TYPES.join(",");

export async function processWorkspaceLogoFile(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Use a PNG, JPEG, WebP or SVG image");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Image is larger than 4 MB — pick a smaller file");
  }

  const img = await loadImage(file);
  // JPEG sources have no alpha channel — re-encode as JPEG (much smaller
  // for photographic logos). Everything else keeps transparency via PNG.
  const format = file.type === "image/jpeg" ? "image/jpeg" : "image/png";

  // Shrink until the encoded payload fits the storage cap.
  for (const maxPx of [256, 128, 64]) {
    const dataUrl = drawToDataUrl(img, maxPx, format);
    if (dataUrl.length <= WORKSPACE_LOGO_MAX_DATAURL_CHARS) return dataUrl;
  }
  throw new Error("Image is too complex to store — try a simpler logo");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the image — the file may be corrupted"));
    };
    img.src = url;
  });
}

function drawToDataUrl(img: HTMLImageElement, maxPx: number, format: string): string {
  // SVGs without an intrinsic size decode as 0x0 — give them a square canvas.
  const w = img.naturalWidth || maxPx;
  const h = img.naturalHeight || maxPx;
  const scale = Math.min(1, maxPx / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return format === "image/jpeg" ? canvas.toDataURL(format, 0.85) : canvas.toDataURL(format);
}
