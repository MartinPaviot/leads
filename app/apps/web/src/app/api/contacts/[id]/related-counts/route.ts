/**
 * GET /api/contacts/[id]/related-counts
 *
 * Live counts of the data related to a contact (activities, notes, tasks) —
 * powers the cascade-delete modal's checkboxes.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getContactRelatedCounts } from "@/lib/contacts/cascade-delete";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!contact) return Response.json({ error: "Not found" }, { status: 404 });

  const counts = await getContactRelatedCounts(authCtx.tenantId, id);
  return Response.json({ counts });
}
