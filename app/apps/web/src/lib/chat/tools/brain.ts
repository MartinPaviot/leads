import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { makeTool, type ToolContext } from "./context";
import { getCompanyBrain } from "@/lib/company-brain/get-brain";
import { getContactBrain } from "@/lib/company-brain/get-contact-brain";
import { getDealBrain } from "@/lib/company-brain/get-deal-brain";
import type {
  CompanyBrain,
  CompanyBrainContact,
  CompanyBrainDeal,
} from "@/lib/company-brain/types";

/**
 * Resolve a free-text company reference (id, domain, or fuzzy name)
 * to a canonical companies row, scoped to the current tenant.
 *
 * Strategy:
 *   1. exact id match
 *   2. exact domain match (case-insensitive)
 *   3. ilike on name
 *
 * Returns null when nothing matches the tenant's namespace.
 */
async function resolveCompanyId(
  ref: string,
  tenantId: string,
): Promise<{ id: string; name: string; domain: string | null } | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const byId = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain })
    .from(companies)
    .where(and(eq(companies.id, trimmed), eq(companies.tenantId, tenantId)))
    .limit(1);
  if (byId[0]) return byId[0];

  const lower = trimmed.toLowerCase();
  const byDomain = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain })
    .from(companies)
    .where(and(eq(companies.domain, lower), eq(companies.tenantId, tenantId)))
    .limit(1);
  if (byDomain[0]) return byDomain[0];

  const byName = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain })
    .from(companies)
    .where(
      and(
        eq(companies.tenantId, tenantId),
        or(ilike(companies.name, `%${trimmed}%`), ilike(companies.domain, `%${lower}%`)),
      ),
    )
    .limit(1);
  return byName[0] ?? null;
}

/**
 * Trim the brain to the chat tool's token budget. The brain itself
 * already caps activities/contacts/memories at 50/50/25 ; here we
 * tighten further so a single tool call stays under ~3K tokens.
 */
function shapeForChat(brain: CompanyBrain) {
  const recent = brain.activities.slice(0, 15).map((a) => ({
    id: a.id,
    type: a.type,
    direction: a.direction,
    when: a.occurredAt.toISOString(),
    summary: a.summary,
  }));

  const contacts = brain.contacts.slice(0, 20).map((c: CompanyBrainContact) => ({
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || null,
    email: c.email,
    title: c.title,
    isChampion: c.isChampion,
    intentScore: c.intentScore,
    intentTrend: c.intentTrend,
    lastTouchAt: c.lastTouchAt?.toISOString() ?? null,
  }));

  const deals = brain.deals.map((d: CompanyBrainDeal) => ({
    id: d.id,
    name: d.name,
    stage: d.stage,
    value: d.value,
    expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
    riskLevel: d.riskLevel,
    riskReasons: d.riskReasons,
    stallProbability: d.stallProbability,
    stallIndicators: d.stallIndicators.slice(0, 5),
    properties: Object.fromEntries(
      Object.entries(d.properties).map(([k, m]) => [
        k,
        { value: m.value, source: m.source, confidence: m.confidence },
      ]),
    ),
  }));

  const meetings = brain.meetings.slice(0, 10).map((m) => ({
    id: m.id,
    title: m.title,
    when: m.occurredAt.toISOString(),
    transcriptChunks: m.transcriptChunkCount,
  }));

  return {
    company: {
      id: brain.company.id,
      name: brain.company.name,
      domain: brain.company.domain,
      industry: brain.company.industry,
      sizeBand: brain.company.sizeBand,
      score: brain.company.score,
    },
    contacts,
    deals,
    recentActivities: recent,
    meetings,
    knowledgeEntries: brain.knowledgeEntries.slice(0, 10),
    contextGraphEdges: brain.contextGraphEdges.slice(0, 20),
    memories: brain.memories.slice(0, 10).map((m) => ({
      id: m.id,
      scope: m.scope,
      content: m.content,
      when: m.createdAt.toISOString(),
    })),
    freshness: {
      activities: brain.freshness.activities?.toISOString() ?? null,
      meetings: brain.freshness.meetings?.toISOString() ?? null,
      memories: brain.freshness.memories?.toISOString() ?? null,
    },
    truncated: brain.truncated,
  };
}

function shapeContactForChat(c: CompanyBrainContact) {
  return {
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || null,
    email: c.email,
    title: c.title,
    isChampion: c.isChampion,
    intentScore: c.intentScore,
    intentTrend: c.intentTrend,
    lastTouchAt: c.lastTouchAt?.toISOString() ?? null,
  };
}

function shapeDealForChat(d: CompanyBrainDeal) {
  return {
    id: d.id,
    name: d.name,
    stage: d.stage,
    value: d.value,
    expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
    riskLevel: d.riskLevel,
    riskReasons: d.riskReasons,
    stallProbability: d.stallProbability,
    stallIndicators: d.stallIndicators.slice(0, 5),
    properties: Object.fromEntries(
      Object.entries(d.properties).map(([k, m]) => [
        k,
        { value: m.value, source: m.source, confidence: m.confidence },
      ]),
    ),
  };
}

export function buildBrainTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    getCompanyBrain: makeTool({
      description: `Get the unified Company Brain for an account: company basics, all contacts (with champion flag + buyer intent score), all deals (with risk level, stall probability, citation-shaped properties), recent activities, meetings (with transcript chunk counts), knowledge entries, context graph edges, and chat memories — in one call, freshness-tagged per layer. Use whenever the user asks "what do we know about X", "tell me about [company]", "brain on [account]", "summarise our relationship with X", "give me the full picture on [company]", or any open-ended account-level question. Prefer this over briefDeal (single deal) or getEnrichedContext (single contact) when the user is asking about a whole account.`,
      inputSchema: z.object({
        company: z
          .string()
          .describe(
            "Company id, domain (e.g. 'stripe.com'), or name (e.g. 'Stripe'). Best precision with id or domain.",
          ),
      }),
      execute: async (input) => {
        const resolved = await resolveCompanyId(input.company, tenantId);
        if (!resolved) {
          return {
            error: `No company found matching "${input.company}" in this tenant.`,
            suggestion:
              "Try the exact domain (e.g. acme.com) or paste the company id from the accounts page.",
          };
        }

        const brain = await getCompanyBrain(resolved.id, {
          tenantId,
          recentActivityCap: 15,
          contactCap: 20,
          memoryCap: 10,
        });

        if (!brain) {
          return {
            error: `Company ${resolved.id} resolved but the brain returned null. Likely a tenant-scope mismatch — escalate.`,
          };
        }

        return shapeForChat(brain);
      },
    }),

    getContactBrain: makeTool({
      description: `Get the unified Contact Brain : focal contact (with champion flag + buyer intent + last touch), activities tied directly to this contact, deals where this contact is the primary contact, plus the surrounding company brain (other contacts at the same company, all open deals, recent company-level activities, knowledge, memories). Use when the user asks "what do we know about [person]", "tell me about [contact name/email]", "brain on Alice", "what's my history with [contact]", or any contact-centric question. The id input must be a contact id ; for a free-text name lookup, route through queryContacts first.`,
      inputSchema: z.object({
        contactId: z.string().describe("The contact id (uuid)."),
      }),
      execute: async (input) => {
        const brain = await getContactBrain(input.contactId, {
          tenantId,
          directActivityCap: 15,
          recentActivityCap: 15,
          contactCap: 20,
          memoryCap: 10,
        });
        if (!brain) {
          return {
            error: `Contact ${input.contactId} not found, has no company assigned, or is outside the current tenant.`,
          };
        }
        return {
          focalContact: shapeContactForChat(brain.focalContact),
          ownedDeals: brain.ownedDeals.map(shapeDealForChat),
          directActivities: brain.directActivities.slice(0, 15).map((a) => ({
            id: a.id,
            type: a.type,
            direction: a.direction,
            when: a.occurredAt.toISOString(),
            summary: a.summary,
          })),
          company: {
            id: brain.companyBrain.company.id,
            name: brain.companyBrain.company.name,
            domain: brain.companyBrain.company.domain,
            industry: brain.companyBrain.company.industry,
          },
          companyContacts: brain.companyBrain.contacts
            .slice(0, 15)
            .map(shapeContactForChat),
          companyOpenDeals: brain.companyBrain.deals.map(shapeDealForChat),
          freshness: {
            focalContact: brain.freshness.focalContact?.toISOString() ?? null,
            directActivities:
              brain.freshness.directActivities?.toISOString() ?? null,
          },
          truncated: brain.truncated,
        };
      },
    }),

    getDealBrain: makeTool({
      description: `Get the unified Deal Brain : focal deal (with risk level, stall probability, citation-shaped properties, risk reasons), the deal's primary contact (with intent + champion), activities tied directly to this deal (stage changes, notes, calls), plus the surrounding company brain (other open deals at the same company for comparison, all contacts, recent company activities, knowledge, memories). Use when the user asks "what's the status of [deal]", "brain on [deal name]", "deep dive on this opportunity", "tell me everything about deal X", or any deal-centric question. The id input must be a deal id.`,
      inputSchema: z.object({
        dealId: z.string().describe("The deal/opportunity id (uuid)."),
      }),
      execute: async (input) => {
        const brain = await getDealBrain(input.dealId, {
          tenantId,
          dealActivityCap: 20,
          recentActivityCap: 15,
          contactCap: 15,
          memoryCap: 10,
        });
        if (!brain) {
          return {
            error: `Deal ${input.dealId} not found, has no company assigned, or is outside the current tenant.`,
          };
        }
        return {
          focalDeal: shapeDealForChat(brain.focalDeal),
          primaryContact: brain.primaryContact
            ? shapeContactForChat(brain.primaryContact)
            : null,
          dealActivities: brain.dealActivities.slice(0, 20).map((a) => ({
            id: a.id,
            type: a.type,
            direction: a.direction,
            when: a.occurredAt.toISOString(),
            summary: a.summary,
          })),
          company: {
            id: brain.companyBrain.company.id,
            name: brain.companyBrain.company.name,
            domain: brain.companyBrain.company.domain,
          },
          otherOpenDeals: brain.companyBrain.deals
            .filter((d) => d.id !== brain.focalDeal.id)
            .map(shapeDealForChat),
          companyContacts: brain.companyBrain.contacts
            .slice(0, 10)
            .map(shapeContactForChat),
          freshness: {
            focalDeal: brain.freshness.focalDeal?.toISOString() ?? null,
            dealActivities:
              brain.freshness.dealActivities?.toISOString() ?? null,
          },
          truncated: brain.truncated,
        };
      },
    }),
  };
}
