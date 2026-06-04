/**
 * PROPOSAL-002 fill engine (data layer).
 *
 * Turns a mapped template + a deal into per-component content:
 *  - field  -> resolved from structured data via its dataKey
 *  - section-> generated prose grounded in the deal's info base (one LLM call)
 * Persists a `proposals` row + `proposal_components` rows. Abstains cleanly
 * (FillUnavailable) rather than persisting a half-draft.
 */

import { z } from "zod";
import { db } from "@/db";
import {
  proposals,
  proposalComponents,
  proposalTemplates,
  deals,
  companies,
  contacts,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getDealAmountDisplay, formatDealAmount } from "@/lib/deals/amount";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import {
  getDeepConversationContext,
  getSkillKnowledge,
  getCompanyContacts,
} from "@/skills/skill-knowledge";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { getModelForTask } from "@/lib/ai/ai-provider";
import type { ComponentMap } from "./component-map";

export class FillUnavailable extends Error {
  reason: "missing_required_data" | "template_not_mapped" | "deal_not_found";
  constructor(
    reason: "missing_required_data" | "template_not_mapped" | "deal_not_found",
    message: string,
  ) {
    super(message);
    this.name = "FillUnavailable";
    this.reason = reason;
  }
}

export interface FieldContext {
  company: { name?: string | null; industry?: string | null; description?: string | null } | null;
  contact: {
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    email?: string | null;
  } | null;
  deal: {
    name: string;
    summary?: string | null;
    value: number | null;
    projectAmount: number | null;
    platformArr: number | null;
  };
  settings: { onboardingCompanyName?: string | null; productDescription?: string | null };
  now: Date;
}

/** Resolve a field component's value from the closed dataKey vocabulary. */
export function resolveFieldValue(dataKey: string | null, ctx: FieldContext): string {
  switch (dataKey) {
    case "company.name":
      return ctx.company?.name ?? "";
    case "company.industry":
      return ctx.company?.industry ?? "";
    case "company.description":
      return ctx.company?.description ?? "";
    case "contact.name":
      return [ctx.contact?.firstName, ctx.contact?.lastName].filter(Boolean).join(" ");
    case "contact.title":
      return ctx.contact?.title ?? "";
    case "contact.email":
      return ctx.contact?.email ?? "";
    case "deal.name":
      return ctx.deal.name ?? "";
    case "deal.summary":
      return ctx.deal.summary ?? "";
    case "deal.amount":
      // Sanctioned headline total (never a manual project+platform sum).
      return formatDealAmount(getDealAmountDisplay(ctx.deal).total);
    case "date.today":
      return ctx.now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    case "seller.companyName":
      return ctx.settings.onboardingCompanyName ?? "";
    case "seller.productDescription":
      return ctx.settings.productDescription ?? "";
    default:
      return "";
  }
}

const sectionsSchema = z.object({
  sections: z.array(z.object({ id: z.string(), content: z.string() })),
});

/** Generate prose for every section component in one grounded LLM call. */
export async function generateSections(
  sections: Array<{ id: string; label: string }>,
  contextBlock: string,
  tenantId: string,
): Promise<Record<string, string>> {
  if (sections.length === 0) return {};
  const model = getModelForTask("chat");
  if (!model) {
    throw new FillUnavailable(
      "missing_required_data",
      "No LLM model is configured to draft proposal sections",
    );
  }

  const sectionList = sections.map((s) => `- id "${s.id}": ${s.label}`).join("\n");
  const prompt = `You are drafting a commercial proposal for a specific prospect. Using ONLY the grounded context below, write the prose for each requested section. Ground every claim in the context — reference real conversations, names, and numbers. No placeholders, no filler openers like "I hope this finds you well".

${contextBlock}

## Sections to write (return content keyed by the exact id)
${sectionList}

Return one entry per section id with persuasive but honest prose (2-5 short paragraphs each, as appropriate to the section).`;

  const result = await tracedGenerateObject({
    model,
    schema: sectionsSchema,
    prompt,
    _trace: { agentId: "skill-proposal-fill-sections", tenantId },
  });
  const out: Record<string, string> = {};
  for (const s of (result.object as { sections: Array<{ id: string; content: string }> }).sections) {
    out[s.id] = s.content;
  }
  return out;
}

export interface FilledComponent {
  componentId: string;
  kind: string;
  label: string;
  content: string;
  order: number;
}

export interface FillResult {
  proposalId: string;
  templateId: string;
  dealId: string;
  components: FilledComponent[];
  unmappedSections: string[];
}

/** Fill a mapped template from a deal's info base and persist the proposal. */
export async function buildProposalFill(
  templateId: string,
  dealId: string,
  opts: { tenantId: string; userId?: string; now?: Date },
): Promise<FillResult> {
  const now = opts.now ?? new Date();

  const [tpl] = await db
    .select()
    .from(proposalTemplates)
    .where(
      and(eq(proposalTemplates.id, templateId), eq(proposalTemplates.tenantId, opts.tenantId)),
    )
    .limit(1);
  if (!tpl) throw new FillUnavailable("template_not_mapped", `Template ${templateId} not found`);
  if (tpl.status !== "mapped" || !tpl.componentMap) {
    throw new FillUnavailable("template_not_mapped", "Template must be mapped before it can be filled");
  }
  const map = tpl.componentMap as ComponentMap;

  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.tenantId, opts.tenantId)))
    .limit(1);
  if (!deal) throw new FillUnavailable("deal_not_found", `Deal ${dealId} not found`);

  const [company, settings] = await Promise.all([
    deal.companyId
      ? db.select().from(companies).where(eq(companies.id, deal.companyId)).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    getTenantSettings(opts.tenantId),
  ]);
  const [contact] = deal.contactId
    ? await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, deal.contactId), eq(contacts.tenantId, opts.tenantId)))
        .limit(1)
    : [null];

  const fieldCtx: FieldContext = {
    company: company
      ? { name: company.name, industry: company.industry, description: company.description }
      : null,
    contact: contact
      ? { firstName: contact.firstName, lastName: contact.lastName, title: contact.title, email: contact.email }
      : null,
    deal: {
      name: deal.name,
      summary: deal.summary,
      value: deal.value,
      projectAmount: deal.projectAmount,
      platformArr: deal.platformArr,
    },
    settings: {
      onboardingCompanyName: settings.onboardingCompanyName,
      productDescription: settings.productDescription,
    },
    now,
  };

  const sectionComponents = map.components.filter((c) => c.kind === "section");
  let sectionContent: Record<string, string> = {};
  if (sectionComponents.length > 0) {
    const [knowledgeBlock, conversation, allContacts] = await Promise.all([
      getSkillKnowledge(
        `commercial proposal pricing positioning ${company?.name ?? ""} ${company?.industry ?? ""}`,
        opts.tenantId,
      ),
      getDeepConversationContext(opts.tenantId, {
        dealId,
        companyId: deal.companyId ?? undefined,
        contactIds: deal.contactId ? [deal.contactId] : [],
        query: `${company?.name ?? ""} ${deal.name} proposal requirements budget timeline`,
      }),
      deal.companyId ? getCompanyContacts(deal.companyId, opts.tenantId) : Promise.resolve([]),
    ]);
    const stakeholders = allContacts.length
      ? allContacts.map((c) => `- ${c.name}${c.title ? ` (${c.title})` : ""}`).join("\n")
      : "No contacts on file";
    const contextBlock = `## Our Company
- Name: ${settings.onboardingCompanyName || "our company"}
- Product: ${settings.productDescription || "not specified"}

${knowledgeBlock}

## Prospect
- Company: ${company?.name || "unknown"}
- Industry: ${company?.industry || "unknown"}
- Description: ${company?.description || "unknown"}

## Stakeholders
${stakeholders}

## Deal
- Name: ${deal.name}
- Stage: ${deal.stage}
- Amount: ${formatDealAmount(getDealAmountDisplay(deal).total)}

## Conversation History (emails, meetings, calls)
${conversation.activities || "No prior interactions recorded"}

## Notes
${conversation.notes || "No notes on file"}

## Related Context (semantic search)
${conversation.semanticResults || "None"}`;

    sectionContent = await generateSections(
      sectionComponents.map((c) => ({ id: c.id, label: c.label })),
      contextBlock,
      opts.tenantId,
    );
  }

  const filled: FilledComponent[] = map.components
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      componentId: c.id,
      kind: c.kind,
      label: c.label,
      content: c.kind === "field" ? resolveFieldValue(c.dataKey, fieldCtx) : sectionContent[c.id] ?? "",
      order: c.order,
    }));

  const unmappedSections = filled
    .filter((f) => f.kind === "section" && !f.content.trim())
    .map((f) => f.label);

  const proposalId = crypto.randomUUID();
  await db.insert(proposals).values({
    id: proposalId,
    tenantId: opts.tenantId,
    templateId,
    dealId,
    createdByUserId: opts.userId ?? null,
    status: "filled",
  });
  if (filled.length > 0) {
    const byId = new Map(map.components.map((c) => [c.id, c]));
    await db.insert(proposalComponents).values(
      filled.map((f) => {
        const c = byId.get(f.componentId);
        return {
          id: crypto.randomUUID(),
          tenantId: opts.tenantId,
          proposalId,
          componentId: f.componentId,
          kind: f.kind,
          label: f.label,
          placeholderToken: c?.placeholderToken ?? "",
          dataKey: c?.dataKey ?? null,
          content: f.content,
          order: f.order,
        };
      }),
    );
  }

  return { proposalId, templateId, dealId, components: filled, unmappedSections };
}
