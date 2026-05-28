import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, deals, sequenceEnrollments, tasks } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { logger } from "@/lib/observability/logger";
import { z } from "zod";

/**
 * K3 — Contact-merge endpoint.
 *
 * GET  /api/contacts/merge                      → candidate duplicate groups
 * POST /api/contacts/merge { survivorId, mergedIds: [] } → merge
 *
 * Duplicate detection is deliberately simple for v1: group contacts by
 * (tenantId, lower(email)) where email is non-null and appears on more
 * than one row. Fuzzy matching on name + company is a v2.
 */

const mergeSchema = z.object({
  survivorId: z.string().min(1),
  mergedIds: z.array(z.string().min(1)).min(1),
});

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const all = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));

    const byEmail = new Map<string, typeof all>();
    for (const c of all) {
      const key = c.email?.toLowerCase().trim();
      if (!key) continue;
      const bucket = byEmail.get(key) ?? [];
      bucket.push(c);
      byEmail.set(key, bucket);
    }

    const groups = Array.from(byEmail.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([email, rows]) => ({
        email,
        count: rows.length,
        // Sort by richness: more properties + more recent update first.
        candidates: rows
          .map((r) => ({
            id: r.id,
            firstName: r.firstName,
            lastName: r.lastName,
            email: r.email,
            title: r.title,
            companyId: r.companyId,
            score: r.score,
            updatedAt: r.updatedAt,
            propertiesCount: r.properties
              ? Object.keys(r.properties as object).length
              : 0,
          }))
          .sort((a, b) => {
            if (b.propertiesCount !== a.propertiesCount)
              return b.propertiesCount - a.propertiesCount;
            const aT = a.updatedAt?.getTime?.() ?? 0;
            const bT = b.updatedAt?.getTime?.() ?? 0;
            return bT - aT;
          }),
      }));

    return NextResponse.json({ groups });
  } catch (err) {
    logger.error("contacts/merge: GET failed", { err });
    return NextResponse.json(
      { error: "Failed to load duplicate groups." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = mergeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { survivorId, mergedIds } = parsed.data;
  if (mergedIds.includes(survivorId)) {
    return NextResponse.json(
      { error: "survivorId must not appear in mergedIds." },
      { status: 400 }
    );
  }

  try {
    // Verify all rows belong to the caller's tenant before any writes.
    const involved = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, authCtx.tenantId),
          inArray(contacts.id, [survivorId, ...mergedIds]),
          isNull(contacts.deletedAt)
        )
      );
    const foundIds = new Set(involved.map((r) => r.id));
    if (!foundIds.has(survivorId) || mergedIds.some((i) => !foundIds.has(i))) {
      return NextResponse.json(
        { error: "One or more contacts are not in your workspace." },
        { status: 404 }
      );
    }

    // Repoint every FK that references contacts.
    await db
      .update(activities)
      .set({ entityId: survivorId })
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          eq(activities.entityType, "contact"),
          inArray(activities.entityId, mergedIds)
        )
      );
    await db
      .update(deals)
      .set({ contactId: survivorId })
      .where(
        and(
          eq(deals.tenantId, authCtx.tenantId),
          inArray(deals.contactId, mergedIds)
        )
      );
    // `sequence_enrollments` has no tenantId column — the contactId FK
    // already ties each row to a tenant-scoped contact, and we've
    // validated that `mergedIds` belong to this tenant above.
    await db
      .update(sequenceEnrollments)
      .set({ contactId: survivorId })
      .where(inArray(sequenceEnrollments.contactId, mergedIds));
    await db
      .update(tasks)
      .set({ entityId: survivorId })
      .where(
        and(
          eq(tasks.tenantId, authCtx.tenantId),
          eq(tasks.entityType, "contact"),
          inArray(tasks.entityId, mergedIds)
        )
      );

    // Remove the merged rows.
    await db
      .delete(contacts)
      .where(
        and(
          eq(contacts.tenantId, authCtx.tenantId),
          inArray(contacts.id, mergedIds)
        )
      );

    logger.info("contacts/merge: merged", {
      tenantId: authCtx.tenantId,
      survivorId,
      mergedCount: mergedIds.length,
    });

    return NextResponse.json({ ok: true, merged: mergedIds.length });
  } catch (err) {
    logger.error("contacts/merge: POST failed", { err });
    return NextResponse.json(
      { error: "Merge failed. Please try again." },
      { status: 500 }
    );
  }
}
