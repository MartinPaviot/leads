import { inngest } from "./client";
import { guardEnrollment } from "@/lib/anti-collision/enroll-guard";
import { db } from "@/db";
import {
  companies,
  contacts,
  sequences,
  sequenceSteps,
  sequenceEnrollments,
  outboundEmails,
  emailOptouts,
} from "@/db/schema";
import { and, eq, sql, gte, inArray, isNotNull } from "drizzle-orm";
import { enrichOrganization, searchPeople, isApolloAvailable } from "@/lib/integrations/apollo-client";
import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import {
  hasContactScorableCriteria,
  scoreContactIcpBatch,
} from "@/lib/scoring/contact-icp-fit";
import type { CampaignConfig } from "@/lib/config/campaign-types";
import { buildProspectContext } from "@/lib/context/prospect-context";
import { personalizeStepEmail } from "@/lib/agents/sequence-generator";
import { STEP_STRATEGIES } from "@/lib/scoring/outbound-methodologies";

/**
 * Async campaign preparation pipeline.
 * Triggered by POST /api/campaigns/prepare.
 *
 * Steps: select segment → enrich companies → discover contacts → score → enroll + draft → finalize
 */
export const prepareCampaign = inngest.createFunction(
  {
    id: "prepare-campaign",
    name: "Prepare Campaign Pipeline",
    retries: 1,
    onFailure: async ({ error, event }) => {
      const sequenceId = (event as any).data?.sequenceId;
      console.error(`[DEAD LETTER] prepare-campaign failed for sequence ${sequenceId}:`, error.message);
      // Mark campaign as failed
      if (sequenceId) {
        try {
          const [seq] = await db
            .select({ campaignConfig: sequences.campaignConfig })
            .from(sequences)
            .where(eq(sequences.id, sequenceId))
            .limit(1);
          if (seq) {
            const config = (seq.campaignConfig || {}) as any;
            config.status = "idle";
            config.error = error.message?.substring(0, 500);
            await db
              .update(sequences)
              .set({ campaignConfig: config })
              .where(eq(sequences.id, sequenceId));
          }
        } catch { /* best effort */ }
      }
    },
    triggers: [{ event: "campaign/prepare" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { sequenceId: string; tenantId: string; userId?: string; config: CampaignConfig } };
    step: any;
  }) => {
    const { sequenceId, tenantId, userId, config } = event.data;
    const { segmentFilters, targetRoles, maxCompanies, maxContactsPerCompany } = config;

    // ── Step A: Select TAM segment ──
    const selectedCompanies = await step.run("select-segment", async () => {
      const conditions = [
        eq(companies.tenantId, tenantId),
        sql`properties->>'source' = 'tam'`,
      ];

      if (segmentFilters.minScore && segmentFilters.minScore > 0) {
        conditions.push(gte(companies.score, segmentFilters.minScore));
      }
      if (segmentFilters.industries?.length) {
        conditions.push(inArray(companies.industry, segmentFilters.industries));
      }
      if (segmentFilters.sizes?.length) {
        conditions.push(inArray(companies.size, segmentFilters.sizes));
      }
      if (segmentFilters.geographies?.length) {
        conditions.push(
          sql`(properties->>'country') IN (${sql.join(
            segmentFilters.geographies.map((g) => sql`${g}`),
            sql`, `
          )})`
        );
      }

      const result = await db
        .select({
          id: companies.id,
          name: companies.name,
          domain: companies.domain,
          industry: companies.industry,
          size: companies.size,
          description: companies.description,
          score: companies.score,
          properties: companies.properties,
        })
        .from(companies)
        .where(and(...conditions))
        .orderBy(sql`score DESC NULLS LAST`)
        .limit(maxCompanies);

      return result;
    });

    if (selectedCompanies.length === 0) {
      // No companies match — mark idle and return
      await step.run("no-match", async () => {
        const cfg = { ...config, status: "idle" as const, error: "No companies match the selected filters" };
        await db.update(sequences).set({ campaignConfig: cfg }).where(eq(sequences.id, sequenceId));
      });
      return { sequenceId, result: "no_match", companiesFound: 0 };
    }

    // ── Step B: Enrich companies that need it ──
    const enrichResult = await step.run("enrich-companies", async () => {
      if (!isApolloAvailable()) return { enriched: 0 };
      let enriched = 0;

      for (const company of selectedCompanies) {
        const props = (company.properties || {}) as any;
        if (props.needs_enrichment !== true) continue;
        if (!company.domain) continue;

        try {
          const org = await enrichOrganization(company.domain);
          if (!org) continue;

          const updatedProps = {
            ...props,
            needs_enrichment: false,
            enrichment_source: "apollo",
            apollo_id: org.id,
            linkedin_url: org.linkedin_url,
            technologies: org.technology_names || [],
            total_funding: org.total_funding,
            total_funding_printed: org.total_funding_printed,
            latest_funding_stage: org.latest_funding_stage,
            founded_year: org.founded_year,
            city: org.city,
            state: org.state,
            country: org.country,
            keywords: org.keywords || [],
            enriched_at: new Date().toISOString(),
          };

          const empCount = org.estimated_num_employees;
          let size = company.size;
          if (empCount) {
            if (empCount <= 10) size = "1-10";
            else if (empCount <= 20) size = "11-20";
            else if (empCount <= 50) size = "21-50";
            else if (empCount <= 100) size = "51-100";
            else if (empCount <= 200) size = "101-200";
            else if (empCount <= 500) size = "201-500";
            else if (empCount <= 1000) size = "501-1,000";
            else size = "1,001+";
          }

          await db
            .update(companies)
            .set({
              industry: org.industry || company.industry,
              size,
              description: org.description || company.description,
              properties: updatedProps,
              updatedAt: new Date(),
            })
            .where(eq(companies.id, company.id));

          enriched++;
        } catch {
          // Skip failed enrichments
        }
      }

      return { enriched };
    });

    // ── Step C: Discover contacts ──
    const discoveredContacts = await step.run("discover-contacts", async () => {
      if (!isApolloAvailable() || targetRoles.length === 0) return { contactIds: [], found: 0 };

      const contactIds: string[] = [];

      // Get existing contact emails to deduplicate
      const existingContacts = await db
        .select({ email: contacts.email })
        .from(contacts)
        .where(eq(contacts.tenantId, tenantId))
        .limit(5000);
      const existingEmails = new Set(
        existingContacts.map((c) => c.email?.toLowerCase()).filter(Boolean)
      );

      // Get opt-outs
      const optouts = await db
        .select({ emailAddress: emailOptouts.emailAddress })
        .from(emailOptouts)
        .where(eq(emailOptouts.tenantId, tenantId));
      const optoutEmails = new Set(optouts.map((o) => o.emailAddress.toLowerCase()));

      for (const company of selectedCompanies) {
        if (!company.domain) continue;

        try {
          const result = await searchPeople({
            q_organization_domains: company.domain,
            person_titles: targetRoles,
            per_page: maxContactsPerCompany,
          });

          for (const person of result.people) {
            if (!person.email) continue;
            const emailLower = person.email.toLowerCase();
            if (existingEmails.has(emailLower)) continue;
            if (optoutEmails.has(emailLower)) continue;

            try {
              const [inserted] = await db
                .insert(contacts)
                .values({
                  tenantId,
                  companyId: company.id,
                  firstName: person.first_name || null,
                  lastName: person.last_name || null,
                  email: person.email,
                  title: person.title || null,
                  linkedinUrl: person.linkedin_url || null,
                  phone: person.phone_numbers?.[0]?.raw_number || null,
                  properties: {
                    enrichment_source: "apollo",
                    seniority: person.seniority,
                    departments: person.departments,
                    city: person.city,
                    country: person.country,
                    campaign_source: sequenceId,
                  },
                })
                .returning({ id: contacts.id });

              contactIds.push(inserted.id);
              existingEmails.add(emailLower);
            } catch {
              // Duplicate or constraint
            }
          }
        } catch {
          // Skip this company's contacts on error
        }
      }

      return { contactIds, found: contactIds.length };
    });

    // ── Step D: Score contacts ──
    // ICP-profile fit (same writer as /api/score-contacts and the sync
    // job), replacing the legacy flat-settings composite so
    // contacts.score keeps ONE meaning across all paths.
    await step.run("score-contacts", async () => {
      try {
        const activeIcps = await loadActiveIcps(tenantId);
        if (!hasContactScorableCriteria(activeIcps)) return;
        await scoreContactIcpBatch(tenantId, discoveredContacts.contactIds, activeIcps);
      } catch {
        // Non-critical
      }
    });

    // ── Step E: Enroll + generate drafts ──
    const draftResult = await step.run("enroll-and-draft", async () => {
      // Get step 1 template
      const [step1] = await db
        .select()
        .from(sequenceSteps)
        .where(eq(sequenceSteps.sequenceId, sequenceId))
        .orderBy(sequenceSteps.stepNumber)
        .limit(1);

      if (!step1) return { enrolled: 0, drafted: 0 };

      let enrolled = 0;
      let drafted = 0;

      // Get contacts at selected companies
      const companyIds = selectedCompanies.map((c: any) => c.id);
      const eligibleContacts = await db
        .select({
          id: contacts.id,
          email: contacts.email,
          score: contacts.score,
          companyId: contacts.companyId,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, tenantId),
            isNotNull(contacts.email),
            inArray(contacts.companyId, companyIds)
          )
        )
        .orderBy(sql`score DESC NULLS LAST`)
        .limit(maxCompanies * maxContactsPerCompany);

      // Check already enrolled
      const alreadyEnrolled = await db
        .select({ contactId: sequenceEnrollments.contactId })
        .from(sequenceEnrollments)
        .where(eq(sequenceEnrollments.sequenceId, sequenceId));
      const enrolledSet = new Set(alreadyEnrolled.map((e) => e.contactId));

      for (const contact of eligibleContacts) {
        if (enrolledSet.has(contact.id)) continue;
        if (!contact.email) continue;

        // Spec 14 — anti-collision (record-only unless ANTI_COLLISION_ENFORCE).
        const ac = await guardEnrollment({ tenantId, contactId: contact.id, enrollmentId: `${sequenceId}:${contact.id}` });
        if (!ac.proceed) continue;

        // Enroll
        const nextStepAt = new Date();
        nextStepAt.setDate(nextStepAt.getDate() + (step1.delayDays || 0));

        const [enrollment] = await db
          .insert(sequenceEnrollments)
          .values({
            sequenceId,
            contactId: contact.id,
            currentStep: 1,
            nextStepAt,
          })
          .returning({ id: sequenceEnrollments.id });

        enrolled++;

        // Build full prospect context and personalize with methodology
        let subject = step1.subjectTemplate;
        let body = step1.bodyTemplate;

        try {
          const ctx = await buildProspectContext(contact.id, tenantId);
          if (ctx) {
            const personalized = await personalizeStepEmail(
              ctx,
              { subject, body },
              STEP_STRATEGIES[0], // Step 1 strategy
            );
            subject = personalized.subject;
            body = personalized.body;
          }
        } catch {
          // Fallback to template variables
          const [c] = await db.select().from(contacts).where(eq(contacts.id, contact.id)).limit(1);
          if (c) {
            const vars: Record<string, string> = {
              firstName: c.firstName || "",
              lastName: c.lastName || "",
              fullName: [c.firstName, c.lastName].filter(Boolean).join(" "),
              title: c.title || "",
            };
            for (const [key, value] of Object.entries(vars)) {
              subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
              body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
            }
          }
        }

        // Resolve sender email from OAuth account
        let senderEmail = "pending@rotation";
        try {
          const { authAccounts } = await import("@/db/schema");
          const { decryptOAuthToken } = await import("@/lib/crypto/oauth-token-crypto");
          const [oauthAccount] = await db
            .select({ idToken: authAccounts.id_token })
            .from(authAccounts)
            .where(and(eq(authAccounts.userId, userId || ""), sql`${authAccounts.provider} != 'credentials'`))
            .limit(1);
          const idToken = decryptOAuthToken(oauthAccount?.idToken);
          if (idToken) {
            const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
            if (payload.email) senderEmail = payload.email;
          }
        } catch { /* fallback to pending@rotation */ }

        // Create draft outbound email
        await db.insert(outboundEmails).values({
          tenantId,
          campaignId: sequenceId,
          enrollmentId: enrollment.id,
          contactId: contact.id,
          stepNumber: 1,
          fromAddress: senderEmail,
          toAddress: contact.email,
          subject,
          bodyHtml: `<div>${body.replace(/\n/g, "<br>")}</div>`,
          bodyText: body,
          status: "draft",
        });

        drafted++;
      }

      return { enrolled, drafted };
    });

    // ── Step E2: Generate follow-up step emails (steps 2-N) ──
    const followUpResult = await step.run("generate-followup-emails", async () => {
      const allSteps = await db
        .select()
        .from(sequenceSteps)
        .where(eq(sequenceSteps.sequenceId, sequenceId))
        .orderBy(sequenceSteps.stepNumber);

      if (allSteps.length <= 1) return { drafted: 0 };

      const followUpSteps = allSteps.slice(1); // steps 2, 3, 4...
      let drafted = 0;

      // Get all enrollments for this sequence
      const allEnrollments = await db
        .select()
        .from(sequenceEnrollments)
        .where(eq(sequenceEnrollments.sequenceId, sequenceId));

      for (const enrollment of allEnrollments) {
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, enrollment.contactId)).limit(1);
        if (!contact?.email) continue;

        let cumulativeDelay = allSteps[0].delayDays || 0;

        for (const followUpStep of followUpSteps) {
          cumulativeDelay += followUpStep.delayDays || 0;

          let subject = followUpStep.subjectTemplate;
          let body = followUpStep.bodyTemplate;

          // Try to personalize
          try {
            const ctx = await buildProspectContext(contact.id, tenantId);
            if (ctx) {
              const strategyIndex = Math.min(followUpStep.stepNumber - 1, STEP_STRATEGIES.length - 1);
              const personalized = await personalizeStepEmail(ctx, { subject, body }, STEP_STRATEGIES[strategyIndex]);
              subject = personalized.subject;
              body = personalized.body;
            }
          } catch {
            // Fallback: simple variable replacement
            const vars: Record<string, string> = {
              firstName: contact.firstName || "",
              lastName: contact.lastName || "",
              fullName: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
              title: contact.title || "",
            };
            for (const [key, value] of Object.entries(vars)) {
              subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
              body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
            }
          }

          // Resolve sender
          let senderEmail = "pending@rotation";
          try {
            const { authAccounts } = await import("@/db/schema");
            const { decryptOAuthToken } = await import("@/lib/crypto/oauth-token-crypto");
            const [oa] = await db.select({ idToken: authAccounts.id_token }).from(authAccounts)
              .where(and(eq(authAccounts.userId, userId || ""), sql`${authAccounts.provider} != 'credentials'`)).limit(1);
            const oaIdToken = decryptOAuthToken(oa?.idToken);
            if (oaIdToken) {
              const payload = JSON.parse(Buffer.from(oaIdToken.split(".")[1], "base64url").toString());
              if (payload.email) senderEmail = payload.email;
            }
          } catch (e) {
            // Falling back to "pending@rotation" is acceptable — the send
            // worker resolves a real From address from the connectedMailbox
            // round-robin pool at send time.
            console.warn("campaign: failed to derive sender email from OAuth token", e);
          }

          await db.insert(outboundEmails).values({
            tenantId,
            campaignId: sequenceId,
            enrollmentId: enrollment.id,
            contactId: contact.id,
            stepNumber: followUpStep.stepNumber,
            fromAddress: senderEmail,
            toAddress: contact.email,
            subject,
            bodyHtml: `<div>${body.replace(/\n/g, "<br>")}</div>`,
            bodyText: body,
            status: "draft",
          });
          drafted++;
        }
      }

      return { drafted };
    });

    // ── Step F: Finalize ──
    await step.run("finalize", async () => {
      const updatedConfig: CampaignConfig = {
        ...config,
        status: "ready",
        preparedAt: new Date().toISOString(),
        stats: {
          companiesSelected: selectedCompanies.length,
          companiesEnriched: enrichResult.enriched,
          contactsFound: discoveredContacts.found,
          emailsDrafted: draftResult.drafted + (followUpResult?.drafted || 0),
        },
      };

      await db
        .update(sequences)
        .set({ campaignConfig: updatedConfig, updatedAt: new Date() })
        .where(eq(sequences.id, sequenceId));
    });

    return {
      sequenceId,
      result: "ready",
      companiesSelected: selectedCompanies.length,
      companiesEnriched: enrichResult.enriched,
      contactsFound: discoveredContacts.found,
      emailsDrafted: draftResult.drafted,
    };
  }
);
