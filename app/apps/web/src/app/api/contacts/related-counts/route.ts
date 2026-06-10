/**
 * POST /api/contacts/related-counts  { ids: string[] }
 *
 * Aggregate live counts of the data related to a SELECTION of contacts
 * (activities, notes, tasks) — powers the bulk cascade-delete modal's
 * checkboxes. Set-based: same query cost for 1 or 100 selected contacts.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { and, inArray, eq, isNull } from "drizzle-orm";
import { getContactsRelatedCounts } from "@/lib/contacts/cascade-delete";

const MAX_IDS = 500;

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string").slice(0, MAX_IDS)
    : [];
  if (ids.length === 0) {
    return Response.json({ error: "ids array required" }, { status: 400 });
  }

  // Keep only ids that are live contacts of this tenant, so the counts
  // reflect exactly what the delete would touch.
  const owned = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(inArray(contacts.id, ids), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));

  const counts = await getContactsRelatedCounts(authCtx.tenantId, owned.map((r) => r.id));
  return Response.json({ counts });
}
