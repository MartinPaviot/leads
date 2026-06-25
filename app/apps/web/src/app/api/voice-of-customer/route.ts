import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { activities, companies, contacts, notes, outboundEmails, sequenceEnrollments } from "@/db/schema";
import { eq, and, desc, or, isNull, inArray } from "drizzle-orm";
import { shouldSurfaceInboundEvent } from "@/lib/home/up-next";

/**
 * Voice of Customer API — extracts feature requests, pain points,
 * and feedback from customer interactions using LLM analysis.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  try {
    // Get all email and meeting activities with content
    const recentActivities = await db.select({
      id: activities.id,
      activityType: activities.activityType,
      summary: activities.summary,
      metadata: activities.metadata,
      entityType: activities.entityType,
      entityId: activities.entityId,
      occurredAt: activities.occurredAt,
    }).from(activities)
      .where(and(
        eq(activities.tenantId, authCtx.tenantId),
        or(
          eq(activities.activityType, "email_received"),
          eq(activities.activityType, "meeting_completed"),
          eq(activities.activityType, "call_completed"),
        ),
        isNull(activities.deletedAt),
      ))
      .orderBy(desc(activities.occurredAt))
      .limit(100);

    // Get all notes
    const allNotes = await db.select().from(notes)
      .where(and(eq(notes.tenantId, authCtx.tenantId), isNull(notes.deletedAt)))
      .orderBy(desc(notes.createdAt))
      .limit(50);

    // Get companies and contacts for attribution
    const allCompanies = await db.select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)));
    const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));

    const allContacts = await db.select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      companyId: contacts.companyId,
      email: contacts.email,
      properties: contacts.properties,
    }).from(contacts)
      .where(and(eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));
    const contactMap = new Map(allContacts.map((c) => [c.id, {
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      companyId: c.companyId,
      email: c.email ?? null,
      properties: (c.properties as Record<string, unknown> | null) ?? null,
    }]));

    // Prospect gate for inbound email: only email_received from a contact we've
    // engaged (sent/enrolled) or confirmed as a lead — and never machine-sent —
    // is a real customer interaction. Newsletters, bots, vendor receipts and
    // stray correspondents would otherwise inflate totalInteractions AND pollute
    // the extracted themes fed to the LLM. meeting_completed/call_completed are
    // always genuine and pass through untouched.
    const inboundContactIds = [
      ...new Set(
        recentActivities
          .filter((a) => a.activityType === "email_received" && a.entityType === "contact" && a.entityId)
          .map((a) => a.entityId as string),
      ),
    ];
    const engagedContactIds = new Set<string>();
    if (inboundContactIds.length) {
      const [sentRows, enrollRows] = await Promise.all([
        db.selectDistinct({ id: outboundEmails.contactId }).from(outboundEmails)
          .where(and(eq(outboundEmails.tenantId, authCtx.tenantId), inArray(outboundEmails.contactId, inboundContactIds))),
        db.selectDistinct({ id: sequenceEnrollments.contactId }).from(sequenceEnrollments)
          .where(inArray(sequenceEnrollments.contactId, inboundContactIds)),
      ]);
      for (const r of sentRows) if (r.id) engagedContactIds.add(r.id);
      for (const r of enrollRows) if (r.id) engagedContactIds.add(r.id);
    }

    // Prepare content for LLM extraction
    const contentItems = [];

    for (const activity of recentActivities) {
      const meta = (activity.metadata || {}) as Record<string, unknown>;
      const body = (meta.body as string) || (meta.snippet as string) || "";
      const structuredNotes = meta.structuredNotes as Record<string, unknown> | undefined;

      const contact = activity.entityType === "contact" ? contactMap.get(activity.entityId) : null;

      // Drop inbound email noise before it's counted or sent to the LLM.
      if (activity.activityType === "email_received") {
        if (
          !shouldSurfaceInboundEvent({
            entityType: activity.entityType,
            fromHeader: typeof meta.from === "string" ? meta.from : null,
            contactEmail: contact?.email ?? null,
            contactProperties: contact?.properties ?? null,
            engaged: !!(activity.entityId && engagedContactIds.has(activity.entityId)),
          })
        ) {
          continue;
        }
      }

      const companyName = contact?.companyId ? companyMap.get(contact.companyId) :
        activity.entityType === "company" ? companyMap.get(activity.entityId) : null;

      contentItems.push({
        type: activity.activityType,
        date: activity.occurredAt,
        company: companyName || "Unknown",
        contact: contact?.name || "Unknown",
        content: structuredNotes
          ? JSON.stringify(structuredNotes).slice(0, 1000)
          : `${activity.summary || ""}\n${body}`.slice(0, 500),
      });
    }

    for (const note of allNotes) {
      const contact = note.entityType === "contact" ? contactMap.get(note.entityId) : null;
      const companyName = contact?.companyId ? companyMap.get(contact.companyId) :
        note.entityType === "company" ? companyMap.get(note.entityId) : null;

      contentItems.push({
        type: "note",
        date: note.createdAt,
        company: companyName || "Unknown",
        contact: contact?.name || "Unknown",
        content: `${note.title || ""}\n${note.content || ""}`.slice(0, 500),
      });
    }

    if (contentItems.length === 0) {
      return Response.json({ insights: [], totalInteractions: 0, message: "No customer interactions found yet" });
    }

    // Use LLM to extract voice of customer insights
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!anthropicKey && !openaiKey) {
      // Return the real interaction count so the subtitle reads "0 themes from
      // N interactions" (we have data, just couldn't analyze it) rather than
      // understating to 0 and looking like an empty tenant.
      return Response.json({ insights: [], totalInteractions: contentItems.length, message: "No LLM API key configured" });
    }

    const prompt = `Analyze these customer interactions and extract Voice of Customer insights. Group by theme.

Customer interactions (${contentItems.length} items):
${contentItems.slice(0, 40).map((item, i) =>
  `${i + 1}. [${item.type}] ${item.date} | ${item.company} / ${item.contact}\n   ${item.content.slice(0, 300)}`
).join("\n\n")}

Extract and return JSON with this structure:
{
  "themes": [
    {
      "theme": "Feature Request: X",
      "category": "feature_request" | "pain_point" | "praise" | "objection" | "competitive_mention",
      "mentions": [
        { "company": "Acme", "contact": "John", "date": "2026-03-15", "quote": "exact quote or close paraphrase" }
      ],
      "summary": "1-2 sentence summary of this theme",
      "frequency": number of mentions
    }
  ]
}

Only include themes with actual evidence from the data. Don't fabricate. Sort by frequency descending.`;

    try {
      let themes: Array<{
        theme: string;
        category: string;
        mentions: Array<{ company: string; contact: string; date: string; quote: string }>;
        summary: string;
        frequency: number;
      }> = [];

      if (anthropicKey) {
        const { anthropic } = await import("@ai-sdk/anthropic");
        const { generateText } = await import("ai");
        const result = await generateText({
          model: anthropic("claude-sonnet-4-6"),
          prompt,
        });
        const parsed = JSON.parse(result.text.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
        themes = parsed.themes || [];
      } else if (openaiKey) {
        const { openai } = await import("@ai-sdk/openai");
        const { generateText } = await import("ai");
        const result = await generateText({
          model: openai("gpt-4o-mini"),
          prompt,
        });
        const parsed = JSON.parse(result.text.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
        themes = parsed.themes || [];
      }

      return Response.json({ insights: themes, totalInteractions: contentItems.length });
    } catch (error) {
      return Response.json({ error: `Analysis failed: ${String(error)}`, insights: [], totalInteractions: contentItems.length }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
