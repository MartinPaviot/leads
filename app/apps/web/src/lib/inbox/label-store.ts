/**
 * Persistence for shared thread labels (INBOX-X04) over the existing `notes`
 * table. Tenant-scoped (every member sees the same labels) — not author-filtered.
 * No migration.
 */

import { db } from "@/db";
import { notes } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { INBOX_LABEL_ENTITY_TYPE, dedupeLabels, sameLabel, normalizeLabel } from "./labels";

/** The thread's current labels (deduped, case-insensitive). */
export async function listThreadLabels(tenantId: string, conversationKey: string): Promise<string[]> {
  const rows = await db
    .select({ content: notes.content })
    .from(notes)
    .where(
      and(
        eq(notes.tenantId, tenantId),
        eq(notes.entityType, INBOX_LABEL_ENTITY_TYPE),
        eq(notes.entityId, conversationKey),
        isNull(notes.deletedAt),
      ),
    )
    .orderBy(desc(notes.createdAt));
  return dedupeLabels(rows.map((r) => r.content ?? "").filter(Boolean));
}

/** Every label used anywhere in the tenant — autocomplete suggestions. */
export async function listTenantLabels(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ content: notes.content })
    .from(notes)
    .where(
      and(
        eq(notes.tenantId, tenantId),
        eq(notes.entityType, INBOX_LABEL_ENTITY_TYPE),
        isNull(notes.deletedAt),
      ),
    )
    .limit(2000);
  return dedupeLabels(rows.map((r) => r.content ?? "").filter(Boolean)).sort((a, b) => a.localeCompare(b));
}

/** Apply a label to a thread (idempotent — no duplicate tag). Returns the new label list. */
export async function addThreadLabel(
  tenantId: string,
  conversationKey: string,
  rawName: string,
  authorId: string,
): Promise<string[]> {
  const name = normalizeLabel(rawName);
  if (!name) return listThreadLabels(tenantId, conversationKey);
  const current = await listThreadLabels(tenantId, conversationKey);
  if (!current.some((l) => sameLabel(l, name))) {
    await db.insert(notes).values({
      tenantId,
      authorId,
      entityType: INBOX_LABEL_ENTITY_TYPE,
      entityId: conversationKey,
      content: name,
    });
  }
  return listThreadLabels(tenantId, conversationKey);
}

/** Remove a label from a thread (soft-delete every matching row). Returns the new list. */
export async function removeThreadLabel(
  tenantId: string,
  conversationKey: string,
  rawName: string,
): Promise<string[]> {
  const name = normalizeLabel(rawName);
  if (!name) return listThreadLabels(tenantId, conversationKey);
  const rows = await db
    .select({ id: notes.id, content: notes.content })
    .from(notes)
    .where(
      and(
        eq(notes.tenantId, tenantId),
        eq(notes.entityType, INBOX_LABEL_ENTITY_TYPE),
        eq(notes.entityId, conversationKey),
        isNull(notes.deletedAt),
      ),
    );
  const ids = rows.filter((r) => r.content && sameLabel(r.content, name)).map((r) => r.id);
  for (const id of ids) {
    await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, id));
  }
  return listThreadLabels(tenantId, conversationKey);
}
