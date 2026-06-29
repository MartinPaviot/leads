/**
 * Spec 36 (T11) — turn Unipile's LinkedIn / Sales-Navigator READ surfaces into
 * canonical-shaped enrichment records. The mappers are pure (unit-tested against
 * the LIVE shapes captured 2026-06-29); the readers are thin orchestration that
 * call the http primitives. NO DB writes and NO send here — callers (sourcing,
 * a chat "enrich" action) decide when to spend the LinkedIn profile-view quota
 * (~100/seat/day) and route the result through upsertAccount/upsertContact.
 *
 * Server-only (the readers read UNIPILE_* via the passed config).
 */

import {
  getUnipileCompanyProfile,
  getUnipileFullProfile,
  mapHeadcountGrowth,
  searchLinkedIn,
  type FullProfileOptions,
  type HeadcountGrowthSignal,
  type UnipileCompanyProfile,
  type UnipileConfig,
  type UnipileFullProfile,
} from "./http";
import { bareDomain } from "@/db/canonical/identity";
import { normalizeCompanyName } from "@/lib/companies/identity";

// ── Account / company enrichment ────────────────────────────────────────────

/** The canonical account fields a company profile contributes (writable set). */
export interface LinkedInAccountFields {
  name: string | null;
  domain: string | null;
  industry: string | null;
  size: string | null;
  description: string | null;
}

/** Bare registrable host from a website URL: "https://www.acme.io/x" → "acme.io". */
export function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  const raw = website.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Human size label from the headcount range / exact count (e.g. "51-200"). */
export function sizeLabel(profile: UnipileCompanyProfile): string | null {
  const r = profile.employee_count_range;
  if (r && (r.from != null || r.to != null)) {
    if (r.from != null && r.to != null) return `${r.from}-${r.to}`;
    if (r.from != null) return `${r.from}+`;
    return `${r.to}`;
  }
  return profile.employee_count != null ? String(profile.employee_count) : null;
}

/** Pure: company profile → the canonical account fields we can write. */
export function companyProfileToAccount(profile: UnipileCompanyProfile): LinkedInAccountFields {
  return {
    name: profile.name ?? null,
    // `industry` is the column (single value) — LinkedIn populates ONE primary
    // industry per company (e.g. "Financial Services"). The full list + the
    // richer specialties live in extras → properties, never collapsed.
    industry: primaryIndustry(profile),
    domain: domainFromWebsite(profile.website),
    size: sizeLabel(profile),
    description: profile.description ?? profile.tagline ?? null,
  };
}

/** LinkedIn's single primary industry (the array's first non-empty value). */
export function primaryIndustry(profile: UnipileCompanyProfile): string | null {
  return profile.industry?.find((i) => i && i.trim()) ?? null;
}

/**
 * Non-column firmographics worth keeping in properties — crucially the FULL
 * industry list + specialties (`activities`), so a company isn't flattened to
 * the single ICP/sourcing label. HQ + foundation date answer the geo/age asks.
 */
export interface AccountExtras {
  /** All LinkedIn industries (usually 1; kept as an array for fidelity). */
  industries: string[];
  /** Company specialties — the multi-category richness (e.g. Spend Management…). */
  specialties: string[];
  hqCity: string | null;
  hqCountry: string | null;
  foundationDate: string | null;
  website: string | null;
  employeeCount: number | null;
}

/** Pure: company profile → the non-column firmographic extras. */
export function companyProfileExtras(profile: UnipileCompanyProfile): AccountExtras {
  const hq = (profile.locations ?? []).find((l) => l.is_headquarter) ?? profile.locations?.[0];
  return {
    industries: (profile.industry ?? []).filter((i): i is string => !!i && i.trim().length > 0),
    specialties: (profile.activities ?? []).filter((a): a is string => !!a && a.trim().length > 0),
    hqCity: hq?.city ?? null,
    hqCountry: hq?.country ?? null,
    foundationDate: profile.foundation_date ?? null,
    website: profile.website ?? null,
    employeeCount: profile.employee_count ?? null,
  };
}

export interface AccountEnrichment {
  fields: LinkedInAccountFields;
  extras: AccountExtras;
  /** The Sales-Navigator headcount-growth signal (scoring input). */
  growth: HeadcountGrowthSignal;
  raw: UnipileCompanyProfile;
}

/**
 * Fetch + normalize a company. `identifier` = public id (acme-corp), numeric id,
 * or URN — the SN people result's `current_positions[].company_id` works.
 */
export async function enrichAccountFromLinkedIn(
  cfg: UnipileConfig,
  accountId: string,
  identifier: string,
): Promise<AccountEnrichment> {
  const raw = await getUnipileCompanyProfile(cfg, identifier, accountId);
  return {
    fields: companyProfileToAccount(raw),
    extras: companyProfileExtras(raw),
    growth: mapHeadcountGrowth(raw.insights),
    raw,
  };
}

// ── Confidence-gated resolution (caveat 1: a name search must not bind the wrong
// company). Confirm a candidate by DOMAIN (strong) or normalized NAME before we
// trust it; never write an unconfirmed match.

/** How a candidate LinkedIn company was confirmed to be the expected one. */
export type MatchConfidence = "domain" | "name" | "none";

/** Pure: is this LinkedIn company profile the same company we expected? */
export function confirmCompanyMatch(
  profile: UnipileCompanyProfile,
  known: { name?: string | null; domain?: string | null },
): MatchConfidence {
  const knownDomain = known.domain ? bareDomain(known.domain) : null;
  const profileDomain = domainFromWebsite(profile.website);
  if (knownDomain && profileDomain && knownDomain === profileDomain) return "domain";
  if (known.name && profile.name && normalizeCompanyName(known.name) === normalizeCompanyName(profile.name)) {
    return "name";
  }
  return "none";
}

/**
 * Pure (caveat 2): the coarse label to preserve as the ICP segment when the
 * precise LinkedIn industry takes over the canonical column. Keep the OLD value
 * iff it exists and differs from the new precise industry — otherwise there is
 * nothing meaningful to preserve (and we never preserve when we have no better
 * value to replace it with).
 */
export function icpSegmentToPreserve(oldIndustry: string | null | undefined, newIndustry: string | null | undefined): string | null {
  const old = (oldIndustry ?? "").trim();
  if (!old || !newIndustry) return null;
  return old !== newIndustry.trim() ? old : null;
}

export interface ResolvedCompany {
  /** LinkedIn company id — persist it so we never name-search this account again. */
  linkedinCompanyId: string;
  confidence: MatchConfidence;
  enrichment: AccountEnrichment;
}

export interface KnownCompany {
  name?: string | null;
  domain?: string | null;
  /** A previously-resolved LinkedIn company id — the idempotent fast path. */
  linkedinCompanyId?: string | null;
}

/**
 * Resolve an EXISTING account to its LinkedIn company and enrich it, gated so a
 * name search can't bind the wrong company:
 *  1. Known LinkedIn id → fetch directly (no search, fully idempotent).
 *  2. Else search by DOMAIN then NAME; accept a candidate ONLY if its profile
 *     domain-matches, or a candidate's name normalizes equal (cheap, pre-fetch).
 *  3. No confident candidate → return null (caller skips — never writes a guess).
 * Bounded: ≤1 profile fetch per query term (name-match is read off the search item).
 */
export async function resolveAndEnrichCompany(
  cfg: UnipileConfig,
  accountId: string,
  known: KnownCompany,
): Promise<ResolvedCompany | null> {
  if (known.linkedinCompanyId) {
    return {
      linkedinCompanyId: known.linkedinCompanyId,
      confidence: "domain",
      enrichment: await enrichAccountFromLinkedIn(cfg, accountId, known.linkedinCompanyId),
    };
  }

  const terms = [known.domain, known.name].filter((q): q is string => !!q && q.trim().length > 0);
  const wantName = known.name ? normalizeCompanyName(known.name) : null;

  for (const term of terms) {
    const page = await searchLinkedIn(
      cfg,
      accountId,
      { api: "sales_navigator", category: "companies", keywords: term },
      { limit: 3 },
    );

    // (a) Cheap name-confirm on the search item — no profile fetch unless it matches.
    const named = wantName ? page.items.find((h) => h.id && h.name && normalizeCompanyName(h.name) === wantName) : undefined;
    if (named?.id) {
      return { linkedinCompanyId: String(named.id), confidence: "name", enrichment: await enrichAccountFromLinkedIn(cfg, accountId, String(named.id)) };
    }

    // (b) Domain-confirm: fetch the top candidate's profile and compare websites.
    if (known.domain) {
      const top = page.items.find((h) => h.id);
      if (top?.id) {
        const enrichment = await enrichAccountFromLinkedIn(cfg, accountId, String(top.id));
        if (confirmCompanyMatch(enrichment.raw, known) !== "none") {
          return { linkedinCompanyId: String(top.id), confidence: "domain", enrichment };
        }
      }
    }
  }
  return null;
}

// ── Contact / lead enrichment ───────────────────────────────────────────────

/** The canonical contact fields a full profile contributes (writable set). */
export interface LinkedInContactFields {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  linkedinUrl: string | null;
}

/** Coarse seniority bucket from a title (best-effort, for scoring/routing). */
export function seniorityFromTitle(title: string | null | undefined): string | null {
  const t = (title ?? "").toLowerCase();
  if (!t) return null;
  if (/\b(founder|co-?founder|owner|ceo|cto|cfo|coo|cmo|president|partner)\b/.test(t)) return "founder_c_suite";
  if (/\b(vp|vice president|svp|evp|chief|head of)\b/.test(t)) return "vp_head";
  if (/\b(director|principal|lead)\b/.test(t)) return "director";
  if (/\b(manager|mgr)\b/.test(t)) return "manager";
  return "individual";
}

/** The current role = the first experience that is still open (end == null). */
export function currentRole(profile: UnipileFullProfile): { title: string | null; company: string | null; companyId: string | null } {
  const exp = profile.work_experience ?? [];
  const cur = exp.find((e) => e.end == null) ?? exp[0];
  return { title: cur?.position ?? profile.headline ?? null, company: cur?.company ?? null, companyId: cur?.company_id ?? null };
}

/** Pure: full profile → the canonical contact fields we can write. */
export function fullProfileToContact(profile: UnipileFullProfile): LinkedInContactFields {
  const url =
    profile.public_profile_url ??
    (profile.public_identifier ? `https://www.linkedin.com/in/${profile.public_identifier}` : null);
  return {
    firstName: profile.first_name ?? null,
    lastName: profile.last_name ?? null,
    title: currentRole(profile).title,
    linkedinUrl: url,
  };
}

export interface ContactEnrichment {
  fields: LinkedInContactFields;
  /** Non-column attributes worth keeping in properties (no canonical column). */
  extras: {
    seniority: string | null;
    summary: string | null;
    location: string | null;
    isOpenProfile: boolean | null;
    isOpenToWork: boolean | null;
    canSendInMail: boolean | null;
    sharedConnectionsCount: number | null;
    currentCompany: string | null;
    currentCompanyId: string | null;
  };
  raw: UnipileFullProfile;
}

/**
 * Fetch + normalize a lead's full profile. Resolution rule (verified live):
 *  - 1st-degree relation → pass its public_identifier (default classic surface).
 *  - out-of-network SN lead → pass the SN id (ACwAA…) + opts.linkedinApi
 *    "sales_navigator" to unlock experience/education/skills + InMail reachability.
 */
export async function enrichContactFromLinkedIn(
  cfg: UnipileConfig,
  accountId: string,
  identifier: string,
  opts: FullProfileOptions = {},
): Promise<ContactEnrichment> {
  const raw = await getUnipileFullProfile(cfg, identifier, accountId, opts);
  const role = currentRole(raw);
  return {
    fields: fullProfileToContact(raw),
    extras: {
      seniority: seniorityFromTitle(role.title),
      summary: raw.summary ?? null,
      location: raw.location ?? null,
      isOpenProfile: raw.is_open_profile ?? null,
      isOpenToWork: raw.is_open_to_work ?? null,
      canSendInMail: raw.can_send_inmail ?? null,
      sharedConnectionsCount: raw.shared_connections_count ?? null,
      currentCompany: role.company,
      currentCompanyId: role.companyId,
    },
    raw,
  };
}
