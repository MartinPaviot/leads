/**
 * Shared team comments on an inbox thread (B8, INBOX-X02). Unlike private notes
 * (notes.ts, owner-scoped), a comment is visible to every workspace member, so the
 * store is tenant-scoped, not author-filtered. Stored under a synthetic entity in
 * the existing `notes` table (zero migration), never quoted/sent/AI-surfaced.
 *
 * This module is the PURE half: the comment shape + body normalization + the
 * row->view mapper. The store / route / UI are the wiring on top.
 */

import { normalizeNoteContent } from "./notes";

/** entityType attaching a team comment to a conversation (never a real CRM entity). */
export const INBOX_COMMENT_ENTITY_TYPE = "inbox_comment";

export interface TeamComment {
  id: string;
  conversationKey: string;
  authorId: string;
  /** Resolved display name; a fallback for an unknown/departed member. */
  authorName: string;
  body: string;
  createdAt: string;
}

/** Trim + cap a comment body; null when there's nothing to save (reuses the note cap). */
export function normalizeCommentBody(raw: unknown): string | null {
  return normalizeNoteContent(raw);
}

export interface CommentRow {
  id: string;
  conversationKey: string;
  authorId: string;
  body: string;
  createdAt: string | Date;
}

/** Map a stored comment row to the view shape, resolving the author name. */
export function shapeComment(row: CommentRow, names: Record<string, string>): TeamComment {
  return {
    id: row.id,
    conversationKey: row.conversationKey,
    authorId: row.authorId,
    authorName: names[row.authorId]?.trim() || "A teammate",
    body: row.body,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
  };
}

/**
 * Who may delete a comment: its author, or a workspace admin. Pure so the store's
 * delete guard is testable in isolation.
 */
export function canDeleteComment(
  requesterId: string,
  comment: { authorId: string },
  isAdmin: boolean,
): boolean {
  return isAdmin || requesterId === comment.authorId;
}
