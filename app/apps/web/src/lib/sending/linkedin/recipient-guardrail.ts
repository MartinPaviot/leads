/**
 * Spec 36 — LinkedIn outbound recipient guardrail (TEST MODE). The LinkedIn twin
 * of lib/emails/recipient-guardrail.ts. A hard safety stop on every LinkedIn
 * action (connect/message/InMail): while test mode is ON — the DEFAULT — an
 * action may only target an explicitly allowlisted profile, never a real
 * prospect. Defence in depth: it must hold no matter how a send is triggered, so
 * wiring "run the LinkedIn campaign" can never act on real contacts while testing.
 *
 * LinkedIn has no email/domain, so the allowlist is explicit `/in/<handle>` slugs.
 * There is NO safe default target (unlike email's own elevay.dev), so in test
 * mode with an EMPTY allowlist, NOTHING is allowed — fail-safe by construction.
 *
 * Switch:
 *   LINKEDIN_TEST_MODE = "off"  → guardrail disabled, real actions.
 *   anything else / unset       → guardrail ON (a typo keeps it ON).
 * Allowlist:
 *   LINKEDIN_TEST_ALLOWLIST (comma-separated) — each entry a profile URL or a
 *   bare handle ("jane-doe"). Matching is on the normalized /in/ handle.
 */

/** True when the guardrail is active (the default). */
export function isLinkedInTestMode(): boolean {
  return (process.env.LINKEDIN_TEST_MODE ?? "on").trim().toLowerCase() !== "off";
}

/** The /in/<handle> slug from a profile URL, or a bare handle. Lowercased. Pure. */
export function linkedinHandle(profileUrlOrHandle: string | null | undefined): string | null {
  if (!profileUrlOrHandle) return null;
  const s = profileUrlOrHandle.trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/\/in\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]) || null;
  // No /in/ — treat the whole thing as a bare handle, but reject anything that
  // still looks like a URL/path (avoid matching a domain by accident).
  if (s.includes("/") || s.includes(" ")) return null;
  return s;
}

/** Normalized allowlist of permitted handles from LINKEDIN_TEST_ALLOWLIST. */
export function linkedinTargetAllowlist(): string[] {
  const raw = (process.env.LINKEDIN_TEST_ALLOWLIST ?? "")
    .split(",")
    .map((s) => linkedinHandle(s))
    .filter((h): h is string => !!h);
  return [...new Set(raw)];
}

/**
 * Whether a LinkedIn action may target `profileUrl` right now. Test mode off →
 * everything allowed. Test mode on → only allowlisted handles pass (empty
 * allowlist blocks everything — fail-safe).
 */
export function isLinkedInTargetAllowed(profileUrl: string | null | undefined): boolean {
  if (!isLinkedInTestMode()) return true;
  const handle = linkedinHandle(profileUrl);
  if (!handle) return false;
  return linkedinTargetAllowlist().includes(handle);
}

/** Human-readable reason for a blocked action. */
export function linkedinTargetBlockReason(profileUrl: string | null | undefined): string {
  const handle = linkedinHandle(profileUrl) ?? "(unparseable profile)";
  return (
    `LinkedIn test mode is on — ${handle} is not on LINKEDIN_TEST_ALLOWLIST, so no action was taken. ` +
    `Add the handle to LINKEDIN_TEST_ALLOWLIST, or set LINKEDIN_TEST_MODE=off to act on real profiles.`
  );
}
