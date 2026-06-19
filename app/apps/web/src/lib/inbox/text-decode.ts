/**
 * Unicode display correctness for the inbox (INBOX-R10) — pure, unit-tested.
 *
 * Two render-time concerns that capture-time mailparser decoding does NOT cover:
 *  - decodeRfc2047: any RFC 2047 encoded-word (=?charset?B/Q?...?=) that survived
 *    into a stored subject / sender name is still shown decoded, never literally.
 *  - neutralizeBidi: strip the Unicode bidi embedding/override/isolate controls
 *    used for "Trojan Source" / filename spoofing (CVE-2021-42574) from DISPLAY
 *    strings (subjects, sender names, snippets) — ties to INBOX-P02.
 *
 * decodeDisplay composes both for safe header display. Charset decoding of full
 * bodies stays at capture (mailparser); mojibake repair + capture-time fallback
 * decode are noted residuals (they touch the capture path) and are NOT done here.
 */

// CVE-2021-42574 Trojan-Source reordering controls: directional embeddings
// (LRE 0x202A / RLE 0x202B), pop (PDF 0x202C), overrides (LRO 0x202D / RLO
// 0x202E) and isolates (LRI 0x2066 / RLI 0x2067 / FSI 0x2068 / PDI 0x2069).
// They are zero-width and reorder following text, so stripping them from short
// display strings removes the spoof without touching any visible glyph. The
// directional *marks* (LRM/RLM/ALM) are intentionally left alone — they only
// hint direction and removing them could alter legitimate mixed-script display.
function isBidiControl(cp: number): boolean {
  return (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
}

export function neutralizeBidi(s: string): string {
  let out = "";
  for (const ch of s || "") {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isBidiControl(cp)) continue;
    out += ch;
  }
  return out;
}

const CHARSET_ALIASES: Record<string, string> = {
  utf8: "utf-8",
  latin1: "iso-8859-1",
  "latin-1": "iso-8859-1",
  cp1252: "windows-1252",
};

function decodeBytes(bytes: Uint8Array, charset: string): string {
  const cs = (charset || "utf-8").toLowerCase().trim();
  const label = CHARSET_ALIASES[cs] || cs;
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      let out = "";
      for (const b of bytes) out += String.fromCharCode(b);
      return out;
    }
  }
}

// RFC 2047 "Q": '_' => space, =XX => byte, otherwise the literal byte.
function qDecode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "_") {
      out.push(0x20);
    } else if (c === "=" && i + 2 < text.length) {
      const v = parseInt(text.slice(i + 1, i + 3), 16);
      if (!Number.isNaN(v)) {
        out.push(v);
        i += 2;
      } else {
        out.push(c.charCodeAt(0));
      }
    } else {
      out.push(c.charCodeAt(0) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function bDecode(text: string): Uint8Array {
  try {
    const bin = atob(text.replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array();
  }
}

const ENCODED_WORD_RE = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

export function decodeRfc2047(input: string): string {
  const s = input || "";
  if (!s.includes("=?")) return s;
  // Adjacent encoded-words separated only by whitespace are joined (RFC 2047 §6.2).
  const joined = s.replace(/\?=\s+=\?/g, "?==?");
  return joined.replace(ENCODED_WORD_RE, (_m, charset, enc, text) => {
    const bytes = String(enc).toUpperCase() === "B" ? bDecode(text) : qDecode(text);
    return decodeBytes(bytes, charset);
  });
}

/** Decode + anti-spoof a header display string (subject / sender name / snippet). */
export function decodeDisplay(s: string): string {
  return neutralizeBidi(decodeRfc2047(s || ""));
}
