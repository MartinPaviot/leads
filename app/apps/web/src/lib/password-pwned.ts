import { createHash } from "node:crypto";

/**
 * S5 — Have I Been Pwned k-anonymity check.
 *
 * Sends the first 5 chars of the SHA-1(password) to HIBP, gets back a
 * list of suffix:count rows for that prefix, and checks whether the
 * full hash is in there. The full password never leaves the server.
 *
 * Strict fail-open: if HIBP is down, slow, or returns garbage, we
 * return `{ pwned: false }` so a third-party outage can't lock new
 * users out of sign-up. The password policy (length + complexity) is
 * still enforced; HIBP is an *additional* defence, not a replacement.
 *
 * Spec: https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

const HIBP_URL = "https://api.pwnedpasswords.com/range/";
const REQUEST_TIMEOUT_MS = 1500;

export interface PwnedCheckResult {
  pwned: boolean;
  /** Total count in the HIBP corpus when known; 0 when not pwned or unknown. */
  count: number;
  /** Set when we returned `pwned: false` because the check itself failed. */
  failOpen?: true;
}

export async function isPasswordPwned(
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<PwnedCheckResult> {
  if (typeof password !== "string" || password.length === 0) {
    return { pwned: false, count: 0 };
  }

  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${HIBP_URL}${prefix}`, {
      signal: ctrl.signal,
      // Add-Padding asks HIBP to pad responses to a uniform size so a
      // network observer can't infer the prefix from response length.
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) {
      return { pwned: false, count: 0, failOpen: true };
    }
    const body = await res.text();
    for (const line of body.split(/\r?\n/)) {
      const [hashSuffix, countStr] = line.split(":");
      if (hashSuffix?.trim().toUpperCase() === suffix) {
        const count = Number.parseInt(countStr ?? "0", 10);
        if (!Number.isFinite(count) || count <= 0) {
          // Padded row — HIBP marks them count=0.
          continue;
        }
        return { pwned: true, count };
      }
    }
    return { pwned: false, count: 0 };
  } catch {
    return { pwned: false, count: 0, failOpen: true };
  } finally {
    clearTimeout(timer);
  }
}
