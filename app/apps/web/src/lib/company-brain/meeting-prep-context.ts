/**
 * Compose the meeting-prep prompt context from one or more Company
 * Brains. Phase 3b — replaces the ad-hoc per-attendee contact +
 * company lookup that lived inside `generateMeetingPrep`.
 *
 * Why : the brain already aggregates contacts, deals (with risk +
 * stall + citation-shaped properties), recent activities, meetings
 * with transcript counts, knowledge entries, context graph edges,
 * memories — all freshness-tagged. The old prep code reproduced
 * a tiny slice of this (contact title + company industry + 5
 * recent activities) because brain didn't exist yet.
 *
 * The composer is deps-injectable so tests can stub the brain
 * fetcher without standing up a Postgres harness.
 */

import { getCompanyBrain as defaultGetCompanyBrain } from "./get-brain";
import { getDecisionLedgerSection } from "./decision-ledger";
import type { CompanyBrain } from "./types";

export interface MeetingPrepAttendee {
  email?: string;
  displayName?: string;
}

export interface ComposeMeetingPrepContextOpts {
  meetingTitle: string | null;
  startTimeIso: string | null;
  attendees: MeetingPrepAttendee[];
  /** Companies to fetch a brain for. Resolved upstream from the
   *  meeting's entityId + the attendees' contact rows. */
  companyIds: string[];
  tenantId: string;
}

export interface ComposeMeetingPrepContextDeps {
  getCompanyBrain?: typeof defaultGetCompanyBrain;
}

const MAX_BRAINS_PER_PREP = 3;

/**
 * Render the brain into a single prompt-ready string. Caps each
 * layer aggressively so the final prompt stays under ~3K tokens
 * even for a multi-company meeting.
 */
function renderBrain(brain: CompanyBrain): string {
  const lines: string[] = [];
  const c = brain.company;
  lines.push(
    `Company: ${c.name}${c.domain ? ` (${c.domain})` : ""}${
      c.industry ? ` — ${c.industry}` : ""
    }${c.sizeBand ? ` — ${c.sizeBand}` : ""}${
      c.score != null ? ` — score ${c.score}` : ""
    }`,
  );

  if (brain.contacts.length > 0) {
    lines.push("Contacts:");
    for (const ct of brain.contacts.slice(0, 8)) {
      const fullName = [ct.firstName, ct.lastName].filter(Boolean).join(" ");
      const flags = [
        ct.isChampion ? "champion" : null,
        ct.intentScore != null
          ? `intent ${ct.intentScore}${ct.intentTrend ? `/${ct.intentTrend}` : ""}`
          : null,
      ].filter(Boolean);
      lines.push(
        `  - ${fullName || ct.email || ct.id}${ct.title ? ` (${ct.title})` : ""}${
          flags.length ? ` [${flags.join(", ")}]` : ""
        }`,
      );
    }
  }

  if (brain.deals.length > 0) {
    lines.push("Open deals:");
    for (const d of brain.deals.slice(0, 5)) {
      const bits = [
        `stage=${d.stage}`,
        d.value != null ? `value=${d.value}` : null,
        d.riskLevel ? `risk=${d.riskLevel}` : null,
        d.stallProbability != null
          ? `stall=${(d.stallProbability * 100).toFixed(0)}%`
          : null,
      ].filter(Boolean);
      lines.push(`  - ${d.name} [${bits.join(", ")}]`);
      if (d.riskReasons.length > 0) {
        lines.push(
          `    reasons: ${d.riskReasons.slice(0, 3).join("; ")}`,
        );
      }
      const propEntries = Object.entries(d.properties).slice(0, 4);
      if (propEntries.length > 0) {
        const propStr = propEntries
          .map(([k, m]) => `${k}=${JSON.stringify(m.value)}@${m.source}`)
          .join(", ");
        lines.push(`    properties: ${propStr}`);
      }
    }
  }

  if (brain.activities.length > 0) {
    lines.push("Recent activities:");
    for (const a of brain.activities.slice(0, 8)) {
      lines.push(
        `  - ${a.occurredAt.toISOString().split("T")[0]} ${a.type}${
          a.direction ? ` (${a.direction})` : ""
        }${a.summary ? `: ${a.summary.slice(0, 120)}` : ""}`,
      );
    }
  }

  if (brain.meetings.length > 0) {
    lines.push("Past meetings:");
    for (const m of brain.meetings.slice(0, 4)) {
      lines.push(
        `  - ${m.occurredAt.toISOString().split("T")[0]} ${m.title}${
          m.transcriptChunkCount > 0
            ? ` (${m.transcriptChunkCount} transcript chunks)`
            : ""
        }`,
      );
    }
  }

  if (brain.knowledgeEntries.length > 0) {
    lines.push("Knowledge:");
    for (const k of brain.knowledgeEntries.slice(0, 4)) {
      lines.push(`  - ${k.title}: ${k.body.slice(0, 200)}`);
    }
  }

  if (brain.contextGraphEdges.length > 0) {
    lines.push("Graph facts:");
    for (const e of brain.contextGraphEdges.slice(0, 6)) {
      lines.push(
        `  - ${e.relationType}: ${e.fact}${
          e.confidence != null ? ` [${(e.confidence * 100).toFixed(0)}%]` : ""
        }`,
      );
    }
  }

  if (brain.memories.length > 0) {
    lines.push("Memories:");
    for (const m of brain.memories.slice(0, 4)) {
      lines.push(`  - [${m.scope}] ${m.content.slice(0, 200)}`);
    }
  }

  return lines.join("\n");
}

export async function composeMeetingPrepContext(
  opts: ComposeMeetingPrepContextOpts,
  deps: ComposeMeetingPrepContextDeps = {},
): Promise<string> {
  const fetchBrain = deps.getCompanyBrain ?? defaultGetCompanyBrain;
  const { meetingTitle, startTimeIso, attendees, companyIds, tenantId } = opts;

  if (!tenantId) {
    throw new Error("composeMeetingPrepContext: tenantId is required");
  }

  const sections: string[] = [];
  sections.push(
    `Meeting: ${meetingTitle ?? "Untitled meeting"}\nDate: ${
      startTimeIso ?? "Unknown"
    }`,
  );

  if (attendees.length > 0) {
    sections.push(
      "Attendees:\n" +
        attendees
          .map((a) => `- ${a.displayName || a.email || "Unknown"}${a.email ? ` (${a.email})` : ""}`)
          .join("\n"),
    );
  }

  // Tenant-wide decision ledger — what was decided + what's still owed
  // across recent meetings. Top-level (not company-scoped) so it also
  // serves a company-less internal/cofounder meeting, where the per-
  // company brains below are empty. Fail-soft; no-op when there's nothing.
  const ledger = await getDecisionLedgerSection(tenantId).catch(() => "");
  if (ledger) sections.push(ledger);

  // Dedupe + cap company list to keep prompt within budget.
  const uniqueCompanyIds = Array.from(new Set(companyIds.filter(Boolean))).slice(
    0,
    MAX_BRAINS_PER_PREP,
  );

  for (const companyId of uniqueCompanyIds) {
    try {
      const brain = await fetchBrain(companyId, {
        tenantId,
        recentActivityCap: 8,
        contactCap: 8,
        memoryCap: 4,
      });
      if (brain) {
        sections.push(`--- Brain for ${brain.company.name} ---\n${renderBrain(brain)}`);
      }
    } catch (err) {
      // A single brain failure must not block the prep entirely.
      console.error(
        `[composeMeetingPrepContext] brain fetch failed for ${companyId}:`,
        err,
      );
    }
  }

  return sections.join("\n\n");
}
