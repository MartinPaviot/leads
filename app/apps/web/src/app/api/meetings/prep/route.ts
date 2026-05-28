import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { activities, companies, contacts, deals, notes } from "@/db/schema";
import { eq, and, desc, or, isNull } from "drizzle-orm";

/**
 * Generate a meeting prep document for a specific meeting (by activity ID)
 * or for a contact/account.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const { activityId, contactId, accountId } = await req.json();

  try {
    const prep: Record<string, unknown> = {};

    // If activityId provided, get the meeting details
    if (activityId) {
      const [meeting] = await db.select().from(activities)
        .where(and(eq(activities.id, activityId), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt)))
        .limit(1);

      if (meeting) {
        const meta = (meeting.metadata || {}) as Record<string, unknown>;
        prep.meeting = {
          title: meeting.summary,
          date: meta.startTime || meeting.occurredAt,
          attendees: meta.attendees,
          location: meta.location,
          meetingLink: meta.meetingLink,
        };

        // Try to match attendees to contacts
        const attendees = (meta.attendees || []) as Array<{ email: string; name?: string; contactId?: string }>;
        const attendeeContactIds = attendees.map((a) => a.contactId).filter(Boolean) as string[];

        if (attendeeContactIds.length > 0) {
          const attendeeContacts = await db.select().from(contacts)
            .where(and(
              eq(contacts.tenantId, authCtx.tenantId),
              isNull(contacts.deletedAt),
              or(...attendeeContactIds.map((id) => eq(contacts.id, id)))
            ));

          prep.attendeeProfiles = attendeeContacts.map((c) => ({
            name: [c.firstName, c.lastName].filter(Boolean).join(" "),
            title: c.title,
            email: c.email,
            companyId: c.companyId,
          }));

          // Get company info for attendees
          const companyIds = [...new Set(attendeeContacts.map((c) => c.companyId).filter(Boolean))] as string[];
          if (companyIds.length > 0) {
            const attendeeCompanies = await db.select().from(companies)
              .where(and(
                eq(companies.tenantId, authCtx.tenantId),
                isNull(companies.deletedAt),
                or(...companyIds.map((id) => eq(companies.id, id)))
              ));
            prep.companies = attendeeCompanies.map((c) => ({
              id: c.id,
              name: c.name,
              industry: c.industry,
              size: c.size,
              revenue: c.revenue,
              score: c.score,
              description: c.description,
            }));
          }
        }
      }
    }

    // Get account context
    const targetAccountId = accountId || (prep.companies as Array<{ id: string }>)?.[0]?.id;
    if (targetAccountId) {
      const [company] = await db.select().from(companies)
        .where(and(eq(companies.id, targetAccountId), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
        .limit(1);

      if (company) {
        const props = (company.properties || {}) as Record<string, unknown>;
        prep.account = {
          name: company.name,
          industry: company.industry,
          size: company.size,
          revenue: company.revenue,
          score: company.score,
          description: company.description,
          technologies: props.technologies,
          funding: props.total_funding_printed,
          foundedYear: props.founded_year,
        };

        // Get all contacts at this company
        const companyContacts = await db.select().from(contacts)
          .where(and(eq(contacts.companyId, targetAccountId), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));
        prep.keyContacts = companyContacts.map((c) => ({
          name: [c.firstName, c.lastName].filter(Boolean).join(" "),
          title: c.title,
          email: c.email,
        }));

        // Get active deals
        const companyDeals = await db.select().from(deals)
          .where(and(eq(deals.companyId, targetAccountId), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)));
        prep.activeDeals = companyDeals.map((d) => ({
          name: d.name,
          stage: d.stage,
          value: d.value,
          expectedCloseDate: d.expectedCloseDate,
          summary: d.summary,
        }));

        // Get recent interactions
        const activityOrConditions = [
          and(eq(activities.entityType, "company"), eq(activities.entityId, targetAccountId)),
          ...companyContacts.map((c) => and(eq(activities.entityType, "contact"), eq(activities.entityId, c.id))),
        ];
        const recentActivity = await db.select().from(activities)
          .where(and(
            eq(activities.tenantId, authCtx.tenantId),
            isNull(activities.deletedAt),
            or(...activityOrConditions),
          ))
          .orderBy(desc(activities.occurredAt))
          .limit(20);

        prep.recentInteractions = recentActivity.map((a) => {
          const meta = (a.metadata || {}) as Record<string, unknown>;
          return {
            type: a.activityType,
            summary: a.summary,
            date: a.occurredAt,
            direction: a.direction,
            emailSnippet: (meta.body as string)?.slice(0, 300) || meta.snippet,
          };
        });

        // Get notes
        const noteOrConditions = [
          and(eq(notes.entityType, "company"), eq(notes.entityId, targetAccountId)),
          ...companyContacts.map((c) => and(eq(notes.entityType, "contact"), eq(notes.entityId, c.id))),
        ];
        const accountNotes = await db.select().from(notes)
          .where(and(
            eq(notes.tenantId, authCtx.tenantId),
            isNull(notes.deletedAt),
            or(...noteOrConditions),
          ))
          .orderBy(desc(notes.createdAt))
          .limit(10);

        prep.notes = accountNotes.map((n) => ({
          title: n.title,
          content: n.content?.slice(0, 500),
          date: n.createdAt,
        }));
      }
    }

    // Contact-specific context
    const targetContactId = contactId;
    if (targetContactId && !targetAccountId) {
      const [contact] = await db.select().from(contacts)
        .where(and(eq(contacts.id, targetContactId), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
        .limit(1);

      if (contact) {
        prep.primaryContact = {
          name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
          title: contact.title,
          email: contact.email,
        };

        const contactActivity = await db.select().from(activities)
          .where(and(
            eq(activities.tenantId, authCtx.tenantId),
            eq(activities.entityType, "contact"),
            eq(activities.entityId, targetContactId),
            isNull(activities.deletedAt),
          ))
          .orderBy(desc(activities.occurredAt))
          .limit(15);

        prep.recentInteractions = contactActivity.map((a) => ({
          type: a.activityType,
          summary: a.summary,
          date: a.occurredAt,
          direction: a.direction,
        }));
      }
    }

    // Generate the prep document using LLM
    const prepDocument = await generatePrepDoc(prep);

    return Response.json({ success: true, prep: prepDocument, rawData: prep });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

async function generatePrepDoc(data: Record<string, unknown>): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return formatFallbackPrep(data);
  }

  const prompt = `Generate a concise meeting preparation briefing from this CRM data. Format as markdown.

Include these sections (skip if no data):
1. **Meeting Overview** — who, when, where
2. **Account Snapshot** — company info, industry, size, score
3. **Key Attendees** — names, titles, relationship history
4. **Deal Status** — active deals, stage, value, next steps
5. **Recent Interactions** — last 5 interactions summarized
6. **Talking Points** — 3-5 suggested topics based on context
7. **Risks & Opportunities** — what to watch for
8. **Open Items** — unresolved questions, pending tasks

CRM Data:
${JSON.stringify(data, null, 2)}

Keep it concise and actionable. Use bullet points. No fluff.`;

  try {
    if (anthropicKey) {
      const { anthropic } = await import("@ai-sdk/anthropic");
      const { generateText } = await import("ai");
      const result = await generateText({
        model: anthropic("claude-sonnet-4-6"),
        prompt,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      });
      return result.text;
    } else if (openaiKey) {
      const { openai } = await import("@ai-sdk/openai");
      const { generateText } = await import("ai");
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        prompt,
      });
      return result.text;
    }
  } catch (err) {
    console.error("Meeting prep LLM failed:", err);
  }

  return formatFallbackPrep(data);
}

function formatFallbackPrep(data: Record<string, unknown>): string {
  const lines: string[] = ["# Meeting Prep\n"];

  const meeting = data.meeting as Record<string, unknown> | undefined;
  if (meeting) {
    lines.push(`## Meeting: ${meeting.title}`);
    lines.push(`- **Date**: ${meeting.date}`);
    if (meeting.location) lines.push(`- **Location**: ${meeting.location}`);
    lines.push("");
  }

  const account = data.account as Record<string, unknown> | undefined;
  if (account) {
    lines.push(`## Account: ${account.name}`);
    if (account.industry) lines.push(`- Industry: ${account.industry}`);
    if (account.size) lines.push(`- Size: ${account.size}`);
    if (account.score) lines.push(`- Score: ${account.score}`);
    lines.push("");
  }

  const deals = data.activeDeals as Array<Record<string, unknown>> | undefined;
  if (deals && deals.length > 0) {
    lines.push("## Active Deals");
    for (const d of deals) {
      lines.push(`- **${d.name}** — ${d.stage} ($${(d.value as number)?.toLocaleString() || "0"})`);
    }
    lines.push("");
  }

  const interactions = data.recentInteractions as Array<Record<string, unknown>> | undefined;
  if (interactions && interactions.length > 0) {
    lines.push("## Recent Interactions");
    for (const i of interactions.slice(0, 5)) {
      lines.push(`- ${(i.date as Date)?.toISOString?.().split("T")[0] || "?"} — ${i.type}: ${i.summary || "no summary"}`);
    }
  }

  return lines.join("\n");
}
