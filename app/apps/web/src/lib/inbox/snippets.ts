/**
 * Personal reply snippets (INBOX-X05, personal scope). Saved reply templates a
 * founder can drop into the composer, with `{{variable}}` placeholders filled
 * from the thread's contact. Stored per-user in user_preferences (no migration).
 *
 * Scope note: the X05 spec asks for *tenant-shared* snippets visible to every
 * member. The shipped inbox is personal (a member can't see another's mailbox),
 * so snippets are personal too — the right fit for today's model. Tenant-sharing
 * is the remaining delta and needs a shared store + the team-inbox decision.
 */

export interface Snippet {
  id: string;
  name: string;
  body: string;
}

export interface SnippetVars {
  firstName?: string | null;
  name?: string | null;
  email?: string | null;
}

/** Neutral fallbacks for an unknown sender — "Hi {{firstName}}" → "Hi there". */
const FALLBACK: Record<string, string> = { firstName: "there", name: "there" };

/**
 * Replace `{{var}}` placeholders with the contact's values, trimming whitespace
 * inside the braces. An unknown/blank value falls back to a neutral token
 * (never a dangling "{{firstName}}"). Unrecognised variables resolve to "".
 */
export function interpolateSnippet(body: string, vars: SnippetVars): string {
  const lookup = vars as Record<string, string | null | undefined>;
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = lookup[key];
    if (value != null && String(value).trim() !== "") return String(value);
    return FALLBACK[key] ?? "";
  });
}

/** First token of a display name — "Ada Lovelace" → "Ada". */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || null;
}

const MAX_SNIPPETS = 50;

/** Coerce stored/incoming JSON into a clean Snippet[] — drops malformed rows, caps the count. */
export function normalizeSnippets(raw: unknown): Snippet[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Snippet[] = [];
  for (const s of raw) {
    if (
      !s ||
      typeof (s as Snippet).id !== "string" ||
      typeof (s as Snippet).name !== "string" ||
      typeof (s as Snippet).body !== "string"
    ) {
      continue;
    }
    const snip = s as Snippet;
    const name = snip.name.trim();
    if (!name || !snip.id || seen.has(snip.id)) continue;
    seen.add(snip.id);
    out.push({ id: snip.id, name: name.slice(0, 80), body: snip.body });
    if (out.length >= MAX_SNIPPETS) break;
  }
  return out;
}
