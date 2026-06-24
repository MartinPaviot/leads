/**
 * Composer draft persistence (auto-save). A pure, testable wrapper over
 * `localStorage` so a refresh / navigate-away / the inbox's periodic re-render
 * never loses typed text. Keyed PER CONTEXT (contactId, else the seeded To, else
 * "compose") so a reply to A never clobbers a reply to B. Cleared on send.
 *
 * localStorage-only by design (survives refresh on the same browser, no backend).
 * A DB-backed Drafts folder (cross-device, Gmail-parity) is a separate increment.
 */

export const DRAFT_KEY = "elevay:email-draft";

export interface ComposerDraftData {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  contactId?: string;
  dealId?: string;
  savedAt?: string;
}

/**
 * Per-context storage key. Derived from the OPENING draft (stable for the life
 * of the panel), so editing recipients in-place doesn't move the slot.
 */
export function draftStorageKey(draft: { contactId?: string; to?: string }): string {
  const ctx = (draft.contactId || draft.to || "compose").toLowerCase().trim();
  return `${DRAFT_KEY}:${ctx}`;
}

export function saveDraftToStorage(key: string, data: Omit<ComposerDraftData, "savedAt">): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch {
    // localStorage may be full or unavailable — auto-save is best-effort.
  }
}

export function loadDraftFromStorage(key: string): ComposerDraftData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as ComposerDraftData;
  } catch {
    return null;
  }
}

export function clearDraftFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}
