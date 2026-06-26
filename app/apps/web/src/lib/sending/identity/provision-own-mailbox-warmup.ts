/**
 * Spec 21 (own-mailbox warmup) — register an ELEVAY-OWNED smtp_custom mailbox into the
 * tenant's Instantly workspace and turn warmup ON, in one orchestrated step. Pure
 * cross-tenant orchestration mirroring `setTenantWarmup`: the dangerous bits (the
 * decrypted Instantly key, the decrypted mailbox password, the HTTP calls) are all
 * INJECTED, so this stays pure + unit-testable and never throws.
 *
 * Order matters and is enforced here: CONNECT (POST /api/v2/accounts) MUST precede
 * ENABLE-WARMUP, because Instantly's warmup toggle only acts on accounts already
 * registered in the workspace (setTenantWarmup intersects against the listed set).
 *
 * Instantly stays warmup-ONLY: the box is provider='smtp_custom' and sends cold via
 * Elevay owner-SMTP — it is NEVER added to an Instantly campaign.
 *
 * Blast radius: sending/identity/* only.
 */

export interface ProvisionMailboxInput {
  email: string;
  /** Decrypted SMTP/IMAP plaintext password (caller decrypts; never the ciphertext). */
  password: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  warmupDailyLimit?: number;
  warmupCustomFtag?: string;
}

export interface ProvisionWarmupDeps {
  /** Decrypt + return the tenant's Instantly API key, or null if Instantly isn't connected. */
  resolveKey: (tenantId: string) => Promise<string | null>;
  /** Register the custom mailbox into the workspace (POST /api/v2/accounts, provider_code 1). */
  connect: (apiKey: string, input: ProvisionMailboxInput) => Promise<{ ok: boolean; accountId?: string; errorMessage?: string }>;
  /** Enable warmup for the registered email; returns the async job id. */
  enableWarmup: (apiKey: string, emails: string[]) => Promise<{ ok: boolean; jobId?: string; errorMessage?: string }>;
}

export interface ProvisionWarmupResult {
  ok: boolean;
  /** Instantly account id from the connect step (present even if warmup-enable later fails). */
  accountId?: string;
  /** Background-job id to poll for warmup-enable completion. */
  jobId?: string;
  reason?: "instantly_not_connected" | "connect_failed" | "warmup_enable_failed";
  /** Provider error detail when a step fails. */
  errorMessage?: string;
}

export async function provisionOwnMailboxWarmup(
  tenantId: string,
  mailbox: ProvisionMailboxInput,
  deps: ProvisionWarmupDeps,
): Promise<ProvisionWarmupResult> {
  const key = await deps.resolveKey(tenantId);
  if (!key) return { ok: false, reason: "instantly_not_connected" };

  const conn = await deps.connect(key, mailbox);
  if (!conn.ok) return { ok: false, reason: "connect_failed", errorMessage: conn.errorMessage };

  const warm = await deps.enableWarmup(key, [mailbox.email]);
  if (!warm.ok) {
    return { ok: false, accountId: conn.accountId, reason: "warmup_enable_failed", errorMessage: warm.errorMessage };
  }

  return { ok: true, accountId: conn.accountId, jobId: warm.jobId };
}
