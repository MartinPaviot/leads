/**
 * Read a live LinkedIn profile to verify a prospect's current role.
 *
 * Pure data providers (Apollo/Lusha) are months stale on who-works-where, so
 * we read the actual public profile through an Apify "no-cookie" actor (no
 * LinkedIn account connected — just an API token). Gated on `APIFY_TOKEN`:
 * without it every call is a no-op (returns null), so this ships dormant and
 * activates the moment the token is set.
 *
 * Provider note (kept out of the UI): the actor is configurable via
 * `APIFY_LINKEDIN_ACTOR` (default: dev_fusion/linkedin-profile-scraper, whose
 * input is `{ profileUrls: [...] }` and output rows carry an `experiences[]`
 * array with `title` / `companyName` / `jobStillWorking` / `jobEndedOn`).
 */

const DEFAULT_ACTOR = "dev_fusion~linkedin-profile-scraper";
const RUN_TIMEOUT_MS = 90_000;

export interface LinkedInPosition {
  title: string | null;
  company: string | null;
  isCurrent: boolean;
}

export interface LinkedInProfile {
  profileUrl: string | null;
  fullName: string | null;
  headline: string | null;
  positions: LinkedInPosition[];
}

/** Verification can only run when an Apify token is configured. */
export function isApifyConfigured(): boolean {
  return !!process.env.APIFY_TOKEN && process.env.APIFY_TOKEN.trim().length > 0;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Map one Apify dataset row to our normalized shape. Defensive: actors vary,
 * so we accept `experiences` | `experience` | `positions`, and treat a role
 * as current when `jobStillWorking`/`current`/`isCurrent` is true OR there's
 * no end date. Pure + exported for unit testing.
 */
export function normalizeApifyItem(item: unknown): LinkedInProfile {
  const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;

  const fullName =
    str(o.fullName) ??
    ([str(o.firstName), str(o.lastName)].filter(Boolean).join(" ") || null);

  const rawExp =
    (Array.isArray(o.experiences) && o.experiences) ||
    (Array.isArray(o.experience) && o.experience) ||
    (Array.isArray(o.positions) && o.positions) ||
    [];

  const positions: LinkedInPosition[] = (rawExp as unknown[]).map((e) => {
    const p = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const ended = str(p.jobEndedOn) ?? str(p.endDate) ?? str(p.ends_at);
    const flag =
      p.jobStillWorking === true || p.current === true || p.isCurrent === true;
    return {
      title: str(p.title) ?? str(p.position) ?? str(p.role),
      company: str(p.companyName) ?? str(p.company) ?? str(p.organisation),
      isCurrent: flag || (!ended && (p.jobStartedOn != null || p.startDate != null || flag)),
    };
  });

  return {
    profileUrl: str(o.linkedinUrl) ?? str(o.profileUrl) ?? str(o.url),
    fullName,
    headline: str(o.headline),
    positions,
  };
}

/**
 * Fetch + normalize a single LinkedIn profile by its URL. Returns null when
 * unconfigured, on any error, or when the actor yields nothing (fail-closed:
 * a failed read must never masquerade as "confirmed").
 */
export async function fetchLinkedInProfileByUrl(
  linkedinUrl: string,
): Promise<LinkedInProfile | null> {
  if (!isApifyConfigured()) return null;
  const url = linkedinUrl.trim();
  if (!url) return null;

  const actor = (process.env.APIFY_LINKEDIN_ACTOR || DEFAULT_ACTOR).trim();
  const endpoint = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(
    process.env.APIFY_TOKEN!,
  )}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUrls: [url] }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const items = (await res.json()) as unknown;
    if (!Array.isArray(items) || items.length === 0) return null;
    return normalizeApifyItem(items[0]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
