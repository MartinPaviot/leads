/**
 * Signal → Auto-Sequence Enrollment
 *
 * When a buying signal is detected on a TAM company that has NO open
 * deal, this function auto-enrolls the company's contacts into the
 * tenant's default outbound sequence.
 *
 * This closes the gap: TAM → Signals → ???. Without this, signals
 * are detected but nobody acts on them automatically.
 *
 * Flow:
 * 1. Signal detected on company (no open deal)
 * 2. Find contacts at that company
 * 3. Find the tenant's active outbound sequence
 * 4. Enroll contacts that aren't already enrolled
 * 5. Create a deal at "lead" stage for the company
 */

import { inngest } from "./client";
import { db } from "@/db";
import {
  contacts,
  companies,
  deals,
  sequences,
  sequenceEnrollments,
  notifications,
  users,
} from "@/db/schema";
import { and, eq, notInArray, inArray, desc } from "drizzle-orm";
import { trackPipeline } from "@/lib/analytics/pipeline-tracker";
import { isCompanyEligible } from "@/lib/sequences/enrollment-eligibility";
import { loadSuppressedEmails } from "@/lib/sequences/suppression";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import {
  enforceAgentApprovalMode,
  readApprovalMode,
} from "@/lib/guardrails/approval-mode";
import { recordAgentAction } from "@/lib/agents/agent-actions";

export const signalAutoEnroll = inngest.createFunction(
  {
    id: "signal-auto-enroll",
    retries: 1,
    triggers: [{ event: "signals/auto-enroll" }],
  },
  async ({ event, step }: {
    event: {
      data: {
        tenantId: string;
        companyId: string;
        companyName: string;
        signalType: string;
        signalTitle: string;
      };
    };
    step: any;
  }) => {
    const { tenantId, companyId, companyName, signalType, signalTitle } = event.data;

    // 1. Check: does this company already have an open deal?
    const existingDeal = await step.run("check-existing-deal", async () => {
      const [deal] = await db
        .select({ id: deals.id })
        .from(deals)
        .where(
          and(
            eq(deals.tenantId, tenantId),
            eq(deals.companyId, companyId),
            notInArray(deals.stage, ["won", "lost"]),
          ),
        )
        .limit(1);
      return deal || null;
    });

    if (existingDeal) {
      return { skipped: true, reason: "Company already has open deal", dealId: existingDeal.id };
    }

    // 1.5 Anti-ICP gate (B1, _specs/pilae-machine). A flagged company
    //     must not auto-enrol even when a fresh signal fires — the
    //     anti-ICP rule overrides the kairos accelerator.
    const companyEligibility = await step.run("check-company-eligibility", async () => {
      const [c] = await db
        .select({
          excludedReason: companies.excludedReason,
          deletedAt: companies.deletedAt,
        })
        .from(companies)
        .where(
          and(eq(companies.id, companyId), eq(companies.tenantId, tenantId)),
        )
        .limit(1);
      return c ?? { excludedReason: null, deletedAt: null };
    });

    if (!isCompanyEligible(companyEligibility)) {
      return {
        skipped: true,
        reason: companyEligibility.excludedReason
          ? `Company excluded (${companyEligibility.excludedReason})`
          : "Company soft-deleted",
      };
    }

    // 2. Find contacts at this company
    const companyContacts = await step.run("find-contacts", async () => {
      return db
        .select({ id: contacts.id, email: contacts.email, firstName: contacts.firstName })
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, tenantId),
            eq(contacts.companyId, companyId),
          ),
        )
        .limit(5); // Max 5 contacts per company auto-enrollment
    });

    if (companyContacts.length === 0) {
      return { skipped: true, reason: "No contacts at this company" };
    }

    // Filter to contacts with email
    let enrollableContacts = companyContacts.filter((c: { id: string; email: string | null }) => c.email);
    if (enrollableContacts.length === 0) {
      return { skipped: true, reason: "No contacts with email addresses" };
    }

    // P0-5 — drop addresses on the tenant suppression-list (bounce/complaint/opt-out)
    // BEFORE recording a doomed pending enrollment. step.run keeps it idempotent.
    enrollableContacts = await step.run("filter-suppressed", async () => {
      const suppressedSet = await loadSuppressedEmails(
        tenantId,
        enrollableContacts.map((c: { email: string | null }) => c.email),
      );
      return enrollableContacts.filter(
        (c: { email: string | null }) => !(c.email && suppressedSet.has(c.email.toLowerCase())),
      );
    });
    if (enrollableContacts.length === 0) {
      return { skipped: true, reason: "All contacts suppressed (bounce/complaint/opt-out)" };
    }

    // 3. Find an active outbound sequence for this tenant whose
    //    trigger config matches the signal type (P0-2 follow-up).
    //    Sequences with no triggerSignalTypes match all signals
    //    (backwards-compat) ; configured sequences only match
    //    their whitelist.
    const activeSequence = await step.run("find-sequence", async () => {
      const candidates = await db
        .select({
          id: sequences.id,
          name: sequences.name,
          icpId: sequences.icpId,
          campaignConfig: sequences.campaignConfig,
        })
        .from(sequences)
        .where(
          and(
            eq(sequences.tenantId, tenantId),
            eq(sequences.status, "active"),
          ),
        )
        .orderBy(desc(sequences.createdAt));

      // Multi-ICP routing (Phase 3): if the company has a primary ICP
      // and an active sequence is bound to it, that wins — the message
      // is tuned to the segment. Falls back to the signal-trigger
      // picker below when there's no ICP-bound sequence.
      const [companyRow] = await db
        .select({ properties: companies.properties })
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.tenantId, tenantId)))
        .limit(1);
      const primaryIcpId =
        ((companyRow?.properties as Record<string, unknown> | null)?.primaryIcpId as
          | string
          | null
          | undefined) ?? null;

      const { pickIcpScopedSequence } = await import(
        "@/lib/icp/enrollment-routing"
      );
      const icpRoute = pickIcpScopedSequence(
        primaryIcpId,
        candidates.map((c) => ({ id: c.id, icpId: c.icpId ?? null })),
      );
      if (icpRoute.reason === "primary_icp_match" && icpRoute.sequenceId) {
        const match = candidates.find((c) => c.id === icpRoute.sequenceId);
        if (match) return { id: match.id, name: match.name };
      }

      const { pickSequenceForSignal } = await import(
        "@/lib/sequences/triggers"
      );
      const picked = pickSequenceForSignal(
        candidates.map((c) => ({
          id: c.id,
          name: c.name,
          campaignConfig: (c.campaignConfig as Record<string, unknown> | null) ?? null,
        })),
        signalType,
      );
      return picked ? { id: picked.id, name: picked.name } : null;
    });

    if (!activeSequence) {
      return { skipped: true, reason: "No active sequence found for tenant" };
    }

    // 4. Check which contacts are already enrolled
    const contactIds = enrollableContacts.map((c: { id: string }) => c.id);
    const alreadyEnrolled = await step.run("check-enrolled", async () => {
      const enrolled = await db
        .select({ contactId: sequenceEnrollments.contactId })
        .from(sequenceEnrollments)
        .where(
          and(
            eq(sequenceEnrollments.sequenceId, activeSequence.id),
            inArray(sequenceEnrollments.contactId, contactIds),
          ),
        );
      return new Set(enrolled.map((e) => e.contactId));
    });

    const toEnroll = enrollableContacts.filter((c: { id: string }) => !alreadyEnrolled.has(c.id));
    if (toEnroll.length === 0) {
      return { skipped: true, reason: "All contacts already enrolled" };
    }

    // 4.5 CLE-13 (item 2): approval gate via the SINGLE authority. Runs AFTER
    // all eligibility checks (open deal, anti-ICP, contacts-with-email, active
    // sequence, not-already-enrolled) and BEFORE the first write, so an
    // ineligible signal is still cheaply short-circuited and a gated one
    // produces no partial enrollment (AC-2.5). `sequence-enrollment` is
    // outbound + confirm:always in CLE-10's metadata, so decideAction returns
    // confirm/queue under EVERY mode — it never auto-executes inline (AC-2.1-2.4,
    // CLE-10 design §6.1). On any non-execute disposition we DEFER: record a
    // pending agent action in the "Needs you" lane and skip the enroll/deal/notify.
    const gate = await step.run("approval-gate", async () => {
      const settings = await getTenantSettings(tenantId);
      const mode = readApprovalMode(settings ?? { agentApprovalMode: "review-each" });
      // A fresh buying signal is high-confidence, but confidence only affects
      // the reason text here — outbound+confirm:always never flips to execute.
      return enforceAgentApprovalMode({
        mode,
        action: "sequence-enrollment",
        confidence: 0.9,
      });
    });

    if (!gate.allowed) {
      await step.run("defer-enroll", async () => {
        await recordAgentAction({
          tenantId,
          actionType: "sequence-enrollment",
          awaitingApproval: true,
          payload: {
            companyId,
            companyName,
            signalType,
            signalTitle,
            sequenceId: activeSequence.id,
            sequenceName: activeSequence.name,
            contactIds: toEnroll.map((c: { id: string }) => c.id),
            queueAs: gate.queueAs,
            reason: gate.reason,
          },
        });
      });
      return {
        skipped: true,
        deferred: true,
        reason: `Enrollment gated: ${gate.reason}`,
      };
    }

    // 5. Enroll contacts (only reached when the authority returns execute).
    let enrolled = 0;
    await step.run("enroll-contacts", async () => {
      for (const contact of toEnroll) {
        await db.insert(sequenceEnrollments).values({
          sequenceId: activeSequence.id,
          contactId: contact.id,
          status: "active",
          currentStep: 1,
          nextStepAt: new Date(), // Immediate first step
        });
        enrolled++;
      }
    });

    await step.run("track-enrolled", async () => {
      for (const contact of toEnroll) {
        await trackPipeline({
          tenantId,
          companyId,
          contactId: contact.id,
          stage: "enrolled",
          sourceSystem: "inngest",
          metadata: { signalType, sequenceId: activeSequence.id, sequenceName: activeSequence.name },
        });
      }
    });

    // 6. Create a deal for this company at "lead" stage
    const newDeal = await step.run("create-deal", async () => {
      const [deal] = await db
        .insert(deals)
        .values({
          tenantId,
          companyId,
          name: `${companyName} — ${signalType}`,
          stage: "lead",
          summary: `Auto-created from ${signalType} signal: ${signalTitle}`,
        })
        .returning({ id: deals.id });
      return deal;
    });

    if (newDeal?.id) {
      await step.run("track-deal-created", async () => {
        await trackPipeline({
          tenantId,
          companyId,
          dealId: newDeal.id,
          stage: "deal_created",
          sourceSystem: "inngest",
          metadata: { signalType, signalTitle, dealName: `${companyName} — ${signalType}` },
        });
      });
    }

    // 7. Notify the user
    await step.run("notify", async () => {
      const tenantUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.tenantId, tenantId))
        .limit(3);

      for (const u of tenantUsers) {
        await db.insert(notifications).values({
          tenantId,
          userId: u.id,
          type: "system",
          title: `Auto-enrolled ${enrolled} contact${enrolled > 1 ? "s" : ""} from ${companyName}`,
          body: `Signal: ${signalTitle}\nSequence: ${activeSequence.name}\nDeal created: ${companyName}`,
          entityType: "deal",
          entityId: newDeal?.id || null,
        });
      }
    });

    return {
      companyId,
      companyName,
      enrolled,
      sequenceId: activeSequence.id,
      sequenceName: activeSequence.name,
      dealId: newDeal?.id,
      signalType,
    };
  },
);
