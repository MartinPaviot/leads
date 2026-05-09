import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { makeTool, type ToolContext } from "./context";
import { getCompanyBrain } from "@/lib/company-brain/get-brain";
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
  };
}
