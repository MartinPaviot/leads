import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/infra/audit-log";
import { addSuppressionDb } from "@/lib/suppression/db-store";
import { normalizeEmail, normalizeDomain, domainOfEmail } from "@/lib/suppression/suppression";
import { z } from "zod";

/**
 * Spec 35 — manual "Do not contact" (R7.5). Creates a MANUAL_DNC suppression at
 * a chosen scope. The value is resolved SERVER-SIDE from contactId/companyId so a
 * client can never suppress an arbitrary address it doesn't own:
 *   - address: the contact's email (or an explicit, owned email)
 *   - domain:  the contact's email domain / the company's domain
 *   - account: the company's canonical identity_key (survives re-import)
 *
 * MANUAL_DNC is permanent-by-default but admin-deactivatable (it is NOT in the
 * permanence-trigger frozen set). Gated like exclude (companies:delete, member+).
 *
 * POST /api/accounts/suppress
 *   { level: "address"|"domain"|"account", contactId?, companyId?, reason }
 */

const bodySchema = z
  .object({
    level: z.enum(["address", "domain", "account"]),
    contactId: z.string().optional(),
    companyId: z.string().optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine((b) => !!b.contactId || !!b.companyId, {
    message: "contactId or companyId required",
  });

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const denied = requirePermission(authCtx.role, "companies:delete");
    if (denied) return denied;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }
    const { level, contactId, companyId, reason } = parsed.data;

    // Resolve the suppression value server-side, tenant-scoped.
    let contact: { email: string | null; companyId: string | null } | undefined;
    if (contactId) {
      [contact] = await db
        .select({ email: contacts.email, companyId: contacts.companyId })
        .from(contacts)
        .where(and(eq(contacts.tenantId, authCtx.tenantId), eq(contacts.id, contactId)))
        .limit(1);
      if (!contact) return Response.json({ error: "Contact not found" }, { status: 404 });
    }
    const cid = companyId ?? contact?.companyId ?? null;
    let company: { domain: string | null; identityKey: string | null } | undefined;
    if (cid) {
      [company] = await db
        .select({ domain: companies.domain, identityKey: companies.identityKey })
        .from(companies)
        .where(and(eq(companies.tenantId, authCtx.tenantId), eq(companies.id, cid)))
        .limit(1);
    }

    let value: string | null = null;
    if (level === "address") value = normalizeEmail(contact?.email);
    else if (level === "domain") value = domainOfEmail(contact?.email) ?? normalizeDomain(company?.domain);
    else value = company?.identityKey ?? cid; // account key (identity_key, fallback id)

    if (!value) {
      return Response.json(
        { error: `Could not resolve a ${level} value to suppress from the given contact/company` },
        { status: 422 },
      );
    }

    try {
      await addSuppressionDb(
        { scope: authCtx.tenantId, level, value, type: "manual_dnc", reason, permanent: true, createdAt: Date.now() },
        { source: "manual_ui", createdBy: authCtx.appUserId },
      );
      await logAudit({
        tenantId: authCtx.tenantId,
        userId: authCtx.appUserId,
        action: "create",
        entityType: "suppression",
        entityId: `${level}:${value}`,
        metadata: { type: "manual_dnc", level, source: "manual_ui", reason },
      });
      return Response.json({ success: true, level, value });
    } catch (error) {
      console.error("Failed to add manual suppression:", error);
      return Response.json({ error: "Failed to add suppression" }, { status: 500 });
    }
  });
}
