/**
 * Pure note-entity-badge decision (P1 30 hydration fix).
 *
 * A note's entity badge should only appear for a real, linkable CRM entity.
 * Inline-created notes default to entityType "general" (route.ts:12,110) and
 * inbox-captured notes use "inbox_thread" — both are truthy, so the page used
 * to render a stray badge with no icon and no link (page.tsx:254). Only
 * company / contact / deal have an icon (entityIcon) and an href (entityHref),
 * so only those should show a badge.
 */

export const LINKABLE_NOTE_ENTITY_TYPES = ["company", "contact", "deal"] as const;

export function isLinkableNoteEntity(
  entityType: string | null | undefined,
  entityId?: string | null,
): boolean {
  if (!entityType) return false;
  if (entityId !== undefined && !entityId) return false;
  return (LINKABLE_NOTE_ENTITY_TYPES as readonly string[]).includes(entityType);
}
