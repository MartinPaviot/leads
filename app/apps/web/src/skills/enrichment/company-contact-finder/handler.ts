import { searchPeople } from "@/lib/integrations/apollo-client";
import type { SkillRunOptions } from "@/skills/types";
import type { CompanyContactFinderInput, CompanyContactFinderOutput } from "./schema";

export async function companyContactFinderHandler(
  input: CompanyContactFinderInput,
  _options: SkillRunOptions,
): Promise<CompanyContactFinderOutput> {
  // Titles rule when present (seniorities only if explicitly given —
  // Apollo ANDs the two facets); without titles, keep the historical
  // decision-maker default so an unfiltered domain search never happens.
  const seniorities =
    input.targetSeniorities ??
    (input.targetTitles && input.targetTitles.length > 0
      ? undefined
      : ["c_suite", "vp", "director"]);
  const result = await searchPeople({
    q_organization_domains: input.companyDomain,
    person_titles: input.targetTitles,
    person_seniorities: seniorities,
    per_page: input.maxResults,
  });

  const contacts = result.people.map((person) => ({
    apolloId: person.id,
    firstName: person.first_name,
    lastName: person.last_name,
    name: person.name,
    email: person.email,
    title: person.title,
    seniority: person.seniority,
    departments: person.departments,
    linkedinUrl: person.linkedin_url,
  }));

  return {
    companyDomain: input.companyDomain,
    totalFound: contacts.length,
    contacts,
  };
}
