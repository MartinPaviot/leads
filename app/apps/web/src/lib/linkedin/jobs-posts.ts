/**
 * Spec 36 (T11, #2 cont.) — the TWO remaining LinkedIn search categories beyond
 * people/companies: JOBS (hiring-signal discovery) and POSTS (content/topic
 * discovery). Both run on the `classic` api tier (verified live — reachable even
 * from a Sales-Nav seat). Shapes match the live `Classic - JOBS` / `Classic -
 * POSTS` schema. Resolution (free-text → LinkedIn ids) uses the CLASSIC service.
 *
 * Jobs → companies that are hiring (a job for "VP of Sales" = a GTM-scaling
 * signal). Posts → people posting about a topic (warm, intent-rich leads).
 *
 * Pure builders + enums here; the sourcing (results → canonical CRM rows) lives
 * in jobs-posts-sourcing.ts.
 */

import {
  resolveLinkedInParameter,
  type UnipileConfig,
  type LinkedInParameterType,
} from "@/lib/providers/unipile/http";

// ---------------------------------------------------------------------------
// Fixed vocabularies (exact enums from the live schema)
// ---------------------------------------------------------------------------

export const JOB_SENIORITIES = ["executive", "director", "mid_senior", "associate", "entry", "intern"] as const;
export type JobSeniority = (typeof JOB_SENIORITIES)[number];

export const JOB_TYPES = ["full_time", "part_time", "contract", "temporary", "volunteer", "internship", "other"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_PRESENCE = ["on_site", "hybrid", "remote"] as const;
export type JobPresence = (typeof JOB_PRESENCE)[number];

export const POST_CONTENT_TYPES = ["videos", "images", "live_videos", "collaborative_articles", "documents"] as const;
export type PostContentType = (typeof POST_CONTENT_TYPES)[number];

export const POST_DATE_POSTED = ["past_day", "past_week", "past_month"] as const;
export type PostDatePosted = (typeof POST_DATE_POSTED)[number];

export type SortBy = "relevance" | "date";

// ---------------------------------------------------------------------------
// JOBS
// ---------------------------------------------------------------------------

/** Free-text + structured criteria for a jobs search. Free-text (locations/
 * industries/functions/roles/companies) resolves to LinkedIn ids; the rest are
 * fixed enums / booleans / numbers. */
export interface JobsSearchCriteria {
  keywords?: string;
  sortBy?: SortBy;
  /** Days since posting (LinkedIn's DATE POSTED). */
  datePostedDays?: number;
  locations?: string[];
  withinAreaMiles?: number;
  industries?: string[];
  functions?: string[];
  roles?: string[];
  companies?: string[];
  seniorities?: string[];
  jobTypes?: string[];
  presence?: string[];
  easyApply?: boolean;
  under10Applicants?: boolean;
  inYourNetwork?: boolean;
}

/** Which free-text job filters resolve, and via which `/search/parameters` type. */
const JOB_RESOLVE: Array<{ field: keyof JobsSearchCriteria; bodyKey: string; type: LinkedInParameterType }> = [
  { field: "locations", bodyKey: "location", type: "LOCATION" },
  { field: "industries", bodyKey: "industry", type: "INDUSTRY" },
  { field: "functions", bodyKey: "function", type: "JOB_FUNCTION" },
  { field: "roles", bodyKey: "role", type: "JOB_TITLE" },
  { field: "companies", bodyKey: "company", type: "COMPANY" },
];

export interface JobsResolvedFilter {
  field: string;
  label: string;
  id: string | null;
  matched: string | null;
}

// A `type` (not an interface) so it carries an implicit index signature and is
// assignable to searchLinkedIn's `{ …; [k: string]: unknown }` body param.
export type JobsSearchBody = {
  api: "classic";
  category: "jobs";
  keywords?: string;
  sort_by?: SortBy;
  date_posted?: number;
  location?: string[];
  location_within_area?: number;
  industry?: string[];
  function?: string[];
  role?: string[];
  company?: string[];
  seniority?: JobSeniority[];
  job_type?: JobType[];
  presence?: JobPresence[];
  easy_apply?: boolean;
  under_10_applicants?: boolean;
  in_your_network?: boolean;
}

const keepEnum = <T extends string>(vals: string[] | undefined, allowed: readonly T[]): T[] => {
  const set = new Set<string>(allowed);
  return (vals ?? []).map((v) => v.trim().toLowerCase()).filter((v): v is T => set.has(v));
};

/** Assemble the jobs search body from resolved ids + validated enums. Pure. */
export function buildJobsSearchBody(criteria: JobsSearchCriteria, resolved: JobsResolvedFilter[]): JobsSearchBody {
  const body: JobsSearchBody = { api: "classic", category: "jobs" };
  const idsOf = (bodyKey: string): string[] => {
    const fieldName = JOB_RESOLVE.find((j) => j.bodyKey === bodyKey)?.field;
    return resolved.filter((r) => r.field === fieldName && r.id != null).map((r) => String(r.id));
  };
  const location = idsOf("location");
  if (location.length) body.location = location;
  const industry = idsOf("industry");
  if (industry.length) body.industry = industry;
  const fn = idsOf("function");
  if (fn.length) body.function = fn;
  const role = idsOf("role");
  if (role.length) body.role = role;
  const company = idsOf("company");
  if (company.length) body.company = company;

  const sen = keepEnum(criteria.seniorities, JOB_SENIORITIES);
  if (sen.length) body.seniority = sen;
  const jt = keepEnum(criteria.jobTypes, JOB_TYPES);
  if (jt.length) body.job_type = jt;
  const pres = keepEnum(criteria.presence, JOB_PRESENCE);
  if (pres.length) body.presence = pres;

  if (criteria.keywords?.trim()) body.keywords = criteria.keywords.trim();
  if (criteria.sortBy) body.sort_by = criteria.sortBy;
  if (Number.isFinite(Number(criteria.datePostedDays)) && Number(criteria.datePostedDays) > 0) body.date_posted = Number(criteria.datePostedDays);
  if (location.length && Number.isFinite(Number(criteria.withinAreaMiles)) && Number(criteria.withinAreaMiles) > 0) {
    body.location_within_area = Number(criteria.withinAreaMiles);
  }
  if (criteria.easyApply) body.easy_apply = true;
  if (criteria.under10Applicants) body.under_10_applicants = true;
  if (criteria.inYourNetwork) body.in_your_network = true;
  return body;
}

/** True when a jobs body carries any real targeting (beyond api/category). Pure. */
export function jobsBodyUsable(body: JobsSearchBody): boolean {
  return Object.keys(body).some((k) => k !== "api" && k !== "category" && k !== "sort_by");
}

/** Resolve a jobs search's free-text filters to LinkedIn ids (CLASSIC service)
 * and build the body + a resolution report. */
export async function resolveJobsQuery(
  cfg: UnipileConfig,
  accountId: string,
  criteria: JobsSearchCriteria,
): Promise<{ body: JobsSearchBody; report: JobsResolvedFilter[]; usable: boolean }> {
  const cache = new Map<string, { id: string; title: string } | null>();
  const report: JobsResolvedFilter[] = [];
  for (const { field, type } of JOB_RESOLVE) {
    const labels = (criteria[field] as string[] | undefined) ?? [];
    for (const raw of labels) {
      const label = raw.trim();
      if (!label) continue;
      const key = `${type}:${label.toLowerCase()}`;
      if (!cache.has(key)) {
        const items = await resolveLinkedInParameter(cfg, accountId, type, label, "CLASSIC", 1);
        cache.set(key, items[0] ?? null);
      }
      const hit = cache.get(key) ?? null;
      report.push({ field, label, id: hit?.id ?? null, matched: hit?.title ?? null });
    }
  }
  const body = buildJobsSearchBody(criteria, report);
  return { body, report, usable: jobsBodyUsable(body) };
}

// ---------------------------------------------------------------------------
// POSTS
// ---------------------------------------------------------------------------

export interface PostsSearchCriteria {
  keywords?: string;
  sortBy?: SortBy;
  datePosted?: string;
  contentType?: string;
}

export type PostsSearchBody = {
  api: "classic";
  category: "posts";
  keywords?: string;
  sort_by?: SortBy;
  date_posted?: PostDatePosted;
  content_type?: PostContentType;
}

/** Assemble the posts search body. Pure. */
export function buildPostsSearchBody(criteria: PostsSearchCriteria): PostsSearchBody {
  const body: PostsSearchBody = { api: "classic", category: "posts" };
  if (criteria.keywords?.trim()) body.keywords = criteria.keywords.trim();
  if (criteria.sortBy) body.sort_by = criteria.sortBy;
  const date = keepEnum(criteria.datePosted ? [criteria.datePosted] : undefined, POST_DATE_POSTED);
  if (date.length) body.date_posted = date[0];
  const ct = keepEnum(criteria.contentType ? [criteria.contentType] : undefined, POST_CONTENT_TYPES);
  if (ct.length) body.content_type = ct[0];
  return body;
}

/** Posts search needs at least keywords (LinkedIn rejects an empty post search). */
export function postsBodyUsable(body: PostsSearchBody): boolean {
  return !!body.keywords;
}
