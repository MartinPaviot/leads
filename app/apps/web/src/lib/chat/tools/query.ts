import { db } from "@/db";
import {
  activities,
  companies,
  contacts,
  deals,
  notes,
  sharedPrompts,
  tasks,
  users,
} from "@/db/schema";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { searchSimilar } from "@/lib/embeddings";
import { makeTool, type ToolContext } from "./context";

function toSnake(camel: string): string {
  return camel.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export function buildQueryTools(ctx: ToolContext) {
  const { tenantId, authCtx } = ctx;

  return {
    searchCRM: makeTool({
      description: `Search the CRM database semantically using vector embeddings. Use when looking for specific records by name, attribute, or topic that may not be in the snapshot.
Examples: query="Sarah Chen" finds contacts named Sarah Chen. query="deals over 50K" finds high-value deals. query="companies using React" finds companies with React in their tech stack. query="recent meetings about pricing" finds meeting activities discussing pricing.`,
      inputSchema: z.object({
        query: z.string().describe("Natural language search query"),
        limit: z.number().optional().describe("Max results (default 10)"),
      }),
      execute: async (input) => {
        if (!process.env.OPENAI_API_KEY) return { results: [] as unknown[], error: "Search unavailable" };
        const results = await searchSimilar(input.query, input.limit ?? 10, tenantId);
        return { results: results.filter((r) => r.similarity > 0.5) };
      },
    }),

    queryContacts: makeTool({
      description: `Query contacts with optional text search by name or email. Use when user asks to find, list, or filter contacts. Examples: search="Sarah" finds all contacts named Sarah. search="acme.com" finds contacts with acme.com emails. Omit search to list recent contacts.`,
      inputSchema: z.object({
        search: z.string().optional().describe("Search by name or email"),
        limit: z.number().optional().describe("Max results (default 20)"),
      }),
      execute: async (input) => {
        const results = await db
          .select()
          .from(contacts)
          .where(
            input.search
              ? and(
                  eq(contacts.tenantId, tenantId),
                  or(
                    ilike(contacts.firstName, `%${input.search}%`),
                    ilike(contacts.lastName, `%${input.search}%`),
                    ilike(contacts.email, `%${input.search}%`)
                  )
                )
              : eq(contacts.tenantId, tenantId)
          )
          .orderBy(desc(contacts.createdAt))
          .limit(input.limit ?? 20);
        return {
          contacts: results.map((c) => ({
            id: c.id,
            name: [c.firstName, c.lastName].filter(Boolean).join(" "),
            email: c.email,
            title: c.title,
            companyId: c.companyId,
          })),
        };
      },
    }),

    queryAccounts: makeTool({
      description: `Query accounts/companies with optional text search by name or domain. Examples: search="Meridian" finds Meridian Labs. search="fintech" finds fintech companies. Omit search to list recent accounts.`,
      inputSchema: z.object({
        search: z.string().optional().describe("Search by name or domain"),
        limit: z.number().optional().describe("Max results (default 20)"),
      }),
      execute: async (input) => {
        const results = await db
          .select()
          .from(companies)
          .where(
            input.search
              ? and(
                  eq(companies.tenantId, tenantId),
                  or(
                    ilike(companies.name, `%${input.search}%`),
                    ilike(companies.domain, `%${input.search}%`)
                  )
                )
              : eq(companies.tenantId, tenantId)
          )
          .orderBy(desc(companies.createdAt))
          .limit(input.limit ?? 20);
        return {
          accounts: results.map((a) => ({
            id: a.id,
            name: a.name,
            domain: a.domain,
            industry: a.industry,
            score: a.score,
            size: a.size,
            revenue: a.revenue,
          })),
        };
      },
    }),

    queryDeals: makeTool({
      description: `Query deals/opportunities with optional filters by stage or name. Examples: stage="proposal" lists all deals in proposal stage. search="Acme" finds the Acme deal. Omit both to list all active deals.`,
      inputSchema: z.object({
        stage: z.string().optional().describe("Filter by stage: lead, qualification, demo, trial, proposal, negotiation, won, lost"),
        search: z.string().optional().describe("Search by deal name"),
        limit: z.number().optional().describe("Max results (default 20)"),
      }),
      execute: async (input) => {
        const conditions = [eq(deals.tenantId, tenantId)];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (input.stage) conditions.push(eq(deals.stage, input.stage as any));
        if (input.search) conditions.push(ilike(deals.name, `%${input.search}%`));
        const results = await db
          .select()
          .from(deals)
          .where(and(...conditions))
          .orderBy(desc(deals.createdAt))
          .limit(input.limit ?? 20);
        return {
          deals: results.map((d) => ({
            id: d.id,
            name: d.name,
            stage: d.stage,
            value: d.value,
            companyId: d.companyId,
            contactId: d.contactId,
            expectedCloseDate: d.expectedCloseDate,
          })),
        };
      },
    }),

    queryActivities: makeTool({
      description: `Query recent activities (emails, meetings, calls, notes) for a specific contact, account, deal, or all. Use for: "when did I last talk to X", "what happened with Y", follow-up gaps, interaction history. Returns full email bodies and metadata for citation. Examples: entityType="contact" + entityId="abc" gets all interactions with that contact. activityType="email_received" filters to received emails only.`,
      inputSchema: z.object({
        entityType: z.string().optional().describe("Filter by entity type: contact, company, deal"),
        entityId: z.string().optional().describe("Filter by specific entity ID"),
        activityType: z.string().optional().describe("Filter by type: email_sent, email_received, meeting_completed, etc."),
        limit: z.number().optional().describe("Max results (default 20)"),
      }),
      execute: async (input) => {
        const conditions = [eq(activities.tenantId, tenantId)];
        if (input.entityType) conditions.push(eq(activities.entityType, input.entityType));
        if (input.entityId) conditions.push(eq(activities.entityId, input.entityId));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (input.activityType) conditions.push(eq(activities.activityType, input.activityType as any));
        const results = await db
          .select()
          .from(activities)
          .where(and(...conditions))
          .orderBy(desc(activities.occurredAt))
          .limit(input.limit ?? 20);
        return {
          activities: results.map((a) => {
            const meta = (a.metadata || {}) as Record<string, unknown>;
            return {
              id: a.id,
              type: a.activityType,
              summary: a.summary,
              direction: a.direction,
              channel: a.channel,
              occurredAt: a.occurredAt,
              entityType: a.entityType,
              entityId: a.entityId,
              emailBody: meta.body ? (meta.body as string).slice(0, 2000) : undefined,
              body: a.rawContent ? a.rawContent.slice(0, 2000) : undefined,
              emailFrom: meta.from,
              emailTo: meta.to,
              structuredNotes: meta.structuredNotes,
              _sourceLink:
                a.entityType === "contact"
                  ? `/contacts/${a.entityId}`
                  : a.entityType === "company"
                    ? `/accounts/${a.entityId}`
                    : a.entityType === "deal"
                      ? `/opportunities/${a.entityId}`
                      : undefined,
            };
          }),
        };
      },
    }),

    queryNotes: makeTool({
      description: "Query notes for a contact, account, deal, or all notes. Use when the user asks about notes, observations, or written context. Returns full note content for citation.",
      inputSchema: z.object({
        entityType: z.string().optional().describe("Filter by entity type: contact, company, deal"),
        entityId: z.string().optional().describe("Filter by specific entity ID"),
        search: z.string().optional().describe("Search by note title or content"),
        limit: z.number().optional().describe("Max results (default 20)"),
      }),
      execute: async (input) => {
        const conditions = [eq(notes.tenantId, tenantId)];
        if (input.entityType) conditions.push(eq(notes.entityType, input.entityType));
        if (input.entityId) conditions.push(eq(notes.entityId, input.entityId));
        if (input.search) {
          conditions.push(
            or(
              ilike(notes.title, `%${input.search}%`),
              ilike(notes.content, `%${input.search}%`)
            )!
          );
        }
        const results = await db
          .select()
          .from(notes)
          .where(and(...conditions))
          .orderBy(desc(notes.createdAt))
          .limit(input.limit ?? 20);
        return {
          notes: results.map((n) => ({
            id: n.id,
            title: n.title,
            content: n.content,
            entityType: n.entityType,
            entityId: n.entityId,
            createdAt: n.createdAt,
            _sourceLink:
              n.entityType === "contact"
                ? `/contacts/${n.entityId}`
                : n.entityType === "company"
                  ? `/accounts/${n.entityId}`
                  : n.entityType === "deal"
                    ? `/opportunities/${n.entityId}`
                    : undefined,
          })),
        };
      },
    }),

    queryTasks: makeTool({
      description: "Query tasks with optional filters. Use when user asks about their tasks, to-dos, follow-ups, or what's due.",
      inputSchema: z.object({
        status: z.string().optional().describe("Filter by status: pending, completed, cancelled"),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async (input) => {
        const conditions = [eq(tasks.tenantId, tenantId)];
        if (input.status) conditions.push(eq(tasks.status, input.status));
        if (input.entityType) conditions.push(eq(tasks.entityType, input.entityType));
        if (input.entityId) conditions.push(eq(tasks.entityId, input.entityId));
        const results = await db
          .select()
          .from(tasks)
          .where(and(...conditions))
          .orderBy(desc(tasks.dueDate))
          .limit(input.limit ?? 20);
        return {
          tasks: results.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            entityType: t.entityType,
            entityId: t.entityId,
          })),
        };
      },
    }),

    whoami: makeTool({
      description:
        "Return the current authenticated user's identity and workspace context (userId, tenantId, email, role). Use at the start of a chat to ground the assistant about who it's talking to and what permissions they have.",
      inputSchema: z.object({}),
      execute: async () => {
        const [user] = await db
          .select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, authCtx.appUserId))
          .limit(1);
        return {
          userId: authCtx.appUserId,
          tenantId,
          role: authCtx.role,
          email: user?.email,
          name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email,
        };
      },
    }),

    listWorkspaceMembers: makeTool({
      description:
        "List all workspace members (users) with id, name, email, role, avatarUrl, createdAt. Use when the user asks 'who's on my team?', 'list teammates', 'show workspace members'.",
      inputSchema: z.object({}),
      execute: async () => {
        const members = await db
          .select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            role: users.role,
            avatarUrl: users.avatarUrl,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.tenantId, tenantId));
        return {
          members: members.map((m) => ({
            id: m.id,
            name: [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email,
            email: m.email,
            role: m.role || "member",
            avatarUrl: m.avatarUrl,
            createdAt: m.createdAt,
          })),
        };
      },
    }),

    searchMeetings: makeTool({
      description:
        "Search meeting activities by attendee name, summary keywords, or date range. Returns meetings with their structured notes, attendees, and follow-up state. Use for 'meetings with X', 'calls last week', 'discussions about pricing'.",
      inputSchema: z.object({
        search: z.string().optional().describe("Substring match on summary or attendee name"),
        startDate: z.string().optional().describe("ISO date — only meetings on or after this"),
        endDate: z.string().optional().describe("ISO date — only meetings on or before this"),
        limit: z.number().optional().describe("Max results (default 10)"),
      }),
      execute: async (input) => {
        const conditions = [
          eq(activities.tenantId, tenantId),
          eq(activities.channel, "meeting"),
        ];
        if (input.startDate) {
          conditions.push(gte(activities.occurredAt, new Date(input.startDate)));
        }
        if (input.endDate) {
          conditions.push(lte(activities.occurredAt, new Date(input.endDate)));
        }
        if (input.search) {
          conditions.push(ilike(activities.summary, `%${input.search}%`));
        }

        const rows = await db
          .select()
          .from(activities)
          .where(and(...conditions))
          .orderBy(desc(activities.occurredAt))
          .limit(input.limit ?? 10);

        return {
          meetings: rows.map((a) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const meta = (a.metadata || {}) as any;
            return {
              id: a.id,
              title: a.summary,
              date: meta.startTime || a.occurredAt,
              attendees: (meta.attendees || []).map(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (att: any) => att.displayName || att.email
              ),
              hasNotes: !!meta.structuredNotes,
              followUpSent: !!meta.followUpSentAt,
              calendarSource: meta.calendarSource,
            };
          }),
        };
      },
    }),

    searchEmailsByMetadata: makeTool({
      description:
        "Search email activities by sender/recipient/subject substring or date range. Returns matching email activities with from/to/subject/preview. Use for 'emails from X', 'emails about Y', 'emails last week'.",
      inputSchema: z.object({
        fromEmail: z.string().optional(),
        toEmail: z.string().optional(),
        subjectContains: z.string().optional(),
        startDate: z.string().optional().describe("ISO date"),
        endDate: z.string().optional().describe("ISO date"),
        direction: z.enum(["inbound", "outbound"]).optional(),
        limit: z.number().optional().describe("Max results (default 20)"),
      }),
      execute: async (input) => {
        const conditions = [
          eq(activities.tenantId, tenantId),
          eq(activities.channel, "email"),
        ];
        if (input.direction) {
          conditions.push(eq(activities.direction, input.direction));
        }
        if (input.startDate) {
          conditions.push(gte(activities.occurredAt, new Date(input.startDate)));
        }
        if (input.endDate) {
          conditions.push(lte(activities.occurredAt, new Date(input.endDate)));
        }
        if (input.subjectContains) {
          conditions.push(ilike(activities.summary, `%${input.subjectContains}%`));
        }
        if (input.fromEmail) {
          conditions.push(
            sql`(metadata->>'from') ILIKE ${"%" + input.fromEmail + "%"}`
          );
        }
        if (input.toEmail) {
          conditions.push(
            sql`(metadata->>'to') ILIKE ${"%" + input.toEmail + "%"}`
          );
        }

        const rows = await db
          .select()
          .from(activities)
          .where(and(...conditions))
          .orderBy(desc(activities.occurredAt))
          .limit(input.limit ?? 20);

        return {
          emails: rows.map((a) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const meta = (a.metadata || {}) as any;
            return {
              id: a.id,
              subject: a.summary,
              from: meta.from,
              to: meta.to,
              direction: a.direction,
              occurredAt: a.occurredAt,
              preview: (a.rawContent || "").slice(0, 200),
              entityType: a.entityType,
              entityId: a.entityId,
            };
          }),
        };
      },
    }),

    runBasicReport: makeTool({
      description:
        "Run an aggregate report over a standard entity (contacts, companies, deals, activities, tasks). Computes count (+ optional sum/avg on a numeric field), optionally grouped by a field. Use for quick pipeline analytics like 'count deals by stage', 'sum deal value by company', 'count activities by type last 30 days'. Simpler than analyzePipeline — returns raw rows.",
      inputSchema: z.object({
        objectType: z.enum(["contact", "company", "deal", "activity", "task"]),
        groupBy: z
          .string()
          .optional()
          .describe(
            "Field name to group by (e.g. 'stage' for deals, 'activityType' for activities, 'status' for tasks)"
          ),
        aggregate: z
          .enum(["count", "sum", "avg"])
          .optional()
          .describe("Aggregation function (default 'count')"),
        aggregateField: z
          .string()
          .optional()
          .describe("Numeric field for sum/avg (e.g. 'value' on deals, 'score' on contacts)"),
        startDate: z
          .string()
          .optional()
          .describe("ISO date — filter by createdAt/occurredAt >= this"),
        endDate: z.string().optional().describe("ISO date — filter by createdAt/occurredAt <= this"),
      }),
      execute: async (input) => {
        const aggregate = input.aggregate ?? "count";

        // Map object types to tables + their date field
        const mapping: Record<
          string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { table: any; dateField: any; allowedGroupBy: string[]; allowedAggField: string[] }
        > = {
          contact: {
            table: contacts,
            dateField: contacts.createdAt,
            allowedGroupBy: ["companyId", "title"],
            allowedAggField: ["score"],
          },
          company: {
            table: companies,
            dateField: companies.createdAt,
            allowedGroupBy: ["industry", "size", "revenue"],
            allowedAggField: ["score"],
          },
          deal: {
            table: deals,
            dateField: deals.createdAt,
            allowedGroupBy: ["stage", "companyId", "contactId"],
            allowedAggField: ["value"],
          },
          activity: {
            table: activities,
            dateField: activities.occurredAt,
            allowedGroupBy: ["activityType", "channel", "direction", "entityType"],
            allowedAggField: [],
          },
          task: {
            table: tasks,
            dateField: tasks.dueDate,
            allowedGroupBy: ["status", "priority", "entityType"],
            allowedAggField: [],
          },
        };
        const cfg = mapping[input.objectType];
        if (!cfg) return { error: `Unknown objectType: ${input.objectType}` };

        // Validate groupBy / aggregateField against allow-lists (SQL injection guard)
        if (input.groupBy && !cfg.allowedGroupBy.includes(input.groupBy)) {
          return {
            error: `groupBy '${input.groupBy}' not allowed on ${input.objectType}. Allowed: ${cfg.allowedGroupBy.join(", ")}`,
          };
        }
        if (
          (aggregate === "sum" || aggregate === "avg") &&
          (!input.aggregateField || !cfg.allowedAggField.includes(input.aggregateField))
        ) {
          return {
            error: `aggregateField required for ${aggregate} on ${input.objectType}. Allowed: ${cfg.allowedAggField.join(", ") || "(none)"}`,
          };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conditions: any[] = [eq(cfg.table.tenantId, tenantId)];
        if (input.startDate) conditions.push(gte(cfg.dateField, new Date(input.startDate)));
        if (input.endDate) conditions.push(lte(cfg.dateField, new Date(input.endDate)));

        // Build the aggregate expression
        let aggExpr;
        if (aggregate === "count") {
          aggExpr = sql<number>`count(*)`;
        } else if (aggregate === "sum") {
          aggExpr = sql<number>`coalesce(sum(${sql.identifier(toSnake(input.aggregateField!))}), 0)`;
        } else {
          aggExpr = sql<number>`coalesce(avg(${sql.identifier(toSnake(input.aggregateField!))}), 0)`;
        }

        if (input.groupBy) {
          const groupCol = sql.identifier(toSnake(input.groupBy));
          const rows = await db
            .select({ bucket: sql<string>`${groupCol}`, value: aggExpr })
            .from(cfg.table)
            .where(and(...conditions))
            .groupBy(sql`${groupCol}`)
            .orderBy(desc(aggExpr))
            .limit(50);
          return {
            objectType: input.objectType,
            aggregate,
            groupBy: input.groupBy,
            rows: rows.map((r) => ({ bucket: r.bucket, value: Number(r.value) })),
          };
        }

        const [row] = await db
          .select({ value: aggExpr })
          .from(cfg.table)
          .where(and(...conditions));
        return {
          objectType: input.objectType,
          aggregate,
          value: Number(row?.value || 0),
        };
      },
    }),

    getNoteBody: makeTool({
      description:
        "Fetch the full body of a single note by id. Use when a search preview is truncated and you need the complete content.",
      inputSchema: z.object({
        noteId: z.string(),
      }),
      execute: async (input) => {
        const [note] = await db
          .select()
          .from(notes)
          .where(and(eq(notes.id, input.noteId), eq(notes.tenantId, tenantId)))
          .limit(1);
        if (!note) return { error: "Note not found" };
        return {
          note: {
            id: note.id,
            title: note.title,
            content: note.content,
            entityType: note.entityType,
            entityId: note.entityId,
            authorId: note.authorId,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            _sourceLink:
              note.entityType === "contact"
                ? `/contacts/${note.entityId}`
                : note.entityType === "company"
                  ? `/accounts/${note.entityId}`
                  : note.entityType === "deal"
                    ? `/opportunities/${note.entityId}`
                    : undefined,
          },
        };
      },
    }),

    getCallRecording: makeTool({
      description:
        "Fetch the full metadata, transcript (if any), and structured notes for a meeting/call by activity id. Returns attendees, timestamps, transcript text, follow-up draft state, and generated tasks.",
      inputSchema: z.object({
        meetingId: z.string(),
      }),
      execute: async (input) => {
        const [activity] = await db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.id, input.meetingId),
              eq(activities.tenantId, tenantId),
              eq(activities.channel, "meeting")
            )
          )
          .limit(1);
        if (!activity) return { error: "Meeting not found" };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = (activity.metadata || {}) as any;
        return {
          meeting: {
            id: activity.id,
            title: activity.summary,
            startTime: meta.startTime || activity.occurredAt,
            endTime: meta.endTime,
            attendees: meta.attendees || [],
            location: meta.location,
            meetingLink: meta.meetingLink,
            calendarSource: meta.calendarSource,
            structuredNotes: meta.structuredNotes || null,
            followUpEmailDraft: meta.followUpEmailDraft || null,
            followUpSentAt: meta.followUpSentAt || null,
            followUpRecipients: meta.followUpRecipients || null,
            transcript: activity.rawContent || null,
            transcriptSource: meta.transcriptSource,
            hasTranscript: !!meta.hasTranscript || !!activity.rawContent,
            generatedTaskIds: meta.generatedTaskIds || [],
            matchedContacts: meta.matchedContacts || [],
          },
        };
      },
    }),

    getEmailContent: makeTool({
      description:
        "Fetch the full content (body + metadata) of a single email activity by id. Returns subject, from/to/cc, direction, full body, and linked entity.",
      inputSchema: z.object({
        emailId: z.string(),
      }),
      execute: async (input) => {
        const [activity] = await db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.id, input.emailId),
              eq(activities.tenantId, tenantId),
              eq(activities.channel, "email")
            )
          )
          .limit(1);
        if (!activity) return { error: "Email not found" };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = (activity.metadata || {}) as any;
        return {
          email: {
            id: activity.id,
            subject: activity.summary,
            from: meta.from,
            to: meta.to,
            cc: meta.cc,
            direction: activity.direction,
            body: activity.rawContent || meta.body || null,
            messageId: meta.messageId,
            threadId: meta.threadId,
            occurredAt: activity.occurredAt,
            entityType: activity.entityType,
            entityId: activity.entityId,
          },
        };
      },
    }),

    semanticSearchNotes: makeTool({
      description:
        "Vector-similarity search over note content. Returns notes whose content best matches the query semantically (not just substring). Use for 'find notes about pricing objections', 'what have we written about X'. Complements queryNotes (which does substring match).",
      inputSchema: z.object({
        query: z.string().describe("Natural-language search query"),
        limit: z.number().optional().describe("Max results (default 10)"),
        minSimilarity: z
          .number()
          .optional()
          .describe("Cosine similarity floor 0-1 (default 0.35)"),
      }),
      execute: async (input) => {
        if (!process.env.OPENAI_API_KEY) {
          return { error: "Semantic search unavailable (OPENAI_API_KEY not set)", results: [] };
        }
        const hits = await searchSimilar(input.query, Math.min((input.limit ?? 10) * 4, 60), tenantId);
        const noteHits = hits.filter(
          (h) => h.entityType === "note" && h.similarity >= (input.minSimilarity ?? 0.35)
        );
        if (noteHits.length === 0) return { results: [] };

        const ids = noteHits.map((h) => h.entityId);
        const rows = await db
          .select()
          .from(notes)
          .where(and(eq(notes.tenantId, tenantId), inArray(notes.id, ids)));
        const byId = new Map(rows.map((n) => [n.id, n]));

        return {
          results: noteHits
            .slice(0, input.limit ?? 10)
            .map((h) => {
              const n = byId.get(h.entityId);
              if (!n) return null;
              return {
                id: n.id,
                title: n.title,
                content: n.content,
                entityType: n.entityType,
                entityId: n.entityId,
                similarity: Math.round(h.similarity * 1000) / 1000,
                createdAt: n.createdAt,
                _sourceLink:
                  n.entityType === "contact"
                    ? `/contacts/${n.entityId}`
                    : n.entityType === "company"
                      ? `/accounts/${n.entityId}`
                      : n.entityType === "deal"
                        ? `/opportunities/${n.entityId}`
                        : undefined,
              };
            })
            .filter((x) => x !== null),
        };
      },
    }),

    semanticSearchEmails: makeTool({
      description:
        "Vector-similarity search over email body/subject content. Returns email activities whose content best matches semantically. Use for 'emails about pricing concerns', 'replies discussing integration'. Complements searchEmailsByMetadata (which does structured filter).",
      inputSchema: z.object({
        query: z.string().describe("Natural-language search query"),
        limit: z.number().optional().describe("Max results (default 10)"),
        minSimilarity: z.number().optional().describe("Cosine similarity floor 0-1 (default 0.35)"),
      }),
      execute: async (input) => {
        if (!process.env.OPENAI_API_KEY) {
          return { error: "Semantic search unavailable (OPENAI_API_KEY not set)", results: [] };
        }
        const hits = await searchSimilar(input.query, Math.min((input.limit ?? 10) * 5, 80), tenantId);
        const activityHits = hits.filter(
          (h) => h.entityType === "activity" && h.similarity >= (input.minSimilarity ?? 0.35)
        );
        if (activityHits.length === 0) return { results: [] };

        const ids = activityHits.map((h) => h.entityId);
        const rows = await db
          .select()
          .from(activities)
          .where(and(eq(activities.tenantId, tenantId), inArray(activities.id, ids)));
        const emailRows = rows.filter((a) => a.channel === "email");
        const byId = new Map(emailRows.map((a) => [a.id, a]));

        return {
          results: activityHits
            .filter((h) => byId.has(h.entityId))
            .slice(0, input.limit ?? 10)
            .map((h) => {
              const a = byId.get(h.entityId)!;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const meta = (a.metadata || {}) as any;
              return {
                id: a.id,
                subject: a.summary,
                from: meta.from,
                to: meta.to,
                direction: a.direction,
                occurredAt: a.occurredAt,
                preview: (a.rawContent || "").slice(0, 300),
                similarity: Math.round(h.similarity * 1000) / 1000,
                entityType: a.entityType,
                entityId: a.entityId,
              };
            }),
        };
      },
    }),

    semanticSearchCallRecordings: makeTool({
      description:
        "Vector-similarity search over meeting transcripts / structured notes. Use for 'calls where the buyer pushed back on price', 'meetings that discussed integration concerns'. Returns meetings whose structured notes or transcript best match the query semantically.",
      inputSchema: z.object({
        query: z.string().describe("Natural-language search query"),
        limit: z.number().optional().describe("Max results (default 10)"),
        minSimilarity: z.number().optional().describe("Cosine similarity floor 0-1 (default 0.35)"),
      }),
      execute: async (input) => {
        if (!process.env.OPENAI_API_KEY) {
          return { error: "Semantic search unavailable (OPENAI_API_KEY not set)", results: [] };
        }
        const hits = await searchSimilar(input.query, Math.min((input.limit ?? 10) * 5, 80), tenantId);
        const activityHits = hits.filter(
          (h) => h.entityType === "activity" && h.similarity >= (input.minSimilarity ?? 0.35)
        );
        if (activityHits.length === 0) return { results: [] };

        const ids = activityHits.map((h) => h.entityId);
        const rows = await db
          .select()
          .from(activities)
          .where(and(eq(activities.tenantId, tenantId), inArray(activities.id, ids)));
        const meetingRows = rows.filter((a) => a.channel === "meeting");
        const byId = new Map(meetingRows.map((a) => [a.id, a]));

        return {
          results: activityHits
            .filter((h) => byId.has(h.entityId))
            .slice(0, input.limit ?? 10)
            .map((h) => {
              const a = byId.get(h.entityId)!;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const meta = (a.metadata || {}) as any;
              return {
                id: a.id,
                title: a.summary,
                date: meta.startTime || a.occurredAt,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                attendees: (meta.attendees || []).map((att: any) => att.displayName || att.email),
                similarity: Math.round(h.similarity * 1000) / 1000,
                hasStructuredNotes: !!meta.structuredNotes,
                preview: (a.rawContent || "").slice(0, 300),
              };
            }),
        };
      },
    }),

    getRecordsByIds: makeTool({
      description:
        "Batch-get records of a given type by their IDs. More efficient than multiple single reads. Supports contact, company, deal, task, note, activity. Returns array of records (missing ids omitted silently).",
      inputSchema: z.object({
        objectType: z
          .enum(["contact", "company", "deal", "task", "note", "activity"])
          .describe("Entity type"),
        ids: z.array(z.string()).min(1).max(100).describe("Max 100 ids"),
      }),
      execute: async (input) => {
        const limited = input.ids.slice(0, 100);
        switch (input.objectType) {
          case "contact": {
            const rows = await db
              .select()
              .from(contacts)
              .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, limited)));
            return {
              objectType: input.objectType,
              records: rows.map((c) => ({
                id: c.id,
                name: [c.firstName, c.lastName].filter(Boolean).join(" "),
                email: c.email,
                title: c.title,
                companyId: c.companyId,
              })),
            };
          }
          case "company": {
            const rows = await db
              .select()
              .from(companies)
              .where(and(eq(companies.tenantId, tenantId), inArray(companies.id, limited)));
            return {
              objectType: input.objectType,
              records: rows.map((c) => ({
                id: c.id,
                name: c.name,
                domain: c.domain,
                industry: c.industry,
                score: c.score,
              })),
            };
          }
          case "deal": {
            const rows = await db
              .select()
              .from(deals)
              .where(and(eq(deals.tenantId, tenantId), inArray(deals.id, limited)));
            return {
              objectType: input.objectType,
              records: rows.map((d) => ({
                id: d.id,
                name: d.name,
                stage: d.stage,
                value: d.value,
                companyId: d.companyId,
                contactId: d.contactId,
              })),
            };
          }
          case "task": {
            const rows = await db
              .select()
              .from(tasks)
              .where(and(eq(tasks.tenantId, tenantId), inArray(tasks.id, limited)));
            return { objectType: input.objectType, records: rows };
          }
          case "note": {
            const rows = await db
              .select()
              .from(notes)
              .where(and(eq(notes.tenantId, tenantId), inArray(notes.id, limited)));
            return { objectType: input.objectType, records: rows };
          }
          case "activity": {
            const rows = await db
              .select()
              .from(activities)
              .where(and(eq(activities.tenantId, tenantId), inArray(activities.id, limited)));
            return { objectType: input.objectType, records: rows };
          }
          default:
            return { error: "Unknown objectType" };
        }
      },
    }),

    listSharedPrompts: makeTool({
      description:
        "List reusable prompt templates available to the current user — includes personal (private) prompts plus any workspace-shared ones. Use when the user asks 'what prompts do I have', 'show shared prompts', 'list team templates'.",
      inputSchema: z.object({
        scope: z.enum(["user", "workspace", "all"]).optional().describe("Filter scope (default 'all')"),
        search: z.string().optional().describe("Substring match on title"),
      }),
      execute: async (input) => {
        const scopeFilter = input.scope || "all";
        const scopeClause =
          scopeFilter === "user"
            ? and(
                eq(sharedPrompts.scope, "user"),
                eq(sharedPrompts.authorId, authCtx.appUserId)
              )
            : scopeFilter === "workspace"
              ? eq(sharedPrompts.scope, "workspace")
              : or(
                  eq(sharedPrompts.scope, "workspace"),
                  and(
                    eq(sharedPrompts.scope, "user"),
                    eq(sharedPrompts.authorId, authCtx.appUserId)
                  )
                );

        const conditions = [eq(sharedPrompts.tenantId, tenantId), scopeClause!];
        if (input.search) {
          conditions.push(ilike(sharedPrompts.title, `%${input.search}%`));
        }

        const rows = await db
          .select()
          .from(sharedPrompts)
          .where(and(...conditions))
          .orderBy(desc(sharedPrompts.updatedAt))
          .limit(50);

        return {
          prompts: rows.map((p) => ({
            id: p.id,
            title: p.title,
            prompt: p.prompt,
            scope: p.scope,
            authorId: p.authorId,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          })),
        };
      },
    }),

    deleteSharedPrompt: makeTool({
      description:
        "Delete a shared prompt by id. User-scope prompts can be deleted by their author. Workspace-scope prompts require admin. Use when the user says 'remove that prompt', 'delete the X template'.",
      inputSchema: z.object({
        id: z.string(),
      }),
      execute: async (input) => {
        const [prompt] = await db
          .select()
          .from(sharedPrompts)
          .where(
            and(eq(sharedPrompts.id, input.id), eq(sharedPrompts.tenantId, tenantId))
          )
          .limit(1);
        if (!prompt) return { error: "Prompt not found" };

        if (prompt.scope === "workspace" && authCtx.role !== "admin") {
          return { error: "Admin access required to delete workspace prompts" };
        }
        if (
          prompt.scope === "user" &&
          prompt.authorId !== authCtx.appUserId
        ) {
          return { error: "You can only delete your own user-scope prompts" };
        }

        await db
          .delete(sharedPrompts)
          .where(
            and(eq(sharedPrompts.id, input.id), eq(sharedPrompts.tenantId, tenantId))
          );
        return { deleted: { id: input.id, title: prompt.title, scope: prompt.scope } };
      },
    }),
  };
}
