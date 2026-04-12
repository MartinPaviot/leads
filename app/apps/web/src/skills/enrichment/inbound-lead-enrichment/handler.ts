import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { enrichPerson, enrichOrganization } from "@/lib/apollo-client";
import type { SkillRunOptions } from "@/skills/types";
import type { InboundLeadEnrichmentInput, InboundLeadEnrichmentOutput } from "./schema";

export async function inboundLeadEnrichmentHandler(
  input: InboundLeadEnrichmentInput,
  options: SkillRunOptions,
): Promise<InboundLeadEnrichmentOutput> {
  const fieldsUpdated: string[] = [];
  let apolloPersonId: string | null = null;
  let apolloOrgId: string | null = null;
  let contactEnriched = false;
  let companyEnriched = false;

  // Fetch existing contact
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, options.tenantId)));

  if (!contact) {
    throw new Error(`Contact ${input.contactId} not found`);
  }

  // Enrich person via Apollo
  const person = await enrichPerson({
    email: contact.email ?? undefined,
    first_name: contact.firstName ?? undefined,
    last_name: contact.lastName ?? undefined,
    domain: undefined, // will be resolved by Apollo
  });

  if (person) {
    apolloPersonId = person.id;
    contactEnriched = true;

    const updates: Record<string, unknown> = {};
    if (!contact.title && person.title) {
      updates.title = person.title;
      fieldsUpdated.push("title");
    }
    if (!contact.linkedinUrl && person.linkedin_url) {
      updates.linkedinUrl = person.linkedin_url;
      fieldsUpdated.push("linkedinUrl");
    }
    if (!contact.phone && person.phone_numbers.length > 0) {
      updates.phone = person.phone_numbers[0].raw_number;
      fieldsUpdated.push("phone");
    }

    // Merge into properties JSONB
    const existingProps = (contact.properties as Record<string, unknown>) ?? {};
    updates.properties = {
      ...existingProps,
      apolloPersonId: person.id,
      seniority: person.seniority,
      departments: person.departments,
      headline: person.headline,
    };
    fieldsUpdated.push("properties");

    if (Object.keys(updates).length > 0) {
      await db
        .update(contacts)
        .set(updates)
        .where(eq(contacts.id, input.contactId));
    }
  }

  // Enrich company if requested and contact has a company
  if (input.enrichCompany && contact.companyId) {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, contact.companyId));

    if (company?.domain) {
      const org = await enrichOrganization(company.domain);
      if (org) {
        apolloOrgId = org.id;
        companyEnriched = true;

        const companyUpdates: Record<string, unknown> = {};
        if (!company.industry && org.industry) {
          companyUpdates.industry = org.industry;
          fieldsUpdated.push("company.industry");
        }
        if (!company.size && org.estimated_num_employees) {
          companyUpdates.size = String(org.estimated_num_employees);
          fieldsUpdated.push("company.size");
        }
        if (!company.revenue && org.annual_revenue) {
          companyUpdates.revenue = String(org.annual_revenue);
          fieldsUpdated.push("company.revenue");
        }

        const existingCompanyProps = (company.properties as Record<string, unknown>) ?? {};
        companyUpdates.properties = {
          ...existingCompanyProps,
          apolloOrgId: org.id,
          fundingStage: org.latest_funding_stage,
          totalFunding: org.total_funding,
          technologies: org.technology_names,
          foundedYear: org.founded_year,
          linkedinUrl: org.linkedin_url,
        };
        fieldsUpdated.push("company.properties");

        if (Object.keys(companyUpdates).length > 0) {
          await db
            .update(companies)
            .set(companyUpdates)
            .where(eq(companies.id, contact.companyId));
        }
      }
    }
  }

  return {
    contactId: input.contactId,
    contactEnriched,
    companyEnriched,
    fieldsUpdated,
    apolloPersonId,
    apolloOrgId,
  };
}
