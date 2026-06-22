/**
 * Pure registry -> canonical mappers (spec 06, AC2/AC3). Each maps a vendor
 * registry shape to CanonicalRegistryAccount with the legal_id identity and a
 * NAICS industry; no vendor type escapes. Zefix carries no NOGA, so its NAICS
 * stays null (documented in RECONCILE).
 */
import type { PappersCompany } from "@/lib/integrations/pappers-client";
import type { SireneCompany } from "@/lib/integrations/recherche-entreprises-client";
import type { ZefixFirm } from "@/lib/integrations/zefix-client";
import { nafToNaics, inseeEffectifToBand } from "@/lib/providers/normalizers/activity-codes";
import type { CanonicalRegistryAccount } from "./types";

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function pappersToCanonical(c: PappersCompany): CanonicalRegistryAccount {
  const naics = nafToNaics(c.codeNaf);
  return {
    legalId: `fr:${digits(c.siren)}`,
    name: c.name ?? null,
    country: "FR",
    domain: c.website ?? null,
    activityCode: c.codeNaf ?? null,
    naicsCode: naics?.code ?? null,
    naicsLabel: naics?.label ?? null,
    headcountBand: null,
    address: { city: c.city ?? null, postalCode: c.postalCode ?? null, region: null },
    raw: c as unknown as Record<string, unknown>,
  };
}

export function sireneToCanonical(c: SireneCompany): CanonicalRegistryAccount {
  const naics = nafToNaics(c.naf);
  return {
    legalId: `fr:${digits(c.siren)}`,
    name: c.name ?? null,
    country: "FR",
    domain: null,
    activityCode: c.naf ?? null,
    naicsCode: naics?.code ?? null,
    naicsLabel: naics?.label ?? null,
    headcountBand: inseeEffectifToBand(c.effectifTranche),
    address: { city: c.city ?? null, postalCode: c.postalCode ?? null, region: c.departement ?? null },
    raw: c as unknown as Record<string, unknown>,
  };
}

export function zefixToCanonical(c: ZefixFirm): CanonicalRegistryAccount {
  return {
    legalId: `ch:${(c.uid ?? "").replace(/\s/g, "")}`,
    name: c.name ?? null,
    country: "CH",
    domain: null,
    activityCode: null, // Zefix carries no NOGA sector
    naicsCode: null,
    naicsLabel: null,
    headcountBand: null,
    address: { city: c.legalSeat ?? null, postalCode: null, region: c.canton ?? null },
    raw: c as unknown as Record<string, unknown>,
  };
}
