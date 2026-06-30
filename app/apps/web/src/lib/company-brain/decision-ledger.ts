/**
 * Cross-meeting decision ledger — the "company brain remembers what we
 * decided" surface. Meeting extraction already records decisions[] on
 * activities.metadata.structuredNotes and turns action items into `tasks`
 * rows, but meeting-prep was COMPANY-scoped (composeMeetingPrepContext
 * fetches a brain per companyId), so a cofounder sync — which has no
 * company — got an empty prep, and even a sales prep never reminded you
 * of the decisions/commitments from the last meeting.
 *
 * This reads, TENANT-WIDE: the recent meetings' decisions + the still-open
 * commitments (pending tasks). composeMeetingPrepContext injects it as a
 * top-level section so EVERY prep — internal or external — opens with
 * "here's what you decided and what's still owed".
 *
 * Read-only, tenant-scoped, no-op ("") when there's nothing yet.
 */

import { db } from "@/db";
import { activities, tasks } from "@/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

const SCAN_MEETINGS = 15;
const MAX_DECISIONS = 6;
const MAX_COMMITMENTS = 8;
const MAX_SNIPPET_CHARS = 200;

function sanitize(s: string): string {
  let flattened = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    flattened += code < 0x20 || code === 0x7f ? " " : s[i];
  }
  return flattened.replace(/\s+/g, " ").trim().slice(0, MAX_SNIPPET_CHARS);
}

function isoDay(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
}

export interface DecisionLedger {
  decisions: Array<{ date: string; text: string }>;
  commitments: Array<{ title: string; due: string | null }>;
}

/**
 * Recent meeting decisions + open commitments for a tenant. Decisions are
 * read from the most recent completed meetings' structured notes (deduped);
 * commitments are the still-pending tasks (action items become tasks).
 */
export async function getDecisionLedger(tenantId: string): Promise<DecisionLedger> {
  const meetingRows = await db
    .select({ occurredAt: activities.occurredAt, metadata: activities.metadata })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.activityType, "meeting_completed"),
        isNull(activities.deletedAt),
        sql`${activities.metadata} -> 'structuredNotes' -> 'decisions' IS NOT NULL`,
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(SCAN_MEETINGS);

  const decisions: DecisionLedger["decisions"] = [];
  const seen = new Set<string>();
  for (const m of meetingRows) {
    if (decisions.length >= MAX_DECISIONS) break;
    const sn = (m.metadata as Record<string, unknown> | null)?.structuredNotes as
      | { decisions?: unknown[] }
      | undefined;
    const ds = Array.isArray(sn?.decisions) ? sn!.decisions : [];
    const date = isoDay(m.occurredAt);
    for (const d of ds) {
      if (decisions.length >= MAX_DECISIONS) break;
      const text = sanitize(String(d ?? ""));
      if (!text || seen.has(text)) continue;
      seen.add(text);
      decisions.push({ date, text });
    }
  }

  const taskRows = await db
    .select({ title: tasks.title, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.tenantId, tenantId), eq(tasks.status, "pending"), isNull(tasks.deletedAt)))
    .orderBy(desc(tasks.createdAt))
    .limit(MAX_COMMITMENTS);

  const commitments: DecisionLedger["commitments"] = [];
  for (const t of taskRows) {
    const title = sanitize(t.title ?? "");
    if (!title) continue;
    commitments.push({ title, due: t.dueDate ? isoDay(t.dueDate) || null : null });
  }

  return { decisions, commitments };
}

/** Render the ledger into a prep-context section. "" when empty. */
export function formatDecisionLedger(ledger: DecisionLedger): string {
  if (ledger.decisions.length === 0 && ledger.commitments.length === 0) return "";
  const parts: string[] = ["Decisions & open commitments (across recent meetings):"];
  if (ledger.decisions.length > 0) {
    parts.push(
      "Recent decisions:\n" +
        ledger.decisions.map((d) => `  - ${d.date ? `${d.date}: ` : ""}${d.text}`).join("\n"),
    );
  }
  if (ledger.commitments.length > 0) {
    parts.push(
      "Open commitments:\n" +
        ledger.commitments
          .map((c) => `  - ${c.title}${c.due ? ` (due ${c.due})` : ""}`)
          .join("\n"),
    );
  }
  return parts.join("\n");
}

/** Read + format in one call. "" when the tenant has no ledger yet. */
export async function getDecisionLedgerSection(tenantId: string): Promise<string> {
  return formatDecisionLedger(await getDecisionLedger(tenantId));
}
