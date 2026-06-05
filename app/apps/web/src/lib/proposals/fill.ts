/**
 * PROPOSAL-002/003 fill engine (data + trust layer).
 *
 * Turns a mapped template + a deal into per-component content WITH a trust
 * signal: each component carries a confidence, may abstain instead of
 * fabricating, and (for sections) cites the exact source interactions it drew
 * from. Persists `proposals` + `proposal_components` (content, confidence,
 * source). Abstains cleanly (FillUnavailable) rather than persist a half-draft.
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
import { and, eq, isNull } from "drizzle-orm";
import { getDealAmountDisplay, formatDealAmount } from "@/lib/deals/amount";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { getModelForTask } from "@/lib/ai/ai-provider";
import { collectCitableSources, type CitableSource } from "./sources";
import { gradeSection } from "./grade";
import type { ComponentMap } from "./component-map";

export type Confidence = "high" | "medium" | "low";

export interface Citation {
  id: string;
  type: string; // "activity" | "note" | "field"
  label: string;
  snippet: string;
  date: string | null;
}

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
  locale: string; // BCP-47 (e.g. "fr-FR"); drives date.today formatting
}

/** Normalize a tenant locale to a BCP-47 tag. Handles the pilae REGION-language
 *  form (e.g. "FR-fr" -> "fr-FR", "US-en" -> "en-US"); leaves valid tags as-is. */
export function toBcp47(locale: string): string {
  const m = locale.match(/^([A-Za-z]{2})-([A-Za-z]{2})$/);
  if (m && m[1] === m[1].toUpperCase() && m[2] === m[2].toLowerCase()) {
    return `${m[2].toLowerCase()}-${m[1].toUpperCase()}`;
  }
  return locale;
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
    case "date.today": {
      const opts = { year: "numeric", month: "long", day: "numeric" } as const;
      try {
        return ctx.now.toLocaleDateString(ctx.locale || "en-US", opts);
      } catch {
        return ctx.now.toLocaleDateString("en-US", opts);
      }
    }
    case "seller.companyName":
      return ctx.settings.onboardingCompanyName ?? "";
    case "seller.productDescription":
      return ctx.settings.productDescription ?? "";
    default:
      return "";
  }
}

const sectionsSchema = z.object({
  sections: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      citationIds: z.array(z.string()),
      abstained: z.boolean(),
    }),
  ),
});

export interface GeneratedSection {
  content: string;
  confidence: Confidence;
  citationIds: string[];
  abstained: boolean;
}

/**
 * Generate prose for every section in one grounded LLM call. The model cites
 * the source-interaction ids it used, self-rates confidence, and ABSTAINS
 * (empty content, low confidence) when a section has no grounding.
 */
export async function generateSections(
  sections: Array<{ id: string; label: string }>,
  contextBlock: string,
  tenantId: string,
): Promise<Record<string, GeneratedSection>> {
  if (sections.length === 0) return {};
  const model = getModelForTask("chat");
  if (!model) {
    throw new FillUnavailable(
      "missing_required_data",
      "No LLM model is configured to draft proposal sections",
    );
  }

  const sectionList = sections.map((s) => `- id "${s.id}": ${s.label}`).join("\n");
  const prompt = `You are drafting a commercial proposal for a specific prospect. Use ONLY the context and the numbered SOURCE INTERACTIONS below. Ground every claim; never invent facts that are not supported by the sources.

${contextBlock}

## Sections to write (return one entry per id)
${sectionList}

For each section return:
- content: persuasive but honest prose (2-5 short paragraphs), grounded in the sources.
- citationIds: the exact [ids] of the SOURCE INTERACTIONS you used (e.g. ["A1","N2"]). Empty if none.
- confidence: "high" only if well-grounded in specific sources; "medium" if partially grounded; "low" if thin.
- abstained: true if there is NO grounding for this section in the sources — then set content to "" and confidence "low". Do NOT fabricate.`;

  const result = await tracedGenerateObject({
    model,
    schema: sectionsSchema,
    prompt,
    _trace: { agentId: "skill-proposal-fill-sections", tenantId },
  });

  const out: Record<string, GeneratedSection> = {};
  for (const s of (result.object as z.infer<typeof sectionsSchema>).sections) {
    out[s.id] = {
      content: s.content,
      confidence: s.confidence,
      citationIds: s.citationIds,
      abstained: s.abstained,
    };
  }
  return out;
}

/** Deterministic confidence for a resolved field value. */
function fieldTrust(value: string): { confidence: Confidence; abstained: boolean } {
  return value.trim() ? { confidence: "high", abstained: false } : { confidence: "low", abstained: true };
}

export interface FilledComponent {
  componentId: string;
  kind: string;
  label: string;
  content: string;
  order: number;
  confidence: Confidence;
  abstained: boolean;
  citations: Citation[];
  supportRatio: number; // PROPOSAL-009: independent grounding score (0..1)
  unsupported: boolean; // claims not backed by the cited sources
}

export interface FillResult {
  proposalId: string;
  templateId: string;
  dealId: string;
  components: FilledComponent[];
  unmappedSections: string[];
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

type DealRow = {
  id: string;
  name: string;
  stage: string | null;
  companyId: string | null;
  contactId: string | null;
  summary: string | null;
  value: number | null;
  projectAmount: number | null;
  platformArr: number | null;
};
type CompanyRow = { name?: string | null; industry?: string | null; description?: string | null } | null;
type SettingsRow = { onboardingCompanyName?: string | null; productDescription?: string | null };

/** Shared grounding context (sources + facts) for section generation. */
async function assembleSectionContext(
  tenantId: string,
  deal: DealRow,
  company: CompanyRow,
  settings: SettingsRow,
): Promise<{ contextBlock: string; sourcesById: Map<string, CitableSource> }> {
  const sources = await collectCitableSources(tenantId, {
    dealId: deal.id,
    companyId: deal.companyId ?? undefined,
    contactId: deal.contactId ?? undefined,
    knowledgeQuery: `commercial proposal pricing positioning ${company?.name ?? ""} ${company?.industry ?? ""}`,
  });
  const contextBlock = `## Our Company
- Name: ${settings.onboardingCompanyName || "our company"}
- Product: ${settings.productDescription || "not specified"}

## Prospect
- Company: ${company?.name || "unknown"}
- Industry: ${company?.industry || "unknown"}
- Description: ${company?.description || "unknown"}

## Deal
- Name: ${deal.name}
- Stage: ${deal.stage}
- Amount: ${formatDealAmount(getDealAmountDisplay(deal).total)}

## SOURCE INTERACTIONS (cite these by id; [K..] entries are Elevay knowledge)
${sources.block}`;
  return { contextBlock, sourcesById: sources.byId };
}

function buildFieldContext(
  deal: DealRow,
  company: CompanyRow,
  contact: { firstName?: string | null; lastName?: string | null; title?: string | null; email?: string | null } | null,
  settings: SettingsRow & { locale?: unknown },
  now: Date,
): FieldContext {
  return {
    company: company ? { name: company.name, industry: company.industry, description: company.description } : null,
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
    settings: { onboardingCompanyName: settings.onboardingCompanyName, productDescription: settings.productDescription },
    now,
    locale: toBcp47(typeof settings.locale === "string" ? settings.locale : "en-US"),
  };
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
    .where(and(eq(proposalTemplates.id, templateId), eq(proposalTemplates.tenantId, opts.tenantId)))
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

  const fieldCtx = buildFieldContext(deal, company, contact, settings, now);

  const sectionComponents = map.components.filter((c) => c.kind === "section");
  let generated: Record<string, GeneratedSection> = {};
  let sourcesById = new Map<string, CitableSource>();
  if (sectionComponents.length > 0) {
    const ctx = await assembleSectionContext(opts.tenantId, deal, company, settings);
    sourcesById = ctx.sourcesById;
    generated = await generateSections(
      sectionComponents.map((c) => ({ id: c.id, label: c.label })),
      ctx.contextBlock,
      opts.tenantId,
    );
  }

  const filled: FilledComponent[] = map.components
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      if (c.kind === "field") {
        const value = resolveFieldValue(c.dataKey, fieldCtx);
        const trust = fieldTrust(value);
        const citations: Citation[] = trust.abstained
          ? []
          : [{ id: c.dataKey ?? "field", type: "field", label: c.dataKey ?? "field", snippet: value, date: null }];
        return {
          componentId: c.id,
          kind: c.kind,
          label: c.label,
          content: value,
          order: c.order,
          confidence: trust.confidence,
          abstained: trust.abstained,
          citations,
          supportRatio: trust.abstained ? 0 : 1,
          unsupported: trust.abstained,
        };
      }
      const g = generated[c.id] ?? { content: "", confidence: "low" as Confidence, citationIds: [], abstained: true };
      const citations: Citation[] = g.citationIds
        .map((id) => sourcesById.get(id))
        .filter((s): s is CitableSource => Boolean(s))
        .map((s) => ({ id: s.id, type: s.type, label: s.label, snippet: s.snippet, date: s.date }));
      // PROPOSAL-009: grade grounding independently; the model's self-rating is
      // only an upper bound, never the source of truth.
      const grade = gradeSection(g.content, citations.map((x) => x.snippet), g.confidence);
      return {
        componentId: c.id,
        kind: c.kind,
        label: c.label,
        content: g.content,
        order: c.order,
        confidence: grade.confidence,
        abstained: g.abstained,
        citations,
        supportRatio: grade.supportRatio,
        unsupported: grade.unsupported,
      };
    });

  const unmappedSections = filled
    .filter((f) => f.kind === "section" && (f.abstained || !f.content.trim()))
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
          confidence: f.confidence,
          source: {
            citations: f.citations,
            abstained: f.abstained,
            supportRatio: f.supportRatio,
            unsupported: f.unsupported,
          },
          order: f.order,
        };
      }),
    );
  }

  // Surface low-confidence first so the proofreader hits the risky parts first,
  // but keep document order as the tiebreak.
  const components = filled
    .slice()
    .sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] || a.order - b.order);

  return { proposalId, templateId, dealId, components, unmappedSections };
}

export interface RegeneratedComponent {
  componentId: string;
  kind: string;
  label: string;
  content: string;
  confidence: Confidence;
  abstained: boolean;
  citations: Citation[];
  supportRatio: number;
  unsupported: boolean;
}

/**
 * PROPOSAL-004: re-draft a single component (with optional guidance), re-grade,
 * and persist. Tenant-scoped. Reuses the same context + trust path as the full fill.
 */
export async function regenerateComponent(
  proposalId: string,
  componentId: string,
  opts: { tenantId: string; guidance?: string; now?: Date },
): Promise<RegeneratedComponent> {
  const now = opts.now ?? new Date();

  const [pr] = await db
    .select()
    .from(proposals)
    .where(
      and(eq(proposals.id, proposalId), eq(proposals.tenantId, opts.tenantId), isNull(proposals.deletedAt)),
    )
    .limit(1);
  if (!pr) throw new FillUnavailable("deal_not_found", `Proposal ${proposalId} not found`);

  const [tpl] = await db
    .select()
    .from(proposalTemplates)
    .where(and(eq(proposalTemplates.id, pr.templateId), eq(proposalTemplates.tenantId, opts.tenantId)))
    .limit(1);
  if (!tpl || !tpl.componentMap) throw new FillUnavailable("template_not_mapped", "Template unavailable");
  const map = tpl.componentMap as ComponentMap;
  const comp = map.components.find((c) => c.id === componentId);
  if (!comp) throw new FillUnavailable("template_not_mapped", `Component ${componentId} not in template`);

  const [deal] = pr.dealId
    ? await db.select().from(deals).where(and(eq(deals.id, pr.dealId), eq(deals.tenantId, opts.tenantId))).limit(1)
    : [undefined];
  if (!deal) throw new FillUnavailable("deal_not_found", "Deal not found");

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

  let result: RegeneratedComponent;
  if (comp.kind === "field") {
    const fieldCtx = buildFieldContext(deal, company, contact, settings, now);
    const value = resolveFieldValue(comp.dataKey, fieldCtx);
    const trust = fieldTrust(value);
    result = {
      componentId,
      kind: "field",
      label: comp.label,
      content: value,
      confidence: trust.confidence,
      abstained: trust.abstained,
      citations: trust.abstained
        ? []
        : [{ id: comp.dataKey ?? "field", type: "field", label: comp.dataKey ?? "field", snippet: value, date: null }],
      supportRatio: trust.abstained ? 0 : 1,
      unsupported: trust.abstained,
    };
  } else {
    const ctx = await assembleSectionContext(opts.tenantId, deal, company, settings);
    const prompt = opts.guidance
      ? `${ctx.contextBlock}\n\nADDITIONAL GUIDANCE for this section: ${opts.guidance}`
      : ctx.contextBlock;
    const generated = await generateSections([{ id: comp.id, label: comp.label }], prompt, opts.tenantId);
    const g = generated[comp.id] ?? { content: "", confidence: "low" as Confidence, citationIds: [], abstained: true };
    const citations: Citation[] = g.citationIds
      .map((id) => ctx.sourcesById.get(id))
      .filter((s): s is CitableSource => Boolean(s))
      .map((s) => ({ id: s.id, type: s.type, label: s.label, snippet: s.snippet, date: s.date }));
    const grade = gradeSection(g.content, citations.map((x) => x.snippet), g.confidence);
    result = {
      componentId,
      kind: "section",
      label: comp.label,
      content: g.content,
      confidence: grade.confidence,
      abstained: g.abstained,
      citations,
      supportRatio: grade.supportRatio,
      unsupported: grade.unsupported,
    };
  }

  await db
    .update(proposalComponents)
    .set({
      content: result.content,
      confidence: result.confidence,
      source: {
        citations: result.citations,
        abstained: result.abstained,
        supportRatio: result.supportRatio,
        unsupported: result.unsupported,
      },
    })
    .where(
      and(
        eq(proposalComponents.proposalId, proposalId),
        eq(proposalComponents.componentId, componentId),
        eq(proposalComponents.tenantId, opts.tenantId),
      ),
    );

  return result;
}
