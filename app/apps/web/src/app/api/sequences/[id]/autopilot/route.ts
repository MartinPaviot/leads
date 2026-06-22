import { getAuthContext } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/db";
import { sequences, sequenceSteps, sequenceEnrollments, contacts, companies } from "@/db/schema";
import { eq, sql, and, isNotNull, gte, isNull } from "drizzle-orm";
import { checkContactEligibility } from "@/lib/sequences/enrollment-eligibility";
import { loadSuppressedEmails } from "@/lib/sequences/suppression";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { readApprovalMode, enforceAgentApprovalMode } from "@/lib/guardrails/approval-mode";
import { recordAgentAction } from "@/lib/agents/agent-actions";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Bulk-enrolling contacts triggers real outbound — execute-gated.
  const denied = requirePermission(authCtx.role, "sequences:execute");
  if (denied) return denied;

  const { id } = await params;

  try {
    // Verify sequence exists, belongs to tenant, and has steps
    const [sequence] = await db
      .select()
      .from(sequences)
      .where(and(eq(sequences.id, id), eq(sequences.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!sequence) {
      return Response.json({ error: "Sequence not found" }, { status: 404 });
    }

    const [stepCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id));

    if (!stepCount || Number(stepCount.count) === 0) {
      return Response.json({ error: "Sequence has no steps" }, { status: 400 });
    }

    const body = await req.json();
    const minScore = body.minScore ?? 50;
    const maxEnroll = Math.min(body.maxEnroll ?? 20, 100);

    // Get already enrolled contact IDs
    const enrolled = await db
      .select({ contactId: sequenceEnrollments.contactId })
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.sequenceId, id));
    const enrolledIds = new Set(enrolled.map((e) => e.contactId));

    // Candidate contacts: tenant, has email, score >= minScore, not soft-deleted.
    // leftJoin companies so we can enforce the anti-ICP `excluded_reason` gate —
    // autopilot auto-SELECTS contacts the founder never vetted individually, so it
    // MUST run the same eligibility check as /enroll, otherwise a flagged company's
    // contacts get bulk-enrolled (anti-ICP bypass). See enrollment-eligibility.ts.
    const candidates = await db
      .select({
        id: contacts.id,
        email: contacts.email,
        deletedAt: contacts.deletedAt,
        companyExcludedReason: companies.excludedReason,
      })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(
        and(
          eq(contacts.tenantId, authCtx.tenantId),
          isNotNull(contacts.email),
          gte(contacts.score, minScore),
          isNull(contacts.deletedAt)
        )
      )
      .orderBy(sql`${contacts.score} DESC NULLS LAST`)
      .limit(maxEnroll * 2); // fetch extra to account for already-enrolled / ineligible

    // P0-5 — load the tenant suppression-list once; never enroll a burned address.
    const suppressedSet = await loadSuppressedEmails(authCtx.tenantId, candidates.map((c) => c.email));

    // Filter to the eligible, not-yet-enrolled set (capped at maxEnroll).
    const toEnroll: string[] = [];
    let skippedCount = 0;
    for (const contact of candidates) {
      if (toEnroll.length >= maxEnroll) break;
      if (enrolledIds.has(contact.id)) {
        skippedCount++;
        continue;
      }
      const eligibility = checkContactEligibility({
        email: contact.email,
        deletedAt: contact.deletedAt,
        companyExcludedReason: contact.companyExcludedReason,
        suppressedReason: contact.email && suppressedSet.has(contact.email.toLowerCase()) ? "hard_bounce" : null,
      });
      if (!eligibility.eligible) {
        skippedCount++;
        continue;
      }
      toEnroll.push(contact.id);
    }

    if (toEnroll.length === 0) {
      return Response.json({
        success: true,
        enrolled: 0,
        queued: 0,
        skipped: skippedCount,
        eligible: candidates.length,
      });
    }

    // HITL gate via the single approval authority. `sequence-enrollment` is
    // outbound + confirm:always (CLE-10), so this NEVER returns allowed:true —
    // auto-selected enrollment must not go live without the founder's per-item
    // approval. We DEFER: record one pending agent action carrying the eligible
    // contactIds; approving it in the "Needs you" lane runs the already-trusted
    // executor (action-executors.ts → sequence-enrollment), which re-validates
    // tenant + soft-delete and enrolls. Mirrors inngest/signal-to-sequence.ts.
    const settings = await getTenantSettings(authCtx.tenantId);
    const mode = readApprovalMode(settings ?? { agentApprovalMode: "review-each" });
    const gate = enforceAgentApprovalMode({
      mode,
      action: "sequence-enrollment",
      confidence: 0.9,
    });

    if (!gate.allowed) {
      await recordAgentAction({
        tenantId: authCtx.tenantId,
        userId: authCtx.userId,
        actionType: "sequence-enrollment",
        awaitingApproval: true,
        payload: {
          sequenceId: id,
          sequenceName: sequence.name,
          contactIds: toEnroll,
          queueAs: gate.queueAs,
          reason: gate.reason,
        },
      });
      return Response.json({
        success: true,
        deferred: true,
        queued: toEnroll.length,
        enrolled: 0,
        skipped: skippedCount,
        eligible: candidates.length,
        reason: gate.reason,
      });
    }

    // Only reachable if the authority ever lets sequence-enrollment auto-execute
    // (it does not today). Enrolls the SAME eligibility-filtered set — never the
    // raw candidates — so the anti-ICP gate holds on this path too.
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id))
      .orderBy(sequenceSteps.stepNumber)
      .limit(1);
    const firstStepDelay = steps[0]?.delayDays || 0;

    let enrolledCount = 0;
    for (const contactId of toEnroll) {
      const nextStepAt = new Date();
      nextStepAt.setDate(nextStepAt.getDate() + firstStepDelay);
      await db
        .insert(sequenceEnrollments)
        .values({ sequenceId: id, contactId, currentStep: 1, nextStepAt });
      enrolledCount++;
    }

    return Response.json({
      success: true,
      enrolled: enrolledCount,
      queued: 0,
      skipped: skippedCount,
      eligible: candidates.length,
    });
  } catch (error) {
    console.error("Autopilot enrollment failed:", error);
    return Response.json({ error: "Autopilot enrollment failed" }, { status: 500 });
  }
}
