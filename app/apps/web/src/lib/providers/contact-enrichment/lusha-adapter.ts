import { enrichPersonLusha, isLushaAvailable } from "@/lib/integrations/lusha-client";
import type {
  ContactEnrichInput,
  ContactEnrichResult,
  ContactEnrichmentProvider,
  ContactProviderContext,
  EnrichedContact,
  EnrichedPhone,
  PhoneType,
} from "./types";

function mapType(t: string): PhoneType {
  const s = t.toLowerCase();
  if (s.includes("mobile") || s.includes("cell")) return "mobile";
  if (s.includes("landline") || s.includes("direct") || s.includes("work") || s.includes("voip")) return "direct";
  return "other";
}

/**
 * Lusha — FR/CH/EU cross-border fallback. geoAffinity FR/CH/EU boosts it
 * for European prospects when Kaspr is unavailable or missed the mobile.
 */
export const lushaContactEnrichmentProvider: ContactEnrichmentProvider = {
  name: "lusha",
  priority: 30,
  costCentsPerCall: 0,
  geoAffinity: ["FR", "CH", "EU"],
  isAvailable(): boolean {
    return isLushaAvailable();
  },
  async enrich(
    input: ContactEnrichInput,
    _ctx: ContactProviderContext,
  ): Promise<ContactEnrichResult> {
    const startedAt = Date.now();
    try {
      const person = await enrichPersonLusha({
        firstName: input.firstName,
        lastName: input.lastName,
        linkedinUrl: input.linkedinUrl,
        companyDomain: input.companyDomain,
        companyName: input.companyName,
      });
      if (!person) {
        return { ok: false, data: null, error: "lusha: no match", provider: "lusha", durationMs: Date.now() - startedAt, costCents: 0 };
      }
      const phones: EnrichedPhone[] = person.phones
        .filter((p) => !p.doNotCall)
        .map((p) => ({ number: p.number, type: mapType(p.type), source: "lusha" }));
      const data: Partial<EnrichedContact> = {
        email: person.email,
        emailStatus: person.email ? (person.emailConfident ? "verified" : "likely") : null,
        phones,
        linkedinUrl: person.linkedinUrl,
        raw: person as unknown as Record<string, unknown>,
      };
      return { ok: true, data, provider: "lusha", durationMs: Date.now() - startedAt, costCents: 0 };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err), provider: "lusha", durationMs: Date.now() - startedAt, costCents: 0 };
    }
  },
};
