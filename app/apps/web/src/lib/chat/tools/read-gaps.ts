/**
 * Read-gap tools — surfaces the chat couldn't see before.
 *
 * The registry could query contacts/accounts/deals/activities but had blind
 * spots the product depends on: outbound sequences (campaigns), mailbox
 * sending health, and proposals. Without these the chat can't answer "how are
 * my campaigns doing", "why aren't my emails sending", or "list my proposals".
 *
 * All read-only, tenant-scoped. Mailbox health is personal (admins see the
 * whole workspace) — mailboxes are per-owner, so a member only sees their own.
 */

import { db } from "@/db";
import {
  sequences,
  sequenceSteps,
  sequenceEnrollments,
  connectedMailboxes,
  proposals,
  proposalTemplates,
  deals,
} from "@/db/schema";
import { and, eq, desc, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { appToAuthUserId } from "@/lib/auth/user-id";
import { makeTool, type ToolContext } from "./context";

const SEQUENCE_STATUSES = ["draft", "active", "paused", "archived"] as const;
type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

export function buildReadGapTools(ctx: ToolContext) {
  const { tenantId, userId, authCtx } = ctx;
  const isAdmin = authCtx.role === "admin";

  return {
    querySequences: makeTool({
      description:
        "List the workspace's outreach sequences (campaigns) with status, number of steps, and enrollment counts broken down by state (active/replied/completed/paused/bounced/unsubscribed). Use for 'how are my campaigns doing', 'list my sequences', 'which sequences are running'. Read-only.",
      inputSchema: z.object({
        status: z
          .string()
          .optional()
          .describe("Filter by status: draft | active | paused | archived"),
        limit: z.number().optional().describe("Max sequences to return (default 25, max 100)"),
      }),
      execute: async (input) => {
        const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
        const statusFilter =
          input.status && (SEQUENCE_STATUSES as readonly string[]).includes(input.status)
            ? (input.status as SequenceStatus)
            : undefined;

        const where = statusFilter
          ? and(eq(sequences.tenantId, tenantId), eq(sequences.status, statusFilter))
          : eq(sequences.tenantId, tenantId);

        const rows = await db
          .select({
            id: sequences.id,
            name: sequences.name,
            status: sequences.status,
            updatedAt: sequences.updatedAt,
          })
          .from(sequences)
          .where(where)
          .orderBy(desc(sequences.updatedAt))
          .limit(limit);

        if (rows.length === 0) {
          return {
            sequences: [],
            total: 0,
            message: statusFilter
              ? `No ${statusFilter} sequences.`
              : "No sequences yet. Create one from the Sequences page or ask me to draft a campaign.",
          };
        }

        const ids = rows.map((r) => r.id);

        const stepCounts = await db
          .select({ sequenceId: sequenceSteps.sequenceId, count: sql<number>`count(*)` })
          .from(sequenceSteps)
          .where(inArray(sequenceSteps.sequenceId, ids))
          .groupBy(sequenceSteps.sequenceId);
        const stepMap = new Map(stepCounts.map((s) => [s.sequenceId, Number(s.count)]));

        const enrollCounts = await db
          .select({
            sequenceId: sequenceEnrollments.sequenceId,
            status: sequenceEnrollments.status,
            count: sql<number>`count(*)`,
          })
          .from(sequenceEnrollments)
          .where(inArray(sequenceEnrollments.sequenceId, ids))
          .groupBy(sequenceEnrollments.sequenceId, sequenceEnrollments.status);
        const enrollMap = new Map<string, Record<string, number>>();
        for (const e of enrollCounts) {
          const m = enrollMap.get(e.sequenceId) ?? {};
          m[e.status ?? "unknown"] = Number(e.count);
          enrollMap.set(e.sequenceId, m);
        }

        return {
          sequences: rows.map((r) => {
            const byStatus = enrollMap.get(r.id) ?? {};
            const totalEnrolled = Object.values(byStatus).reduce((a, b) => a + b, 0);
            return {
              id: r.id,
              name: r.name,
              status: r.status,
              steps: stepMap.get(r.id) ?? 0,
              enrolled: { total: totalEnrolled, ...byStatus },
              updatedAt: r.updatedAt,
              _sourceLink: `/sequences/${r.id}`,
            };
          }),
          total: rows.length,
        };
      },
    }),

    getMailboxHealth: makeTool({
      description:
        "Report connected mailbox health for sending: address, provider, status (warming_up/active/paused/disabled/error), health score, today's send usage vs daily limit, 7-day bounce/reply counts, and warmup state. Use for 'is my email connected', 'why aren't my emails sending', 'mailbox health'. Shows your own mailboxes (admins see the whole workspace). Read-only.",
      inputSchema: z.object({}),
      execute: async () => {
        const authUserId = await appToAuthUserId(userId);
        const where = isAdmin
          ? eq(connectedMailboxes.tenantId, tenantId)
          : and(
              eq(connectedMailboxes.tenantId, tenantId),
              eq(connectedMailboxes.userId, authUserId ?? "__none__"),
            );

        const rows = await db
          .select({
            emailAddress: connectedMailboxes.emailAddress,
            provider: connectedMailboxes.provider,
            status: connectedMailboxes.status,
            healthScore: connectedMailboxes.healthScore,
            dailyLimit: connectedMailboxes.dailyLimit,
            sentToday: connectedMailboxes.sentToday,
            sentTotal: connectedMailboxes.sentTotal,
            bounceCount7d: connectedMailboxes.bounceCount7d,
            replyCount7d: connectedMailboxes.replyCount7d,
            warmupCompletedAt: connectedMailboxes.warmupCompletedAt,
          })
          .from(connectedMailboxes)
          .where(where)
          .orderBy(desc(connectedMailboxes.healthScore));

        if (rows.length === 0) {
          return {
            mailboxes: [],
            total: 0,
            message: isAdmin
              ? "No mailboxes connected in this workspace. Connect one at /settings/mailboxes."
              : "You have no mailbox connected. Connect one at /settings/mailboxes to send from your own address.",
          };
        }

        const mailboxes = rows.map((r) => ({
          email: r.emailAddress,
          provider: r.provider,
          status: r.status,
          healthScore: r.healthScore,
          sendUsage: `${r.sentToday}/${r.dailyLimit} today`,
          sentTotal: r.sentTotal,
          bounces7d: r.bounceCount7d,
          replies7d: r.replyCount7d,
          warmedUp: !!r.warmupCompletedAt,
        }));

        const needsAttention = mailboxes
          .filter(
            (m) => m.status === "error" || m.status === "disabled" || (m.healthScore ?? 100) < 70,
          )
          .map((m) => ({ email: m.email, status: m.status, healthScore: m.healthScore }));

        return {
          mailboxes,
          total: mailboxes.length,
          activeCount: mailboxes.filter((m) => m.status === "active").length,
          needsAttention,
          scope: isAdmin ? "workspace" : "you",
        };
      },
    }),

    queryProposals: makeTool({
      description:
        "List generated proposals (filled documents) or proposal templates with their status. Use for 'list my proposals', 'what proposals have I made', 'show my proposal templates'. Read-only.",
      inputSchema: z.object({
        kind: z
          .enum(["proposals", "templates"])
          .optional()
          .describe("'proposals' (filled docs, default) or 'templates'"),
        limit: z.number().optional().describe("Max rows (default 25, max 100)"),
      }),
      execute: async (input) => {
        const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);

        if (input.kind === "templates") {
          const rows = await db
            .select({
              id: proposalTemplates.id,
              name: proposalTemplates.name,
              status: proposalTemplates.status,
              mapConfirmed: proposalTemplates.mapConfirmed,
              originalFileName: proposalTemplates.originalFileName,
              updatedAt: proposalTemplates.updatedAt,
            })
            .from(proposalTemplates)
            .where(and(eq(proposalTemplates.tenantId, tenantId), isNull(proposalTemplates.deletedAt)))
            .orderBy(desc(proposalTemplates.updatedAt))
            .limit(limit);
          return {
            templates: rows.map((r) => ({ ...r, _sourceLink: "/proposals" })),
            total: rows.length,
            ...(rows.length === 0 ? { message: "No proposal templates uploaded yet." } : {}),
          };
        }

        const rows = await db
          .select({
            id: proposals.id,
            status: proposals.status,
            templateName: proposalTemplates.name,
            dealName: deals.name,
            createdAt: proposals.createdAt,
            updatedAt: proposals.updatedAt,
          })
          .from(proposals)
          .leftJoin(proposalTemplates, eq(proposals.templateId, proposalTemplates.id))
          .leftJoin(deals, eq(proposals.dealId, deals.id))
          .where(and(eq(proposals.tenantId, tenantId), isNull(proposals.deletedAt)))
          .orderBy(desc(proposals.updatedAt))
          .limit(limit);

        return {
          proposals: rows.map((r) => ({ ...r, _sourceLink: "/proposals" })),
          total: rows.length,
          ...(rows.length === 0
            ? { message: "No proposals generated yet. Upload a template, then fill it for a deal." }
            : {}),
        };
      },
    }),
  };
}
