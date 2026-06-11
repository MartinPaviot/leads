/**
 * Workspace logo — shared validation + serving helpers.
 *
 * The logo is stored as a small raster data URL inside `tenants.settings`
 * (`logoDataUrl` + `logoUpdatedAt`, see lib/config/tenant-settings.ts) and
 * served to the browser through GET /api/settings/workspace/logo. The bytes
 * must never be inlined into SSR payloads or LLM prompts — pass around the
 * versioned URL from `workspaceLogoUrl()` instead.
 *
 * The validate/parse helpers are generic "small raster image data URL"
 * rules and are reused by per-user profile photos (lib/users/avatar.ts) —
 * if a third consumer appears, extract them to lib/images/.
 */

/** Hard cap on the stored data URL length (chars). ~400k chars of base64 is
 * ~300 KB of binary — far above what a 256px logo produces (typically under
 * 60 KB) but low enough that the tenants.settings row stays cheap to read. */
export const WORKSPACE_LOGO_MAX_DATAURL_CHARS = 400_000;

/** Raster formats only. SVG is deliberately rejected server-side — the
 * client rasterizes SVG to PNG before upload, so a raw SVG reaching the API
 * is either a bug or an attempt to store scriptable markup. */
const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export function isValidWorkspaceLogoDataUrl(value: string): boolean {
  if (typeof value !== "string") return false;
  if (value.length > WORKSPACE_LOGO_MAX_DATAURL_CHARS) return false;
  return LOGO_DATA_URL_RE.test(value);
}

/** Decode a stored logo data URL into servable bytes. Returns null on any
 * malformed input so the serving route fails closed with a 404. */
export function parseWorkspaceLogoDataUrl(
  value: string,
): { mime: string; bytes: Uint8Array<ArrayBuffer> } | null {
  if (typeof value !== "string" || value.length > WORKSPACE_LOGO_MAX_DATAURL_CHARS) return null;
  const match = LOGO_DATA_URL_RE.exec(value);
  if (!match) return null;
  const buf = Buffer.from(match[2], "base64");
  if (buf.length === 0) return null;
  // Copy into a plain ArrayBuffer-backed view — Buffer is typed over
  // ArrayBufferLike, which Response's BodyInit rejects.
  const bytes = new Uint8Array(buf.length);
  bytes.set(buf);
  return { mime: `image/${match[1]}`, bytes };
}

/** Versioned serving URL for the workspace logo, or null when none is set.
 * `?v=` carries `logoUpdatedAt` so browsers can cache the response as
 * immutable and still pick up replacements instantly. */
export function workspaceLogoUrl(settings: {
  logoDataUrl?: string | null;
  logoUpdatedAt?: string;
}): string | null {
  if (!settings.logoDataUrl) return null;
  return `/api/settings/workspace/logo?v=${encodeURIComponent(settings.logoUpdatedAt ?? "0")}`;
}
