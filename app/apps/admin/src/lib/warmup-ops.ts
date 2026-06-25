/**
 * Spec 21 — admin-side warmup operations. Wires the web app's pure
 * `setTenantWarmup` core (apps/web .../sending/identity/warmup-admin.ts) with REAL
 * deps, using the admin app's own DB connection + the web crypto/Instantly client
 * imported via the `@web/*` path alias (no cross-app HTTP, no key duplication).
 *
 * Server-only (decrypts client keys, calls Instantly). Gated by the route's
 * isAdminAuthenticated check — never import into a client component.
 */

import { db, tenants } from "./db";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@web/lib/crypto/settings-encryption";
import {
  listInstantlyAccounts,
  enableInstantlyWarmup,
  disableInstantlyWarmup,
} from "@web/lib/providers/instantly-client";
import {
  setTenantWarmup,
  mailboxWarmupOverview,
  type WarmupAction,
  type TenantWarmupDeps,
  type TenantWarmupResult,
  type MailboxWarmup,
} from "@web/lib/sending/identity/warmup-admin";

function settingsOf(row: { settings: unknown } | undefined): Record<string, unknown> | null {
  return row && row.settings && typeof row.settings === "object" ? (row.settings as Record<string, unknown>) : null;
}

function deps(): TenantWarmupDeps {
  return {
    resolveKey: async (tenantId) => {
      const [row] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const enc = settingsOf(row)?.instantlyCredentialsEncrypted;
      if (typeof enc !== "string" || !enc) return null;
      try {
        return decryptSecret(enc);
      } catch {
        return null; // server key mismatch — treat as not-resolvable, never throw
      }
    },
    listAccounts: (apiKey) => listInstantlyAccounts({ apiKey }),
    setWarmup: (apiKey, emails, action) =>
      action === "enable" ? enableInstantlyWarmup({ apiKey }, emails) : disableInstantlyWarmup({ apiKey }, emails),
  };
}

/** Enable/disable Instantly warmup for ALL of a client tenant's mailboxes. */
export function runTenantWarmup(tenantId: string, action: WarmupAction): Promise<TenantWarmupResult> {
  return setTenantWarmup(tenantId, action, deps());
}

export interface ConnectedTenant {
  id: string;
  name: string | null;
}

/** Tenants that have an Instantly key on file (the only ones warmup applies to). */
export async function listConnectedTenants(): Promise<ConnectedTenant[]> {
  const rows = await db.select({ id: tenants.id, name: tenants.name, settings: tenants.settings }).from(tenants);
  return rows
    .filter((r) => typeof settingsOf(r)?.instantlyCredentialsEncrypted === "string")
    .map((r) => ({ id: r.id, name: r.name }));
}

export interface TenantMailboxWarmup {
  ok: boolean;
  mailboxes?: MailboxWarmup[];
  error?: string;
}

/** Per-mailbox warmup status + score for one tenant (for the admin overview). */
export async function getTenantMailboxWarmup(tenantId: string): Promise<TenantMailboxWarmup> {
  const d = deps();
  const key = await d.resolveKey(tenantId);
  if (!key) return { ok: false, error: "instantly_not_connected" };
  const listed = await d.listAccounts(key);
  if (!listed.ok) return { ok: false, error: "list_accounts_failed" };
  return { ok: true, mailboxes: mailboxWarmupOverview(listed.accounts) };
}
