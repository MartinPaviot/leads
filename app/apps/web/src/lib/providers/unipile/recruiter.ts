/**
 * Unipile client — the remaining LinkedIn Specific endpoints: the generic raw
 * passthrough ("magic route"), profile endorsement, the Recruiter pipeline user
 * action, and the Recruiter jobs + hiring-projects surface. Recruiter is outside
 * Elevay's sales-GTM scope; these complete the client for parity.
 */
import { unipileFetch, unipileFetchBinary, type UnipileConfig, type UnipileList } from "./http";

/**
 * POST /linkedin — the generic "get raw data from any endpoint" passthrough.
 * Hit any LinkedIn internal endpoint Unipile hasn't wrapped: pass the LinkedIn
 * request_url (+ optional method/headers/body/query_params). The escape hatch.
 */
export interface LinkedInRawRequest {
  account_id: string;
  request_url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, unknown>;
  body?: Record<string, unknown>;
  query_params?: Record<string, unknown>;
  force_api?: boolean;
  bypass_redirect?: boolean;
  encoding?: boolean;
}
export function linkedinRawRequest(cfg: UnipileConfig, req: LinkedInRawRequest): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "POST", "/linkedin", req);
}

/** POST /linkedin/profile/endorse — endorse a specific skill on a profile. */
export function endorseProfileSkill(cfg: UnipileConfig, body: { account_id: string; profile_id: string; skill_endorsement_id: number }): Promise<{ object?: string }> {
  return unipileFetch(cfg, "POST", "/linkedin/profile/endorse", body);
}

/** POST /linkedin/user/{id} — Recruiter pipeline action on a user profile. */
export interface RecruiterUserAction {
  account_id?: string;
  api?: "recruiter";
  action: "addCandidateToPipeline" | "addApplicantToPipeline" | "changeCandidatePipeline";
  hiring_project_id?: string;
  stage?: "UNCONTACTED" | "CONTACTED" | "REPLIED";
}
export function recruiterUserAction(cfg: UnipileConfig, userId: string, body: RecruiterUserAction): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "POST", `/linkedin/user/${encodeURIComponent(userId)}`, body);
}

// ── Recruiter: hiring projects ───────────────────────────────────────────────

/** GET /linkedin/projects — list hiring projects. */
export function listHiringProjects(cfg: UnipileConfig, accountId: string, opts: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: string } = {}): Promise<UnipileList<Record<string, unknown>>> {
  const q = new URLSearchParams({ account_id: accountId });
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  if (opts.sortBy) q.set("sort_by", opts.sortBy);
  if (opts.sortOrder) q.set("sort_order", opts.sortOrder);
  return unipileFetch(cfg, "GET", `/linkedin/projects?${q.toString()}`);
}

/** GET /linkedin/projects/{id} — a hiring project. */
export function getHiringProject(cfg: UnipileConfig, projectId: string, accountId: string): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "GET", `/linkedin/projects/${encodeURIComponent(projectId)}?account_id=${encodeURIComponent(accountId)}`);
}

// ── Recruiter: job postings ──────────────────────────────────────────────────

/** GET /linkedin/jobs — list job postings. */
export function listJobs(cfg: UnipileConfig, accountId: string, opts: { category?: string; limit?: number; cursor?: string } = {}): Promise<UnipileList<Record<string, unknown>>> {
  const q = new URLSearchParams({ account_id: accountId });
  if (opts.category) q.set("category", opts.category);
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  return unipileFetch(cfg, "GET", `/linkedin/jobs?${q.toString()}`);
}

/** GET /linkedin/jobs/{id} — a job posting (service = CLASSIC | RECRUITER). */
export function getJob(cfg: UnipileConfig, jobId: string, accountId: string, service: string): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "GET", `/linkedin/jobs/${encodeURIComponent(jobId)}?account_id=${encodeURIComponent(accountId)}&service=${encodeURIComponent(service)}`);
}

/** GET /linkedin/jobs/{id}/applicants — applicants to a job posting (filterable). */
export function listJobApplicants(cfg: UnipileConfig, jobId: string, accountId: string, params: Record<string, string | number | boolean> = {}): Promise<UnipileList<Record<string, unknown>>> {
  const q = new URLSearchParams({ account_id: accountId });
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  return unipileFetch(cfg, "GET", `/linkedin/jobs/${encodeURIComponent(jobId)}/applicants?${q.toString()}`);
}

/** GET /linkedin/jobs/applicants/{aid} — a single applicant. */
export function getJobApplicant(cfg: UnipileConfig, applicantId: string, accountId: string): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "GET", `/linkedin/jobs/applicants/${encodeURIComponent(applicantId)}?account_id=${encodeURIComponent(accountId)}`);
}

/** GET /linkedin/jobs/applicants/{aid}/resume — download an applicant's résumé (bytes). */
export function getJobApplicantResume(cfg: UnipileConfig, applicantId: string, accountId: string, service?: string): Promise<ArrayBuffer> {
  const q = new URLSearchParams({ account_id: accountId });
  if (service) q.set("service", service);
  return unipileFetchBinary(cfg, `/linkedin/jobs/applicants/${encodeURIComponent(applicantId)}/resume?${q.toString()}`);
}

/** POST /linkedin/jobs — create a job-posting draft. */
export function createJob(cfg: UnipileConfig, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "POST", "/linkedin/jobs", body);
}

/** PATCH /linkedin/jobs/{id} — edit a job posting. */
export function updateJob(cfg: UnipileConfig, jobId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "PATCH", `/linkedin/jobs/${encodeURIComponent(jobId)}`, body);
}

/** POST /linkedin/jobs/{draftId}/checkpoint — solve a job-creation checkpoint. */
export function solveJobCheckpoint(cfg: UnipileConfig, draftId: string, body: { account_id: string; input: string }): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "POST", `/linkedin/jobs/${encodeURIComponent(draftId)}/checkpoint`, body);
}

/** POST /linkedin/jobs/{draftId}/publish — publish a drafted job posting. */
export function publishJob(cfg: UnipileConfig, draftId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return unipileFetch(cfg, "POST", `/linkedin/jobs/${encodeURIComponent(draftId)}/publish`, body);
}

/** POST /linkedin/jobs/{id}/close — close a job posting. */
export function closeJob(cfg: UnipileConfig, jobId: string, accountId: string, service?: string): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ account_id: accountId });
  if (service) q.set("service", service);
  return unipileFetch(cfg, "POST", `/linkedin/jobs/${encodeURIComponent(jobId)}/close?${q.toString()}`);
}
