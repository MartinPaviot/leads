import { inngest } from "./client";
import { db } from "@/db";
import { releaseEnrollmentById } from "@/lib/anti-collision/enroll-guard";
import { companies, contacts, sequenceSteps, sequenceEnrollments, activities, outboundEmails, emailOptouts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { addBusinessDays } from "@/lib/util/business-days";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { pauseEnrollment } from "@/lib/sequences/enrollment";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { embedEntity, companyToText, contactToText } from "@/lib/ai/embeddings";
import { generateAccountSummary } from "@/lib/ai/ai-account-summary";
import { buildProspectContext } from "@/lib/context/prospect-context";
import { personalizeStepEmail } from "@/lib/agents/sequence-generator";
import { STEP_STRATEGIES } from "@/lib/scoring/outbound-methodologies";
import { trackPipeline } from "@/lib/analytics/pipeline-tracker";
import { logger } from "@/lib/observability/logger";
import { decideRouteMode } from "@/lib/sequence-drafts/router";
import { tenants } from "@/db/schema";
import {
  enrichOrganization,
  employeeCountToRange,
  revenueToRange,
  isApolloAvailable,
} from "@/lib/integrations/apollo-client";
import { enrichContact as runContactWaterfall } from "@/lib/providers/contact-enrichment/waterfall";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

// Enrich a company after creation — uses Apollo API only, no LLM fallback
export const enrichCompany = inngest.createFunction(
  {
    id: "enrich-company",
    name: "Enrich Company Data",
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] enrich-company failed for ${(event as any).data?.companyId}:`, error.message);
    },
    triggers: [{ event: "company/created" }],
  },
  async ({ event, step }: { event: { data: { companyId: string; tenantId: string } }; step: any }) => {
    const { companyId } = event.data as {
      companyId: string;
      tenantId: string;
    };

    const company = await step.run("fetch-company", async () => {
      const [c] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      return c || null;
    });

    if (!company) {
      return { companyId, enriched: false, reason: "Company not found" };
    }

    const props = (company.properties || {}) as Record<string, unknown>;
    if (props.enrichment_source === "apollo" && company.industry && company.description) {
      return { companyId, enriched: false, reason: "Already enriched from Apollo" };
    }

    if (!company.domain) {
      return { companyId, enriched: false, reason: "No domain — cannot enrich without domain" };
    }

    let org: Awaited<ReturnType<typeof enrichOrganization>> = null;

    if (isApolloAvailable()) {
      org = await step.run("enrich-from-apollo", async () => {
        try {
          return await enrichOrganization(company.domain!);
        } catch (err) {
          console.warn(`Apollo enrichment failed for ${company.domain}:`, err);
          return null;
        }
      });
    }

    // LLM fallback when Apollo is unavailable or returned nothing
    if (!org) {
      const { enrichCompanyViaLLM } = await import("@/lib/ai/llm-enrichment");
      const llmResult = await step.run("enrich-from-llm", async () => {
        return enrichCompanyViaLLM(company.name, company.domain, event.data.tenantId || company.tenantId);
      });

      if (llmResult) {
        await step.run("update-company-llm", async () => {
          await db
            .update(companies)
            .set({
              industry: llmResult.industry || company.industry,
              description: llmResult.description || company.description,
              size: llmResult.size || company.size,
              revenue: llmResult.revenue || company.revenue,
              properties: {
                ...props,
                enrichment_source: "llm",
                enrichment_attempted_at: new Date().toISOString(),
                founded_year: llmResult.founded_year,
                technologies: llmResult.technologies,
                city: llmResult.city,
                country: llmResult.country,
                keywords: llmResult.keywords,
              },
              lastEnrichedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(companies.id, companyId));
        });

        // AI summary for LLM-enriched companies — non-blocking
        await step.run("generate-ai-summary-llm", async () => {
          try {
            const [freshCompany] = await db
              .select()
              .from(companies)
              .where(eq(companies.id, companyId))
              .limit(1);
            if (!freshCompany) return;

            const enrichedProps = (freshCompany.properties || {}) as Record<string, unknown>;
            const result = await generateAccountSummary(
              {
                name: freshCompany.name,
                domain: freshCompany.domain,
                industry: freshCompany.industry,
                description: freshCompany.description,
                size: freshCompany.size,
                revenue: freshCompany.revenue,
                properties: enrichedProps,
              },
              event.data.tenantId || company.tenantId,
            );

            if (result) {
              await db
                .update(companies)
                .set({
                  properties: {
                    ...enrichedProps,
                    ai_account_summary: result.ai_account_summary,
                    ai_how_they_make_money: result.ai_how_they_make_money,
                    ai_summary_generated_at: new Date().toISOString(),
                  },
                  updatedAt: new Date(),
                })
                .where(eq(companies.id, companyId));
            }
          } catch (err) {
            console.warn("enrich: AI summary generation (LLM path) failed (non-blocking):", err);
          }
        }).catch((e: unknown) => console.warn("enrich: AI summary step (LLM path) failed (non-blocking)", e));

        return { companyId, enriched: true, source: "llm" };
      }

      // Both Apollo and LLM failed
      await step.run("mark-unenriched", async () => {
        await db
          .update(companies)
          .set({
            properties: {
              ...props,
              enrichment_source: "unavailable",
              enrichment_attempted_at: new Date().toISOString(),
            },
            lastEnrichedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(companies.id, companyId));
      });
      return { companyId, enriched: false, reason: "Both Apollo and LLM returned no data" };
    }

    await step.run("update-company", async () => {
      await db
        .update(companies)
        .set({
          industry: org.industry || company.industry,
          description: org.description || company.description,
          size: employeeCountToRange(org.estimated_num_employees),
          revenue: revenueToRange(org.annual_revenue),
          properties: {
            ...props,
            enrichment_source: "apollo",
            apollo_id: org.id,
            linkedin_url: org.linkedin_url,
            website_url: org.website_url,
            founded_year: org.founded_year,
            technologies: org.technology_names,
            total_funding: org.total_funding,
            total_funding_printed: org.total_funding_printed,
            latest_funding_stage: org.latest_funding_stage,
            employee_count: org.estimated_num_employees,
            annual_revenue: org.annual_revenue,
            annual_revenue_printed: org.annual_revenue_printed,
            city: org.city,
            state: org.state,
            country: org.country,
            keywords: org.keywords,
            enriched_at: new Date().toISOString(),
          },
          lastEnrichedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
    });

    // AI summary — generate after enrichment, non-blocking
    await step.run("generate-ai-summary", async () => {
      try {
        const [freshCompany] = await db
          .select()
          .from(companies)
          .where(eq(companies.id, companyId))
          .limit(1);
        if (!freshCompany) return;

        const enrichedProps = (freshCompany.properties || {}) as Record<string, unknown>;
        const result = await generateAccountSummary(
          {
            name: freshCompany.name,
            domain: freshCompany.domain,
            industry: freshCompany.industry,
            description: freshCompany.description,
            size: freshCompany.size,
            revenue: freshCompany.revenue,
            properties: enrichedProps,
          },
          event.data.tenantId || company.tenantId,
        );

        if (result) {
          await db
            .update(companies)
            .set({
              properties: {
                ...enrichedProps,
                ai_account_summary: result.ai_account_summary,
                ai_how_they_make_money: result.ai_how_they_make_money,
                ai_summary_generated_at: new Date().toISOString(),
              },
              updatedAt: new Date(),
            })
            .where(eq(companies.id, companyId));
        }
      } catch (err) {
        console.warn("enrich: AI summary generation failed (non-blocking):", err);
      }
    }).catch((e: unknown) => console.warn("enrich: AI summary step failed (non-blocking)", e));

    await step.run("re-embed", async () => {
      const text = companyToText({
        name: company.name,
        domain: company.domain,
        industry: org.industry,
        revenue: revenueToRange(org.annual_revenue),
        size: employeeCountToRange(org.estimated_num_employees),
        description: org.description,
      });
      if (text && process.env.OPENAI_API_KEY) {
        await embedEntity(event.data.tenantId || company.tenantId, "company", companyId, text);
      }
    });

    await step.run("track-enriched", async () => {
      await trackPipeline({
        traceId: companyId,
        tenantId: event.data.tenantId || company.tenantId,
        companyId,
        stage: "enriched",
        sourceSystem: "inngest",
        metadata: { source: org ? "apollo" : "llm", domain: company.domain },
      });
    });

    // Real-time signal detection after enrichment completes
    await step.run("realtime-signal-eval", async () => {
      await inngest.send({
        name: "signals/evaluate-realtime",
        data: {
          type: "enrichment_completed" as const,
          tenantId: event.data.tenantId || company.tenantId,
          companyId,
        },
      });
    }).catch((e: unknown) => console.warn("enrich: realtime-signal trigger failed (non-blocking)", e));

    // F001: Fire agent reactor after enrichment
    await step.run("fire-agent-react", async () => {
      await inngest.send({
        name: "agent/react",
        data: {
          tenantId: event.data.tenantId || company.tenantId,
          trigger: "contact_enriched",
          entityType: "company",
          entityId: companyId,
          metadata: { source: org ? "apollo" : "llm", companyName: company.name },
          deduplicationKey: `contact_enriched:company:${companyId}`,
          firedAt: new Date().toISOString(),
        },
      });
    }).catch(() => {});

    return { companyId, enriched: true, source: "apollo" };
  }
);

// Enrich a contact after creation — uses Apollo API only, no LLM fallback
export const enrichContact = inngest.createFunction(
  {
    id: "enrich-contact",
    name: "Enrich Contact Data",
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] enrich-contact failed for ${(event as any).data?.contactId}:`, error.message);
    },
    triggers: [{ event: "contact/created" }],
  },
  async ({ event, step }: { event: { data: { contactId: string; tenantId: string } }; step: any }) => {
    const { contactId } = event.data;

    const contact = await step.run("fetch-contact", async () => {
      const [c] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);
      return c || null;
    });

    if (!contact) {
      return { contactId, enriched: false, reason: "Contact not found" };
    }

    const props = (contact.properties || {}) as Record<string, unknown>;
    if (props.enrichment_source === "apollo" && contact.title) {
      return { contactId, enriched: false, reason: "Already enriched from Apollo" };
    }

    if (!isApolloAvailable()) {
      return { contactId, enriched: false, reason: "Apollo API key not configured" };
    }

    // Resolve company domain/name — drives geo-routing (CH → Lusha first) and
    // gives the phone vendors a company to match on.
    const company = await step.run("fetch-company", async () => {
      if (!contact.companyId) return null;
      const [c] = await db
        .select({ name: companies.name, domain: companies.domain })
        .from(companies)
        .where(eq(companies.id, contact.companyId))
        .limit(1);
      return c || null;
    });

    const apolloId =
      (props.apolloId as string | undefined) || (props.apollo_id as string | undefined) || undefined;
    const emailDomain = contact.email?.split("@")[1];

    // Full contact-enrichment waterfall: Apollo people/match (by id) reveals
    // identity (last_name + linkedin + verified email), then geo-routed phone
    // vendors (Lusha for CH/FR) fill the mobile. Degrades gracefully — a vendor
    // 429/miss just leaves that field empty for the next wave.
    const wf = await step.run("enrich-waterfall", async () => {
      try {
        return await runContactWaterfall(
          {
            firstName: contact.firstName || undefined,
            lastName: contact.lastName || undefined,
            email: contact.email || undefined,
            linkedinUrl: contact.linkedinUrl || undefined,
            companyName: company?.name || undefined,
            companyDomain: company?.domain || emailDomain || undefined,
            apolloId,
          },
          { tenantId: event.data.tenantId || contact.tenantId },
        );
      } catch (err) {
        console.warn(`Contact waterfall failed for ${contactId}:`, err);
        return null;
      }
    });

    if (!wf || !wf.enriched) {
      await step.run("mark-unenriched", async () => {
        await db
          .update(contacts)
          .set({
            properties: {
              ...props,
              enrichment_source: "unavailable",
              enrichment_attempted_at: new Date().toISOString(),
            },
            lastEnrichedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, contactId));
      });
      return { contactId, enriched: false, reason: "No enrichment data" };
    }

    const d = wf.data;
    const phone = d.mobilePhone ?? d.directPhone ?? d.phones[0]?.number ?? contact.phone;

    await step.run("update-contact", async () => {
      await db
        .update(contacts)
        .set({
          firstName: d.firstName || contact.firstName,
          lastName: d.lastName || contact.lastName,
          title: d.title || contact.title,
          linkedinUrl: d.linkedinUrl || contact.linkedinUrl,
          email: !contact.email && d.email ? d.email : contact.email,
          phone,
          properties: {
            ...props,
            enrichment_source: "waterfall",
            apollo_id: apolloId ?? props.apollo_id ?? props.apolloId,
            seniority: d.seniority,
            email_status: d.emailStatus,
            phones: d.phones,
            enriched_at: new Date().toISOString(),
          },
          lastEnrichedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, contactId));
    });

    await step.run("re-embed", async () => {
      const text = contactToText({
        firstName: d.firstName || contact.firstName,
        lastName: d.lastName || contact.lastName,
        title: d.title || contact.title,
        email: d.email || contact.email,
        phone: phone || undefined,
        companyName: company?.name,
      });
      if (text && process.env.OPENAI_API_KEY) {
        await embedEntity(event.data.tenantId || contact.tenantId, "contact", contactId, text);
      }
    });

    return { contactId, enriched: true, source: "waterfall" };
  }
);

// Batch enrich companies — fans out individual company/created events
export const enrichBatch = inngest.createFunction(
  {
    id: "enrich-company-batch",
    name: "Batch Enrich Companies",
    retries: 1,
    concurrency: [{ limit: 3 }],
    triggers: [{ event: "company/enrich-batch" }],
  },
  async ({ event, step }: { event: { data: { companyIds: string[]; tenantId: string } }; step: any }) => {
    const { companyIds, tenantId } = event.data as {
      companyIds: string[];
      tenantId: string;
    };
    let enriched = 0;

    for (const companyId of companyIds) {
      await step.run(`enrich-${companyId}`, async () => {
        await inngest.send({
          name: "company/created",
          data: { companyId, tenantId },
        });
        enriched++;
      });
    }

    return { enriched, total: companyIds.length };
  }
);

const emailSchema = z.object({
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Email body, professional and personalized"),
});

// Send sequence step email
export const sendSequenceStep = inngest.createFunction(
  {
    id: "send-sequence-step",
    name: "Send Sequence Step",
    retries: 3,
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] send-sequence-step failed for enrollment ${(event as any).data?.enrollmentId}:`, error.message);
    },
    triggers: [{ event: "sequence/step-due" }],
  },
  async ({ event, step }: { event: { data: { enrollmentId: string } }; step: any }) => {
    const { enrollmentId } = event.data;

    const enrollment = await step.run("fetch-enrollment", async () => {
      const [e] = await db
        .select()
        .from(sequenceEnrollments)
        .where(eq(sequenceEnrollments.id, enrollmentId))
        .limit(1);
      return e || null;
    });

    if (!enrollment || enrollment.status !== "active") {
      return { enrollmentId, sent: false, reason: "Not active" };
    }

    // P0-1 task 1.4 : when the tenant is on manual approval mode,
    // `routeSequenceStepToDraft` (in `sequence-draft-router.ts`)
    // handles this event and writes a `sequence_drafts` row instead.
    // We bail here so the same event isn't double-processed.
    //
    // The contact has the tenantId ; we resolve via a single fetch.
    const tenantSettings = await step.run("fetch-tenant-mode", async () => {
      const [c] = await db
        .select({ tenantId: contacts.tenantId })
        .from(contacts)
        .where(eq(contacts.id, enrollment.contactId))
        .limit(1);
      if (!c) return null;
      const [t] = await db
        .select({ settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, c.tenantId))
        .limit(1);
      return (t?.settings as Record<string, unknown> | null) ?? {};
    });
    if (decideRouteMode(tenantSettings) === "manual") {
      return {
        enrollmentId,
        sent: false,
        reason: "Tenant on manual approval — routed to draft queue",
      };
    }

    // Fetch the step template
    const stepTemplate = await step.run("fetch-step", async () => {
      const [s] = await db
        .select()
        .from(sequenceSteps)
        .where(
          and(
            eq(sequenceSteps.sequenceId, enrollment.sequenceId),
            eq(sequenceSteps.stepNumber, enrollment.currentStep)
          )
        )
        .limit(1);
      return s || null;
    });

    if (!stepTemplate) {
      // No more steps — mark completed
      await step.run("mark-completed", async () => {
        await db
          .update(sequenceEnrollments)
          .set({ status: "completed" })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      });
      await releaseEnrollmentById(enrollmentId); // Spec 14 — free the anti-collision lock on terminal.
      return { enrollmentId, sent: false, reason: "No more steps" };
    }

    // Fetch contact for personalization
    const contact = await step.run("fetch-contact", async () => {
      const [c] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, enrollment.contactId))
        .limit(1);
      return c || null;
    });

    if (!contact || !contact.email) {
      return { enrollmentId, sent: false, reason: "No contact email" };
    }

    const tenantId = contact.tenantId;

    // Idempotency: if we've already created an outbound for this enrollment+step,
    // skip. Protects against duplicate `sequence/step-due` events from cron
    // overlaps or Inngest retries that re-deliver the trigger.
    const existingOutbound = await step.run("check-duplicate", async () => {
      const [row] = await db
        .select({ id: outboundEmails.id })
        .from(outboundEmails)
        .where(
          and(
            eq(outboundEmails.enrollmentId, enrollmentId),
            eq(outboundEmails.stepNumber, enrollment.currentStep),
          ),
        )
        .limit(1);
      return row || null;
    });
    if (existingOutbound) {
      return { enrollmentId, sent: false, reason: "Outbound already exists for this step" };
    }

    // Generate personalized email using template + LLM
    const model = getLLMModel();
    let subject = stepTemplate.subjectTemplate;
    let body = stepTemplate.bodyTemplate;

    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

    // Substitute template variables
    const vars: Record<string, string> = {
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      fullName: contactName,
      title: contact.title || "",
    };

    for (const [key, value] of Object.entries(vars)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      subject = subject.replace(pattern, value);
      body = body.replace(pattern, value);
    }

    // Personalize with full prospect intelligence.
    //
    // Failure mode discipline: when the LLM call or context build
    // throws, we MUST NOT silently fall back to the bare template
    // (with raw `{{firstName}}` interpolation only). Monaco-parity
    // requirement: every fallback is logged with full context so the
    // founder sees in observability that 8% of step-2 emails went
    // out unpersonalised — and can choose to either tighten the
    // prompt or pause the sequence. The caller (review queue) can
    // also flag the email visually based on `personalisationFallback`.
    const personalized = await step.run("personalize-email", async () => {
      try {
        const ctx = await buildProspectContext(contact.id, enrollment.sequenceId ? "default" : "default");
        if (!ctx) {
          logger.warn("sequence.personalize.missing_context", {
            tenantId,
            sequenceId: enrollment.sequenceId,
            enrollmentId,
            contactId: contact.id,
            stepNumber: enrollment.currentStep,
            reason: "buildProspectContext returned null",
          });
          return { ok: false as const, reason: "missing_prospect_context" };
        }

        // Find the step strategy for this step number
        const strategy = STEP_STRATEGIES.find((s) => s.stepNumber === enrollment.currentStep)
          || STEP_STRATEGIES[0];

        const out = await personalizeStepEmail(ctx, { subject, body }, strategy);
        return { ok: true as const, out };
      } catch (err) {
        logger.warn("sequence.personalize.failed", {
          tenantId,
          sequenceId: enrollment.sequenceId,
          enrollmentId,
          contactId: contact.id,
          stepNumber: enrollment.currentStep,
          errorName: err instanceof Error ? err.name : typeof err,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return { ok: false as const, reason: "llm_personalize_threw" };
      }
    });

    let personalisationFallbackReason: string | null = null;
    if (personalized.ok) {
      subject = personalized.out.subject;
      body = personalized.out.body;
    } else {
      personalisationFallbackReason = personalized.reason;
    }

    // Check opt-out before sending (within the contact's actual tenant)
    const optedOut = await step.run("check-optout", async () => {
      const [opt] = await db
        .select()
        .from(emailOptouts)
        .where(
          and(
            eq(emailOptouts.tenantId, tenantId),
            eq(emailOptouts.emailAddress, contact.email!.toLowerCase())
          )
        )
        .limit(1);
      return !!opt;
    });

    if (optedOut) {
      return { enrollmentId, sent: false, reason: "Opted out" };
    }

    // Create outbound email record (draft or queued depending on autopilot)
    const outboundEmail = await step.run("create-outbound-email", async () => {
      const [email] = await db
        .insert(outboundEmails)
        .values({
          tenantId,
          enrollmentId,
          contactId: enrollment.contactId,
          stepNumber: enrollment.currentStep,
          fromAddress: "pending@rotation", // Will be set by send worker
          toAddress: contact.email!,
          subject,
          bodyHtml: `<div>${body.replace(/\n/g, "<br>")}</div>`,
          bodyText: body,
          status: "queued", // Goes straight to queue — review queue can intercept if needed
          queuedAt: new Date(),
          // Tag personalisation fallbacks with a `[fallback:...]`
          // prefix so the review-queue UI can flag them visibly and
          // analytics can distinguish them from genuine send errors
          // (the latter set `errorMessage` without this prefix when
          // status flips to "failed").
          errorMessage: personalisationFallbackReason
            ? `[fallback:${personalisationFallbackReason}] sent with template-only personalisation`
            : null,
        })
        .returning();
      return email;
    });

    await step.run("track-email-queued", async () => {
      await trackPipeline({
        traceId: enrollmentId,
        tenantId,
        companyId: contact.companyId,
        contactId: enrollment.contactId,
        enrollmentId,
        outboundEmailId: outboundEmail.id,
        stage: "email_queued",
        sourceSystem: "inngest",
        metadata: { step: enrollment.currentStep, subject },
      });
    });

    // Log activity
    await step.run("log-send", async () => {
      await db.insert(activities).values({
        tenantId,
        actorType: "system",
        actorId: null,
        entityType: "contact",
        entityId: enrollment.contactId,
        activityType: "sequence_step_sent",
        channel: "email",
        direction: "outbound",
        summary: `Sequence step ${enrollment.currentStep}: ${subject}`,
        rawContent: body,
        metadata: {
          sequenceId: enrollment.sequenceId,
          stepNumber: enrollment.currentStep,
          enrollmentId,
          outboundEmailId: outboundEmail.id,
          to: contact.email,
        },
      });
    });

    // Advance to next step
    await step.run("advance-step", async () => {
      const nextStep = enrollment.currentStep + 1;

      // Check if next step exists
      const [nextStepTemplate] = await db
        .select()
        .from(sequenceSteps)
        .where(
          and(
            eq(sequenceSteps.sequenceId, enrollment.sequenceId),
            eq(sequenceSteps.stepNumber, nextStep)
          )
        )
        .limit(1);

      if (nextStepTemplate) {
        // Skip weekends unless tenant explicitly opts out — recipients
        // shouldn't get a Tuesday follow-up landing in their Saturday inbox.
        const settings = await getTenantSettings(tenantId).catch(() => ({} as Record<string, unknown>));
        const skipWeekends = (settings as { sequencesSkipWeekends?: boolean }).sequencesSkipWeekends !== false;
        const delayDays = nextStepTemplate.delayDays || 2;
        const nextStepAt = skipWeekends
          ? addBusinessDays(new Date(), delayDays)
          : (() => {
              const d = new Date();
              d.setDate(d.getDate() + delayDays);
              return d;
            })();

        await db
          .update(sequenceEnrollments)
          .set({
            currentStep: nextStep,
            lastStepAt: new Date(),
            nextStepAt,
          })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      } else {
        await db
          .update(sequenceEnrollments)
          .set({
            status: "completed",
            lastStepAt: new Date(),
            nextStepAt: null,
          })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      }
    });

    return { enrollmentId, sent: true, step: enrollment.currentStep };
  }
);

// Process replies and classify them
export const processReply = inngest.createFunction(
  {
    id: "process-reply",
    name: "Process Sequence Reply",
    retries: 3,
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] process-reply failed for enrollment ${(event as any).data?.enrollmentId}:`, error.message);
    },
    triggers: [{ event: "email/reply-received" }],
  },
  async ({ event, step }: { event: { data: { enrollmentId: string; replyContent?: string; replyBody?: string; outboundEmailId?: string; tenantId?: string } }; step: any }) => {
    const { enrollmentId, outboundEmailId, tenantId } = event.data;
    // The sync pipeline (sync-functions.ts) emits `replyBody`; older callers
    // used `replyContent`. Reading only the latter made classify-reply throw
    // on every IMAP-synced reply (3 retries → dead letter), so the
    // classification never persisted. Accept both, fail-soft on empty.
    const replyContent = event.data.replyContent ?? event.data.replyBody ?? "";

    // Mark enrollment as replied (centralised — also writes audit activity)
    await step.run("mark-replied", async () => {
      await pauseEnrollment(enrollmentId, "replied");
    });

    // Classify the reply if LLM available
    const model = getLLMModel();
    let classification = "unknown";

    if (model && replyContent.trim().length > 0) {
      const result = await step.run("classify-reply", async () => {
        const { object } = await tracedGenerateObject({
          model: model!,
          schema: z.object({
            classification: z.enum([
              "interested",
              "meeting_request",
              "objection_price",
              "objection_timing",
              "objection_competitor",
              "objection_authority",
              "ooo",
              "unsubscribe",
            ]),
            reason: z.string(),
            objectionDetail: z.string().optional().describe("Specific concern if objection"),
            nextAction: z.string().describe("Recommended next action"),
            urgency: z.enum(["high", "medium", "low"]),
          }),
          prompt: `Classify this email reply with precision:

"${replyContent.slice(0, 500)}"

Classifications:
- interested: wants to learn more, asks questions, open to conversation
- meeting_request: explicitly asks for a call, demo, or meeting
- objection_price: too expensive, budget concerns, ROI questions
- objection_timing: not now, maybe later, bad quarter, busy period
- objection_competitor: already using something else, comparing tools
- objection_authority: need to check with boss, not the decision-maker, internal process
- ooo: out of office auto-reply
- unsubscribe: asks to be removed, stop emailing

Also determine:
- objectionDetail: the specific concern or question (if applicable)
- nextAction: what should happen next (e.g., "send case study", "propose meeting times", "follow up in Q2")
- urgency: high (ready to act), medium (interested but not urgent), low (lukewarm or future)`,
          _trace: { agentId: "process-reply", tenantId: "default" },
        });
        return object as any;
      });
      classification = result.classification;

      // Persist the classification on the replied outbound email — the
      // inbox triage lanes and outcome-detector both read this column
      // (it used to be computed here and dropped, leaving it always null).
      if (outboundEmailId) {
        await step.run("persist-classification", async () => {
          await db
            .update(outboundEmails)
            .set({ replyClassification: result.classification, updatedAt: new Date() })
            .where(
              tenantId
                ? and(eq(outboundEmails.id, outboundEmailId), eq(outboundEmails.tenantId, tenantId))
                : eq(outboundEmails.id, outboundEmailId),
            );
        });
      }

      // Fire event for intelligent reply handling (if not ooo/unsubscribe)
      if (!["ooo", "unsubscribe"].includes(classification)) {
        await step.run("trigger-reply-handler", async () => {
          await inngest.send({
            name: "reply/classified",
            data: {
              enrollmentId,
              classification: result.classification,
              reason: result.reason,
              objectionDetail: result.objectionDetail,
              nextAction: result.nextAction,
              urgency: result.urgency,
              replyContent: replyContent.slice(0, 1000),
            },
          });
        });
      }

      // Handle OOO: reschedule next step
      if (classification === "ooo") {
        await step.run("reschedule-ooo", async () => {
          // Try to parse return date from the reply
          const returnMatch = replyContent.match(/(?:back|return|available|retour)\s+(?:on\s+)?(\w+\s+\d{1,2}|\d{1,2}\/\d{1,2})/i);
          const rescheduleDate = new Date();
          if (returnMatch) {
            const parsed = new Date(returnMatch[1]);
            if (!isNaN(parsed.getTime())) {
              rescheduleDate.setTime(parsed.getTime());
              rescheduleDate.setDate(rescheduleDate.getDate() + 1); // day after return
            } else {
              rescheduleDate.setDate(rescheduleDate.getDate() + 7); // default 1 week
            }
          } else {
            rescheduleDate.setDate(rescheduleDate.getDate() + 7);
          }

          await db
            .update(sequenceEnrollments)
            .set({ status: "active", nextStepAt: rescheduleDate })
            .where(eq(sequenceEnrollments.id, enrollmentId));
        });
      }

      // If unsubscribe, update enrollment AND add to global opt-out list
      if (classification === "unsubscribe") {
        await step.run("mark-unsubscribed", async () => {
          await db
            .update(sequenceEnrollments)
            .set({ status: "unsubscribed" })
            .where(eq(sequenceEnrollments.id, enrollmentId));
        });
        await releaseEnrollmentById(enrollmentId); // Spec 14 — free the anti-collision lock on terminal.

        // Add to global opt-out list so ALL future sequences are blocked
        await step.run("add-to-optout", async () => {
          const [enrollment] = await db
            .select()
            .from(sequenceEnrollments)
            .where(eq(sequenceEnrollments.id, enrollmentId))
            .limit(1);
          if (!enrollment) return;

          const [contact] = await db
            .select()
            .from(contacts)
            .where(eq(contacts.id, enrollment.contactId))
            .limit(1);
          if (!contact?.email) return;

          await db
            .insert(emailOptouts)
            .values({
              tenantId: contact.tenantId || "default",
              emailAddress: contact.email.toLowerCase(),
              reason: "unsubscribe",
            })
            .onConflictDoNothing();
        });
      }
    }

    return { enrollmentId, classification };
  }
);
