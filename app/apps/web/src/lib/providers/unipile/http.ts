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
  /** Account status message: OK | CREDENTIALS | ERROR | STOPPED | … */
  sources?: Array<{ status?: string }>;
  [k: string]: unknown;
}

/** GET /accounts/{id} — used by the status?() health probe. */
export function getUnipileAccount(cfg: UnipileConfig, accountId: string): Promise<UnipileAccountInfo> {
  return unipileFetch<UnipileAccountInfo>(cfg, "GET", `/accounts/${encodeURIComponent(accountId)}`);
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
