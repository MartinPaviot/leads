/**
 * Instantly Hypergrowth API client — thin wrapper used by the
 * `external-connected` sending mode. WS-1 PR E ships the skeleton
 * + connect/disconnect flow; actual send routing from
 * `email-send-worker.ts` lands when the user has verified the
 * connection works in production.
 *
 * Endpoint set (current Instantly API v2, confirmed by Martin's
 * Hypergrowth plan docs):
 *   GET  /api/v2/accounts           → list sending accounts (health probe)
 *   POST /api/v2/emails             → send a single email
 *
 * Auth: `Authorization: Bearer <api-key>`.
 *
 * This module accepts the plaintext key as a string parameter —
 * callers are expected to decrypt from `settings.instantlyCredentialsEncrypted`
 * via `decryptSecret`. Never accept the ciphertext directly here,
 * and never log the plaintext.
 */

const DEFAULT_BASE_URL = "https://api.instantly.ai";
const TIMEOUT_MS = 10_000;

export interface InstantlyClientOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface InstantlyHealthResult {
  ok: boolean;
  status: number;
  accountCount?: number;
  errorMessage?: string;
}

export interface InstantlySendRequest {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  fromAccountEmail: string;
}

export interface InstantlySendResult {
  ok: boolean;
  status: number;
  messageId?: string;
  errorMessage?: string;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe the accounts endpoint to verify the API key is valid. Used by
 * the connect flow before persisting the encrypted key.
 */
export async function testInstantlyConnection(
  options: InstantlyClientOptions,
): Promise<InstantlyHealthResult> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  try {
    const res = await fetchWithTimeout(
      `${base}/api/v2/accounts?limit=1`,
      { method: "GET", headers: buildHeaders(options.apiKey) },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        errorMessage: body.slice(0, 300) || `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      items?: unknown[];
      accounts?: unknown[];
    };
    const accountCount = data.items?.length ?? data.accounts?.length ?? 0;
    return { ok: true, status: res.status, accountCount };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      errorMessage: err instanceof Error ? err.message : "unknown fetch error",
    };
  }
}

/**
 * List ALL sending accounts (mailboxes) on the connected Instantly workspace,
 * paginating through the v2 cursor (`starting_after` → `next_starting_after`).
 * Returns the raw account objects so the importer can map them defensively —
 * the exact field set is confirmed against the first live response.
 *
 * One key = the whole workspace's mailboxes, so a user with 50 Instantly boxes
 * imports all of them without re-entering a single credential.
 */
export async function listInstantlyAccounts(
  options: InstantlyClientOptions,
): Promise<{
  ok: boolean;
  status: number;
  accounts: Record<string, unknown>[];
  errorMessage?: string;
}> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  const accounts: Record<string, unknown>[] = [];
  let startingAfter: string | undefined;
  const LIMIT = 100;

  // Hard page cap (100 × 100 = 10k accounts) so a malformed `next` cursor can
  // never loop forever.
  for (let pageGuard = 0; pageGuard < 100; pageGuard++) {
    const url = new URL(`${base}/api/v2/accounts`);
    url.searchParams.set("limit", String(LIMIT));
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    let res: Response;
    try {
      res = await fetchWithTimeout(
        url.toString(),
        { method: "GET", headers: buildHeaders(options.apiKey) },
        TIMEOUT_MS,
      );
    } catch (err) {
      return {
        ok: false,
        status: 0,
        accounts,
        errorMessage: err instanceof Error ? err.message : "unknown fetch error",
      };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, accounts, errorMessage: body.slice(0, 300) || `HTTP ${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as {
      items?: unknown[];
      accounts?: unknown[];
      next_starting_after?: string;
    };
    const items = (data.items ?? data.accounts ?? []) as Record<string, unknown>[];
    accounts.push(...items);

    const next = data.next_starting_after;
    if (!next || items.length === 0) break;
    startingAfter = next;
  }

  return { ok: true, status: 200, accounts };
}

/**
 * List Unibox emails (campaign sends, replies, manual) on the connected
 * workspace, paginating the v2 cursor. Returns raw email objects so the
 * ingestion can detect inbound replies + map them defensively — the exact
 * field set is confirmed against the first live response.
 */
export async function listInstantlyEmails(
  options: InstantlyClientOptions & { startingAfter?: string; limit?: number },
): Promise<{
  ok: boolean;
  status: number;
  emails: Record<string, unknown>[];
  nextStartingAfter?: string;
  errorMessage?: string;
}> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  const limit = options.limit ?? 100;
  const url = new URL(`${base}/api/v2/emails`);
  url.searchParams.set("limit", String(limit));
  if (options.startingAfter) url.searchParams.set("starting_after", options.startingAfter);

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url.toString(),
      { method: "GET", headers: buildHeaders(options.apiKey) },
      TIMEOUT_MS,
    );
  } catch (err) {
    return {
      ok: false,
      status: 0,
      emails: [],
      errorMessage: err instanceof Error ? err.message : "unknown fetch error",
    };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, emails: [], errorMessage: body.slice(0, 300) || `HTTP ${res.status}` };
  }
  const data = (await res.json().catch(() => ({}))) as {
    items?: unknown[];
    emails?: unknown[];
    next_starting_after?: string;
  };
  const emails = (data.items ?? data.emails ?? []) as Record<string, unknown>[];
  return { ok: true, status: 200, emails, nextStartingAfter: data.next_starting_after };
}

/**
 * Dispatch a single email through Instantly. Not yet wired into
 * `email-send-worker.ts` — that integration ships when Martin has
 * verified the connection flow end-to-end with a live Hypergrowth
 * account. The signature is stable so the worker call site can be
 * added in a small follow-up PR.
 */
export async function sendViaInstantly(
  options: InstantlyClientOptions,
  request: InstantlySendRequest,
): Promise<InstantlySendResult> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  try {
    const res = await fetchWithTimeout(
      `${base}/api/v2/emails`,
      {
        method: "POST",
        headers: buildHeaders(options.apiKey),
        body: JSON.stringify({
          to: request.to,
          subject: request.subject,
          html: request.bodyHtml,
          text: request.bodyText,
          from_account_email: request.fromAccountEmail,
        }),
      },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        errorMessage: body.slice(0, 300) || `HTTP ${res.status}`,
      };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string; message_id?: string };
    return {
      ok: true,
      status: res.status,
      messageId: data.id ?? data.message_id,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      errorMessage: err instanceof Error ? err.message : "unknown fetch error",
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Warmup (spec 21) — confirmed Instantly API v2 surface:             */
/*    POST /api/v2/accounts/warmup/enable   → async background job     */
/*    POST /api/v2/accounts/warmup/disable  → async background job     */
/*    GET  /api/v2/accounts/{email}         → warmup_status + score    */
/*    POST /api/v2/accounts/warmup-analytics→ landed_inbox/spam/health */
/*    GET  /api/v2/background-jobs/{id}      → poll enable/disable      */
/*  Reads feed the pure readiness gate (sending/identity/warmup-       */
/*  readiness.ts). No live call here without a decrypted key.          */
/* ------------------------------------------------------------------ */

/** A background-job handle returned by enable/disable-warmup. */
export interface InstantlyJobResult {
  ok: boolean;
  status: number;
  jobId?: string;
  errorMessage?: string;
}

async function postWarmupToggle(
  options: InstantlyClientOptions,
  action: "enable" | "disable",
  emails: string[],
): Promise<InstantlyJobResult> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  try {
    const res = await fetchWithTimeout(
      `${base}/api/v2/accounts/warmup/${action}`,
      { method: "POST", headers: buildHeaders(options.apiKey), body: JSON.stringify({ emails }) },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, errorMessage: body.slice(0, 300) || `HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, status: res.status, jobId: data.id };
  } catch (err) {
    return { ok: false, status: 0, errorMessage: err instanceof Error ? err.message : "unknown fetch error" };
  }
}

/** Enable warmup for up to 100 mailbox emails. Returns the async job id to poll. */
export function enableInstantlyWarmup(options: InstantlyClientOptions, emails: string[]): Promise<InstantlyJobResult> {
  return postWarmupToggle(options, "enable", emails.slice(0, 100));
}

/** Disable warmup for up to 100 mailbox emails. Returns the async job id to poll. */
export function disableInstantlyWarmup(options: InstantlyClientOptions, emails: string[]): Promise<InstantlyJobResult> {
  return postWarmupToggle(options, "disable", emails.slice(0, 100));
}

/** One mailbox's live warmup health: warmup_status (1=active/-1=banned/-2=spam/-3=suspended/0=paused) + stat_warmup_score (0-100). */
export interface InstantlyAccountWarmup {
  ok: boolean;
  status: number;
  /** Instantly warmup_status, or null when absent from the response. */
  warmupStatus?: number | null;
  /** Instantly stat_warmup_score (0-100), or null when absent. */
  warmupScore?: number | null;
  /** Raw account object (defensive — exact field set confirmed against the first live response). */
  account?: Record<string, unknown>;
  errorMessage?: string;
}

/** Read one mailbox's warmup status + score (GET /api/v2/accounts/{email}). */
export async function getInstantlyAccount(options: InstantlyClientOptions, email: string): Promise<InstantlyAccountWarmup> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  try {
    const res = await fetchWithTimeout(
      `${base}/api/v2/accounts/${encodeURIComponent(email)}`,
      { method: "GET", headers: buildHeaders(options.apiKey) },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, errorMessage: body.slice(0, 300) || `HTTP ${res.status}` };
    }
    const account = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const warmupStatus = typeof account.warmup_status === "number" ? account.warmup_status : null;
    const warmupScore = typeof account.stat_warmup_score === "number" ? account.stat_warmup_score : null;
    return { ok: true, status: res.status, warmupStatus, warmupScore, account };
  } catch (err) {
    return { ok: false, status: 0, errorMessage: err instanceof Error ? err.message : "unknown fetch error" };
  }
}

/** Per-email warmup analytics aggregate (the richer signal: inbox vs span placement). */
export interface WarmupAnalyticsAggregate {
  sent?: number;
  landed_inbox?: number;
  landed_spam?: number;
  received?: number;
  health_score?: number;
}

export interface InstantlyWarmupAnalytics {
  ok: boolean;
  status: number;
  /** aggregate_data keyed by email. */
  aggregate?: Record<string, WarmupAnalyticsAggregate>;
  errorMessage?: string;
}

/** Batch warmup analytics for up to 100 emails (POST /api/v2/accounts/warmup-analytics). */
export async function getInstantlyWarmupAnalytics(options: InstantlyClientOptions, emails: string[]): Promise<InstantlyWarmupAnalytics> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  try {
    const res = await fetchWithTimeout(
      `${base}/api/v2/accounts/warmup-analytics`,
      { method: "POST", headers: buildHeaders(options.apiKey), body: JSON.stringify({ emails: emails.slice(0, 100) }) },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, errorMessage: body.slice(0, 300) || `HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { aggregate_data?: Record<string, WarmupAnalyticsAggregate> };
    return { ok: true, status: res.status, aggregate: data.aggregate_data ?? {} };
  } catch (err) {
    return { ok: false, status: 0, errorMessage: err instanceof Error ? err.message : "unknown fetch error" };
  }
}

/** A background job's progress (poll enable/disable-warmup to completion). */
export interface InstantlyJobStatus {
  ok: boolean;
  status: number;
  /** "pending" | "in-progress" | "success" | "failed". */
  jobStatus?: string;
  /** 0..100. */
  progress?: number;
  errorMessage?: string;
}

/** Poll a background job (GET /api/v2/background-jobs/{id}). */
export async function getInstantlyBackgroundJob(options: InstantlyClientOptions, jobId: string): Promise<InstantlyJobStatus> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  try {
    const res = await fetchWithTimeout(
      `${base}/api/v2/background-jobs/${encodeURIComponent(jobId)}`,
      { method: "GET", headers: buildHeaders(options.apiKey) },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, errorMessage: body.slice(0, 300) || `HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { status?: string; progress?: number };
    return { ok: true, status: res.status, jobStatus: data.status, progress: data.progress };
  } catch (err) {
    return { ok: false, status: 0, errorMessage: err instanceof Error ? err.message : "unknown fetch error" };
  }
}
