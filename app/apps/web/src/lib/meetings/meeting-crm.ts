/**
 * Meeting → CRM qualification writer.
 *
 * A recorded meeting feeds the SAME qualification a call does. This writes the
 * MEDDPICC spine + evidence onto the linked deal, the account intel onto the
 * company, and the contact's buying-group profile onto the contact — through
 * the same human-in-the-loop review seam (getCaptureApprovalMode) and the SAME
 * property keys the call path writes (lib/voice/post-call-crm.ts). So the
 * existing call-intel.tsx surfaces (MeddpiccScorecard, AccountCallIntel,
 * ContactCallProfile) and POST /api/call-intel/review work unchanged whether the
 * qualification came from a dial-out call or a recorded meeting.
 *
 * It does NOT route deals (create / advance / close) — a meeting is a touch on
 * an existing opportunity, and processPostCall already owns tasks + the silent
 * extractedIntel / meetingIntel writes the deal & account detail pages read.
 */

import { db } from "@/db";
import { deals, companies, contacts, tenants } from "@/db/schema";
import { and, eq, isNull, inArray, desc } from "drizzle-orm";
import { getCaptureApprovalMode, getFieldApprovalMode, type CaptureApprovalMode } from "@/lib/capture/approval";
import type { MeetingNotes } from "./notes-schema";

const OPEN_STAGES = ["lead", "qualification", "demo", "trial", "proposal", "negotiation"] as const;

export interface MeetingCrmTargets {
  dealId: string | null;
  companyId: string | null;
  contactId: string | null;
}

/**
 * Resolve which deal / company / contact a meeting's qualification attaches to.
 * Shared by the writer and GET /api/meetings/[id]/notes so the page shows the
 * exact record the writer wrote to.
 *   - deal: the stamped meta.dealId wins; else the newest OPEN deal for the
 *     contact's company (read-only — never created here).
 *   - company: the deal's company, else the contact's company.
 */
export async function resolveMeetingCrmTargets(
  tenantId: string,
  input: { dealId?: string | null; contactId?: string | null },
): Promise<MeetingCrmTargets> {
  const contactId = input.contactId && input.contactId !== "unknown" ? input.contactId : null;

  let contactCompanyId: string | null = null;
  if (contactId) {
    const [c] = await db
      .select({ companyId: contacts.companyId })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)))
      .limit(1);
    contactCompanyId = c?.companyId ?? null;
  }

  let dealId: string | null = null;
  let dealCompanyId: string | null = null;
  if (input.dealId) {
    const [d] = await db
      .select({ id: deals.id, companyId: deals.companyId })
      .from(deals)
      .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, tenantId), isNull(deals.deletedAt)))
      .limit(1);
    if (d) {
      dealId = d.id;
      dealCompanyId = d.companyId;
    }
  }
  if (!dealId && contactCompanyId) {
    const [d] = await db
      .select({ id: deals.id, companyId: deals.companyId })
      .from(deals)
      .where(and(
        eq(deals.tenantId, tenantId),
        eq(deals.companyId, contactCompanyId),
        isNull(deals.deletedAt),
        inArray(deals.stage, [...OPEN_STAGES]),
      ))
      .orderBy(desc(deals.updatedAt))
      .limit(1);
    if (d) {
      dealId = d.id;
      dealCompanyId = d.companyId;
    }
  }

  return { dealId, companyId: dealCompanyId ?? contactCompanyId, contactId };
}

// ── Pure field mapping (testable, no DB) ────────────────────────────────────

export interface MeetingQualificationWrites {
  meddic: Record<string, unknown> | null;
  evidence: Array<{ claim: string; quote: string }>;
  callIntel: Record<string, unknown> | null;
  callProfile: Record<string, unknown> | null;
  /** Buying signals written LIVE on the deal (ungated, like the call path) so the
   *  BANT / SPIN lenses populate for meeting-sourced deals. */
  buyingSignals: Record<string, unknown> | null;
}

/**
 * Turn extracted meeting notes into the exact property payloads the call-intel
 * surfaces read. Pure — no DB. Defensive against legacy notes (pre-Slice-2
 * meetings lack meddic / contactProfile / evidence / initiatives).
 */
export function buildMeetingQualificationWrites(
  notes: Partial<Pick<MeetingNotes, "meddic" | "evidence" | "buyingSignals" | "contactProfile">>,
  stamp: { meetingId: string; at: string },
): MeetingQualificationWrites {
  const bs = (notes.buyingSignals ?? {}) as Partial<MeetingNotes["buyingSignals"]>;
  const stack = Array.isArray(bs.currentStack) ? bs.currentStack : [];
  const competitors = Array.isArray(bs.competitors) ? bs.competitors : [];
  const initiatives = Array.isArray(bs.initiatives) ? bs.initiatives : [];
  const teamSize = bs.teamSize ?? null;
  const painPoints = Array.isArray(bs.painPoints) ? bs.painPoints : [];
  const nextSteps = Array.isArray(bs.nextSteps) ? bs.nextSteps : [];
  const budget = bs.budget ?? null;
  const timeline = bs.timeline ?? null;

  const meddic = notes.meddic
    ? {
        ...notes.meddic,
        competition: competitors,
        updatedFromMeetingId: stamp.meetingId,
        updatedAt: stamp.at,
      }
    : null;

  const evidence = (Array.isArray(notes.evidence) ? notes.evidence : []).slice(0, 12);

  const hasAccountIntel = stack.length > 0 || competitors.length > 0 || !!teamSize || initiatives.length > 0;
  const callIntel = hasAccountIntel
    ? { stack, competitors, teamSize, initiatives, updatedFromMeetingId: stamp.meetingId, updatedAt: stamp.at }
    : null;

  const callProfile = notes.contactProfile
    ? { ...notes.contactProfile, updatedFromMeetingId: stamp.meetingId, updatedAt: stamp.at }
    : null;

  const buyingSignals =
    budget || timeline || painPoints.length || nextSteps.length || stack.length || competitors.length || teamSize || initiatives.length
      ? { budget, timeline, painPoints, nextSteps, competitors, teamSize, currentStack: stack, initiatives, updatedFromMeetingId: stamp.meetingId, updatedAt: stamp.at }
      : null;

  return { meddic, evidence, callIntel, callProfile, buyingSignals };
}

// ── Writer ──────────────────────────────────────────────────────────────────

export interface ApplyMeetingQualificationArgs {
  tenantId: string;
  meetingId: string;
  notes: MeetingNotes;
  occurredAt: Date;
  /** The deal stamped on the meeting, if any. */
  dealId?: string | null;
  /** The meeting's contact (activity.entityId when entityType==='contact'). */
  contactId?: string | null;
}

export interface ApplyMeetingQualificationResult {
  mode: CaptureApprovalMode;
  dealWritten: boolean;
  companyWritten: boolean;
  contactWritten: boolean;
  targets: MeetingCrmTargets;
}

/**
 * Write the meeting's qualification to the CRM through the review seam. In
 * 'auto' (default) it lands on the live keys (meddic / evidence / callIntel /
 * callProfile); in 'review' it lands on pending* keys, approved / dismissed on
 * the fiche via /api/call-intel/review — identical to the call path.
 */
export async function applyMeetingQualificationToCrm(
  args: ApplyMeetingQualificationArgs,
): Promise<ApplyMeetingQualificationResult> {
  const { tenantId, meetingId, notes, occurredAt } = args;

  const [tenantRow] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const settings = tenantRow?.settings as Record<string, unknown> | null;
  // Per-field auto/review (Claap's hybrid workflow): each fact follows its own
  // mode, so review can wait on MEDDPICC while account intel syncs live.
  const mKey = getFieldApprovalMode(settings, "meddic") === "review" ? "pendingMeddic" : "meddic";
  const eKey = getFieldApprovalMode(settings, "evidence") === "review" ? "pendingEvidence" : "evidence";
  const ciKey = getFieldApprovalMode(settings, "callIntel") === "review" ? "pendingCallIntel" : "callIntel";
  const cpKey = getFieldApprovalMode(settings, "callProfile") === "review" ? "pendingCallProfile" : "callProfile";

  const targets = await resolveMeetingCrmTargets(tenantId, { dealId: args.dealId, contactId: args.contactId });
  const writes = buildMeetingQualificationWrites(notes, { meetingId, at: occurredAt.toISOString() });

  const result: ApplyMeetingQualificationResult = {
    mode: getCaptureApprovalMode(settings),
    dealWritten: false,
    companyWritten: false,
    contactWritten: false,
    targets,
  };

  // Deal — MEDDPICC + evidence (review-gated) + buying signals (live, like the
  // call path, so the BANT / SPIN lenses populate for meeting-sourced deals).
  if (targets.dealId && (writes.meddic || writes.evidence.length > 0 || writes.buyingSignals)) {
    const [deal] = await db
      .select({ properties: deals.properties })
      .from(deals)
      .where(and(eq(deals.id, targets.dealId), eq(deals.tenantId, tenantId), isNull(deals.deletedAt)))
      .limit(1);
    if (deal) {
      const next = { ...((deal.properties as Record<string, unknown>) || {}) };
      if (writes.meddic) next[mKey] = writes.meddic;
      if (writes.evidence.length > 0) next[eKey] = writes.evidence;
      if (writes.buyingSignals) next.buyingSignals = writes.buyingSignals;
      await db
        .update(deals)
        .set({ properties: next, updatedAt: occurredAt })
        .where(and(eq(deals.id, targets.dealId), eq(deals.tenantId, tenantId)));
      result.dealWritten = true;
    }
  }

  // Company — account intel (merge with prior, like the call path)
  if (targets.companyId && writes.callIntel) {
    const [co] = await db
      .select({ properties: companies.properties })
      .from(companies)
      .where(and(eq(companies.id, targets.companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)))
      .limit(1);
    if (co) {
      const cprops = { ...((co.properties as Record<string, unknown>) || {}) };
      const prev = (cprops[ciKey] as Record<string, unknown>) || {};
      const ci = writes.callIntel;
      cprops[ciKey] = {
        ...prev,
        stack: (ci.stack as string[]).length ? ci.stack : prev.stack ?? [],
        competitors: (ci.competitors as string[]).length ? ci.competitors : prev.competitors ?? [],
        teamSize: ci.teamSize ?? prev.teamSize ?? null,
        initiatives: (ci.initiatives as string[]).length ? ci.initiatives : prev.initiatives ?? [],
        updatedFromMeetingId: meetingId,
        updatedAt: occurredAt.toISOString(),
      };
      await db
        .update(companies)
        .set({ properties: cprops, updatedAt: occurredAt })
        .where(and(eq(companies.id, targets.companyId), eq(companies.tenantId, tenantId)));
      result.companyWritten = true;
    }
  }

  // Contact — buying-group profile
  if (targets.contactId && writes.callProfile) {
    const [c] = await db
      .select({ properties: contacts.properties })
      .from(contacts)
      .where(and(eq(contacts.id, targets.contactId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)))
      .limit(1);
    if (c) {
      const props = { ...((c.properties as Record<string, unknown>) || {}) };
      props[cpKey] = writes.callProfile;
      await db
        .update(contacts)
        .set({ properties: props, updatedAt: occurredAt })
        .where(and(eq(contacts.id, targets.contactId), eq(contacts.tenantId, tenantId)));
      result.contactWritten = true;
    }
  }

  return result;
}
