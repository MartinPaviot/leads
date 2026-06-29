/**
 * Spec 36 (T6) — live Unipile HTTP layer for the in-Elevay connect flow.
 * Server-only (reads UNIPILE_API_KEY/DSN). The connect UX lives in Elevay:
 * we call POST /hosted/accounts/link to mint a hosted-auth URL the founder
 * opens — the LinkedIn login happens on Unipile's hosted page, never on our
 * servers, and the founder never touches the Unipile dashboard.
 *
 * Pure helpers (base URL, body mapping, webhook-token check) are exported and
 * unit-tested; the fetch calls are thin wrappers over them.
 */

import { UnipileApiError } from "./client";

export interface UnipileConfig {
  /** Host form: https://{subdomain}.unipile.com:{port} (no trailing /api/v1). */
  dsn: string;
  apiKey: string;
  /** Shared secret echoed in the webhook/notify URL as ?token=… (T6/T10). */
  webhookSecret?: string;
}

/** Read Unipile config from env; null when not provisioned (so callers 503). */
export function readUnipileConfig(): UnipileConfig | null {
  const dsn = process.env.UNIPILE_DSN?.trim();
  const apiKey = process.env.UNIPILE_API_KEY?.trim();
  if (!dsn || !apiKey) return null;
  return {
    dsn: dsn.replace(/\/+$/, ""),
    apiKey,
    webhookSecret: process.env.UNIPILE_WEBHOOK_SECRET?.trim() || undefined,
  };
}

/** The REST base: the DSN host + /api/v1 (idempotent if already suffixed). */
export function unipileApiBase(dsn: string): string {
  const clean = dsn.replace(/\/+$/, "");
  return clean.endsWith("/api/v1") ? clean : `${clean}/api/v1`;
}

export type HostedAuthType = "create" | "reconnect";

export interface HostedAuthParams {
  type: HostedAuthType;
  /** Providers to offer; ["LINKEDIN"] for our flow (Sales Nav auto-detected). */
  providers: string[];
  /** Where the created account is attached — our DSN. */
  apiUrl: string;
  /** ISO expiry for the link (Unipile rejects after this). */
  expiresOn: string;
  /** Our callback; carries ?token=<webhookSecret> for verification. */
  notifyUrl: string;
  /** Our linkedin_account row id — echoed back in the callback as `name`. */
  name: string;
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
  /** For type=reconnect: the Unipile account_id to re-authenticate. */
  reconnectAccount?: string;
}

/** Map our camelCase params to the snake_case hosted-auth body. Pure. */
export function toHostedAuthBody(p: HostedAuthParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: p.type,
    providers: p.providers,
    api_url: p.apiUrl,
    expiresOn: p.expiresOn,
    notify_url: p.notifyUrl,
    name: p.name,
  };
  if (p.successRedirectUrl) body.success_redirect_url = p.successRedirectUrl;
  if (p.failureRedirectUrl) body.failure_redirect_url = p.failureRedirectUrl;
  if (p.type === "reconnect" && p.reconnectAccount) body.reconnect_account = p.reconnectAccount;
  return body;
}

async function unipileFetch<T>(cfg: UnipileConfig, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${unipileApiBase(cfg.dsn)}${path}`, {
    method,
    headers: {
      "X-API-KEY": cfg.apiKey,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new UnipileApiError(`Unipile ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}

export interface HostedAuthResponse {
  object?: string;
  url: string;
}

/** POST /hosted/accounts/link — mint the URL the founder opens to connect. */
export function createHostedAuthLink(cfg: UnipileConfig, params: HostedAuthParams): Promise<HostedAuthResponse> {
  return unipileFetch<HostedAuthResponse>(cfg, "POST", "/hosted/accounts/link", toHostedAuthBody(params));
}

export interface UnipileAccountInfo {
  object?: string;
  id: string;
  type?: string;
  /** Display name of the connected account (the seat owner). */
  name?: string;
  /** Provider connection params; for LinkedIn the `im` block carries the seat's
   * premium tier (premiumFeatures) + public identifier (verified live shape). */
  connection_params?: {
    im?: { username?: string; publicIdentifier?: string; premiumFeatures?: string[] };
  };
  /** Account status message: OK | CREDENTIALS | ERROR | STOPPED | … */
  sources?: Array<{ status?: string }>;
  [k: string]: unknown;
}

/** GET /accounts/{id} — used by the status?() health probe. */
export function getUnipileAccount(cfg: UnipileConfig, accountId: string): Promise<UnipileAccountInfo> {
  return unipileFetch<UnipileAccountInfo>(cfg, "GET", `/accounts/${encodeURIComponent(accountId)}`);
}

// ── Messaging read primitives (T10 inbound) — VERIFIED LIVE 2026-06-26 against
// the connected seat. GET /chats → {object,items,cursor}; chat carries
// `attendee_provider_id` (the other party's member id = attribution key) +
// `unread_count`. GET /chats/{id}/messages → {object,items,cursor}; message
// carries `is_sender` (0=inbound from them, 1=our echo), `id` (providerMessageId),
// `text`, `chat_id`, `timestamp`, `is_event`.

export interface UnipileList<T> {
  object?: string;
  items: T[];
  cursor?: string | null;
}

export interface UnipileChat {
  id: string;
  account_id?: string;
  /** The other party's provider_id (member id, ACoAA… for people) — attribution key. */
  attendee_provider_id?: string | null;
  attendee_type?: string | null;
  unread_count?: number;
  timestamp?: string;
  name?: string | null;
  [k: string]: unknown;
}

export interface UnipileMessage {
  id: string;
  chat_id?: string;
  text?: string | null;
  /** 0 = inbound (from the other party); 1 = our own sent message (echo). */
  is_sender?: number;
  /** 1 = a system event (joined/left/…) rather than a real message. */
  is_event?: number;
  sender_id?: string;
  sender_attendee_id?: string;
  timestamp?: string;
  account_id?: string;
  message_type?: string;
  [k: string]: unknown;
}

/** GET /chats — recent chats for a connected account. */
export function listChats(
  cfg: UnipileConfig,
  accountId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<UnipileList<UnipileChat>> {
  const q = new URLSearchParams({ account_id: accountId, limit: String(opts.limit ?? 20) });
  if (opts.cursor) q.set("cursor", opts.cursor);
  return unipileFetch<UnipileList<UnipileChat>>(cfg, "GET", `/chats?${q.toString()}`);
}

/** GET /chats/{id}/messages — messages in a chat (newest first). */
export function listChatMessages(
  cfg: UnipileConfig,
  chatId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<UnipileList<UnipileMessage>> {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 20) });
  if (opts.cursor) q.set("cursor", opts.cursor);
  return unipileFetch<UnipileList<UnipileMessage>>(
    cfg,
    "GET",
    `/chats/${encodeURIComponent(chatId)}/messages?${q.toString()}`,
  );
}

export interface UnipileSeatInfo {
  /** 'classic' | 'sales_navigator' | 'recruiter' — the search/InMail api selector. */
  seatType: string;
  displayName: string | null;
  profileUrl: string | null;
}

/**
 * Derive the seat's premium tier + identity from a Unipile account. Verified
 * against the live GET /accounts/{id} shape: connection_params.im.premiumFeatures
 * carries ["sales_navigator"] / ["recruiter"], `name` is the display name, and
 * publicIdentifier is the /in/<handle> segment. Pure — unit-tested; the connect
 * webhook persists the result so a self-serve seat isn't stuck on the 'classic'
 * default. (The promise that "Sales Navigator is detected automatically".)
 */
export function seatInfoFromAccount(info: UnipileAccountInfo): UnipileSeatInfo {
  const im = info.connection_params?.im;
  const features = (im?.premiumFeatures ?? []).map((f) => String(f).toLowerCase());
  const seatType = features.includes("sales_navigator")
    ? "sales_navigator"
    : features.includes("recruiter")
      ? "recruiter"
      : "classic";
  const displayName = info.name ?? im?.username ?? null;
  const profileUrl = im?.publicIdentifier ? `https://www.linkedin.com/in/${im.publicIdentifier}` : null;
  return { seatType, displayName, profileUrl };
}

export interface UnipileUserProfile {
  /** The opaque, viewer-scoped provider id (ACoAA…) — the send target. */
  provider_id?: string;
  id?: string;
  public_identifier?: string;
  /** e.g. "DISTANCE_1" | "DISTANCE_2" | "OUT_OF_NETWORK". */
  network_distance?: string;
  is_relationship?: boolean;
  [k: string]: unknown;
}

/**
 * GET /users/{identifier}?account_id=… — resolve a public identifier (the
 * /in/<handle> segment) to a provider_id, WITH the sending account (ids are
 * viewer-scoped). The spec-36 T1 resolution step.
 */
export function getUnipileUserProfile(cfg: UnipileConfig, identifier: string, accountId: string): Promise<UnipileUserProfile> {
  return unipileFetch<UnipileUserProfile>(
    cfg,
    "GET",
    `/users/${encodeURIComponent(identifier)}?account_id=${encodeURIComponent(accountId)}`,
  );
}

export type LinkedInSearchApi = "classic" | "sales_navigator" | "recruiter";
export type LinkedInSearchCategory = "people" | "companies";

/** A LinkedIn/Sales-Nav search result (verified shape, people category). */
export interface LinkedInSearchResult {
  id?: string;
  type?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  headline?: string;
  summary?: string;
  industry?: string;
  location?: string;
  public_identifier?: string;
  public_profile_url?: string;
  profile_url?: string;
  member_urn?: string;
  network_distance?: string;
  premium?: boolean;
  current_positions?: Array<{ company?: string; company_name?: string; role?: string; title?: string; [k: string]: unknown }>;
  recent_posts_count?: number;
  shared_connections_count?: number;
  [k: string]: unknown;
}

export interface LinkedInSearchPage {
  items: LinkedInSearchResult[];
  cursor: string | null;
  /** paging.total_count — the TAM size estimate for this query. */
  total: number | null;
}

/**
 * POST /linkedin/search — one page. `api: "sales_navigator"` requires a Sales
 * Navigator seat (the founder's has it). Filters beyond `keywords` are LinkedIn
 * numeric ids resolved via GET /linkedin/search/parameters (follow-up); this
 * covers keyword/category + the paste-a-search-URL variant via `url`.
 */
export async function searchLinkedIn(
  cfg: UnipileConfig,
  accountId: string,
  body: { api: LinkedInSearchApi; category?: LinkedInSearchCategory; keywords?: string; url?: string; [k: string]: unknown },
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<LinkedInSearchPage> {
  const q = `account_id=${encodeURIComponent(accountId)}&limit=${opts.limit ?? 25}${opts.cursor ? `&cursor=${encodeURIComponent(opts.cursor)}` : ""}`;
  const j = await unipileFetch<{ items?: LinkedInSearchResult[]; cursor?: string | null; paging?: { total_count?: number } }>(
    cfg,
    "POST",
    `/linkedin/search?${q}`,
    body,
  );
  return { items: j.items ?? [], cursor: j.cursor ?? null, total: j.paging?.total_count ?? null };
}

export type LinkedInParameterType =
  | "LOCATION"
  | "INDUSTRY"
  | "COMPANY"
  | "SCHOOL"
  | "JOB_TITLE"
  | "JOB_FUNCTION"
  | "SERVICE"
  | "SKILL"
  | "PEOPLE"
  | "CONNECTIONS"
  | "EMPLOYMENT_TYPE";

export type LinkedInParameterService = "CLASSIC" | "SALES_NAVIGATOR" | "RECRUITER";

export interface LinkedInSearchParameter {
  /** Numeric LinkedIn filter ID (returned as a string). */
  id: string;
  /** The human label LinkedIn returns for that ID. */
  title: string;
}

/**
 * GET /linkedin/search/parameters — resolve a human label ("France", "Software
 * Development", "Founder") into the numeric LinkedIn filter ID that POST
 * /linkedin/search requires. Verified live: returns { items: [{ id, title }] }
 * ranked best-match-first. IDs are SERVICE-scoped — resolve with the same
 * `service` you'll search in. (The pre-step the parameter-based search needs.)
 */
export async function resolveLinkedInParameter(
  cfg: UnipileConfig,
  accountId: string,
  type: LinkedInParameterType,
  keywords: string | undefined,
  service: LinkedInParameterService = "CLASSIC",
  limit = 10,
): Promise<LinkedInSearchParameter[]> {
  const qs = new URLSearchParams({ account_id: accountId, type, service, limit: String(limit) });
  if (keywords) qs.set("keywords", keywords);
  const j = await unipileFetch<{ items?: Array<{ id?: string | number; title?: string }> }>(
    cfg,
    "GET",
    `/linkedin/search/parameters?${qs.toString()}`,
  );
  return (j.items ?? [])
    .filter((it) => it.id != null)
    .map((it) => ({ id: String(it.id), title: it.title ?? "" }));
}

/** A 1st-degree relation as returned by GET /users/relations (verified shape). */
export interface UnipileRelation {
  /** Unipile member id (ACoAA…) — the viewer-scoped provider_id / send target. */
  member_id?: string;
  member_urn?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  public_identifier?: string;
  public_profile_url?: string;
  [k: string]: unknown;
}

export interface UnipileRelationsPage {
  items: UnipileRelation[];
  cursor: string | null;
}

/**
 * GET /users/relations — one page of a connected account's 1st-degree relations.
 * Cursor-paginated (envelope {object, items, cursor}; no paging object). Every
 * item is implicitly 1st-degree. Caller loops until cursor is null.
 */
export async function listUnipileRelations(
  cfg: UnipileConfig,
  accountId: string,
  cursor?: string | null,
  limit = 100,
): Promise<UnipileRelationsPage> {
  const q = `account_id=${encodeURIComponent(accountId)}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const j = await unipileFetch<{ items?: UnipileRelation[]; cursor?: string | null }>(cfg, "GET", `/users/relations?${q}`);
  return { items: j.items ?? [], cursor: j.cursor ?? null };
}

// ── Sales-Navigator RETRIEVAL primitives — every shape below was verified LIVE
// (2026-06-29) against the connected sales_navigator seat. These are read-only
// (no send, no notify) and feed enrichment/scoring, NOT the send path.

/** GET /users/me — the connected seat's own profile (its SN/Recruiter identity). */
export interface UnipileOwnProfile {
  object?: string;
  provider_id?: string;
  public_identifier?: string;
  public_profile_url?: string;
  first_name?: string;
  last_name?: string;
  occupation?: string;
  headline?: string;
  premium?: boolean;
  open_profile?: boolean;
  location?: string;
  email?: string;
  organizations?: unknown[];
  /** Present iff the seat holds a Sales Navigator contract. */
  sales_navigator?: { contract_id?: string; owner_seat_id?: string } | null;
  recruiter?: unknown | null;
  [k: string]: unknown;
}

export function getUnipileOwnProfile(cfg: UnipileConfig, accountId: string): Promise<UnipileOwnProfile> {
  return unipileFetch<UnipileOwnProfile>(cfg, "GET", `/users/me?account_id=${encodeURIComponent(accountId)}`);
}

/** A single role in a profile's experience history (GET /users/{id} sections). */
export interface UnipileWorkExperience {
  company?: string;
  company_id?: string | null;
  position?: string;
  description?: string;
  status?: string;
  location?: string;
  company_picture_url?: string;
  skills?: string[] | null;
  start?: string;
  end?: string | null;
}
export interface UnipileEducation {
  school?: string;
  school_id?: string;
  degree?: string;
  school_picture_url?: string;
  start?: string;
  end?: string | null;
}
export interface UnipileLanguage {
  name?: string;
  proficiency?: string;
}

/**
 * The FULL lead profile — what the Sales Navigator lead card shows. Superset of
 * UnipileUserProfile; only present when fetched with `linkedin_sections`.
 */
export interface UnipileFullProfile extends UnipileUserProfile {
  public_profile_url?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  summary?: string;
  location?: string;
  member_urn?: string;
  primary_locale?: { country?: string; language?: string };
  follower_count?: number;
  connections_count?: number;
  shared_connections_count?: number;
  is_open_profile?: boolean;
  /** SN-surface only: the lead is open-to-work / InMail-reachable. */
  is_open_to_work?: boolean;
  can_send_inmail?: boolean;
  is_premium?: boolean;
  is_creator?: boolean;
  is_influencer?: boolean;
  birthdate?: { month?: number; day?: number; year?: number } | null;
  connected_at?: number;
  websites?: string[];
  hashtags?: string[];
  work_experience?: UnipileWorkExperience[];
  work_experience_total_count?: number;
  education?: UnipileEducation[];
  education_total_count?: number;
  languages?: UnipileLanguage[];
  skills?: Array<string | { name?: string }>;
  certifications?: unknown[];
  projects?: unknown[];
  volunteering_experience?: unknown[];
  profile_picture_url?: string;
}

export interface FullProfileOptions {
  /** LinkedIn sections to hydrate; "*" = all. Heavy requests are throttled. */
  sections?: string;
  /** Query a premium surface — REQUIRED (with the SN id) to unlock out-of-network leads. */
  linkedinApi?: LinkedInSearchApi;
}

/**
 * GET /users/{identifier}?linkedin_sections=… — the full profile (experience,
 * education, skills, languages, summary). RESOLUTION RULE (verified live):
 *  - 1st-degree relation: pass the public_identifier on the default (classic) surface.
 *  - out-of-network lead: pass the SN id (ACwAA…) + linkedinApi:"sales_navigator"
 *    — that unlocks work_experience/education/skills + can_send_inmail/is_open_to_work
 *    that classic locks (a public handle + SN surface 422s `invalid_recipient`).
 */
export function getUnipileFullProfile(
  cfg: UnipileConfig,
  identifier: string,
  accountId: string,
  opts: FullProfileOptions = {},
): Promise<UnipileFullProfile> {
  const q = new URLSearchParams({ account_id: accountId, linkedin_sections: opts.sections ?? "*" });
  if (opts.linkedinApi) q.set("linkedin_api", opts.linkedinApi);
  return unipileFetch<UnipileFullProfile>(cfg, "GET", `/users/${encodeURIComponent(identifier)}?${q.toString()}`);
}

/** A company location (verified shape; `street` is an array of free-text lines). */
export interface UnipileCompanyLocation {
  is_headquarter?: boolean;
  city?: string;
  country?: string;
  area?: string;
  postalCode?: string;
  street?: string[];
}

/** Headcount-growth insight — the Sales Navigator "company growth" signal. */
export interface UnipileCompanyInsights {
  employeesCount?: {
    totalCount?: number;
    averageTenure?: string;
    growthGraph?: Array<{ monthRange?: number; growthPercentage?: number }>;
    employeesCountGraph?: Array<{ count?: number; date?: string }>;
  };
}

/** GET /linkedin/company/{id} — the full account/company profile (firmographics + insights). */
export interface UnipileCompanyProfile {
  object?: string;
  id?: string;
  entity_urn?: string;
  public_identifier?: string;
  name?: string;
  description?: string;
  tagline?: string;
  website?: string;
  phone?: string;
  industry?: string[];
  employee_count?: number;
  employee_count_range?: { from?: number; to?: number };
  followers_count?: number;
  foundation_date?: string;
  locations?: UnipileCompanyLocation[];
  activities?: string[];
  hashtags?: Array<{ title?: string }>;
  logo?: string;
  logo_large?: string;
  profile_url?: string;
  claimed?: boolean;
  insights?: UnipileCompanyInsights;
  [k: string]: unknown;
}

export function getUnipileCompanyProfile(
  cfg: UnipileConfig,
  identifier: string,
  accountId: string,
): Promise<UnipileCompanyProfile> {
  return unipileFetch<UnipileCompanyProfile>(
    cfg,
    "GET",
    `/linkedin/company/${encodeURIComponent(identifier)}?account_id=${encodeURIComponent(accountId)}`,
  );
}

/** A normalized, scoring-ready headcount-growth signal (pure derivation). */
export interface HeadcountGrowthSignal {
  totalCount: number | null;
  averageTenure: string | null;
  growth6moPct: number | null;
  growth12moPct: number | null;
  growth24moPct: number | null;
  /** Newest-last monthly headcount series. */
  series: Array<{ date: string; count: number }>;
}

/** Pure: distil company insights into the headcount-growth signal. */
export function mapHeadcountGrowth(insights: UnipileCompanyInsights | undefined): HeadcountGrowthSignal {
  const e = insights?.employeesCount;
  const byRange = (m: number) => e?.growthGraph?.find((g) => g.monthRange === m)?.growthPercentage ?? null;
  return {
    totalCount: e?.totalCount ?? null,
    averageTenure: e?.averageTenure ?? null,
    growth6moPct: byRange(6),
    growth12moPct: byRange(12),
    growth24moPct: byRange(24),
    series: (e?.employeesCountGraph ?? [])
      .filter((p) => p.date && typeof p.count === "number")
      .map((p) => ({ date: p.date as string, count: p.count as number })),
  };
}

/** GET /linkedin/inmail_balance — remaining InMail credits per premium surface. */
export interface UnipileInMailBalance {
  object?: string;
  premium?: number | null;
  recruiter?: number | null;
  sales_navigator?: number | null;
}
export function getUnipileInMailBalance(cfg: UnipileConfig, accountId: string): Promise<UnipileInMailBalance> {
  return unipileFetch<UnipileInMailBalance>(cfg, "GET", `/linkedin/inmail_balance?account_id=${encodeURIComponent(accountId)}`);
}

/** GET /linkedin/contracts — the SN/Recruiter contracts available on the seat. */
export interface UnipileContract {
  id: string;
  name?: string;
  product?: string;
  selected?: boolean;
}
export async function listUnipileContracts(cfg: UnipileConfig, accountId: string): Promise<UnipileContract[]> {
  const j = await unipileFetch<{ items?: UnipileContract[] }>(
    cfg,
    "GET",
    `/linkedin/contracts?account_id=${encodeURIComponent(accountId)}`,
  );
  return j.items ?? [];
}

/** A post with its engagement counters (recent-activity buying signal). */
export interface UnipilePost {
  id?: string;
  text?: string;
  date?: string;
  parsed_datetime?: string;
  is_repost?: boolean;
  impressions_counter?: number;
  reaction_counter?: number;
  comment_counter?: number;
  repost_counter?: number;
  share_url?: string;
  social_id?: string;
  [k: string]: unknown;
}

/**
 * GET /users/{provider_id}/posts — a person's recent posts. NOTE (verified live):
 * the identifier MUST be the provider_id (ACoAA…); a public handle 422s
 * `invalid_recipient`. `recent_posts_count` on a search result tells you whether
 * it is worth a call.
 */
export async function listUnipileUserPosts(
  cfg: UnipileConfig,
  providerId: string,
  accountId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<UnipileList<UnipilePost>> {
  const q = new URLSearchParams({ account_id: accountId, limit: String(opts.limit ?? 10) });
  if (opts.cursor) q.set("cursor", opts.cursor);
  return unipileFetch<UnipileList<UnipilePost>>(cfg, "GET", `/users/${encodeURIComponent(providerId)}/posts?${q.toString()}`);
}

/** A pending invitation (sent or received). */
export interface UnipileInvitation {
  id?: string;
  invitation_text?: string;
  invited_user?: string;
  invited_user_id?: string;
  invited_user_public_id?: string;
  invited_user_description?: string;
  invited_user_profile_picture_url?: string;
  /** Received-only: the person who sent us the request. */
  inviter?: string;
  date?: string;
  parsed_datetime?: string;
  [k: string]: unknown;
}

/** GET /users/invite/sent — our pending OUTBOUND invitations (diff to detect accepts). */
export async function listUnipileInvitationsSent(
  cfg: UnipileConfig,
  accountId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<UnipileList<UnipileInvitation>> {
  const q = new URLSearchParams({ account_id: accountId, limit: String(opts.limit ?? 50) });
  if (opts.cursor) q.set("cursor", opts.cursor);
  return unipileFetch<UnipileList<UnipileInvitation>>(cfg, "GET", `/users/invite/sent?${q.toString()}`);
}

/** GET /users/invite/received — pending INBOUND connection requests. */
export async function listUnipileInvitationsReceived(
  cfg: UnipileConfig,
  accountId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<UnipileList<UnipileInvitation>> {
  const q = new URLSearchParams({ account_id: accountId, limit: String(opts.limit ?? 50) });
  if (opts.cursor) q.set("cursor", opts.cursor);
  return unipileFetch<UnipileList<UnipileInvitation>>(cfg, "GET", `/users/invite/received?${q.toString()}`);
}

/**
 * Constant-time check that the inbound webhook/notify request carries our
 * shared secret in `?token=`. Fail-closed: no secret configured → reject.
 * (The hosted-auth notify_url is a plain callback with no documented signature,
 * so we secure the URL we control rather than rely on an unverified scheme.)
 */
export function verifyWebhookToken(requestUrl: string, secret: string | undefined): boolean {
  if (!secret) return false;
  let token: string | null = null;
  try {
    token = new URL(requestUrl).searchParams.get("token");
  } catch {
    return false;
  }
  if (!token || token.length !== secret.length) return false;
  // length-guarded constant-time compare without importing crypto here.
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
