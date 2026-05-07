/**
 * Pure helpers for the transcript video player (P0-4 task 4.4).
 *
 * The citation chip already links to `/meetings/[id]?t=<seconds>` ;
 * the meeting page hosts the player. This module decides :
 *   - What kind of recording URL we have (Loom / Zoom / Recall /
 *     direct mp4 / unknown).
 *   - How to compose a deep-link that seeks to a timestamp.
 *   - Whether we can embed via <iframe> or need a native <video>.
 *
 * Pure : no DOM, no fetch. Tested in
 * `__tests__/video-player-url.test.ts` exhaustively.
 */

export type VideoProvider =
  | "loom"
  | "zoom"
  | "recall"
  | "youtube"
  | "vimeo"
  | "direct"
  | "unknown";

export interface VideoEmbedDescriptor {
  provider: VideoProvider;
  /** URL that goes into <iframe src> for embedded providers, or
   *  <video src> for direct files. */
  embedUrl: string;
  /** Whether this URL can be embedded inline (true) or only opened
   *  in a new tab (false — the provider blocks framing). */
  canEmbed: boolean;
  /** Whether the resolved URL itself contains the seek-to-time
   *  parameter (so the iframe loads at the right offset). When
   *  false, the caller falls back to native-player JS seek. */
  seekInUrl: boolean;
}

/**
 * Detect the provider from the URL string. Tolerant of trailing
 * paths, query strings, and casing. Returns "unknown" rather than
 * throwing so the caller can render a "no recording yet" fallback.
 */
export function detectProvider(rawUrl: string | null | undefined): VideoProvider {
  if (!rawUrl) return "unknown";
  const url = rawUrl.trim().toLowerCase();
  if (!url) return "unknown";
  if (/(?:^|\/\/)(?:www\.)?loom\.com\//.test(url)) return "loom";
  if (
    /(?:^|\/\/)(?:[a-z0-9-]+\.)?zoom\.us\//.test(url) ||
    /\.zoom\.us\/rec\//.test(url)
  ) {
    return "zoom";
  }
  if (/recall\.ai|recall-bot|recallai/i.test(url)) return "recall";
  if (
    /(?:^|\/\/)(?:www\.|m\.)?youtube\.com\/watch/.test(url) ||
    /(?:^|\/\/)youtu\.be\//.test(url)
  ) {
    return "youtube";
  }
  if (/(?:^|\/\/)(?:www\.|player\.)?vimeo\.com\//.test(url)) return "vimeo";
  if (/\.(mp4|webm|ogg|m3u8|mpd)(?:\?|$|#)/.test(url)) return "direct";
  return "unknown";
}

/**
 * Build the embed URL with a seek-to-time deep-link. Per-provider :
 *  - Loom : `?t=NNs` query param ; supports embed via /embed path.
 *  - Zoom : strip the `/share` segment if any, append `?startTime=ms`.
 *  - Recall.ai : has `?t=NNs` ; embeddable directly.
 *  - YouTube : `?t=NN` for watch URL ; `?start=NN` for embed.
 *  - Vimeo : `?#t=NNs` fragment ; embed via /video/<id>.
 *  - Direct files : append `#t=NN` fragment which native HTML5
 *    video respects.
 *  - Unknown : pass through ; caller falls back to "open in new tab".
 */
export function buildEmbedUrl(
  rawUrl: string | null | undefined,
  seekToSec: number,
): VideoEmbedDescriptor {
  const provider = detectProvider(rawUrl);
  if (provider === "unknown" || !rawUrl) {
    return {
      provider,
      embedUrl: rawUrl ?? "",
      canEmbed: false,
      seekInUrl: false,
    };
  }
  const seekInt = Math.max(0, Math.floor(seekToSec));

  switch (provider) {
    case "loom": {
      // Loom embed URL : https://www.loom.com/embed/<id>?t=<sec>s
      const id = extractLoomId(rawUrl);
      if (!id) {
        return { provider, embedUrl: rawUrl, canEmbed: false, seekInUrl: false };
      }
      return {
        provider,
        embedUrl: `https://www.loom.com/embed/${id}?t=${seekInt}s`,
        canEmbed: true,
        seekInUrl: true,
      };
    }
    case "zoom": {
      // Zoom recording deep-link : `?startTime=<ms>`. Embedding via
      // iframe is blocked (X-Frame-Options) ; we link out instead.
      return {
        provider,
        embedUrl: addOrReplaceQuery(rawUrl, "startTime", String(seekInt * 1000)),
        canEmbed: false,
        seekInUrl: true,
      };
    }
    case "recall": {
      return {
        provider,
        embedUrl: addOrReplaceQuery(rawUrl, "t", `${seekInt}s`),
        canEmbed: true,
        seekInUrl: true,
      };
    }
    case "youtube": {
      const id = extractYoutubeId(rawUrl);
      if (!id) {
        return { provider, embedUrl: rawUrl, canEmbed: false, seekInUrl: false };
      }
      return {
        provider,
        embedUrl: `https://www.youtube.com/embed/${id}?start=${seekInt}`,
        canEmbed: true,
        seekInUrl: true,
      };
    }
    case "vimeo": {
      const id = extractVimeoId(rawUrl);
      if (!id) {
        return { provider, embedUrl: rawUrl, canEmbed: false, seekInUrl: false };
      }
      return {
        provider,
        embedUrl: `https://player.vimeo.com/video/${id}#t=${seekInt}s`,
        canEmbed: true,
        seekInUrl: true,
      };
    }
    case "direct": {
      // Native HTML5 video supports `#t=<sec>` media fragment.
      const u = stripFragment(rawUrl);
      return {
        provider,
        embedUrl: `${u}#t=${seekInt}`,
        canEmbed: true,
        seekInUrl: true,
      };
    }
    default:
      return {
        provider: "unknown",
        embedUrl: rawUrl,
        canEmbed: false,
        seekInUrl: false,
      };
  }
}

// ── URL helpers ────────────────────────────────────────────────

function extractLoomId(url: string): string | null {
  // https://www.loom.com/share/<id> or /embed/<id>
  const m = url.match(/loom\.com\/(?:share|embed)\/([a-z0-9]+)/i);
  return m ? m[1] : null;
}

function extractYoutubeId(url: string): string | null {
  const watch = url.match(/[?&]v=([\w-]{6,15})/);
  if (watch) return watch[1];
  const short = url.match(/youtu\.be\/([\w-]{6,15})/);
  if (short) return short[1];
  const embed = url.match(/youtube\.com\/embed\/([\w-]{6,15})/);
  if (embed) return embed[1];
  return null;
}

function extractVimeoId(url: string): string | null {
  // https://vimeo.com/<id> OR https://player.vimeo.com/video/<id>
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function addOrReplaceQuery(
  rawUrl: string,
  key: string,
  value: string,
): string {
  const qIndex = rawUrl.indexOf("?");
  if (qIndex < 0) return `${rawUrl}?${key}=${value}`;
  const base = rawUrl.slice(0, qIndex);
  const tail = rawUrl.slice(qIndex + 1);
  const parts = tail.split("&").filter((p) => p.length > 0);
  let replaced = false;
  const next = parts.map((p) => {
    const eq = p.indexOf("=");
    const k = eq >= 0 ? p.slice(0, eq) : p;
    if (k === key) {
      replaced = true;
      return `${key}=${value}`;
    }
    return p;
  });
  if (!replaced) next.push(`${key}=${value}`);
  return `${base}?${next.join("&")}`;
}

function stripFragment(rawUrl: string): string {
  const i = rawUrl.indexOf("#");
  return i >= 0 ? rawUrl.slice(0, i) : rawUrl;
}
