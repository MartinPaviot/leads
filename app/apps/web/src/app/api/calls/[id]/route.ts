/**
 * GET /api/calls/[id]
 *
 * Full call detail for the post-call page — transcript, recording URL
 * (proxied), summary, signals, action items. Tenant-scoped read.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { calls, contacts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await ctx.params;
    const [row] = await db
      .select({
        call: calls,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactTitle: contacts.title,
      })
      .from(calls)
      .leftJoin(contacts, eq(contacts.id, calls.contactId))
      .where(and(eq(calls.id, id), eq(calls.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({
      ...row.call,
      contactName:
        `${row.contactFirstName ?? ""} ${row.contactLastName ?? ""}`.trim() ||
        "Unknown",
      contactTitle: row.contactTitle,
      // The raw Twilio recording URL requires basic auth — never expose
      // it directly. The dashboard player must go through
      // /api/calls/[id]/recording (Phase 1.5 proxy, can wait).
      recordingUrl: row.call.recordingUrl ? `/api/calls/${id}/recording` : null,
    });
  });
}
