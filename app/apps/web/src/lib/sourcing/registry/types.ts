/**
 * Registry sourcing types (spec 06). CanonicalRegistryAccount carries the
 * legal_id identity (fr:<siren> / ch:<uid>) + registry firmographics. The
 * existing Pappers/SIRENE/Zefix clients, spec-00 upsert, spec-02 meter, and the
 * long-TTL cache are all injected (RECONCILE.md), so this builds off main.
 */
import type { PappersCompany } from "@/lib/integrations/pappers-client";
import type { SireneCompany } from "@/lib/integrations/recherche-entreprises-client";

export interface RegistryAddress {
  city: string | null;
  postalCode: string | null;
  region: string | null;
}

/** Neutral registry account — legal_id identity + firmographics, no vendor type. */
export interface CanonicalRegistryAccount {
  /** Identity: fr:<siren> | ch:<uid>. */
  legalId: string;
  name: string | null;
  country: "FR" | "CH";
  domain: string | null;
  /** Raw activity code (NAF/APE or NOGA). */
  activityCode: string | null;
  naicsCode: string | null;
  naicsLabel: string | null;
  /** Headcount band (e.g. "50-99"). */
  headcountBand: string | null;
  address: RegistryAddress | null;
  raw?: Record<string, unknown>;
}

export interface MeterOp {
  workspace: string;
  kind: string;
  provider: string;
  amount: number;
  ref: string;
}

/** Long-TTL cache for stable registry data (AC4). Default backed by spec-00 field-source. */
export interface RegistryCache {
  get(key: string): Promise<CanonicalRegistryAccount | null>;
  set(key: string, value: CanonicalRegistryAccount, ttlMs: number): Promise<void>;
}

export interface RegistrySegment {
  country: "FR" | "CH";
  /** FR NAF codes / regions / INSEE effectif tranches to filter on. */
  nafCodes?: string[];
  regions?: string[];
  effectifTranches?: string[];
  volume?: number;
}

export interface RegistryDeps {
  tenantId: string;
  searchSirene?(params: {
    activite_principale?: string[];
    departement?: string[];
    tranche_effectif_salarie?: string[];
    page?: number;
    perPage?: number;
  }): Promise<{ companies: SireneCompany[] }>;
  /** Single-entity FR fetch by SIREN for field-level enrich (AC5). */
  fetchPappersBySiren?(siren: string): Promise<PappersCompany | null>;
  /** spec-02 metering (AC4). */
  meter<R>(op: MeterOp, fn: () => Promise<R>): Promise<R>;
  /** Long-TTL cache (AC4). */
  cache?: RegistryCache;
  /** spec-00 upsert (persist). */
  upsertAccount?(tenantId: string, account: CanonicalRegistryAccount): Promise<void>;
}

/** Long TTL: registry data (legal name, NAF, address) is stable for months. */
export const REGISTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
