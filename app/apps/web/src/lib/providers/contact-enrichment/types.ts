/**
 * Contact-enrichment provider contracts — the people-level twin of
 * lib/providers/company-enrichment. One normalized shape (EnrichedContact)
 * and a small provider interface (isAvailable + enrich). Waterfall,
 * registry, and adapters live in sibling files.
 *
 * Why a dedicated people waterfall: cold calling Switzerland + France
 * lives or dies on MOBILE coverage, and no single vendor wins both.
 * Apollo's FR/CH mobile fill is thin; Kaspr leads FR mobiles; Lusha
 * covers FR/CH/EU. The waterfall geo-routes the prospect to the vendor
 * most likely to return a reachable mobile, then merges.
 */

/** Finer than the company GeoRegion — FR vs CH matters for vendor choice. */
export type ContactGeo = "FR" | "CH" | "EU" | "US" | "OTHER";

export type PhoneType = "mobile" | "direct" | "work" | "other";
export type EmailStatus = "verified" | "likely" | "unverified";

export interface EnrichedPhone {
  /** E.164 when the provider gives it; otherwise the raw national form. */
  number: string;
  type: PhoneType;
  /** Provider that supplied it, for provenance. */
  source?: string;
}

export interface EnrichedContact {
  email: string | null;
  emailStatus: EmailStatus | null;
  /** Best mobile/cell — what the dialer prefers (accessibility 1.0). */
  mobilePhone: string | null;
  /** Best direct line when no mobile. */
  directPhone: string | null;
  /** Every distinct number found, de-duped, with type + source. */
  phones: EnrichedPhone[];
  linkedinUrl: string | null;
  title: string | null;
  seniority: string | null;
  /** Raw provider payloads keyed by provider — forensic only, never rendered. */
  raw: Record<string, unknown> | null;
}

export function emptyContact(): EnrichedContact {
  return {
    email: null,
    emailStatus: null,
    mobilePhone: null,
    directPhone: null,
    phones: [],
    linkedinUrl: null,
    title: null,
    seniority: null,
    raw: null,
  };
}

export interface ContactEnrichInput {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  linkedinUrl?: string;
  companyDomain?: string;
  companyName?: string;
  /** Pre-resolved geo. When absent the waterfall derives it from
   * knownPhoneE164 then companyDomain TLD. Drives provider ordering. */
  geo?: ContactGeo;
  /** A phone already on the record (E.164) — used only to derive geo. */
  knownPhoneE164?: string;
}

export interface ContactProviderContext {
  tenantId: string;
}

export interface ContactEnrichResult {
  ok: boolean;
  data: Partial<EnrichedContact> | null;
  error?: string;
  provider: string;
  durationMs: number;
  costCents: number;
}

export interface ContactEnrichmentProvider {
  /** Short slug: "apollo", "kaspr", "lusha". */
  name: string;
  /** Lower runs first (before geo-routing). 10 cheapest/broadest, 100 last. */
  priority: number;
  /** Return false when the env key is missing so the waterfall skips it silently. */
  isAvailable(): boolean;
  /** Estimated cost per call in US cents (Kaspr ≈ 30¢/mobile, Lusha ≈ credits). */
  costCentsPerCall: number;
  /** Regions where this provider's mobile coverage is strongest. When the
   * input geo matches, the waterfall boosts it to run earlier. */
  geoAffinity?: ContactGeo[];
  enrich(
    input: ContactEnrichInput,
    ctx: ContactProviderContext,
  ): Promise<ContactEnrichResult>;
}

export interface ContactWaterfallResult {
  data: EnrichedContact;
  attempts: ContactEnrichResult[];
  totalCostCents: number;
  /** True when at least one provider contributed a phone or email. */
  enriched: boolean;
}

/**
 * Derive the routing geo from a known E.164 phone first (most reliable),
 * then the company domain TLD. Returns "OTHER" when nothing is decisive.
 */
export function deriveContactGeo(input: ContactEnrichInput): ContactGeo {
  if (input.geo) return input.geo;

  const phone = input.knownPhoneE164?.replace(/\s+/g, "");
  if (phone?.startsWith("+33")) return "FR";
  if (phone?.startsWith("+41")) return "CH";
  if (phone?.startsWith("+1")) return "US";
  if (phone && /^\+(32|49|34|39|31|351|353|44)/.test(phone)) return "EU";

  const domain = input.companyDomain?.toLowerCase() ?? "";
  if (domain.endsWith(".fr")) return "FR";
  if (domain.endsWith(".ch")) return "CH";
  if (/\.(de|be|es|it|nl|pt|ie|eu|co\.uk|uk)$/.test(domain)) return "EU";

  return "OTHER";
}
