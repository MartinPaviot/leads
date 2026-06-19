/**
 * Shared thread labels (INBOX-X04) — tenant-wide tags any member can apply to a
 * conversation (e.g. "Needs founder reply"). Stored in the existing `notes`
 * table (entityType "inbox_label", entityId = conversationKey, content = label),
 * so every member sees the same labels with no migration. Distinct from the
 * list's deterministic per-user filter labels (T02): these are manual + shared.
 */

export const INBOX_LABEL_ENTITY_TYPE = "inbox_label";

const MAX_LEN = 40;

/** Trim + cap a label; null when empty. Case preserved, but compared case-insensitively. */
export function normalizeLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.slice(0, MAX_LEN);
}

/** Two labels are the same tag regardless of case/spacing. */
export function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Dedupe a label list case-insensitively, preserving first-seen casing + order. */
export function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of labels) {
    const key = l.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(l.trim());
  }
  return out;
}

/** Deterministic chip hue (0–359) from the label text, so a tag looks the same everywhere. */
export function labelHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
