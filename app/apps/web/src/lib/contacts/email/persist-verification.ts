/**
 * Spec 17 (A2) — run the email verification waterfall for one contact and persist
 * the verdict to `contacts.email_status`, the column the live pre-send gate reads
 * (`loadEmailStatus` → `isEmailKnownUnsendable`). This is the missing producer:
 * the gate was wired but nothing wrote the status, so it could never fire.
 *
 * Safe-by-construction: only a DEFINITIVE verdict is written; an `unknown` result
 * (transient DNS error, budget exhausted, no signal) NEVER clobbers an existing
 * status — so a provider self-report or a prior `valid` is preserved. With the
 * default MX provider the only writes are `invalid` (dead domain) and `risky`
 * (disposable), leaving valid-domain mailboxes untouched until a paid verifier lands.
 *
 * Blast radius: contacts/email/* + a single `contacts.email_status` write.
 */

import { db as defaultDb } from "@/db";
import { contacts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { verifyEmail, type EmailVerification, type MeterOp, type VerifyProvider } from "./verify-email";
import { mxVerifyProvider } from "./mx-verify-provider";

export interface PersistVerificationDeps {
  database?: typeof defaultDb;
  /** Override the verification provider (paid mailbox-level verifier when available). */
  provider?: VerifyProvider;
  now?: () => number;
}

/** No cost-metering for the free MX provider; a paid provider should inject a real meter. */
const passthroughMeter = <R>(_op: MeterOp, fn: () => Promise<R>): Promise<R> => fn();

/**
 * Verify the contact's current email and persist a definitive `email_status`.
 * Returns the verification (or null when the contact has no email). Never throws on
 * a verification miss — provider/DNS errors degrade to `unknown` (no write).
 */
export async function verifyAndPersistEmailStatus(
  tenantId: string,
  contactId: string,
  deps: PersistVerificationDeps = {},
): Promise<EmailVerification | null> {
  const database = deps.database ?? defaultDb;
  const provider = deps.provider ?? mxVerifyProvider();

  const [row] = await database
    .select({ email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)))
    .limit(1);

  const email = row?.email?.trim();
  if (!email) return null;

  const result = await verifyEmail(contactId, email, { tenantId, provider, meter: passthroughMeter, now: deps.now });

  // Only persist a verdict — never downgrade an existing signal to `unknown`.
  if (result.status !== "unknown") {
    await database
      .update(contacts)
      .set({ emailStatus: result.status })
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)));
  }
  return result;
}
