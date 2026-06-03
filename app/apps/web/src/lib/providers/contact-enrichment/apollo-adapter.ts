import { enrichPerson, isApolloAvailable } from "@/lib/integrations/apollo-client";
import type {
  ContactEnrichInput,
  ContactEnrichResult,
  ContactEnrichmentProvider,
  ContactProviderContext,
  EnrichedContact,
  EnrichedPhone,
  PhoneType,
} from "./types";

function mapApolloPhoneType(t: string | undefined): PhoneType {
  const s = (t ?? "").toLowerCase();
  if (s.includes("mobile") || s.includes("cell")) return "mobile";
  if (s.includes("work") || s.includes("corporate") || s.includes("direct")) return "direct";
  return "other";
}

export const apolloContactEnrichmentProvider: ContactEnrichmentProvider = {
  name: "apollo",
  priority: 10,
  costCentsPerCall: 0,
  isAvailable(): boolean {
    return isApolloAvailable();
  },
  async enrich(
    input: ContactEnrichInput,
    _ctx: ContactProviderContext,
  ): Promise<ContactEnrichResult> {
    const startedAt = Date.now();
    try {
      const person = await enrichPerson({
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        organization_name: input.companyName,
        domain: input.companyDomain,
      });
      if (!person) {
        return { ok: false, data: null, error: "apollo: no match", provider: "apollo", durationMs: Date.now() - startedAt, costCents: 0 };
      }
      const phones: EnrichedPhone[] = (person.phone_numbers ?? [])
        .filter((p) => p.raw_number)
        .map((p) => ({ number: p.raw_number, type: mapApolloPhoneType(p.type), source: "apollo" }));

      const status = person.email_status === "verified" ? "verified" : person.email_status === "likely" ? "likely" : person.email ? "unverified" : null;

      const data: Partial<EnrichedContact> = {
        email: person.email ?? null,
        emailStatus: status,
        phones,
        linkedinUrl: person.linkedin_url ?? null,
        title: person.title ?? null,
        seniority: person.seniority ?? null,
        raw: person as unknown as Record<string, unknown>,
      };
      return { ok: true, data, provider: "apollo", durationMs: Date.now() - startedAt, costCents: 0 };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err), provider: "apollo", durationMs: Date.now() - startedAt, costCents: 0 };
    }
  },
};
