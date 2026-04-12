import { searchPeople, enrichPerson } from "@/lib/apollo-client";
import type { SkillRunOptions } from "@/skills/types";
import type { ApolloLeadFinderInput, ApolloLeadFinderOutput } from "./schema";

export async function apolloLeadFinderHandler(
  input: ApolloLeadFinderInput,
  _options: SkillRunOptions,
): Promise<ApolloLeadFinderOutput> {
  const allLeads: ApolloLeadFinderOutput["leads"] = [];
  let creditsUsed = 0;

  for (const domain of input.domains) {
    // Phase 1: Free People Search
    const result = await searchPeople({
      q_organization_domains: domain,
      person_titles: input.personTitles,
      person_seniorities: input.personSeniorities,
      per_page: input.maxResultsPerDomain,
    });

    for (const person of result.people) {
      // Phase 2: Optional paid enrichment for verified emails
      if (input.enrichEmails && person.email_status !== "verified") {
        const enriched = await enrichPerson({
          first_name: person.first_name ?? undefined,
          last_name: person.last_name ?? undefined,
          domain,
        });
        if (enriched) {
          creditsUsed += 1;
          allLeads.push({
            apolloId: enriched.id,
            firstName: enriched.first_name,
            lastName: enriched.last_name,
            name: enriched.name,
            email: enriched.email,
            emailStatus: enriched.email_status,
            title: enriched.title,
            seniority: enriched.seniority,
            departments: enriched.departments,
            linkedinUrl: enriched.linkedin_url,
            phoneNumbers: enriched.phone_numbers.map((p) => ({
              rawNumber: p.raw_number,
              type: p.type,
            })),
            companyName: enriched.organization?.name ?? null,
            companyDomain: domain,
          });
          continue;
        }
      }

      allLeads.push({
        apolloId: person.id,
        firstName: person.first_name,
        lastName: person.last_name,
        name: person.name,
        email: person.email,
        emailStatus: person.email_status,
        title: person.title,
        seniority: person.seniority,
        departments: person.departments,
        linkedinUrl: person.linkedin_url,
        phoneNumbers: person.phone_numbers.map((p) => ({
          rawNumber: p.raw_number,
          type: p.type,
        })),
        companyName: person.organization?.name ?? null,
        companyDomain: domain,
      });
    }
  }

  return {
    totalFound: allLeads.length,
    leads: allLeads,
    domainsSearched: input.domains.length,
    creditsUsed,
  };
}
