/**
 * Spec 37 (B3.2) — prepare one selected prospect for enrollment: ensure its
 * intelligence is current, then generate the signal-grounded copy. PURE WIRING —
 * no research or copy logic here; it composes the existing engines.
 *
 * generateCopyMessage is the un-gated copy core (buildProspectContext → evidence →
 * generateMessage), which itself loads the (cached-or-scraped) intelligence brief
 * and enforces the never-invent floor (segment fallback when no groundable
 * evidence). It is NOT generateShadowCopy (that's gated by COPY_ENGINE_SHADOW +
 * persists a sample) — the autopilot is its own path and wants the message back.
 *
 * Cost discipline (R6.2): called ONLY for the budget-bounded selected set, so worst
 * case is 1 brief (usually cached) + 1 copy generation per prospect.
 *
 * Blast radius: lib/autopilot/* only.
 */

import { buildIntelligenceBrief } from "@/lib/campaign-engine/build-intelligence-brief";
import { generateCopyMessage } from "@/lib/copy/personalization/db-shadow";
import { verifyAndPersistEmailStatus } from "@/lib/contacts/email/persist-verification";

type CopyOutcome = Awaited<ReturnType<typeof generateCopyMessage>>;
type CopyOpts = NonNullable<Parameters<typeof generateCopyMessage>[2]>;

export interface PrepareOptions {
  /**
   * Force a fresh brief scrape (repopulate the 14-day cache) before generating —
   * off by default: the prospect was selected on a daily-fresh priority_score, and
   * forcing 100 scrapes/day/client is the cost we avoid (R6.2). On only when the
   * caller wants same-day signal freshness.
   */
  forceRefresh?: boolean;
  lang?: CopyOpts["lang"];
}

/** Refresh-if-asked, then generate the grounded message. Returns the copy outcome
 *  (ran:false + reason when there's no prospect context). */
export async function prepareProspect(
  tenantId: string,
  contactId: string,
  companyId: string,
  opts: PrepareOptions = {},
): Promise<CopyOutcome> {
  if (opts.forceRefresh) {
    // Repopulate the brief cache so the grounded copy reflects today's signals.
    await buildIntelligenceBrief(companyId, tenantId, contactId, { forceRefresh: true });
  }
  // Spec 17 (A2): verify the recipient domain and persist `email_status` BEFORE the
  // step is sent, so evaluateSend's deliverability gate refuses dead-domain
  // addresses (it reads contacts.email_status; nothing wrote it before). Best-effort
  // — a verification miss must never block the prepare/enroll path.
  await verifyAndPersistEmailStatus(tenantId, contactId).catch(() => {});
  // generateCopyMessage internally builds the (cached-or-fresh) context + enforces
  // never-invent; no flag gate (the cutover flag governs the LIVE send path, not
  // this generation).
  return generateCopyMessage(contactId, tenantId, { lang: opts.lang });
}
