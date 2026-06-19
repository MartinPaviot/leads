/**
 * Inbox digest composition (INBOX-N02 morning / end-of-day digest) — pure.
 *
 * Groups a flat list of digest items into ordered, capped sections (overdue
 * first, then awaiting-reply, important, meetings, everything else). The delivery
 * cadence + channel ride the notification prefs (notification-prefs.ts) and
 * Inngest, which are deferred; this is the content the digest renders.
 */

export type DigestKind = "overdue" | "awaiting_reply" | "important" | "meeting" | "other";

export interface DigestItem {
  key: string;
  subject: string;
  from: string;
  kind: DigestKind;
  /** ISO timestamp of the latest message, for ordering / "Nd ago". */
  at: string | null;
}

export interface DigestSection {
  id: DigestKind;
  title: string;
  items: DigestItem[];
}

export interface Digest {
  title: string;
  total: number;
  sections: DigestSection[];
}

const SECTION_ORDER: { id: DigestKind; title: string }[] = [
  { id: "overdue", title: "Overdue replies" },
  { id: "awaiting_reply", title: "Awaiting your reply" },
  { id: "important", title: "Important & new" },
  { id: "meeting", title: "Meetings" },
  { id: "other", title: "Everything else" },
];

const PER_SECTION = 8;

/** Newest first within a section. */
function byRecency(a: DigestItem, b: DigestItem): number {
  return (b.at || "").localeCompare(a.at || "");
}

/** Title for a digest run. isEvening picks the end-of-day framing (INBOX-N02). */
export function digestTitle(isEvening: boolean): string {
  return isEvening ? "End-of-day digest" : "Morning digest";
}

export function composeDigest(items: DigestItem[], title = "Your inbox digest"): Digest {
  const sections: DigestSection[] = [];
  for (const s of SECTION_ORDER) {
    const matched = items
      .filter((i) => i.kind === s.id)
      .sort(byRecency)
      .slice(0, PER_SECTION);
    if (matched.length > 0) sections.push({ id: s.id, title: s.title, items: matched });
  }
  return { title, total: items.length, sections };
}
