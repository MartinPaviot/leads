/**
 * Spec 36 (T11, #2) — translate an Elevay ICP's free-text criteria into a
 * precise Sales-Navigator search body. LinkedIn filters are numeric IDs, not
 * labels, so each industry/location/title label is resolved via GET
 * /linkedin/search/parameters (top match, cached per run); the rest (keywords,
 * network distance) pass through. This is the in-app alternative to pasting a
 * Sales-Nav URL: the user describes their ICP and we build the query.
 *
 * The body assembly (buildSalesNavBody) is pure + unit-tested; the resolution
 * (resolveIcpToSalesNavQuery) is the thin async orchestration over the resolver.
 */

import {
  resolveLinkedInParameter,
  type UnipileConfig,
  type LinkedInParameterService,
  type LinkedInSearchApi,
  type LinkedInSearchCategory,
} from "@/lib/providers/unipile/http";

/** The resolvable ICP inputs we map onto Sales-Nav filter IDs. Free-text labels
 * (industries/locations/jobTitles) get resolved to LinkedIn numeric IDs; keywords
 * + networkDistance pass through unresolved. */
export interface IcpSearchCriteria {
  industries?: string[];
  locations?: string[];
  jobTitles?: string[];
  keywords?: string;
  networkDistance?: number[];
}

export type ResolvableType = "INDUSTRY" | "LOCATION" | "JOB_TITLE";

export interface ResolvedFilter {
  type: ResolvableType;
  /** The label the user typed. */
  label: string;
  /** The resolved LinkedIn numeric ID, or null when nothing matched. */
  id: string | null;
  /** The LinkedIn title we matched the label to (for the confirmation report). */
  matched: string | null;
}

export interface SalesNavSearchBody {
  api: LinkedInSearchApi;
  category: LinkedInSearchCategory;
  keywords?: string;
  /** Sales Navigator / Recruiter use { include }; Classic uses a flat id array.
   * IDs are STRINGS (the live schema requires `^\d+$` strings). */
  location?: string[] | { include: string[] };
  industry?: string[] | { include: string[] };
  /** Classic people only — Sales Navigator people has NO job_title filter, so
   * titles fold into `keywords` there (verified against the live SN schema). */
  job_title?: string[];
  network_distance?: number[];
}

/**
 * Assemble the POST /linkedin/search body from resolved filter IDs. Pure. The
 * shape is api-tier-specific and matches the LIVE Unipile schema (verified): for
 * sales_navigator/recruiter, location/industry are `{ include: [stringIds] }` and
 * there is no job_title filter (titles → keywords as `(a OR b)`); for classic they
 * are flat string-id arrays plus a job_title array. IDs stay strings.
 */
export function buildSalesNavBody(
  api: LinkedInSearchApi,
  category: LinkedInSearchCategory,
  resolved: ResolvedFilter[],
  opts: { keywords?: string; networkDistance?: number[] } = {},
): SalesNavSearchBody {
  const idsOf = (t: ResolvableType): string[] =>
    resolved.filter((r) => r.type === t && r.id != null).map((r) => String(r.id));
  const location = idsOf("LOCATION");
  const industry = idsOf("INDUSTRY");
  const jobTitleIds = idsOf("JOB_TITLE");
  const titleLabels = resolved.filter((r) => r.type === "JOB_TITLE").map((r) => r.label);
  const advanced = api === "sales_navigator" || api === "recruiter";

  const body: SalesNavSearchBody = { api, category };
  const kw: string[] = [];
  if (opts.keywords?.trim()) kw.push(opts.keywords.trim());

  if (advanced) {
    if (location.length) body.location = { include: location };
    if (industry.length) body.industry = { include: industry };
    if (category === "people" && titleLabels.length) {
      kw.push(`(${titleLabels.map((t) => (/\s/.test(t) ? `"${t}"` : t)).join(" OR ")})`);
    }
  } else {
    if (location.length) body.location = location;
    if (industry.length) body.industry = industry;
    if (category === "people" && jobTitleIds.length) body.job_title = jobTitleIds;
  }

  const keywords = kw.join(" ").trim();
  if (keywords) body.keywords = keywords;
  if (opts.networkDistance?.length) body.network_distance = opts.networkDistance;
  return body;
}

/** The LinkedIn parameter service that matches a search api tier. Pure. */
export function serviceForApi(api: LinkedInSearchApi): LinkedInParameterService {
  return api === "sales_navigator" ? "SALES_NAVIGATOR" : api === "recruiter" ? "RECRUITER" : "CLASSIC";
}

export interface IcpResolveResult {
  body: SalesNavSearchBody;
  report: ResolvedFilter[];
  /** true when the search is meaningful: at least one structured filter resolved,
   * or free-text keywords were given. A false result should NOT be searched. */
  usable: boolean;
}

/**
 * Resolve an ICP's free-text industries/locations/jobTitles to LinkedIn filter
 * IDs (top match each, cached per run, resolved in the search's own service) and
 * build the Sales-Nav search body. Returns the body + a resolution report so the
 * caller can show "France → France (105015875)" and flag anything unresolved.
 */
export async function resolveIcpToSalesNavQuery(
  cfg: UnipileConfig,
  accountId: string,
  icp: IcpSearchCriteria,
  opts: { api: LinkedInSearchApi; category: LinkedInSearchCategory },
): Promise<IcpResolveResult> {
  const service = serviceForApi(opts.api);
  const cache = new Map<string, { id: string; title: string } | null>();

  const resolveOne = async (type: ResolvableType, raw: string): Promise<ResolvedFilter> => {
    const label = raw.trim();
    const key = `${type}:${label.toLowerCase()}`;
    if (!cache.has(key)) {
      const items = await resolveLinkedInParameter(cfg, accountId, type, label, service, 1);
      cache.set(key, items[0] ?? null);
    }
    const hit = cache.get(key) ?? null;
    return { type, label, id: hit?.id ?? null, matched: hit?.title ?? null };
  };

  const report: ResolvedFilter[] = [];
  for (const l of icp.industries ?? []) if (l.trim()) report.push(await resolveOne("INDUSTRY", l));
  for (const l of icp.locations ?? []) if (l.trim()) report.push(await resolveOne("LOCATION", l));
  for (const l of icp.jobTitles ?? []) if (l.trim()) report.push(await resolveOne("JOB_TITLE", l));

  const body = buildSalesNavBody(opts.api, opts.category, report, {
    keywords: icp.keywords,
    networkDistance: icp.networkDistance,
  });
  // Usable = the assembled body carries at least one real filter or keywords.
  const usable = !!(body.keywords || body.location || body.industry || body.job_title);
  return { body, report, usable };
}
