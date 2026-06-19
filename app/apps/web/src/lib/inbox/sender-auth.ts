/**
 * Sender identity + domain authentication for the reading pane (INBOX-R06).
 *
 * Two pure concerns, both unit-tested:
 *  - `parseAuthResults` reads the receiving server's `Authentication-Results`
 *    header (SPF / DKIM / DMARC) into a compact trust verdict, computed once at
 *    capture and stored on the activity. A "pass" badge is a real anti-phishing
 *    signal that complements the R03 misleading-link flag; we never assert a
 *    verdict we don't have (absent header ⇒ "unknown", shows nothing).
 *  - `initialsFor` / `avatarColorIndex` derive a deterministic initials avatar
 *    (no remote logo fetch, no provider) for the sender.
 */

export type SenderAuthStatus = "pass" | "fail" | "unknown";

export interface SenderAuth {
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  status: SenderAuthStatus;
}

function field(header: string, name: string): string | null {
  // e.g. "... spf=pass (…) smtp.mailfrom=… dkim=pass … dmarc=pass (p=REJECT) …"
  const m = new RegExp(`\\b${name}\\s*=\\s*([a-z]+)`, "i").exec(header);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Compute a trust verdict from RFC headers (lower-cased keys, as the IMAP/Gmail
 * normaliser produces). Returns "unknown" when there is no usable header — we
 * never downgrade mail just because the receiver didn't stamp it.
 */
export function parseAuthResults(headers: Record<string, string> | null | undefined): SenderAuth {
  const raw = headers?.["authentication-results"] ?? "";
  if (!raw) return { spf: null, dkim: null, dmarc: null, status: "unknown" };

  const spf = field(raw, "spf");
  const dkim = field(raw, "dkim");
  const dmarc = field(raw, "dmarc");

  let status: SenderAuthStatus = "unknown";
  if (dmarc === "pass" || (spf === "pass" && dkim === "pass")) {
    status = "pass";
  } else if (dmarc === "fail" || spf === "fail" || dkim === "fail") {
    status = "fail";
  }
  return { spf, dkim, dmarc, status };
}

/** Up to two uppercase initials from a display name, else the email local part. */
export function initialsFor(nameOrEmail: string): string {
  const s = (nameOrEmail || "").trim();
  if (!s) return "?";
  const local = s.includes("@") ? s.split("@")[0] : s;
  const words = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

/** Deterministic palette index (0..n-1) from a seed — stable per sender. */
export function avatarColorIndex(seed: string, palette = 10): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % palette;
}
