/**
 * Spec 34 — live wiring of per-subject DSAR erasure. This is NOT the tenant-wide
 * wipe at /api/gdpr/delete (that deletes the founder's whole workspace); this
 * erases ONE prospect (right-to-be-forgotten) across the contact + its outbound +
 * activities, then adds a PERMANENT spec-22 suppression keyed on the email as the
 * do-not-resurrect marker — so if the prospect is ever re-sourced, the live send
 * gate (evaluateSend) suppresses them again. Wires the pure `eraseSubject` ports.
 *
 * DESTRUCTIVE + GATED: runs only behind `DSAR_ERASE_ENABLED` (off) + an explicit
 * confirm at the route + admin capability. Every delete is scoped by BOTH tenantId
 * AND the contact id, so a bug can never widen past the one subject. Idempotent:
 * a re-run finds the do-not-resurrect marker and reports a no-op.
 */

import { db as defaultDb } from "@/db";
import { contacts, outboundEmails, activities, suppression, linkedinProviderIdentity, linkedinActionEvent } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { eraseSubject, type EraseDeps, type EraseReport } from "./erase";
import { addSuppressionDb } from "@/lib/suppression/db-store";
import { normalizeEmail, GLOBAL_SCOPE } from "@/lib/suppression/suppression";
import { logAudit } from "@/lib/infra/audit-log";

/** Whether per-subject DSAR erase is enabled. Default OFF — destructive. */
export function isDsarEraseEnabled(): boolean {
  const v = process.env.DSAR_ERASE_ENABLED;
  return v === "1" || v === "true";
}

const DSAR_SOURCE = "dsar";

export interface EraseSubjectLiveResult {
  ran: boolean;
  reason?: string;
  report?: EraseReport;
}

/**
 * Erase one contact for a tenant. Resolves the contact (tenant-scoped), then runs
 * the pure eraseSubject with live ports. Returns ran:false when disabled or the
 * contact is absent. `requestedById` is recorded in the audit + suppression.
 */
export async function eraseSubjectLive(
  tenantId: string,
  contactId: string,
  opts: { requestedById?: string | null; database?: typeof defaultDb; requestedAt?: number } = {},
): Promise<EraseSubjectLiveResult> {
  if (!isDsarEraseEnabled()) return { ran: false, reason: "dsar_erase_disabled" };
  const database = opts.database ?? defaultDb;

  const [contact] = await database
    .select({ id: contacts.id, email: contacts.email, tenantId: contacts.tenantId })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)))
    .limit(1);
  if (!contact) return { ran: false, reason: "contact_not_found" };

  const email = normalizeEmail(contact.email);

  const deps: EraseDeps = {
    // Delete the subject's PII-bearing rows, EVERY query scoped by tenant + id.
    eraseCanonical: async () => {
      await database.delete(outboundEmails).where(and(eq(outboundEmails.tenantId, tenantId), eq(outboundEmails.contactId, contactId)));
      await database.delete(activities).where(and(eq(activities.tenantId, tenantId), eq(activities.entityType, "contact"), eq(activities.entityId, contactId)));
      // spec-36: the contact's LinkedIn personal data — the viewer-scoped
      // provider_id cache + the action log (both contact-keyed, EU-hosted).
      await database.delete(linkedinProviderIdentity).where(and(eq(linkedinProviderIdentity.tenantId, tenantId), eq(linkedinProviderIdentity.contactId, contactId)));
      await database.delete(linkedinActionEvent).where(and(eq(linkedinActionEvent.tenantId, tenantId), eq(linkedinActionEvent.contactId, contactId)));
      await database.delete(contacts).where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));
    },
    // Enrichment/provider cache erasure is a follow-up (no contact-keyed cache table today).
    eraseCaches: async () => [],
    // CRM propagation rides on the spec-28 HubSpot wiring (env-gated) — no-op until configured.
    propagateCrm: async () => false,
    // AC2 — permanent suppression so the email is never re-sourced/contacted.
    addSuppression: async () => {
      if (!email) return;
      await addSuppressionDb(
        { scope: tenantId ?? GLOBAL_SCOPE, level: "address", value: email, type: "manual_dnc", reason: "dsar_erased", permanent: true, createdAt: Date.now() },
        { source: DSAR_SOURCE, createdBy: opts.requestedById ?? null },
        database,
      );
    },
    // AC4 — the permanent suppression IS the do-not-resurrect marker (same write, idempotent).
    setDoNotResurrect: async () => {
      if (!email) return;
      await addSuppressionDb(
        { scope: tenantId ?? GLOBAL_SCOPE, level: "address", value: email, type: "manual_dnc", reason: "dsar_erased", permanent: true, createdAt: Date.now() },
        { source: DSAR_SOURCE, createdBy: opts.requestedById ?? null },
        database,
      );
    },
    hasDoNotResurrect: async () => {
      if (!email) return false;
      // Mirror addSuppressionDb's scope mapping: a falsy tenantId is written as a
      // GLOBAL_SCOPE row with tenant_id = NULL, so read it with isNull (eq(col, NULL)
      // never matches). Without this, the marker write/read could disagree and
      // idempotentNoop would silently always be false.
      const scopeCond = tenantId ? eq(suppression.tenantId, tenantId) : isNull(suppression.tenantId);
      const [row] = await database
        .select({ id: suppression.value })
        .from(suppression)
        .where(and(scopeCond, eq(suppression.level, "address"), eq(suppression.value, email), eq(suppression.source, DSAR_SOURCE)))
        .limit(1);
      return !!row;
    },
    // AC5 — verify no residual PII rows remain for this subject.
    findResidual: async () => {
      const residual: string[] = [];
      const [c] = await database.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId))).limit(1);
      if (c) residual.push("contacts");
      const [o] = await database.select({ id: outboundEmails.id }).from(outboundEmails).where(and(eq(outboundEmails.tenantId, tenantId), eq(outboundEmails.contactId, contactId))).limit(1);
      if (o) residual.push("outbound_emails");
      const [lpi] = await database.select({ id: linkedinProviderIdentity.id }).from(linkedinProviderIdentity).where(and(eq(linkedinProviderIdentity.tenantId, tenantId), eq(linkedinProviderIdentity.contactId, contactId))).limit(1);
      if (lpi) residual.push("linkedin_provider_identity");
      const [lae] = await database.select({ id: linkedinActionEvent.id }).from(linkedinActionEvent).where(and(eq(linkedinActionEvent.tenantId, tenantId), eq(linkedinActionEvent.contactId, contactId))).limit(1);
      if (lae) residual.push("linkedin_action_event");
      return residual;
    },
    audit: async (report) => {
      await logAudit({
        tenantId,
        userId: opts.requestedById || "system",
        action: "delete",
        entityType: "contact",
        entityId: contactId,
        metadata: { event: "dsar_subject_erased", verified: report.verified, idempotentNoop: report.idempotentNoop, residual: report.residual },
      }).catch(() => {});
    },
    requestedAt: opts.requestedAt,
  };

  const report = await eraseSubject(contactId, deps);
  return { ran: true, report };
}
