import { enrichPersonKaspr, isKasprAvailable } from "@/lib/integrations/kaspr-client";
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
  if (s.includes("mobile") || s.includes("cell") || s.includes("portable")) return "mobile";
  if (s.includes("office") || s.includes("direct") || s.includes("work")) return "direct";
  return "other";
}

/**
 * Kaspr — FR mobile leader. geoAffinity FR boosts it ahead of Apollo for
 * French prospects. Needs a LinkedIn URL (the waterfall passes the one
 * Apollo discovered); returns null otherwise and is skipped.
 */
export const kasprContactEnrichmentProvider: ContactEnrichmentProvider = {
  name: "kaspr",
  priority: 20,
  costCentsPerCall: 30,
  geoAffinity: ["FR"],
  isAvailable(): boolean {
    return isKasprAvailable();
  },
  async enrich(
    input: ContactEnrichInput,
    _ctx: ContactProviderContext,
  ): Promise<ContactEnrichResult> {
    const startedAt = Date.now();
    try {
      const person = await enrichPersonKaspr({
        linkedinUrl: input.linkedinUrl,
        firstName: input.firstName,
        lastName: input.lastName,
        companyName: input.companyName,
      });
      if (!person) {
        return { ok: false, data: null, error: "kaspr: no match (needs linkedinUrl)", provider: "kaspr", durationMs: Date.now() - startedAt, costCents: 0 };
      }
      const phones: EnrichedPhone[] = person.phones.map((p) => ({
        number: p.number,
        type: mapType(p.type),
        source: "kaspr",
      }));
      const data: Partial<EnrichedContact> = {
        email: person.email,
        emailStatus: person.email ? (person.emailValidated ? "verified" : "likely") : null,
        phones,
        raw: person as unknown as Record<string, unknown>,
      };
      // Charge only when Kaspr actually returned a contact detail.
      const cost = person.phones.length > 0 || person.email ? 30 : 0;
      return { ok: true, data, provider: "kaspr", durationMs: Date.now() - startedAt, costCents: cost };
    } catch (err) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err), provider: "kaspr", durationMs: Date.now() - startedAt, costCents: 0 };
    }
  },
};
