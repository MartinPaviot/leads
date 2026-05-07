/**
 * Fan-out events emitted after a visit is identified (P0-2 task 2.3).
 *
 * Pure : decides which events to emit + their payloads. The
 * Inngest worker dispatches via `inngest.send` ; tests inject a
 * recording stub so we assert the contract without spinning Inngest.
 *
 * Three event flows :
 *
 *   1. NEW COMPANY → `company/created`
 *      Emitted when the upsert created a fresh `companies` row
 *      (no prior match for this tenant + domain). Triggers the
 *      existing enrichment pipeline (Apollo + LLM fallback).
 *
 *   2. ALL IDENTIFIED VISITS → `signals/auto-enroll`
 *      Emitted regardless of new-or-existing company. The
 *      signal-to-sequence worker decides whether to actually
 *      enroll contacts based on : open deal exists? recent
 *      signal? sequence trigger configured? Treating a website
 *      visit as a "high-intent visit" signal lets the existing
 *      auto-enrollment plumbing pick it up without rewrites.
 *
 *   3. CACHED HITS → no fan-out
 *      Dedup hits already had their fan-out the first time
 *      around. Re-emitting would spam the enrolment worker.
 */

export interface FanoutInput {
  tenantId: string;
  companyId: string;
  companyDomain: string;
  companyName: string | null;
  visitId: string;
  /** True when the upsert path inserted a new `companies` row. */
  isNewCompany: boolean;
  /** True when this identification was a dedup-cache hit. */
  fromCache: boolean;
  /** Visit URL — used for the signal title. */
  url?: string | null;
}

export interface FanoutEvent {
  name: string;
  data: Record<string, unknown>;
}

export function planFanout(input: FanoutInput): FanoutEvent[] {
  if (input.fromCache) return [];

  const events: FanoutEvent[] = [];

  if (input.isNewCompany) {
    events.push({
      name: "company/created",
      data: {
        companyId: input.companyId,
        tenantId: input.tenantId,
      },
    });
  }

  events.push({
    name: "signals/auto-enroll",
    data: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      companyName: input.companyName ?? input.companyDomain,
      signalType: "website_visit",
      signalTitle: buildSignalTitle(input),
      // Surfaced for the audit trail — the auto-enroll worker
      // logs this so the dashboard can show "enrolled because
      // they visited /pricing".
      sourceVisitId: input.visitId,
      sourceUrl: input.url ?? null,
    },
  });

  return events;
}

function buildSignalTitle(input: FanoutInput): string {
  const subject = input.companyName ?? input.companyDomain;
  if (input.url) {
    const path = extractPath(input.url);
    if (path) {
      return `${subject} visited ${path}`;
    }
  }
  return `${subject} visited the website`;
}

function extractPath(url: string): string | null {
  // Tolerate raw paths ("/pricing") and full URLs.
  if (url.startsWith("/")) return url;
  try {
    const u = new URL(url);
    return u.pathname || null;
  } catch {
    return null;
  }
}
