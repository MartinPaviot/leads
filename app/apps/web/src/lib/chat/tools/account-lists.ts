/**
 * Chat/agent tools for account lists — the SERVER-tool layer, so the agent can
 * manage lists and target them in outreach from ANYWHERE (Slack, other pages),
 * not only when the user is on /accounts (that's the page-action layer).
 *
 * Read/CRUD tools wrap the existing tenant-scoped account-lists DB helpers.
 * enrollAccountListInSequence reuses the SAME gate stack as enrollInSequence
 * (eligibility -> suppression -> already-enrolled -> anti-collision) and the
 * SAME HITL approval gate as runSequenceAutopilot (queues for founder review
 * unless the tenant's approval mode auto-allows). It never bypasses a send gate:
 * it only creates enrollment rows; every actual send is gated downstream by
 * evaluateSend (SAFE_MODE targeting, lawful basis, deliverability, identity).
 */
import { db } from "@/db";
import { accountLists, accountListMembers, sequences, sequenceSteps, sequenceEnrollments, contacts, companies } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import {
  listsWithCounts,
  listLiveCount,
  insertMembers,
  isUniqueViolation,
  resolveListRef,
  listMemberContactIds,
  createAccountListWithMembers,
} from "@/lib/accounts/account-lists-db";
import { checkContactEligibility } from "@/lib/sequences/enrollment-eligibility";
import { loadSuppressedEmails } from "@/lib/sequences/suppression";
import { guardEnrollment } from "@/lib/anti-collision/enroll-guard";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { readApprovalMode, enforceAgentApprovalMode } from "@/lib/guardrails/approval-mode";
import { recordAgentAction } from "@/lib/agents/agent-actions";

/** Bound a single bulk list-enroll. The send pipeline rate-limits actual sends;
 * this just keeps one enroll call from creating an unbounded row burst. */
const ENROLL_CANDIDATE_CAP = 500;

const listRef = {
  listId: z.string().optional().describe("The list's id (preferred when known)"),
  listName: z.string().optional().describe("The list's exact name (case-insensitive) — use when the id is unknown"),
};

export function buildAccountListTools(ctx: ToolContext) {
  const { tenantId, userId } = ctx;

  /** Resolve a sequence by id or (case-insensitive) name. Returns an error
   * string for the tool to surface when missing or ambiguous. */
  async function resolveSequence(ref: { sequenceId?: string; sequenceName?: string }) {
    if (ref.sequenceId) {
      const [s] = await db.select({ id: sequences.id, name: sequences.name }).from(sequences)
        .where(and(eq(sequences.id, ref.sequenceId), eq(sequences.tenantId, tenantId))).limit(1);
      return s ?? { error: "Sequence not found." as const };
    }
    const name = ref.sequenceName?.trim();
    if (!name) return { error: "Provide a sequenceId or sequenceName." as const };
    const matches = await db.select({ id: sequences.id, name: sequences.name }).from(sequences)
      .where(and(eq(sequences.tenantId, tenantId), sql`lower(${sequences.name}) = lower(${name})`)).limit(2);
    if (matches.length === 0) return { error: `No sequence named "${name}".` as const };
    if (matches.length > 1) return { error: `Several sequences are named "${name}" — pass the sequenceId.` as const };
    return matches[0];
  }

  return {
    listAccountLists: makeTool({
      description:
        "List the workspace's account lists (curated collections of companies) with their live member counts. Use when the user asks 'what lists do I have', 'show my account lists', or before adding to / enrolling a list.",
      inputSchema: z.object({}),
      execute: async () => ({ lists: await listsWithCounts(tenantId) }),
    }),

    createAccountList: makeTool({
      description:
        "Create a new account list (a named collection of companies). Pass companyIds you've already resolved (e.g. from a search). Names are unique per workspace. Use when the user says 'create a list', 'save these accounts as a list', 'group these companies'.",
      inputSchema: z.object({
        name: z.string().min(1).max(120).describe("List name (unique per workspace)"),
        companyIds: z.array(z.string()).max(50_000).optional().describe("Company ids to seed the list with (optional)"),
      }),
      execute: async (input) => {
        const res = await createAccountListWithMembers(tenantId, input.name.trim(), userId, input.companyIds ?? []);
        if (!res.ok) return { error: `A list named "${input.name.trim()}" already exists.` };
        return { created: res.list };
      },
    }),

    addCompaniesToAccountList: makeTool({
      description:
        "Add companies to an existing account list (resolve it by id or name). Ids are validated against the workspace and de-duped. Use when the user says 'add these to my X list', 'put Acme in Hot Leads'.",
      inputSchema: z.object({
        ...listRef,
        companyIds: z.array(z.string()).min(1).max(50_000).describe("Company ids to add"),
      }),
      execute: async (input) => {
        const list = await resolveListRef(tenantId, input);
        if (!list) return { error: "List not found." };
        await insertMembers(db, list.id, tenantId, input.companyIds);
        return { list: { id: list.id, name: list.name, count: await listLiveCount(list.id, tenantId) } };
      },
    }),

    removeCompaniesFromAccountList: makeTool({
      description:
        "Remove companies from an account list (resolve it by id or name). The companies themselves are kept — only their membership is dropped. Use when the user says 'remove X from the list', 'take Acme out of Hot Leads'.",
      inputSchema: z.object({
        ...listRef,
        companyIds: z.array(z.string()).min(1).max(50_000).describe("Company ids to remove"),
      }),
      execute: async (input) => {
        const list = await resolveListRef(tenantId, input);
        if (!list) return { error: "List not found." };
        const ids = [...new Set(input.companyIds.filter(Boolean))];
        if (ids.length > 0) {
          await db.delete(accountListMembers)
            .where(and(eq(accountListMembers.listId, list.id), inArray(accountListMembers.companyId, ids)));
        }
        return { list: { id: list.id, name: list.name, count: await listLiveCount(list.id, tenantId) } };
      },
    }),

    renameAccountList: makeTool({
      description:
        "Rename an account list (resolve it by id or current name). Names are unique per workspace. Use when the user says 'rename my X list to Y'.",
      inputSchema: z.object({
        ...listRef,
        newName: z.string().min(1).max(120).describe("The new name"),
      }),
      execute: async (input) => {
        const list = await resolveListRef(tenantId, input);
        if (!list) return { error: "List not found." };
        const newName = input.newName.trim();
        if (newName === list.name) return { list: { id: list.id, name: list.name, count: await listLiveCount(list.id, tenantId) } };
        try {
          await db.update(accountLists).set({ name: newName, updatedAt: new Date() }).where(eq(accountLists.id, list.id));
        } catch (e) {
          if (isUniqueViolation(e)) return { error: `A list named "${newName}" already exists.` };
          throw e;
        }
        return { list: { id: list.id, name: newName, count: await listLiveCount(list.id, tenantId) } };
      },
    }),

    deleteAccountList: makeTool({
      description:
        "Delete an account list (resolve it by id or name). The companies in it are KEPT — only the grouping is removed. Destructive (the list is gone). Use when the user says 'delete my X list'.",
      inputSchema: z.object({ ...listRef }),
      execute: async (input) => {
        const list = await resolveListRef(tenantId, input);
        if (!list) return { error: "List not found." };
        await db.delete(accountLists).where(eq(accountLists.id, list.id));
        return { deleted: { id: list.id, name: list.name } };
      },
    }),

    enrollAccountListInSequence: makeTool({
      description:
        "Target an account list in outreach: enroll the list's members' contacts into an existing sequence. Resolve both by id or name. Applies every enrollment gate (no email / soft-deleted / suppressed / anti-ICP-excluded company / already-enrolled / anti-collision) and respects the workspace approval mode — when not auto-approved it QUEUES the enrollment for founder review rather than firing. Use when the user says 'start outreach to my X list', 'enroll Hot Leads in the Q3 sequence', 'target this list'.",
      inputSchema: z.object({
        ...listRef,
        sequenceId: z.string().optional().describe("Sequence id (preferred)"),
        sequenceName: z.string().optional().describe("Sequence name (case-insensitive) when the id is unknown"),
      }),
      execute: async (input) => {
        const list = await resolveListRef(tenantId, input);
        if (!list) return { error: "List not found." };
        const seq = await resolveSequence(input);
        if ("error" in seq) return { error: seq.error };

        const [stepCount] = await db.select({ count: sql<number>`count(*)::int` }).from(sequenceSteps)
          .where(eq(sequenceSteps.sequenceId, seq.id));
        if (!stepCount || Number(stepCount.count) === 0) {
          return { error: "That sequence has no steps — add steps before enrolling." };
        }
        const [firstStep] = await db.select({ delayDays: sequenceSteps.delayDays }).from(sequenceSteps)
          .where(eq(sequenceSteps.sequenceId, seq.id)).orderBy(sequenceSteps.stepNumber).limit(1);
        const firstDelay = firstStep?.delayDays ?? 0;

        // Candidate contacts of the list's live members (capped).
        const candidateIds = await listMemberContactIds(list.id, tenantId, ENROLL_CANDIDATE_CAP + 1);
        const capped = candidateIds.length > ENROLL_CANDIDATE_CAP;
        const ids = candidateIds.slice(0, ENROLL_CANDIDATE_CAP);
        if (ids.length === 0) {
          return { enrolled: 0, skipped: 0, queued: 0, list: list.name, sequence: seq.name, note: "No contactable members in this list." };
        }

        // Batch-load the gate inputs: contact + its company's exclusion, the
        // suppression set, and who's already in this sequence.
        const rows = await db
          .select({ id: contacts.id, email: contacts.email, deletedAt: contacts.deletedAt, companyExcludedReason: companies.excludedReason })
          .from(contacts)
          .leftJoin(companies, eq(contacts.companyId, companies.id))
          .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, ids)));
        const suppressed = await loadSuppressedEmails(tenantId, rows.map((r) => r.email).filter((e): e is string => !!e));
        const already = new Set(
          (await db.select({ contactId: sequenceEnrollments.contactId }).from(sequenceEnrollments)
            .where(and(eq(sequenceEnrollments.sequenceId, seq.id), inArray(sequenceEnrollments.contactId, ids))))
            .map((r) => r.contactId),
        );

        let skipped = 0;
        const eligible: string[] = [];
        for (const r of rows) {
          if (already.has(r.id)) { skipped++; continue; }
          const elig = checkContactEligibility({
            email: r.email,
            deletedAt: r.deletedAt,
            companyExcludedReason: r.companyExcludedReason,
            suppressedReason: r.email && suppressed.has(r.email.toLowerCase()) ? "hard_bounce" : null,
          });
          if (!elig.eligible) { skipped++; continue; }
          eligible.push(r.id);
        }
        // contacts with no row loaded (shouldn't happen — ids came from a join) count as skipped
        skipped += ids.length - rows.length;

        if (eligible.length === 0) {
          return { enrolled: 0, skipped, queued: 0, list: list.name, sequence: seq.name, capped };
        }

        // HITL gate — enrolling a whole list is an outbound bulk action. Defer to
        // the founder's approval mode; queue (don't fire) unless auto-allowed.
        const settings = await getTenantSettings(tenantId);
        const mode = readApprovalMode(settings ?? { agentApprovalMode: "review-each" });
        const gate = enforceAgentApprovalMode({ mode, action: "sequence-enrollment", confidence: 0.9 });
        if (!gate.allowed) {
          await recordAgentAction({
            tenantId,
            userId,
            actionType: "sequence-enrollment",
            awaitingApproval: true,
            payload: { sequenceId: seq.id, sequenceName: seq.name, contactIds: eligible, listId: list.id, listName: list.name, queueAs: gate.queueAs, reason: gate.reason },
          });
          return { deferred: true, queued: eligible.length, enrolled: 0, skipped, list: list.name, sequence: seq.name, capped, reason: gate.reason };
        }

        let enrolled = 0;
        for (const contactId of eligible) {
          const ac = await guardEnrollment({ tenantId, contactId, enrollmentId: `${seq.id}:${contactId}` });
          if (!ac.proceed) { skipped++; continue; }
          const nextStepAt = new Date();
          nextStepAt.setDate(nextStepAt.getDate() + firstDelay);
          await db.insert(sequenceEnrollments).values({ sequenceId: seq.id, contactId, currentStep: 1, nextStepAt }).onConflictDoNothing();
          enrolled++;
        }
        return { enrolled, skipped, queued: 0, list: list.name, sequence: seq.name, capped };
      },
    }),
  };
}
