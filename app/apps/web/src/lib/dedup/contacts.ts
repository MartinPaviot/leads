/**
 * Contact dedup (spec 07, AC3): by lower(email) then by linkedin_url. Pure.
 * Deterministic survivor (smallest id). A contact already merged by email is not
 * re-grouped by linkedin.
 */
import type { ContactGroup, DedupContact } from "./types";

export function dedupeContacts(contacts: DedupContact[]): ContactGroup[] {
  const groups: ContactGroup[] = [];
  const assigned = new Set<string>();

  const pass = (keyOf: (c: DedupContact) => string | null, by: "email" | "linkedin") => {
    const buckets = new Map<string, DedupContact[]>();
    for (const c of contacts) {
      if (assigned.has(c.id)) continue;
      const k = keyOf(c);
      if (!k) continue;
      const arr = buckets.get(k) ?? [];
      arr.push(c);
      buckets.set(k, arr);
    }
    for (const members of buckets.values()) {
      if (members.length < 2) continue;
      const ids = members.map((m) => m.id).sort();
      members.forEach((m) => assigned.add(m.id));
      groups.push({ survivorId: ids[0], absorbedIds: ids.slice(1), by });
    }
  };

  pass((c) => (c.email ? c.email.toLowerCase().trim() : null), "email");
  pass((c) => (c.linkedinUrl ? c.linkedinUrl.toLowerCase().replace(/\/+$/, "").trim() : null), "linkedin");
  return groups;
}
