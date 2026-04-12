import { searchPeople } from "@/lib/apollo-client";
import type { SkillRunOptions } from "@/skills/types";
import type { CompanyContactFinderInput, CompanyContactFinderOutput } from "./schema";

export async function companyContactFinderHandler(
  input: CompanyContactFinderInput,
  _options: SkillRunOptions,
): Promise<CompanyContactFinderOutput> {
  const result = await searchPeople({
    q_organization_domains: input.companyDomain,
    person_titles: input.targetTitles,
    person_seniorities: input.targetSeniorities,
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
