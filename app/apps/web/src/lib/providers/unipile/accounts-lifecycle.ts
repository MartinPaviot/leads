/**
 * Unipile client — account lifecycle (the non-hosted, native side + seat health).
 * Completes the Accounts tag: native connect / reconnect / checkpoint, plus
 * restart / resync / delete / update for seat-health management. Elevay connects
 * via hosted-auth (http.ts) in normal use; these are the recovery + native paths.
 */
import { unipileFetch, type UnipileConfig } from "./http";

export type UnipileProvider = "LINKEDIN" | "INSTAGRAM" | "MESSENGER" | "TWITTER" | "WHATSAPP" | "TELEGRAM" | string;

/** Universal optionals shared by native connect/reconnect. */
export interface NativeConnectCommon {
  user_agent?: string;
  country?: string;
  ip?: string;
  recruiter_contract_id?: string;
  disabled_features?: string[];
  sync_limit?: { chats?: number | string; messages?: number | string };
  proxy?: { protocol: string; host: string; port: number; username?: string; password?: string };
}

/** LinkedIn native connect: credentials OR cookie (li_at + optional li_a premium). */
export type LinkedInNativeConnect =
  | ({ provider: "LINKEDIN"; username: string; password: string } & NativeConnectCommon)
  | ({ provider: "LINKEDIN"; access_token: string; premium_token?: string } & NativeConnectCommon);

export interface UnipileAccountCreated {
  object?: string;
  account_id?: string;
  /** Present (object "Checkpoint") when LinkedIn demands a 2FA/OTP/captcha step. */
  checkpoint?: { type?: string };
}

/** POST /accounts — native connect (credentials or li_at cookie). 202 → checkpoint. */
export function connectAccountNative(cfg: UnipileConfig, body: LinkedInNativeConnect | Record<string, unknown>): Promise<UnipileAccountCreated> {
  return unipileFetch(cfg, "POST", "/accounts", body);
}

/** POST /accounts/{id} — native reconnect (re-auth a CREDENTIALS account, same id). */
export function reconnectAccountNative(cfg: UnipileConfig, accountId: string, body: LinkedInNativeConnect | Record<string, unknown>): Promise<UnipileAccountCreated> {
  return unipileFetch(cfg, "POST", `/accounts/${encodeURIComponent(accountId)}`, body);
}

/** POST /accounts/checkpoint — submit a 2FA/OTP/captcha solution code. */
export function solveAccountCheckpoint(cfg: UnipileConfig, body: { account_id: string; code: string; provider: UnipileProvider }): Promise<UnipileAccountCreated> {
  return unipileFetch(cfg, "POST", "/accounts/checkpoint", body);
}

/** POST /accounts/checkpoint/resend — re-trigger the checkpoint notification (OTP/in-app). */
export function resendAccountCheckpoint(cfg: UnipileConfig, body: { account_id: string; provider: UnipileProvider }): Promise<{ object?: string }> {
  return unipileFetch(cfg, "POST", "/accounts/checkpoint/resend", body);
}

/** POST /accounts/{id}/restart — re-activate the sources of a frozen (STOPPED/ERROR) account. */
export function restartAccount(cfg: UnipileConfig, accountId: string): Promise<{ object?: string }> {
  return unipileFetch(cfg, "POST", `/accounts/${encodeURIComponent(accountId)}/restart`);
}

export interface ResyncOptions {
  /** LinkedIn only — incremental (preserve existing) instead of a full re-sync. */
  partial?: boolean;
  chunkSize?: number;
  linkedinProduct?: "classic" | "recruiter" | "sales_navigator";
  /** epoch ms time-span bounds. */
  after?: number;
  before?: number;
}

/** GET /accounts/{id}/sync — trigger + poll a messaging data re-sync (LinkedIn/Telegram). */
export function resyncAccount(cfg: UnipileConfig, accountId: string, opts: ResyncOptions = {}): Promise<{ object?: string; status?: string }> {
  const q = new URLSearchParams();
  if (opts.partial != null) q.set("partial", String(opts.partial));
  if (opts.chunkSize != null) q.set("chunk_size", String(opts.chunkSize));
  if (opts.linkedinProduct) q.set("linkedin_product", opts.linkedinProduct);
  if (opts.after != null) q.set("after", String(opts.after));
  if (opts.before != null) q.set("before", String(opts.before));
  const qs = q.toString();
  return unipileFetch(cfg, "GET", `/accounts/${encodeURIComponent(accountId)}/sync${qs ? `?${qs}` : ""}`);
}

/** DELETE /accounts/{id} — hard-unlink an account from Unipile. */
export function deleteAccount(cfg: UnipileConfig, accountId: string): Promise<{ object?: string }> {
  return unipileFetch(cfg, "DELETE", `/accounts/${encodeURIComponent(accountId)}`);
}

/** PATCH /accounts/{id} — update connection params (proxy / country / ip). */
export function updateAccount(cfg: UnipileConfig, accountId: string, body: { proxy?: Record<string, unknown>; country?: string; ip?: string }): Promise<{ object?: string }> {
  return unipileFetch(cfg, "PATCH", `/accounts/${encodeURIComponent(accountId)}`, body);
}
