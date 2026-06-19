/**
 * Idempotent OAuth mailbox link (A1 B3, R2.2-R2.5 / R4 / R6 / R7.3 / R8.1).
 *
 * The shared core behind the OAuth-LINK callback: register the mailbox with
 * EmailEngine, upsert ONE connected_mailboxes row on the (tenant_id,
 * email_address) key, and fire the initial sync. Reused so both the OAuth-link
 * entry point and any re-link converge on a single row instead of throwing on
 * the unique constraint (the legacy bare insert at route.ts:215 500s on re-link).
 *
 * R7.3: a hard EmailEngine failure THROWS before any row is written — never the
 * legacy console.warn+save-anyway (route.ts:210-212) that persisted a dead,
 * non-syncing mailbox. R8.1: tokens go straight to EmailEngine and are never
 * returned, logged, or stored on the row.
 *
 * The three IO seams (register / upsert / send) are injectable so the
 * orchestration + the fail-closed invariant are unit-testable without a DB,
 * mirroring the generator-injection pattern in compose-reply.ts.
 */

import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { logger } from "@/lib/observability/logger";

export type LinkProvider = "gmail" | "outlook";

type MailboxRow = typeof connectedMailboxes.$inferSelect;

export interface LinkResult {
  mailbox: MailboxRow;
  created: boolean;
}

export interface LinkOAuthInput {
  /** auth-user id == connected_mailboxes.user_id. */
  authUserId: string;
  tenantId: string;
  provider: LinkProvider;
  /** Verified email from the provider userinfo (lowercased here). */
  email: string;
  displayName?: string;
  accessToken: string;
  refreshToken?: string;
  /** Sync-event identity (mirrors the smtp_custom fire, route.ts:141-153). */
  appUserId?: string;
  syncUserId?: string;
}

export interface EeOAuthBody {
  account: string;
  name: string;
  oauth2: { provider: string; auth: { user: string }; accessToken: string; refreshToken?: string };
}

/** EE account id: tenantId + "_" + email with non-alphanumerics hyphenated (route.ts:64). */
export function deriveEeAccountId(tenantId: string, email: string): string {
  return `${tenantId}_${email.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

/** The EmailEngine OAuth registration body (mirrors route.ts:165-174). */
export function buildEeOAuthBody(input: {
  eeAccountId: string;
  email: string;
  displayName?: string;
  provider: LinkProvider;
  accessToken: string;
  refreshToken?: string;
}): EeOAuthBody {
  return {
    account: input.eeAccountId,
    name: input.displayName || input.email,
    oauth2: {
      provider: input.provider === "gmail" ? "gmail" : "outlook",
      auth: { user: input.email },
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
    },
  };
}

/** Register the OAuth mailbox with EmailEngine; throw on a hard failure (R7.3). */
async function registerWithEmailEngine(body: EeOAuthBody): Promise<void> {
  const eeBase = process.env.EMAILENGINE_URL || "http://localhost:3100";
  const res = await fetch(`${eeBase}/v1/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Redacted: status + a short reason only — never the tokens (R8.3).
    throw new Error(`EmailEngine registration failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

/** Default upsert: one row on (tenant_id, email_address); reactivate error/disabled (R4.3). */
async function upsertMailboxRow(input: {
  authUserId: string;
  tenantId: string;
  provider: LinkProvider;
  email: string;
  displayName: string;
  eeAccountId: string;
  domain: string;
}): Promise<LinkResult> {
  const [existing] = await db
    .select({ status: connectedMailboxes.status })
    .from(connectedMailboxes)
    .where(and(eq(connectedMailboxes.tenantId, input.tenantId), eq(connectedMailboxes.emailAddress, input.email)))
    .limit(1);
  const created = !existing;
  const reactivated = existing?.status === "error" || existing?.status === "disabled";
  // Keep a healthy box's status; reactivate a broken one to warming_up.
  const updateStatus = !existing || reactivated ? ("warming_up" as const) : existing.status;

  const [mailbox] = await db
    .insert(connectedMailboxes)
    .values({
      tenantId: input.tenantId,
      userId: input.authUserId,
      emailAddress: input.email,
      displayName: input.displayName,
      provider: input.provider,
      eeAccountId: input.eeAccountId,
      domain: input.domain,
      shared: false,
      status: "warming_up",
      warmupStartedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [connectedMailboxes.tenantId, connectedMailboxes.emailAddress],
      set: {
        userId: input.authUserId,
        displayName: input.displayName,
        provider: input.provider,
        eeAccountId: input.eeAccountId,
        status: updateStatus,
        updatedAt: new Date(),
      },
    })
    .returning();

  return { mailbox, created };
}

export interface LinkOAuthDeps {
  register?: (body: EeOAuthBody) => Promise<void>;
  upsert?: (input: {
    authUserId: string;
    tenantId: string;
    provider: LinkProvider;
    email: string;
    displayName: string;
    eeAccountId: string;
    domain: string;
  }) => Promise<LinkResult>;
  send?: (event: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
}

/**
 * Register + idempotently upsert an OAuth mailbox for the current user, then fire
 * the initial sync. Returns the row + a `created` flag; NEVER returns tokens.
 * Order matters: EmailEngine registration runs FIRST so a hard failure aborts
 * with zero rows written (R7.3).
 */
export async function linkOAuthMailbox(input: LinkOAuthInput, deps: LinkOAuthDeps = {}): Promise<LinkResult> {
  const register = deps.register ?? registerWithEmailEngine;
  const upsert = deps.upsert ?? upsertMailboxRow;
  const send = deps.send ?? ((e: { name: string; data: Record<string, unknown> }) => inngest.send(e));

  const email = input.email.trim().toLowerCase();
  const eeAccountId = deriveEeAccountId(input.tenantId, email);
  const domain = email.split("@")[1] ?? "";
  const displayName = input.displayName?.trim() || email.split("@")[0];

  // 1. EmailEngine first — a hard failure throws before any row (R7.3, R8.1).
  await register(
    buildEeOAuthBody({
      eeAccountId,
      email,
      displayName,
      provider: input.provider,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
    }),
  );

  // 2. One row on (tenant, email) (R4).
  const result = await upsert({
    authUserId: input.authUserId,
    tenantId: input.tenantId,
    provider: input.provider,
    email,
    displayName,
    eeAccountId,
    domain,
  });

  // 3. Initial sync (R6.2) — mirror the smtp_custom fire; best-effort.
  await send({
    name: "email/sync-requested",
    data: {
      userId: input.syncUserId ?? input.appUserId ?? input.authUserId,
      tenantId: input.tenantId,
      appUserId: input.appUserId ?? input.authUserId,
      daysBack: 30,
      provider: input.provider,
      mailboxId: result.mailbox.id,
    },
  }).catch((e) => logger.warn?.("link-mailbox.sync_fire_failed", { err: e instanceof Error ? e.message : String(e) }));

  return result;
}
