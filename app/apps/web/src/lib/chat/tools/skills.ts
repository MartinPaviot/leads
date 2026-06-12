import { db } from "@/db";
import { companies, proposalTemplates } from "@/db/schema";
import { desc, eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { makeTool, type ToolContext } from "./context";

export function buildSkillsTools(ctx: ToolContext) {
  const { tenantId, settings } = ctx;

  return {
    analyzePipeline: makeTool({
      description: `Analyze the entire deal pipeline: stage breakdown, stuck deals, win rate, average deal value, velocity. Use when user asks "how's my pipeline", "pipeline review", "deal health", "what's stuck", or "forecast".`,
      inputSchema: z.object({
        periodDays: z.number().optional().describe("Analysis period in days (default 30)"),
        stuckThresholdDays: z
          .number()
          .optional()
          .describe("Days before a deal is considered stuck (default 14)"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { pipelineReviewSkill } = await import("@/skills/intelligence/pipeline-review");
        const result = await runSkill(
          pipelineReviewSkill,
          {
            periodDays: input.periodDays ?? 30,
            stuckThresholdDays: input.stuckThresholdDays ?? 14,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    scanSignals: makeTool({
      description: `Scan companies for buying signals: funding events, engagement spikes, stalled deals, tech adoption. Use when user asks "any signals?", "who's showing intent?", "what companies are active?", or "buying signals".`,
      inputSchema: z.object({
        companyIds: z
          .array(z.string())
          .optional()
          .describe("Specific company IDs to scan, or omit to scan top-scored companies"),
        signalTypes: z
          .array(z.string())
          .optional()
          .describe("Signal types: funding, engagement_spike, deal_stall, tech_adoption"),
        lookbackDays: z.number().optional().describe("Days to look back (default 30)"),
      }),
      execute: async (input) => {
        let ids = input.companyIds;
        if (!ids || ids.length === 0) {
          const topCompanies = await db
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.tenantId, tenantId))
            .orderBy(desc(companies.score))
            .limit(50);
          ids = topCompanies.map((c) => c.id);
        }
        if (ids.length === 0) return { signals: [], message: "No companies to scan" };

        const { runSkill } = await import("@/skills/runner");
        const { signalScannerSkill } = await import("@/skills/signals/signal-scanner");
        const result = await runSkill(
          signalScannerSkill,
          {
            companyIds: ids,
            signalTypes: input.signalTypes ?? [
              "funding",
              "engagement_spike",
              "deal_stall",
              "tech_adoption",
            ],
            lookbackDays: input.lookbackDays ?? 30,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    generateBattlecard: makeTool({
      description: `Generate a competitive sales battlecard against a competitor. Use when user asks "battlecard for X", "how do we compete with X", "competitive analysis of X", or "what are X's weaknesses".`,
      inputSchema: z.object({
        competitorDomain: z.string().describe("Competitor website domain (e.g. competitor.com)"),
        competitorName: z.string().optional(),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { battlecardGeneratorSkill } = await import(
          "@/skills/intelligence/battlecard-generator"
        );
        const result = await runSkill(
          battlecardGeneratorSkill,
          {
            competitorDomain: input.competitorDomain,
            competitorName: input.competitorName,
            ourProductDescription: settings.productDescription,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    researchCompetitor: makeTool({
      description: `Research a competitor: team, funding, tech stack, positioning, vulnerabilities. Use when user asks "tell me about X", "research X company", "who are X's leaders", or "competitor intel on X".`,
      inputSchema: z.object({
        competitorDomain: z.string().describe("Competitor domain (e.g. competitor.com)"),
        competitorName: z.string().optional(),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { competitorIntelSkill } = await import("@/skills/intelligence/competitor-intel");
        const result = await runSkill(
          competitorIntelSkill,
          {
            competitorDomain: input.competitorDomain,
            competitorName: input.competitorName,
            focusAreas: ["product", "positioning", "team", "funding", "tech_stack"],
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    detectChurnRisk: makeTool({
      description: `Scan all accounts for churn risk: inactivity, negative sentiment, engagement drops. Use when user asks "who's at risk?", "churn risk", "which accounts are going dark?", or "customer health".`,
      inputSchema: z.object({
        lookbackDays: z.number().optional().describe("Analysis period (default 60)"),
        inactivityThresholdDays: z
          .number()
          .optional()
          .describe("Days of inactivity before flagging (default 21)"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { churnRiskDetectorSkill } = await import(
          "@/skills/intelligence/churn-risk-detector"
        );
        const result = await runSkill(
          churnRiskDetectorSkill,
          {
            lookbackDays: input.lookbackDays ?? 60,
            inactivityThresholdDays: input.inactivityThresholdDays ?? 21,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    analyzeSequencePerformance: makeTool({
      description: `Analyze email sequence/campaign performance: open rates, reply rates, bounce rates per step. Use when user asks "how are my campaigns doing?", "sequence performance", "email stats", or "which campaign works best?".`,
      inputSchema: z.object({
        sequenceId: z.string().optional().describe("Specific sequence ID, or omit for all"),
        periodDays: z.number().optional().describe("Analysis period (default 30)"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { sequencePerformanceSkill } = await import(
          "@/skills/intelligence/sequence-performance"
        );
        const result = await runSkill(
          sequencePerformanceSkill,
          {
            sequenceId: input.sequenceId,
            periodDays: input.periodDays ?? 30,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    findLeadsAtCompany: makeTool({
      description: `Find decision-makers at a specific company using Apollo. Use when user asks "find contacts at X", "who works at X", "get me the VP Sales at X", or "decision makers at X".`,
      inputSchema: z.object({
        companyDomain: z.string().describe("Company domain to search"),
        targetTitles: z.array(z.string()).optional().describe("Specific titles to look for"),
        targetSeniorities: z
          .array(z.string())
          .optional()
          .describe("Seniority levels: c_suite, vp, director, manager"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { companyContactFinderSkill } = await import(
          "@/skills/enrichment/company-contact-finder"
        );
        const result = await runSkill(
          companyContactFinderSkill,
          {
            companyDomain: input.companyDomain,
            targetTitles: input.targetTitles,
            targetSeniorities: input.targetSeniorities ?? ["c_suite", "vp", "director"],
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    detectExpansionOpportunities: makeTool({
      description: `Find upsell/expansion opportunities among existing customers: new departments engaging, positive sentiment, activity increases, headcount growth. Use when user asks "expansion opportunities", "who can we upsell?", "growth signals from customers".`,
      inputSchema: z.object({
        lookbackDays: z.number().optional().describe("Analysis period (default 30)"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { expansionSignalSpotterSkill } = await import(
          "@/skills/signals/expansion-signal-spotter"
        );
        const result = await runSkill(
          expansionSignalSpotterSkill,
          {
            lookbackDays: input.lookbackDays ?? 30,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    buildTAM: makeTool({
      description: `Build a scored Total Addressable Market using Apollo. Use when user asks "build my TAM", "find companies matching my ICP", "search for target companies", "prospect list for fintech".`,
      inputSchema: z.object({
        keywords: z
          .array(z.string())
          .optional()
          .describe("Company keyword tags (e.g. ['saas', 'fintech'])"),
        employeeRanges: z
          .array(z.string())
          .optional()
          .describe("Apollo ranges like ['51,200', '201,500']"),
        locations: z.array(z.string()).optional().describe("Locations like ['United States', 'France']"),
        maxPages: z
          .number()
          .optional()
          .describe("Pages to search (default 5, each = 100 companies)"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { tamBuilderSkill } = await import("@/skills/enrichment/tam-builder");
        const result = await runSkill(
          tamBuilderSkill,
          {
            mode: "build",
            companyFilters: {
              q_organization_keyword_tags: input.keywords,
              organization_num_employees_ranges: input.employeeRanges,
              organization_locations: input.locations,
            },
            maxPages: input.maxPages ?? 5,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    findLeadsByDomain: makeTool({
      description: `Find leads across multiple company domains using Apollo. Two-phase: free search then optional paid enrichment. Use when user asks "find leads at these companies", "prospect across domains", "get contacts for my target list".`,
      inputSchema: z.object({
        domains: z.array(z.string()).describe("Company domains to search"),
        personTitles: z.array(z.string()).optional().describe("Job titles to filter"),
        personSeniorities: z.array(z.string()).optional().describe("Seniority levels"),
        enrichEmails: z.boolean().optional().describe("Enrich for verified emails (costs credits)"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { apolloLeadFinderSkill } = await import("@/skills/enrichment/apollo-lead-finder");
        const result = await runSkill(
          apolloLeadFinderSkill,
          {
            domains: input.domains,
            personTitles: input.personTitles,
            personSeniorities: input.personSeniorities ?? ["c_suite", "vp", "director"],
            enrichEmails: input.enrichEmails ?? false,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    defineICP: makeTool({
      description: `Analyze a company and define its Ideal Customer Profile. Use when user asks "define ICP for X", "who should we target?", "ideal customer for our product", "ICP analysis".`,
      inputSchema: z.object({
        companyDomain: z.string().describe("Company domain to analyze"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { icpIdentificationSkill } = await import("@/skills/scoring/icp-identification");
        const result = await runSkill(
          icpIdentificationSkill,
          {
            companyDomain: input.companyDomain,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    prepSalesCall: makeTool({
      description: `Deep pre-call preparation: person insights, company intel, competitive landscape, call strategy, opening hook, discovery questions, objection handlers. Use when user asks "prep for call with X", "call strategy for X", "how to approach this meeting".`,
      inputSchema: z.object({
        contactId: z.string().describe("Contact ID for the call"),
        dealId: z.string().optional().describe("Associated deal ID"),
        callType: z
          .enum(["discovery", "demo", "follow_up", "negotiation", "close"])
          .optional(),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { salesCallPrepSkill } = await import("@/skills/intelligence/sales-call-prep");
        const result = await runSkill(
          salesCallPrepSkill,
          {
            contactId: input.contactId,
            dealId: input.dealId,
            callType: input.callType ?? "discovery",
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    qualifyLeads: makeTool({
      description: `Batch-qualify contacts against the ICP profiles (stored ICP-fit score: company criteria + persona match, refreshed before reading). Use when user asks "qualify these leads", "score my contacts", "which leads are worth pursuing?", "rank contacts by fit".`,
      inputSchema: z.object({
        contactIds: z.array(z.string()).describe("Contact IDs to qualify"),
        minScoreThreshold: z
          .number()
          .optional()
          .describe("Minimum score to be qualified (default 40)"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { leadQualificationSkill } = await import("@/skills/scoring/lead-qualification");
        const result = await runSkill(
          leadQualificationSkill,
          {
            contactIds: input.contactIds,
            minScoreThreshold: input.minScoreThreshold ?? 40,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    qualifyInboundLead: makeTool({
      description: `Qualify a single inbound lead: score, detect duplicates, determine priority (hot/warm/nurture/disqualified), recommend action. Use when user asks "qualify this lead", "is this lead worth it?", "triage this inbound".`,
      inputSchema: z.object({
        contactId: z.string().describe("Contact ID of the inbound lead"),
        source: z
          .enum([
            "form",
            "demo_request",
            "trial",
            "content_download",
            "webinar",
            "chatbot",
            "referral",
            "unknown",
          ])
          .optional(),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { inboundLeadQualificationSkill } = await import(
          "@/skills/scoring/inbound-lead-qualification"
        );
        const result = await runSkill(
          inboundLeadQualificationSkill,
          {
            contactId: input.contactId,
            source: input.source ?? "unknown",
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    enrichContact: makeTool({
      description: `Enrich a contact with Apollo data: fills missing title, LinkedIn, phone, seniority, departments. Also enriches company. Use when user asks "enrich this contact", "get more data on X", "fill in missing info for X".`,
      inputSchema: z.object({
        contactId: z.string().describe("Contact ID to enrich"),
        enrichCompany: z
          .boolean()
          .optional()
          .describe("Also enrich associated company (default true)"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { inboundLeadEnrichmentSkill } = await import(
          "@/skills/enrichment/inbound-lead-enrichment"
        );
        const result = await runSkill(
          inboundLeadEnrichmentSkill,
          {
            contactId: input.contactId,
            enrichCompany: input.enrichCompany ?? true,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    checkDuplicates: makeTool({
      description: `Check if contacts already exist in the CRM to prevent duplicate outreach. Use when user asks "are these duplicates?", "check for existing contacts", "dedup this list".`,
      inputSchema: z.object({
        contacts: z
          .array(
            z.object({
              email: z.string().optional(),
              linkedinUrl: z.string().optional(),
              name: z.string().optional(),
            })
          )
          .describe("Contacts to check"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { contactCacheSkill } = await import("@/skills/signals/contact-cache");
        const result = await runSkill(
          contactCacheSkill,
          {
            action: "check",
            contacts: input.contacts,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    trackChampions: makeTool({
      description: `Check if known champions/advocates have changed jobs or titles. Use when user asks "check my champions", "did anyone change jobs?", "champion tracking", "job change alerts".`,
      inputSchema: z.object({
        contactIds: z.array(z.string()).describe("Contact IDs of champions to track"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { championTrackerSkill } = await import("@/skills/signals/champion-tracker");
        const result = await runSkill(
          championTrackerSkill,
          {
            contactIds: input.contactIds,
            detectJobChange: true,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    checkFundingSignals: makeTool({
      description: `Check companies for new funding rounds. Use when user asks "any funding news?", "who just raised?", "funding signals", "recently funded companies".`,
      inputSchema: z.object({
        companyIds: z
          .array(z.string())
          .optional()
          .describe("Specific company IDs, or omit for top companies"),
      }),
      execute: async (input) => {
        let ids = input.companyIds;
        if (!ids || ids.length === 0) {
          const topCompanies = await db
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.tenantId, tenantId))
            .orderBy(desc(companies.score))
            .limit(100);
          ids = topCompanies.map((c) => c.id);
        }
        if (ids.length === 0) return { signals: [], message: "No companies to check" };
        const { runSkill } = await import("@/skills/runner");
        const { fundingSignalMonitorSkill } = await import(
          "@/skills/signals/funding-signal-monitor"
        );
        const result = await runSkill(
          fundingSignalMonitorSkill,
          {
            companyIds: ids,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    checkHiringSignals: makeTool({
      description: `Detect growth/hiring signals from employee count changes. Use when user asks "who's hiring?", "growth signals", "hiring intent", "which companies are growing?".`,
      inputSchema: z.object({
        companyIds: z
          .array(z.string())
          .optional()
          .describe("Specific company IDs, or omit for top companies"),
        targetKeywords: z
          .array(z.string())
          .optional()
          .describe("Job title keywords indicating buying intent"),
      }),
      execute: async (input) => {
        let ids = input.companyIds;
        if (!ids || ids.length === 0) {
          const topCompanies = await db
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.tenantId, tenantId))
            .orderBy(desc(companies.score))
            .limit(50);
          ids = topCompanies.map((c) => c.id);
        }
        if (ids.length === 0) return { signals: [], message: "No companies to check" };
        const { runSkill } = await import("@/skills/runner");
        const { jobPostingIntentSkill } = await import("@/skills/signals/job-posting-intent");
        const result = await runSkill(
          jobPostingIntentSkill,
          {
            companyIds: ids,
            targetKeywords: input.targetKeywords ?? [],
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    detectLeadershipChanges: makeTool({
      description: `Detect new VP+ and C-suite hires at tracked companies and draft outreach. Use when user asks "any new leaders?", "leadership changes", "new VPs at target accounts", "executive changes".`,
      inputSchema: z.object({
        companyIds: z
          .array(z.string())
          .optional()
          .describe("Specific company IDs, or omit for top companies"),
        generateOutreach: z
          .boolean()
          .optional()
          .describe("Auto-generate outreach emails (default true)"),
      }),
      execute: async (input) => {
        let ids = input.companyIds;
        if (!ids || ids.length === 0) {
          const topCompanies = await db
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.tenantId, tenantId))
            .orderBy(desc(companies.score))
            .limit(30);
          ids = topCompanies.map((c) => c.id);
        }
        if (ids.length === 0) return { changes: [], message: "No companies to check" };
        const { runSkill } = await import("@/skills/runner");
        const { leadershipChangeOutreachSkill } = await import(
          "@/skills/outreach/leadership-change-outreach"
        );
        const result = await runSkill(
          leadershipChangeOutreachSkill,
          {
            companyIds: ids,
            generateOutreach: input.generateOutreach ?? true,
          },
          { tenantId, dryRun: false }
        );
        return result.data ?? { error: result.error };
      },
    }),

    scopePoC: makeTool({
      description: `Scope a Proof of Concept for a deal: objective, success criteria, timeline, resources, risks. Use when user asks "scope a PoC for X", "PoC plan for this deal", "trial plan", "pilot scope".`,
      inputSchema: z.object({
        dealId: z.string().describe("Deal ID to scope the PoC for"),
        focusAreas: z.array(z.string()).optional().describe("Specific areas to focus on"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { scopePocSkill } = await import("@/skills/intelligence/scope-poc");
        const result = await runSkill(
          scopePocSkill,
          { dealId: input.dealId, focusAreas: input.focusAreas },
          { tenantId, dryRun: false },
        );
        return result.data ?? { error: result.error };
      },
    }),

    draftProposal: makeTool({
      description: `Draft a commercial proposal for a deal: executive summary, problem statement, solution, implementation plan, pricing, next steps. Use when user asks "draft a proposal for X", "write a proposal", "create proposal for this deal".`,
      inputSchema: z.object({
        dealId: z.string().describe("Deal ID to draft proposal for"),
        includePricing: z.boolean().optional().describe("Include pricing section (default true)"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { draftProposalSkill } = await import("@/skills/intelligence/draft-proposal");
        const result = await runSkill(
          draftProposalSkill,
          { dealId: input.dealId, includePricing: input.includePricing },
          { tenantId, dryRun: false },
        );
        return result.data ?? { error: result.error };
      },
    }),

    handleObjection: makeTool({
      description: `Get a strategic response to a specific prospect objection. Use when user asks "how do I handle this objection", "they said X, what do I say", "objection response for X", "counter to pricing objection".`,
      inputSchema: z.object({
        dealId: z.string().describe("Deal ID for context"),
        objection: z.string().describe("The specific objection text"),
        objectionCategory: z
          .enum(["pricing", "timing", "competition", "technical", "authority", "need", "other"])
          .optional(),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { handleObjectionSkill } = await import("@/skills/intelligence/handle-objection");
        const result = await runSkill(
          handleObjectionSkill,
          {
            dealId: input.dealId,
            objection: input.objection,
            objectionCategory: input.objectionCategory,
          },
          { tenantId, dryRun: false },
        );
        return result.data ?? { error: result.error };
      },
    }),

    reEngageStalledDeal: makeTool({
      description: `Generate a re-engagement strategy for a stalled deal: diagnosis, approach, email draft, alternative angles. Use when user asks "re-engage this deal", "how to get this deal moving", "deal is stuck, what do I do", "breakup email for X".`,
      inputSchema: z.object({
        dealId: z.string().describe("Stalled deal ID"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { reEngageStalledSkill } = await import("@/skills/intelligence/re-engage-stalled");
        const result = await runSkill(
          reEngageStalledSkill,
          { dealId: input.dealId },
          { tenantId, dryRun: false },
        );
        return result.data ?? { error: result.error };
      },
    }),

    listProposalTemplates: makeTool({
      description: `List the user's proposal templates and their status (uploaded/detected/mapped), or inspect one template's detected component map. Use when the user asks "show my proposal templates", "what proposal templates do I have", or "show the components for template X".`,
      inputSchema: z.object({
        templateId: z
          .string()
          .optional()
          .describe("Inspect a specific template's component map; omit to list all"),
      }),
      execute: async (input) => {
        if (input.templateId) {
          const [tpl] = await db
            .select()
            .from(proposalTemplates)
            .where(
              and(
                eq(proposalTemplates.id, input.templateId),
                eq(proposalTemplates.tenantId, tenantId),
                isNull(proposalTemplates.deletedAt),
              ),
            )
            .limit(1);
          if (!tpl) return { error: "Template not found" };
          return {
            template: {
              id: tpl.id,
              name: tpl.name,
              status: tpl.status,
              componentMap: tpl.componentMap,
            },
          };
        }
        const templates = await db
          .select({
            id: proposalTemplates.id,
            name: proposalTemplates.name,
            status: proposalTemplates.status,
            sourceFormat: proposalTemplates.sourceFormat,
            updatedAt: proposalTemplates.updatedAt,
          })
          .from(proposalTemplates)
          .where(
            and(
              eq(proposalTemplates.tenantId, tenantId),
              isNull(proposalTemplates.deletedAt),
            ),
          )
          .orderBy(desc(proposalTemplates.updatedAt))
          .limit(50);
        return { templates };
      },
    }),

    fillProposal: makeTool({
      description: `Draft a commercial proposal by filling a MAPPED template from a deal's information base (resolves field values + generates each section's prose). Use when the user asks "draft a proposal for deal X using template Y", "fill my proposal template for this deal", or "generate the proposal".`,
      inputSchema: z.object({
        templateId: z.string().describe("A mapped proposal template id"),
        dealId: z.string().describe("The deal to draft the proposal for"),
      }),
      execute: async (input) => {
        const { runSkill } = await import("@/skills/runner");
        const { proposalFillSkill } = await import("@/skills/intelligence/proposal-fill");
        const result = await runSkill(
          proposalFillSkill,
          { templateId: input.templateId, dealId: input.dealId },
          { tenantId, dryRun: false },
        );
        return result.data ?? { error: result.error };
      },
    }),
  };
}
