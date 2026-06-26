/**
 * Provision Elevay-OWNED owner-SMTP capacity from already-warmed mailboxes.
 *
 * Context (founder directive 2026-06-26): cold outbound must leave via
 * Elevay-OWNED infrastructure (owner-SMTP), NEVER the Instantly send API. Our
 * cold domains ARE warmed — but via Instantly's connect-your-own-mailbox model,
 * so the `connected_mailboxes` rows are `provider="instantly"` with NO SMTP
 * creds. Two consequences: the cold send path can't use them (`shouldUseOwnerSmtp`
 * needs `smtp_custom` + creds) and the autopilot capacity source EXCLUDES
 * provider "instantly" (`NO_ELEVAY_SEND_TRANSPORT`). So those warmed boxes earn
 * zero sendable capacity.
 *
 * This converts each row to `provider="smtp_custom"` with the box's real
 * SMTP/IMAP creds (the founder exports them from the mailbox host — e.g. Zoho —
 * since Elevay never stored them), so `shouldUseOwnerSmtp` routes sends through the
 * owner's own SMTP. The box stays registered in Instantly for WARMUP, which maps
 * accounts by email address, not by our provider tag — so converting the tag
 * does not interrupt the warm-up.
 *
 * Rigor guarantees:
 *   - Every cred is VERIFIED by a real SMTP connect + AUTH (no message sent)
 *     before the row is written. A bad/expired password can never silently
 *     become "active" capacity — it surfaces as `verify_failed` and the row is
 *     left untouched.
 *   - `verifyOnly` mode checks creds and writes NOTHING (pre-activation dry-run).
 *   - The plaintext password is encrypted at rest (AES-256-GCM) via the injected
 *     `encryptSecret`; it is never logged or returned.
 *   - Pure: every side effect (verify, encrypt, DB read/write) is injected, so
 *     the logic is unit-testable without live SMTP or a database.
 */

/** One mailbox's real SMTP/IMAP credentials, as exported from the mail host. */
export interface OwnerSmtpCred {
  emailAddress: string;
  smtpHost: string;
  smtpPort: number;
  imapHost?: string | null;
  imapPort?: number | null;
  /** Plaintext password (or app-specific password). Encrypted before storage. */
  password: string;
}

export type ProvisionOutcome =
  /** Cred verified + row converted to owner-SMTP (`smtp_custom`). */
  | "converted"
  /** verifyOnly mode: cred verified OK, row deliberately left untouched. */
  | "verified_only"
  /** SMTP connect/auth failed → row left untouched (NOT made sendable). */
  | "verify_failed"
  /** No `connected_mailboxes` row for that tenant + email. */
  | "not_found"
  /** The input cred was missing a required field. */
  | "invalid";

export interface ProvisionResult {
  emailAddress: string;
  outcome: ProvisionOutcome;
  /** Human-readable note (prior provider, SMTP error, missing field). Never a secret. */
  detail?: string;
}

export interface ProvisionDeps {
  /** Real SMTP connect + AUTH, no send. Throws on bad host/port/credentials. */
  verifySmtp: (c: {
    emailAddress: string;
    smtpHost: string;
    smtpPort: number | null;
    password: string;
  }) => Promise<void>;
  /** AES-256-GCM encrypt of the bare password (lib/crypto/settings-encryption). */
  encryptSecret: (plaintext: string) => string;
  /** Look up the existing (Instantly-warmed) mailbox row by tenant + email. */
  findMailbox: (
    tenantId: string,
    emailAddress: string,
  ) => Promise<{ id: string; provider: string } | null>;
  /** Persist the owner-SMTP conversion onto the row. */
  updateMailbox: (
    id: string,
    fields: {
      provider: string;
      smtpHost: string;
      smtpPort: number;
      imapHost: string | null;
      imapPort: number | null;
      secretEncrypted: string;
    },
  ) => Promise<void>;
  /** When true, VERIFY creds but write nothing (pre-activation dry-run). */
  verifyOnly?: boolean;
}

function normalizeEmail(raw: string): string {
  return (raw || "").trim().toLowerCase();
}

/**
 * Convert each warmed mailbox into Elevay owner-SMTP capacity. Processes creds
 * sequentially (SMTP verify is network-bound; one box at a time keeps the host
 * from rate-limiting auth probes) and returns one result per input cred, in
 * order. Never throws on a single bad cred — it is recorded and the run
 * continues, so one expired password can't abort provisioning the other boxes.
 */
export async function provisionOwnerSmtp(
  tenantId: string,
  creds: OwnerSmtpCred[],
  deps: ProvisionDeps,
): Promise<ProvisionResult[]> {
  const results: ProvisionResult[] = [];

  for (const cred of creds) {
    const email = normalizeEmail(cred.emailAddress);

    if (!email || !cred.smtpHost || !cred.smtpPort || !cred.password) {
      results.push({
        emailAddress: email || "(missing)",
        outcome: "invalid",
        detail: "missing emailAddress / smtpHost / smtpPort / password",
      });
      continue;
    }

    // 1. Verify the cred with a real SMTP connect + AUTH. No message is sent.
    try {
      await deps.verifySmtp({
        emailAddress: email,
        smtpHost: cred.smtpHost,
        smtpPort: cred.smtpPort,
        password: cred.password,
      });
    } catch (err) {
      results.push({
        emailAddress: email,
        outcome: "verify_failed",
        detail: err instanceof Error ? err.message : "SMTP verify failed",
      });
      continue;
    }

    // 2. Dry-run: cred is good, but deliberately write nothing.
    if (deps.verifyOnly) {
      results.push({ emailAddress: email, outcome: "verified_only" });
      continue;
    }

    // 3. Find the existing (Instantly-warmed) row to convert in place.
    const row = await deps.findMailbox(tenantId, email);
    if (!row) {
      results.push({
        emailAddress: email,
        outcome: "not_found",
        detail: "no connected_mailboxes row for this tenant + email",
      });
      continue;
    }

    // 4. Convert to owner-SMTP. Encrypt the password at rest; keep eeAccountId,
    //    domain and warm-up history intact (only the transport fields change).
    await deps.updateMailbox(row.id, {
      provider: "smtp_custom",
      smtpHost: cred.smtpHost,
      smtpPort: cred.smtpPort,
      imapHost: cred.imapHost ?? null,
      imapPort: cred.imapPort ?? null,
      secretEncrypted: deps.encryptSecret(cred.password),
    });
    results.push({
      emailAddress: email,
      outcome: "converted",
      detail: `was ${row.provider}`,
    });
  }

  return results;
}

/** Roll up provision results for a one-line operator summary. */
export function summarizeProvision(results: ProvisionResult[]): Record<ProvisionOutcome, number> {
  const tally: Record<ProvisionOutcome, number> = {
    converted: 0,
    verified_only: 0,
    verify_failed: 0,
    not_found: 0,
    invalid: 0,
  };
  for (const r of results) tally[r.outcome] += 1;
  return tally;
}
