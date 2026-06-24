import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * POST /api/inbox/drafts — upsert a COMPOSER draft so it persists in the DB
 * (the Drafts folder, cross-device), not just localStorage.
 *
 * A draft is an `outbound_emails` row with `status='draft'` + `sentAt=null` —
 * the SAME shape the agent's prepared-reply drafts use, so it is:
 *   - reloaded on conversation reopen (detail route's `preparedDraft`, matched
 *     by contactId),
 *   - surfaced in the Drafts folder (conversations route's draftThreadIds, when
 *     a threadId is attached),
 *   - consumed on send (POST /api/inbox/drafts/[id]/consume).
 * A draft is NEVER auto-sent: the cron only picks up `status='queued'`, and
 * `send-now` needs an explicit dispatch the composer never issues for a draft.
 *
 * Upsert key: the client passes back the `id` it received on the first save and
 * we UPDATE that row; with no id we dedup on (tenant, contactId, threadId) so a
 * reopened thread updates its one draft instead of piling up rows.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    id?: string | null;
    contactId?: string | null;
    threadId?: string | null;
    to?: string | null;
    subject?: string | null;
    bodyHtml?: string | null;
    bodyText?: string | null;
    mailboxId?: string | null;
  } | null;
  if (!body) return Response.json({ error: "Bad request" }, { status: 400 });

  const tenantId = authCtx.tenantId;
  const values = {
    toAddress: (body.to || "").trim(),
    subject: body.subject || "",
    bodyHtml: body.bodyHtml || "",
    bodyText: body.bodyText ?? null,
    contactId: body.contactId || null,
    threadId: body.threadId || null,
    mailboxId: body.mailboxId || null,
    updatedAt: new Date(),
  };

  try {
    // 1) Explicit id → update that draft (tenant-scoped, still a draft).
    if (body.id) {
      const [row] = await db
        .update(outboundEmails)
        .set(values)
        .where(
          and(
            eq(outboundEmails.id, body.id),
            eq(outboundEmails.tenantId, tenantId),
            eq(outboundEmails.status, "draft"),
            isNull(outboundEmails.sentAt),
          ),
        )
        .returning({ id: outboundEmails.id });
      if (row) return Response.json({ id: row.id });
      // Fall through to insert if the id no longer matches a live draft.
    }

    // 2) Dedup on (tenant, contactId, threadId) so a reopened thread reuses its
    //    one draft row. Only when we have a contact to scope by.
    if (body.contactId) {
      const [existing] = await db
        .select({ id: outboundEmails.id })
        .from(outboundEmails)
        .where(
          and(
            eq(outboundEmails.tenantId, tenantId),
            eq(outboundEmails.contactId, body.contactId),
            eq(outboundEmails.status, "draft"),
            isNull(outboundEmails.sentAt),
            body.threadId
              ? eq(outboundEmails.threadId, body.threadId)
              : isNull(outboundEmails.threadId),
          ),
        )
        .limit(1);
      if (existing) {
        await db
          .update(outboundEmails)
          .set(values)
          .where(and(eq(outboundEmails.id, existing.id), eq(outboundEmails.tenantId, tenantId)));
        return Response.json({ id: existing.id });
      }
    }

    // 3) Insert a fresh draft. fromAddress is resolved at send time, so a
    //    placeholder is fine for a never-sent draft.
    const [created] = await db
      .insert(outboundEmails)
      .values({
        tenantId,
        status: "draft",
        fromAddress: "pending@rotation",
        ...values,
      })
      .returning({ id: outboundEmails.id });
    return Response.json({ id: created.id });
  } catch (error) {
    console.error("Failed to upsert draft:", error);
    return Response.json({ error: "Failed to save draft" }, { status: 500 });
  }
}
