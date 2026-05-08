/**
 * Pure helper that derives per-layer `lastRefreshedAt` timestamps
 * from a loaded brain. Exported separately so unit tests can pin
 * the contract without setting up a full DB mock.
 */

import type { CompanyBrain, CompanyBrainFreshness } from "./types";

/**
 * Returns the most recent timestamp across an array of items, or
 * null when the array is empty / all dates are missing.
 */
function maxDate(dates: Array<Date | null | undefined>): Date | null {
  let max: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!max || d.getTime() > max.getTime()) max = d;
  }
  return max;
}

export function deriveFreshness(
  brain: Omit<CompanyBrain, "freshness" | "truncated">,
): CompanyBrainFreshness {
  return {
    company: brain.company.createdAt ?? null,
    contacts: maxDate(brain.contacts.map((c) => c.lastTouchAt)),
    deals: null, // deals don't carry a per-layer refresh timestamp
    activities: maxDate(brain.activities.map((a) => a.occurredAt)),
    meetings: maxDate(brain.meetings.map((m) => m.occurredAt)),
    // transcriptChunks freshness = most recent meeting it relates to
    transcriptChunks: brain.transcriptChunks
      ? maxDate(
          brain.transcriptChunks
            .map((tc) =>
              brain.meetings.find((m) => m.id === tc.meetingId)?.occurredAt,
            )
            .filter((d): d is Date => !!d),
        )
      : null,
    knowledgeEntries: null, // KEs carry no canonical timestamp on the brain shape
    contextGraphEdges: null, // edges may have t_valid but not surfaced here
    memories: maxDate(brain.memories.map((m) => m.createdAt)),
    dossier: null, // Dossier shape varies ; dossier.builtAt is optional
  };
}
