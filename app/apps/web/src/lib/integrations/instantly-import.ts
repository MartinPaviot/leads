/**
 * Instantly → Elevay mailbox import (one shared Instantly workspace).
 *
 * Elevay runs ONE Instantly workspace whose mailboxes belong to different reps.
 * An admin connects the single workspace API key (Settings → Sending
 * infrastructure) and imports every sending account as a `connected_mailboxes`
 * row (provider `instantly`) — left UNASSIGNED (`user_id = null`). An admin then
 * assigns each box to its rep; the inbox is personal, so a rep sees only the
 * boxes assigned to them (`getInboxScope` filters by `user_id`).
 *
 * What it does NOT do: pull the underlying IMAP/SMTP passwords or OAuth tokens
 * (Instantly never exposes those). Reading/sending for these boxes goes through
 * the Instantly API, never our per-box SMTP — which is why `mailbox-selector`
 * excludes provider `instantly` from the SMTP send pool.
 */

import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { listInstantlyAccounts } from "@/lib/providers/instantly-client";

export interface InstantlyMailboxRow {
  tenantId: string;
  /** Unassigned on import — an admin assigns the owning rep afterwards. */
  userId: null;
  emailAddress: string;
  displayName: string;
  provider: "instantly";
  eeAccountId: string;
  domain: string;
  status: "active";
}

/**
 * Pure: map one Instantly account object to a `connected_mailboxes` insert.
 * Returns null when the account carries no usable email. Defensive about field
 * names — the live shape is confirmed from the first response's keys
 * (`ImportResult.sampleFields`) and tightened if Instantly differs.
 *
 * Boxes import UNASSIGNED (`userId: null`); ownership is set later via the
 * admin assignment step. `eeAccountId` keys on (tenant, mailbox) only, so it is
 * stable across re-imports and reassignments → idempotent upsert.
 */
export function instantlyAccountToMailboxRow(
  account: Record<string, unknown>,
  ctx: { tenantId: string },
): InstantlyMailboxRow | null {
  const email = String(account.email ?? account.email_address ?? "")
    .toLowerCase()
    .trim();
  if (!email || !email.includes("@")) return null;

  const first = typeof account.first_name === "string" ? account.first_name : "";
  const last = typeof account.last_name === "string" ? account.last_name : "";
  const name = [first, last].filter(Boolean).join(" ").trim();
  const domain = email.split("@")[1] ?? "";

  return {
    tenantId: ctx.tenantId,
    userId: null,
    emailAddress: email,
    displayName: name || email.split("@")[0],
    provider: "instantly",
    eeAccountId: `instantly:${ctx.tenantId}:${email}`,
    domain,
    // Already-warm production mailboxes — no cold-start warmup. Excluded from
    // the SMTP send pool by provider, so "active" only affects inbox visibility.
    status: "active",
  };
}

export interface ImportResult {
  ok: boolean;
  /** Accounts returned by Instantly. */
  total: number;
  /** New rows inserted this run. */
  imported: number;
  /** Already present (idempotent re-run) or no usable email. */
  skipped: number;
  /** Field names of the first account — confirms the live shape on first run. */
  sampleFields: string[];
  errorMessage?: string;
}

/**
 * List the workspace's Instantly accounts and upsert them as the tenant's
 * (unassigned) connected mailboxes. Idempotent: re-running only inserts boxes
 * not already imported (unique `ee_account_id`).
 */
export async function importInstantlyMailboxes(ctx: {
  tenantId: string;
  apiKey: string;
}): Promise<ImportResult> {
  const list = await listInstantlyAccounts({ apiKey: ctx.apiKey });
  if (!list.ok) {
    return {
      ok: false,
      total: 0,
      imported: 0,
      skipped: 0,
      sampleFields: [],
      errorMessage: list.errorMessage ?? `HTTP ${list.status}`,
    };
  }

  const sampleFields = list.accounts[0] ? Object.keys(list.accounts[0]) : [];
  const rows = list.accounts
    .map((a) => instantlyAccountToMailboxRow(a, { tenantId: ctx.tenantId }))
    .filter((r): r is InstantlyMailboxRow => r !== null);

  let imported = 0;
  if (rows.length > 0) {
    const inserted = await db
      .insert(connectedMailboxes)
      .values(rows)
      .onConflictDoNothing({ target: connectedMailboxes.eeAccountId })
      .returning({ id: connectedMailboxes.id });
    imported = inserted.length;
  }

  return {
    ok: true,
    total: list.accounts.length,
    imported,
    skipped: list.accounts.length - imported,
    sampleFields,
  };
}
