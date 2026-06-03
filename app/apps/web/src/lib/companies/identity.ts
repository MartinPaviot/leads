/**
 * Account identity resolution + hygiene — the basis of a "clean" account
 * list. Pure.
 *
 * A clean list needs ONE canonical record per real legal entity. The
 * authoritative key is the official registry id (SIREN for France, UID
 * CHE- for Switzerland); domain is the fallback, normalized legal name
 * the last resort. Deduping on this key (not just domain) is what removes
 * the duplicates Apollo-style scraped data leaves behind.
 */

export interface CompanyLike {
  id?: string;
  name?: string | null;
  domain?: string | null;
  industry?: string | null;
  excludedReason?: string | null;
  deletedAt?: Date | string | null;
  properties?: Record<string, unknown> | null;
}

const LEGAL_SUFFIXES =
  /\b(s\.?a\.?s\.?u?|s\.?a\.?r\.?l|s\.?a\b|e\.?u\.?r\.?l|sci|sasu|gmbh|ag|s\.?à\.?r\.?l|sagl|sa\b|ltd|llc|inc|co|corp|plc|bv|nv|oy|ab|holding|group|groupe)\b/gi;

/** Normalize a company name for fallback matching: lowercase, strip
 *  accents, drop legal suffixes + punctuation, collapse spaces. */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    // Collapse acronym dots/apostrophes FIRST so "s.a." -> "sa" matches
    // the legal-suffix regex (spacing them would leave "s a" and miss it).
    .replace(/[.'’]/g, "")
    .replace(/[,/&"()\-]/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bareDomain(d: string | null | undefined): string | null {
  if (!d) return null;
  return (
    d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim() || null
  );
}

/**
 * The canonical dedup key for an account, most-authoritative first:
 *   fr:<siren> · ch:<uid> · d:<domain> · n:<normalized name>
 * Returns null only when there's nothing to key on (drop such rows).
 */
export function canonicalIdentityKey(c: CompanyLike): string | null {
  const p = c.properties ?? {};
  const siren = typeof p.siren === "string" ? p.siren.replace(/\s/g, "") : null;
  if (siren) return `fr:${siren}`;
  const uid = typeof p.uid === "string" ? p.uid : typeof p.zefix_uid === "string" ? p.zefix_uid : null;
  if (uid) return `ch:${uid.replace(/\s/g, "")}`;
  const dom = bareDomain(c.domain);
  if (dom) return `d:${dom}`;
  const n = normalizeCompanyName(c.name);
  return n ? `n:${n}` : null;
}

/** Actionable for outbound = active, not excluded, and reachable
 *  (has a domain — the minimum to enrich/contact). */
export function isActionable(c: CompanyLike): boolean {
  if (c.deletedAt) return false;
  if (c.excludedReason) return false;
  if (!bareDomain(c.domain)) return false;
  return true;
}

export interface QualityReport {
  total: number;
  uniqueEntities: number;
  duplicateRows: number;
  unkeyed: number; // no siren/uid/domain/name
  missingDomain: number;
  missingIndustry: number;
  excludedOrDeleted: number;
  bySource: Record<string, number>;
  /** Canonical keys with >1 row (the dupes to merge). */
  duplicateGroups: Array<{ key: string; count: number; ids: string[] }>;
}

/** Audit a set of accounts for cleanliness. Pure. */
export function auditAccountQuality(companies: CompanyLike[]): QualityReport {
  const groups = new Map<string, string[]>();
  let unkeyed = 0;
  let missingDomain = 0;
  let missingIndustry = 0;
  let excludedOrDeleted = 0;
  const bySource: Record<string, number> = {};

  for (const c of companies) {
    const key = canonicalIdentityKey(c);
    if (!key) unkeyed++;
    else {
      const arr = groups.get(key) ?? [];
      arr.push(c.id ?? "?");
      groups.set(key, arr);
    }
    if (!bareDomain(c.domain)) missingDomain++;
    if (!c.industry) missingIndustry++;
    if (c.deletedAt || c.excludedReason) excludedOrDeleted++;
    const src = String((c.properties ?? {}).source ?? "(none)");
    bySource[src] = (bySource[src] ?? 0) + 1;
  }

  const dupGroups = [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, count: ids.length, ids }))
    .sort((a, b) => b.count - a.count);

  const duplicateRows = dupGroups.reduce((s, g) => s + (g.count - 1), 0);

  return {
    total: companies.length,
    uniqueEntities: groups.size + unkeyed,
    duplicateRows,
    unkeyed,
    missingDomain,
    missingIndustry,
    excludedOrDeleted,
    bySource,
    duplicateGroups: dupGroups.slice(0, 50),
  };
}
