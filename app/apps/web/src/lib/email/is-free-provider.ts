/**
 * Free-email-provider detection.
 *
 * Used by the inbound demo-form webhook (and contact-create paths) to
 * decide whether the email's domain represents a real company we can
 * match against the TAM. Personal emails (gmail, outlook, etc.) cannot
 * be matched to an account by domain, so we flag them and route
 * separately rather than auto-creating a noise account.
 *
 * The list is intentionally hand-curated rather than pulled from npm.
 * Two reasons:
 *  1. Keeping it static avoids a runtime dep just for a 200-row map.
 *  2. We tune it to *our* B2B context — disposable/temp-mail providers
 *     are blocked too because no real demo-request founder would use
 *     `mailinator.com` as their work address.
 *
 * Maintenance: when adding entries, prefer the apex domain only
 * (`gmail.com`, not `mail.gmail.com`). The matcher strips subdomains
 * before comparison.
 */

const FREE_AND_DISPOSABLE = new Set<string>([
  // Major personal providers
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "ymail.com",
  "rocketmail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.fr",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "tutanota.com",
  "tuta.io",
  "zoho.com",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "fastmail.com",
  "fastmail.fm",
  "mail.com",
  "yandex.com",
  "yandex.ru",

  // FR/EU personal
  "free.fr",
  "orange.fr",
  "wanadoo.fr",
  "laposte.net",
  "sfr.fr",
  "neuf.fr",
  "club-internet.fr",
  "bbox.fr",

  // Disposable / temp-mail (small high-signal subset)
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "throwaway.email",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "maildrop.cc",
]);

/**
 * Extract apex domain from an email and check if it's a known free or
 * disposable provider. Returns false on any malformed input — callers
 * must already have validated the email shape upstream.
 */
export function isFreeEmailDomain(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const at = email.lastIndexOf("@");
  // Need a non-empty local part AND a non-empty domain part:
  //   "@gmail.com" → at=0, no local → reject
  //   "user@"     → at=last, no domain → reject
  //   "noatsign"  → at=-1, malformed   → reject
  if (at <= 0 || at === email.length - 1) return false;
  const raw = email.slice(at + 1).trim().toLowerCase();
  if (!raw) return false;

  // Strip subdomains down to the apex. We only check the last two
  // labels for most TLDs; for ccTLDs with second-level zones (co.uk,
  // co.jp, com.br, etc.) we check three. Imperfect for very long
  // ccTLDs (e.g. `something.gov.uk` would resolve to `gov.uk` which
  // isn't in our set anyway) but matches the apex for everything in
  // FREE_AND_DISPOSABLE.
  const parts = raw.split(".");
  if (parts.length < 2) return false;

  const lastTwo = parts.slice(-2).join(".");
  if (FREE_AND_DISPOSABLE.has(lastTwo)) return true;

  // Three-label check for known ccTLD second-levels.
  if (parts.length >= 3) {
    const second = parts[parts.length - 2];
    if (second === "co" || second === "com" || second === "ne") {
      const lastThree = parts.slice(-3).join(".");
      if (FREE_AND_DISPOSABLE.has(lastThree)) return true;
    }
  }

  return false;
}
