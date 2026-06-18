import { db } from "@/db";
import { activities, companies, contacts, deals } from "@/db/schema";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { scoreBuyerIntent, type BuyerIntentScore } from "@/lib/scoring/buyer-intent";
import { predictStalls, type StallPrediction } from "@/lib/analysis/stall-predictor";
import { navigateDirective } from "@/lib/chat/ui-directives"; // CLE-15 narrate-actuate

export function buildIntelligenceTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    getDealCoaching: makeTool({
      description:
        "Get comprehensive deal context for coaching. Use when user asks for advice on a deal, 'what should I do about X deal', 'help with X opportunity', coaching, or deal strategy.",
      inputSchema: z.object({
        dealId: z.string().describe("The deal/opportunity ID"),
      }),
      execute: async (input) => {
        const [deal] = await db
          .select()
          .from(deals)
          .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, tenantId), isNull(deals.deletedAt)))
          .limit(1);
        if (!deal) return { error: "Deal not found" };

        const [relatedContact, relatedCompany, dealActivities] = await Promise.all([
          deal.contactId
            ? db
                .select()
                .from(contacts)
                .where(and(eq(contacts.id, deal.contactId), isNull(contacts.deletedAt)))
                .limit(1)
                .then((r) => r[0] || null)
            : null,
          deal.companyId
            ? db
                .select()
                .from(companies)
                .where(and(eq(companies.id, deal.companyId), isNull(companies.deletedAt)))
                .limit(1)
                .then((r) => r[0] || null)
            : null,
          db
            .select()
            .from(activities)
            .where(
              and(
                eq(activities.tenantId, tenantId),
                isNull(activities.deletedAt),
                or(
                  and(eq(activities.entityType, "deal"), eq(activities.entityId, input.dealId)),
                  ...(deal.contactId
                    ? [
                        and(
                          eq(activities.entityType, "contact"),
                          eq(activities.entityId, deal.contactId)
                        ),
                      ]
                    : [])
                )
              )
            )
            .orderBy(desc(activities.occurredAt))
            .limit(30),
        ]);

        const lastActivity = dealActivities[0];
        const daysSinceLastActivity = lastActivity?.occurredAt
          ? Math.floor((Date.now() - new Date(lastActivity.occurredAt).getTime()) / 86400000)
          : null;

        return {
          deal: {
            id: deal.id,
            name: deal.name,
            stage: deal.stage,
            value: deal.value,
            summary: deal.summary,
            expectedCloseDate: deal.expectedCloseDate,
          },
          contact: relatedContact
            ? {
                id: relatedContact.id,
                name: [relatedContact.firstName, relatedContact.lastName].filter(Boolean).join(" "),
                email: relatedContact.email,
                title: relatedContact.title,
              }
            : null,
          company: relatedCompany
            ? {
                id: relatedCompany.id,
                name: relatedCompany.name,
                industry: relatedCompany.industry,
                score: relatedCompany.score,
                properties: relatedCompany.properties,
              }
            : null,
          recentActivities: dealActivities.map((a) => ({
            type: a.activityType,
            summary: a.summary,
            date: a.occurredAt,
            direction: a.direction,
          })),
          daysSinceLastActivity,
          riskLevel:
            daysSinceLastActivity && daysSinceLastActivity > 14
              ? "high"
              : daysSinceLastActivity && daysSinceLastActivity > 7
                ? "medium"
                : "low",
        };
      },
    }),

    getAccountIntelligence: makeTool({
      description:
        "Get detailed account intelligence including score breakdown, signals, contacts, and activity summary. Use for 'why this account', account analysis, or account strategy questions. " +
        "Set `reveal: true` ONLY when the user also wants to SEE the account (e.g. 'score Acme and pull it up', 'analyze Acme and take me there') — it sends them to the account page and highlights it. For a pure question (no intent to go there), leave `reveal` unset: the text answer stands alone.",
      inputSchema: z.object({
        accountId: z.string().describe("The account/company ID"),
        reveal: z
          .boolean()
          .optional()
          .describe(
            "Opt-in narrate-actuate: when true, also navigate the user to the account page and highlight it. Set only when the user wants to land on the record, never for a pure question.",
          ),
      }),
      execute: async (input) => {
        const [company] = await db
          .select()
          .from(companies)
          .where(and(eq(companies.id, input.accountId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)))
          .limit(1);
        if (!company) return { error: "Account not found" };

        const props = (company.properties || {}) as Record<string, unknown>;
        const [companyContacts, companyDeals, recentActivity] = await Promise.all([
          db
            .select()
            .from(contacts)
            .where(
              and(eq(contacts.companyId, input.accountId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt))
            ),
          db
            .select()
            .from(deals)
            .where(and(eq(deals.companyId, input.accountId), eq(deals.tenantId, tenantId), isNull(deals.deletedAt))),
          db
            .select()
            .from(activities)
            .where(
              and(
                eq(activities.tenantId, tenantId),
                isNull(activities.deletedAt),
                eq(activities.entityType, "company"),
                eq(activities.entityId, input.accountId)
              )
            )
            .orderBy(desc(activities.occurredAt))
            .limit(10),
        ]);

        // Score buyer intent for each contact (cap at 5 to avoid latency)
        const contactsToScore = companyContacts.slice(0, 5);
        const intentScores: Record<string, { score: number; trend: string }> = {};
        for (const c of contactsToScore) {
          try {
            const intent = await scoreBuyerIntent(c.id, tenantId);
            intentScores[c.id] = { score: intent.score, trend: intent.trend };
          } catch {
            // Non-critical: skip failed scores
          }
        }

        return {
          // CLE-15: opt-in narrate-actuate. The full text payload below always
          // stands on its own; the directive is additive and ignored by off-web
          // clients. Only emitted when the model set `reveal` (intent to SEE).
          ...(input.reveal
            ? navigateDirective(`/accounts/${company.id}`, company.name ?? undefined, {
                entityId: company.id,
                scope: "accounts",
              })
            : {}),
          account: {
            id: company.id,
            name: company.name,
            domain: company.domain,
            industry: company.industry,
            score: company.score,
            size: company.size,
            revenue: company.revenue,
            description: company.description,
          },
          scoreBreakdown: {
            grade: props.score_grade,
            fit: props.score_fit,
            engagement: props.score_engagement,
            fitReasons: props.score_fit_reasons,
            engagementReasons: props.score_engagement_reasons,
          },
          signals: {
            technologies: props.technologies,
            funding: props.total_funding_printed,
            fundingStage: props.latest_funding_stage,
            foundedYear: props.founded_year,
            location: [props.city, props.state, props.country].filter(Boolean).join(", "),
          },
          contacts: companyContacts.map((c) => ({
            id: c.id,
            name: [c.firstName, c.lastName].filter(Boolean).join(" "),
            title: c.title,
            email: c.email,
            buyerIntent: intentScores[c.id] || null,
          })),
          deals: companyDeals.map((d) => ({
            id: d.id,
            name: d.name,
            stage: d.stage,
            value: d.value,
          })),
          recentActivity: recentActivity.map((a) => ({
            type: a.activityType,
            summary: a.summary,
            date: a.occurredAt,
          })),
        };
      },
    }),

    generateMeetingPrep: makeTool({
      description:
        "Generate a meeting preparation briefing for an account or contact. Use when user asks to 'prepare for meeting with X', 'briefing for X', or 'meeting prep'.",
      inputSchema: z.object({
        accountId: z.string().optional().describe("Account ID to prepare for"),
        contactId: z.string().optional().describe("Contact ID to prepare for"),
      }),
      execute: async (input) => {
        const data: Record<string, unknown> = {};

        if (input.accountId) {
          const [company] = await db
            .select()
            .from(companies)
            .where(and(eq(companies.id, input.accountId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)))
            .limit(1);
          if (company) {
            data.account = {
              name: company.name,
              industry: company.industry,
              size: company.size,
              revenue: company.revenue,
              description: company.description,
              score: company.score,
            };
            const props = (company.properties || {}) as Record<string, unknown>;
            data.signals = {
              technologies: props.technologies,
              funding: props.total_funding_printed,
              foundedYear: props.founded_year,
            };

            const companyContacts = await db
              .select()
              .from(contacts)
              .where(
                and(eq(contacts.companyId, input.accountId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt))
              );
            data.contacts = companyContacts.map((c) => ({
              name: [c.firstName, c.lastName].filter(Boolean).join(" "),
              title: c.title,
              email: c.email,
            }));

            const companyDeals = await db
              .select()
              .from(deals)
              .where(and(eq(deals.companyId, input.accountId), eq(deals.tenantId, tenantId), isNull(deals.deletedAt)));
            data.deals = companyDeals.map((d) => ({
              name: d.name,
              stage: d.stage,
              value: d.value,
            }));

            const recentActivity = await db
              .select()
              .from(activities)
              .where(
                and(
                  eq(activities.tenantId, tenantId),
                  isNull(activities.deletedAt),
                  eq(activities.entityType, "company"),
                  eq(activities.entityId, input.accountId)
                )
              )
              .orderBy(desc(activities.occurredAt))
              .limit(15);
            data.recentActivity = recentActivity.map((a) => ({
              type: a.activityType,
              summary: a.summary,
              date: a.occurredAt,
              direction: a.direction,
            }));
          }
        }

        if (input.contactId) {
          const [contact] = await db
            .select()
            .from(contacts)
            .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)))
            .limit(1);
          if (contact) {
            data.contact = {
              name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
              title: contact.title,
              email: contact.email,
            };
            const contactActivity = await db
              .select()
              .from(activities)
              .where(
                and(
                  eq(activities.tenantId, tenantId),
                  isNull(activities.deletedAt),
                  eq(activities.entityType, "contact"),
                  eq(activities.entityId, input.contactId)
                )
              )
              .orderBy(desc(activities.occurredAt))
              .limit(15);
            data.interactionHistory = contactActivity.map((a) => ({
              type: a.activityType,
              summary: a.summary,
              date: a.occurredAt,
            }));
          }
        }

        return {
          meetingPrepData: data,
          instruction:
            "Generate a comprehensive meeting prep briefing from this data. Include: key talking points, potential objections, relationship history, and suggested agenda items.",
        };
      },
    }),

    getMeetingNotes: makeTool({
      description: `Get structured meeting notes (summary, key points, action items, buying signals, decisions) for a specific company or contact. Use when the user asks about a past meeting, what was discussed, action items from a call, or meeting outcomes.
Examples: "What did we discuss with Acme last call?" "What were the action items from the meeting with Sarah?" "What objections did they raise?"`,
      inputSchema: z.object({
        companyName: z.string().optional().describe("Company name to search meetings for"),
        contactName: z.string().optional().describe("Contact name to search meetings for"),
        limit: z.number().optional().describe("Max meetings to return (default 5)"),
      }),
      execute: async (input) => {
        let meetingActivities = await db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.tenantId, tenantId),
              isNull(activities.deletedAt),
              eq(activities.channel, "meeting"),
              sql`metadata->>'structuredNotes' IS NOT NULL`
            )
          )
          .orderBy(desc(activities.occurredAt))
          .limit(input.limit ?? 5);

        if (input.companyName || input.contactName) {
          const searchTerm = (input.companyName || input.contactName || "").toLowerCase();
          meetingActivities = meetingActivities.filter((a) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const meta = (a.metadata || {}) as any;
            const attendees = meta.attendees || [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const matchesAttendee = attendees.some((att: any) =>
              (att.displayName || att.email || "").toLowerCase().includes(searchTerm)
            );
            const matchesSummary = (a.summary || "").toLowerCase().includes(searchTerm);
            return matchesAttendee || matchesSummary;
          });
        }

        return {
          meetings: meetingActivities.map((a) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const meta = (a.metadata || {}) as any;
            return {
              id: a.id,
              title: a.summary,
              date: meta.startTime || a.occurredAt,
              notes: meta.structuredNotes,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              attendees: (meta.attendees || []).map((att: any) => att.displayName || att.email),
              followUpDraft: meta.followUpEmailDraft || null,
            };
          }),
        };
      },
    }),

    getBuyerIntentScore: makeTool({
      description:
        "Get a contact's buyer intent score based on behavioral signals (response time, meeting acceptance, questions asked, email length trends, forwarding patterns, document requests, after-hours engagement). Use when user asks 'how engaged is this contact', 'what's the intent score for X', 'is this buyer interested', or 'buyer signals for X'.",
      inputSchema: z.object({
        contactId: z.string().describe("The contact ID to score"),
      }),
      execute: async (input) => {
        try {
          const score = await scoreBuyerIntent(input.contactId, tenantId);
          return {
            contactId: score.contactId,
            score: score.score,
            trend: score.trend,
            topSignals: score.signals
              .filter((s) => s.value > 0)
              .sort((a, b) => b.value * b.weight - a.value * a.weight)
              .slice(0, 5)
              .map((s) => ({
                type: s.type,
                contribution: Math.round(s.value * s.weight),
                evidence: s.evidence,
              })),
            summary:
              score.score >= 70
                ? "High intent -- this buyer is actively evaluating"
                : score.score >= 40
                  ? "Moderate intent -- engaged but not yet in buying mode"
                  : "Low intent -- minimal engagement signals detected",
          };
        } catch (err) {
          return { error: `Failed to score buyer intent: ${err}` };
        }
      },
    }),

    getDealsAtRisk: makeTool({
      description:
        "Get deals that are predicted to stall in the next 7 days, with specific risk indicators and suggested interventions. Use when user asks 'which deals are at risk', 'stalling deals', 'pipeline health', 'deals about to stall', or 'what needs attention'.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const predictions = await predictStalls(tenantId);
          const atRisk = predictions.filter((p) => p.stallProbability >= 0.3);

          return {
            totalOpenDeals: predictions.length + (predictions.length === 0 ? 0 : 0),
            dealsAtRisk: atRisk.length,
            predictions: atRisk.slice(0, 10).map((p) => ({
              dealId: p.dealId,
              dealName: p.dealName,
              stallProbability: Math.round(p.stallProbability * 100),
              daysUntilLikelyStall: p.daysUntilLikelyStall,
              topIndicators: p.indicators
                .slice(0, 3)
                .map((i) => `[${i.severity}] ${i.detail}`),
              topIntervention: p.suggestedInterventions[0]?.action || null,
            })),
          };
        } catch (err) {
          return { error: `Failed to predict stalls: ${err}` };
        }
      },
    }),

    getWinLossAnalysis: makeTool({
      description:
        "Get the win/loss post-mortem analysis for a closed deal. Shows key factors, engagement velocity, champion presence, competitor impact, objection handling, and recommendations. Use when user asks 'why did we win/lose X deal', 'deal post-mortem', 'win-loss analysis', or 'what went wrong with X deal'.",
      inputSchema: z.object({
        dealId: z.string().describe("The closed deal ID to analyze"),
      }),
      execute: async (input) => {
        const [deal] = await db
          .select({ properties: deals.properties, stage: deals.stage, name: deals.name })
          .from(deals)
          .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, tenantId), isNull(deals.deletedAt)))
          .limit(1);

        if (!deal) return { error: "Deal not found" };
        if (deal.stage !== "won" && deal.stage !== "lost") {
          return { error: "Deal is not closed yet. Win/loss analysis is only available for won or lost deals." };
        }

        const props = (deal.properties || {}) as Record<string, unknown>;

        // Return cached analysis if available
        if (props.winLossAnalysis) {
          return {
            dealName: deal.name,
            cachedAt: props.winLossAnalyzedAt,
            analysis: props.winLossAnalysis,
          };
        }

        // Run analysis on-demand if not yet cached
        try {
          const { analyzeWinLoss } = await import("@/lib/analysis/win-loss-engine");
          const analysis = await analyzeWinLoss(input.dealId, tenantId);
          return {
            dealName: deal.name,
            analysis,
          };
        } catch (err) {
          return { error: `Failed to run win/loss analysis: ${err}` };
        }
      },
    }),
  };
}
