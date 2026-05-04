import type {
  CompanyEnrichmentProvider,
  EnrichedCompany,
  EnrichInput,
  EnrichResult,
  GeoRegion,
  ProviderContext,
  ProvenanceEntry,
  WaterfallResult,
} from "./types";
import { emptyCompany } from "./types";
import { ensureDefaultsLoaded, listAvailableProviders } from "./registry";

// ── Geo detection ────────────────────────────────────────────────

const EU_TLDS = new Set([
  "fr", "de", "uk", "co.uk", "nl", "be", "es", "it", "pt", "at", "ch",
  "se", "no", "dk", "fi", "ie", "pl", "cz", "ro", "hu", "bg", "hr",
  "sk", "si", "lt", "lv", "ee", "lu", "mt", "cy", "gr", "eu",
]);
const AU_TLDS = new Set(["au", "com.au", "nz", "co.nz"]);

function detectGeoFromDomain(domain: string | undefined): GeoRegion | undefined {
  if (!domain) return undefined;
  const parts = domain.toLowerCase().split(".");
  if (parts.length < 2) return undefined;
  const tld2 = parts.slice(-2).join(".");
  const tld1 = parts[parts.length - 1];
  if (AU_TLDS.has(tld2) || AU_TLDS.has(tld1)) return "AU";
  if (EU_TLDS.has(tld2) || EU_TLDS.has(tld1)) return "EU";
  if (tld1 === "us" || tld2 === "com" || tld2 === "io" || tld2 === "co") return undefined;
  return undefined;
}

/**
 * Re-sort providers by geo affinity. Providers whose geoAffinity
 * includes the input geo get a -50 priority bonus (run earlier).
 * The sort is stable: same-affinity providers keep their original
 * priority order.
 */
function sortByGeo(
  providers: CompanyEnrichmentProvider[],
  geo: GeoRegion,
): CompanyEnrichmentProvider[] {
  return [...providers].sort((a, b) => {
    const aBoost = a.geoAffinity?.includes(geo) ? -50 : 0;
    const bBoost = b.geoAffinity?.includes(geo) ? -50 : 0;
    return (a.priority + aBoost) - (b.priority + bBoost);
  });
}

/**
 * Fields that, when all three are present, let us break out of the
 * waterfall early. Saturation means we have enough to render the
 * company card and run scoring — calling a second LLM would be waste.
 *
 * Rule: `industry` + `description` + (`employeeCount` OR `sizeRange`).
 */
function isSaturated(c: EnrichedCompany): boolean {
  const hasSize = c.employeeCount != null || (c.sizeRange != null && c.sizeRange.trim().length > 0);
  return (
    !!c.industry &&
    c.industry.trim().length > 0 &&
    !!c.description &&
    c.description.trim().length > 0 &&
    hasSize
  );
}

/**
 * Merge a provider's partial result into the running accumulator.
 * Rules:
 *   - scalar fields: first non-null non-empty wins (we never overwrite)
 *   - arrays: union with case-sensitive dedupe, capped at 20
 * Returns the list of field names that the provider *contributed*.
 */
function mergePartial(
  target: EnrichedCompany,
  partial: Partial<EnrichedCompany>,
): Array<keyof EnrichedCompany> {
  const contributed: Array<keyof EnrichedCompany> = [];

  const scalarKeys: Array<keyof EnrichedCompany> = [
    "domain",
    "name",
    "industry",
    "description",
    "employeeCount",
    "sizeRange",
    "annualRevenue",
    "revenueRange",
    "foundedYear",
    "city",
    "state",
    "country",
    "fundingStage",
    "totalFunding",
    "linkedinUrl",
    "logoUrl",
  ];
  for (const k of scalarKeys) {
    if (target[k] != null && target[k] !== "") continue;
    const incoming = partial[k];
    if (incoming == null) continue;
    if (typeof incoming === "string" && incoming.trim().length === 0) continue;
    // The scalar keys above all take primitive values, so this assignment
    // is sound. TypeScript can't narrow the union across the whole loop,
    // so we cast at the assignment site only — via unknown because
    // EnrichedCompany has no string index signature.
    (target as unknown as Record<string, unknown>)[k] = incoming;
    contributed.push(k);
  }

  const arrayKeys: Array<"technologies" | "keywords" | "investors"> = ["technologies", "keywords", "investors"];
  for (const k of arrayKeys) {
    const incoming = partial[k];
    if (!Array.isArray(incoming) || incoming.length === 0) continue;
    const seen = new Set(target[k]);
    const before = seen.size;
    for (const v of incoming) {
      if (typeof v === "string" && v.trim().length > 0) seen.add(v);
    }
    if (seen.size > before) {
      target[k] = Array.from(seen).slice(0, 20);
      contributed.push(k);
    }
  }

  // raw payload: only set if empty. Never overwrite earlier provider's
  // raw — we want the FIRST successful response's payload for audit.
  if (target.raw == null && partial.raw && typeof partial.raw === "object") {
    target.raw = partial.raw;
    contributed.push("raw");
  }

  return contributed;
}

/**
 * Waterfall orchestrator. Primary → secondaries → LLM, merging
 * non-null fields from each. Stops early when the result is saturated
 * (see `isSaturated`).
 *
 * Always returns a WaterfallResult — never throws. Provider errors
 * are captured as non-ok attempts so callers can diagnose. Tests can
 * inject providers via `registerProvider` after `resetRegistryForTest`.
 */
export async function enrichCompany(
  input: EnrichInput,
  ctx: ProviderContext,
  opts?: { overrideProviders?: CompanyEnrichmentProvider[] },
): Promise<WaterfallResult> {
  if (!opts?.overrideProviders) {
    await ensureDefaultsLoaded();
  }

  const geo = input.geo ?? detectGeoFromDomain(input.domain);
  const baseProviders = opts?.overrideProviders
    ? [...opts.overrideProviders].sort((a, b) => a.priority - b.priority)
    : listAvailableProviders();
  const providers = geo ? sortByGeo(baseProviders, geo) : baseProviders;

  const data = emptyCompany();
  const provenance: ProvenanceEntry[] = [];
  const attempts: EnrichResult[] = [];
  let totalCostCents = 0;

  for (const provider of providers) {
    if (!provider.isAvailable()) continue;

    const attempt = await runProvider(provider, input, ctx);
    attempts.push(attempt);
    totalCostCents += attempt.costCents;

    if (attempt.ok && attempt.data) {
      const contributed = mergePartial(data, attempt.data);
      const now = new Date().toISOString();
      for (const field of contributed) {
        provenance.push({ provider: provider.name, field, atIso: now });
      }
      if (isSaturated(data)) break;
    }
  }

  return {
    data,
    provenance,
    attempts,
    totalCostCents,
    enriched: provenance.length > 0,
  };
}

async function runProvider(
  provider: CompanyEnrichmentProvider,
  input: EnrichInput,
  ctx: ProviderContext,
): Promise<EnrichResult> {
  const startedAt = Date.now();
  try {
    const result = await provider.enrich(input, ctx);
    // Normalise durationMs + costCents in case the adapter forgot them.
    return {
      ...result,
      durationMs: result.durationMs ?? Date.now() - startedAt,
      costCents: result.costCents ?? (result.ok ? provider.costCentsPerCall : 0),
    };
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      provider: provider.name,
      durationMs: Date.now() - startedAt,
      costCents: 0,
    };
  }
}
