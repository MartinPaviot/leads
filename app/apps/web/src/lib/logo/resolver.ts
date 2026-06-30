/**
 * Server-side logo resolver — cascading tiers 1–6.
 *
 * This is the core of the logo-rendering fix. It resolves a company's
 * logo through a priority cascade, caches results in Upstash + DB, and
 * emits PostHog telemetry per tier hit.
 *
 * See `docs/specs/logo-rendering-fix-spec.md` §2.1 for the cascade
 * design and `logo-rendering-fix-plan.md` T B.3 for the implementation
 * spec.
 *
 * Server-only — never import on the client.
 */

import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getCached,
  getCachedBatch,
  isNegative,
  setCached,
  setNegative,
  type CachedLogo,
} from "./cache";
import { isDefaultGlobe } from "./google-globe-fingerprint";
import { isScrapingAllowed, scrapeLogoFromHomepage } from "./scrape";

export type ResolvedLogoTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ResolvedLogo {
  url: string | null;
  tier: ResolvedLogoTier;
  resolvedAt: string;
  fromCache: boolean;
}

const GOOGLE_V2_TIMEOUT = 2000;

// logo.clearbit.com's CDN is dead (DNS gone). Two consequences, both handled
// here: (1) we no longer resolve to it — every uncached lookup used to pay a
// guaranteed-failing HEAD request to Clearbit first (the old tier 2); (2) we
// must not SERVE a stale tier-2 Clearbit URL still sitting in the cache/DB from
// before it died — treat those as a miss so the entry self-heals to a live tier
// (Apollo / Google favicon) on the next resolve.
function isDeadLogoUrl(url: string | null | undefined): boolean {
  return !!url && url.includes("logo.clearbit.com");
}

// ── Tier helpers ──

async function tryApolloFromDb(
  domain: string,
  tenantId?: string,
): Promise<string | null> {
  try {
    const where = tenantId
      ? and(eq(companies.domain, domain), eq(companies.tenantId, tenantId))
      : eq(companies.domain, domain);
    const rows = await db
      .select({ properties: companies.properties })
      .from(companies)
      .where(where)
      .limit(1);
    if (rows.length === 0) return null;
    const props = rows[0].properties as Record<string, unknown> | null;
    const logoUrl = props?.logo_url;
    if (typeof logoUrl === "string" && logoUrl.startsWith("http")) {
      return logoUrl;
    }
    return null;
  } catch {
    return null;
  }
}

async function tryGoogleV2(domain: string): Promise<string | null> {
  try {
    const url = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(GOOGLE_V2_TIMEOUT),
    });
    const buf = await res.arrayBuffer();
    if (isDefaultGlobe(res.status, buf.byteLength)) return null;
    return url;
  } catch {
    return null;
  }
}

async function tryHomepageScrape(domain: string): Promise<string | null> {
  try {
    const allowed = await isScrapingAllowed(domain);
    if (!allowed) return null;
    return await scrapeLogoFromHomepage(domain);
  } catch {
    return null;
  }
}

// ── Persistence ──

async function persistToDb(
  domain: string,
  url: string | null,
  tier: ResolvedLogoTier,
): Promise<void> {
  try {
    await db
      .update(companies)
      .set({
        resolvedLogoUrl: url,
        resolvedLogoTier: tier,
        logoResolvedAt: new Date(),
      })
      .where(eq(companies.domain, domain));
  } catch {
    // Non-critical — cache is the primary store. If the column doesn't
    // exist yet (migration not run), this silently fails.
  }
}

// ── Main resolver ──

export async function resolveCompanyLogo(
  domain: string | null | undefined,
  companyName: string,
  existingLogoUrl?: string | null,
  tenantId?: string,
): Promise<ResolvedLogo> {
  const now = new Date().toISOString();
  const d = domain?.toLowerCase()?.trim();

  if (!d) {
    return { url: null, tier: 6, resolvedAt: now, fromCache: false };
  }

  // Tier 0: user-uploaded (stretch, always null in v1)
  // Tier 1: check existing cached value (ignore a dead Clearbit URL)
  if (existingLogoUrl && !isDeadLogoUrl(existingLogoUrl)) {
    return { url: existingLogoUrl, tier: 1, resolvedAt: now, fromCache: true };
  }

  const cached = await getCached(d);
  if (cached && !isDeadLogoUrl(cached.url)) {
    return {
      url: cached.url,
      tier: cached.tier as ResolvedLogoTier,
      resolvedAt: cached.resolvedAt,
      fromCache: true,
    };
  }

  // Negative cache — domain is known to have no resolvable logo
  if (await isNegative(d)) {
    return { url: null, tier: 6, resolvedAt: now, fromCache: true };
  }

  // Tier 2 (Clearbit) removed — CDN dead. Apollo is the first network tier now.

  // Tier 3: Apollo enrichment payload from DB
  const apollo = await tryApolloFromDb(d, tenantId);
  if (apollo) {
    const result: ResolvedLogo = {
      url: apollo,
      tier: 3,
      resolvedAt: now,
      fromCache: false,
    };
    await setCached(d, { url: apollo, tier: 3, resolvedAt: now });
    persistToDb(d, apollo, 3).catch(() => {});
    return result;
  }

  // Tier 4: Google Favicons V2
  const google = await tryGoogleV2(d);
  if (google) {
    const result: ResolvedLogo = {
      url: google,
      tier: 4,
      resolvedAt: now,
      fromCache: false,
    };
    await setCached(d, { url: google, tier: 4, resolvedAt: now });
    persistToDb(d, google, 4).catch(() => {});
    return result;
  }

  // Tier 5: Homepage meta scrape
  const scraped = await tryHomepageScrape(d);
  if (scraped) {
    const result: ResolvedLogo = {
      url: scraped,
      tier: 5,
      resolvedAt: now,
      fromCache: false,
    };
    await setCached(d, { url: scraped, tier: 5, resolvedAt: now });
    persistToDb(d, scraped, 5).catch(() => {});
    return result;
  }

  // Tier 6: all network tiers failed — negative cache + fallback
  await setNegative(d);
  persistToDb(d, null, 6).catch(() => {});
  return { url: null, tier: 6, resolvedAt: now, fromCache: false };
}

/** Batch resolver for the client coalescer endpoint. */
export async function resolveCompanyLogoBatch(
  requests: Array<{
    domain: string | null | undefined;
    companyName: string;
    existingLogoUrl?: string | null;
    tenantId?: string;
  }>,
): Promise<Record<string, ResolvedLogo>> {
  const results: Record<string, ResolvedLogo> = {};

  // 1. Batch cache lookup
  const domainsToResolve = requests
    .filter((r) => r.domain)
    .map((r) => r.domain!.toLowerCase().trim());
  const cachedBatch = await getCachedBatch(domainsToResolve);

  // 2. Separate cached hits from misses
  const toResolve: typeof requests = [];
  for (const req of requests) {
    const d = req.domain?.toLowerCase()?.trim();
    const key = d || req.companyName;
    const c = d ? cachedBatch.get(d) : undefined;
    if (c && !isDeadLogoUrl(c.url)) {
      results[key] = {
        url: c.url,
        tier: c.tier as ResolvedLogoTier,
        resolvedAt: c.resolvedAt,
        fromCache: true,
      };
    } else {
      // miss, or a stale dead-Clearbit hit → re-resolve so it self-heals
      toResolve.push(req);
    }
  }

  // 3. Resolve misses with concurrency cap (8 at a time)
  const CONCURRENCY = 8;
  for (let i = 0; i < toResolve.length; i += CONCURRENCY) {
    const chunk = toResolve.slice(i, i + CONCURRENCY);
    const resolved = await Promise.all(
      chunk.map((req) =>
        resolveCompanyLogo(
          req.domain,
          req.companyName,
          req.existingLogoUrl,
          req.tenantId,
        ),
      ),
    );
    for (let j = 0; j < chunk.length; j++) {
      const key =
        chunk[j].domain?.toLowerCase()?.trim() || chunk[j].companyName;
      results[key] = resolved[j];
    }
  }

  return results;
}
