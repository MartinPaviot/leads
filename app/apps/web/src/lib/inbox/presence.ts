/**
 * Live thread presence (INBOX-X03) — who else is viewing a conversation, so two
 * teammates don't reply over each other. Pure summary + the timing constants;
 * the DB heartbeat/read live in presence-store.ts (defensive — inert until the
 * inbox_presence table is migrated in).
 */

export interface Viewer {
  userId: string;
  state: string; // "viewing" | "drafting"
}

/** A viewer counts as present while their heartbeat is younger than this. */
export const PRESENCE_ACTIVE_MS = 30_000;
/** Client heartbeat + poll cadence (comfortably under PRESENCE_ACTIVE_MS). */
export const PRESENCE_HEARTBEAT_MS = 12_000;

/** Short "who's here" line for the pane, e.g. "Ada and Bob are here". */
export function presenceSummary(viewers: Viewer[], names: Record<string, string>): string {
  const labels = viewers.map((v) => {
    const name = names[v.userId] || "Someone";
    return v.state === "drafting" ? `${name} (drafting)` : name;
  });
  if (labels.length === 0) return "";
  if (labels.length === 1) return `${labels[0]} is here`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} are here`;
  return `${labels[0]}, ${labels[1]} +${labels.length - 2} more here`;
}
