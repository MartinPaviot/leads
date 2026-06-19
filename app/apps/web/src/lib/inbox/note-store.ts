/**
 * Persistence for private thread notes (INBOX-X06) over the existing `notes`
 * table. Owner-scoped: a note is keyed to (tenant, author, conversationKey), so
 * only its author reads it — consistent with the personal inbox. No migration.
 *
 * Deliberately does NOT call ingestEpisode (unlike the generic /api/notes) — an
 * internal thread note must stay out of the AI context graph to honour the
 * "never surfaced/sent" guarantee.
 */

import { db } from "@/db";
import { notes } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { INBOX_NOTE_ENTITY_TYPE, type ThreadNote } from "./notes";

export async function listThreadNotes(
  tenantId: string,
  authorId: string,
  conversationKey: string,
): Promise<ThreadNote[]> {
  const rows = await db
    .select({ id: notes.id, content: notes.content, createdAt: notes.createdAt })
    .from(notes)
    .where(
      and(
        eq(notes.tenantId, tenantId),
        eq(notes.authorId, authorId),
        eq(notes.entityType, INBOX_NOTE_ENTITY_TYPE),
        eq(notes.entityId, conversationKey),
        isNull(notes.deletedAt),
      ),
    )
    .orderBy(desc(notes.createdAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    content: r.content ?? "",
    createdAt: (r.createdAt ?? new Date()).toISOString(),
  }));
}

export async function addThreadNote(
  tenantId: string,
  authorId: string,
  conversationKey: string,
  content: string,
): Promise<ThreadNote> {
  const [row] = await db
    .insert(notes)
    .values({
      tenantId,
      authorId,
      entityType: INBOX_NOTE_ENTITY_TYPE,
      entityId: conversationKey,
      content,
    })
    .returning({ id: notes.id, content: notes.content, createdAt: notes.createdAt });
  return {
    id: row.id,
    content: row.content ?? content,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  };
}

/** Soft-delete one of the author's own notes. */
export async function deleteThreadNote(
  tenantId: string,
  authorId: string,
  noteId: string,
): Promise<void> {
  await db
    .update(notes)
    .set({ deletedAt: new Date() })
    .where(and(eq(notes.tenantId, tenantId), eq(notes.authorId, authorId), eq(notes.id, noteId)));
}
