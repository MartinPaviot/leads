/**
 * Connection-graph domain types (_specs/CONNECTION-GRAPH).
 *
 * Vendor-neutral: a `RawRelation` is what ANY provider (Unipile, a
 * self-hosted browser worker, the mock) hands us; everything downstream
 * works off the normalised `ConnectionEdge`. No provider type leaks past
 * this boundary.
 */

/** Normalised LinkedIn network distance. "first" = direct connection
 * (warmest); "out_of_network" = no path the user's plan can see. */
export type NetworkDistance = "first" | "second" | "third" | "out_of_network";

/** The connected account's LinkedIn plan. The provider only returns what
 * this plan already shows, so it is the ceiling on what the feature can
 * do (free → 1st-degree overlay only; sales_navigator → intro paths +
 * ICP search at throughput). */
export type LinkedInAccountTier =
  | "free"
  | "premium"
  | "sales_navigator"
  | "recruiter"
  | "unknown";

/** A relation exactly as a provider returns it, before normalisation. */
export interface RawRelation {
  externalId: string;
  name: string;
  headline?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  /** Provider-raw distance (e.g. "DISTANCE_1"); normalised downstream. */
  networkDistance?: string | number | null;
  sharedConnectionsCount?: number | null;
}

/** A normalised edge: the founder → a person, resolved against the CRM. */
export interface ConnectionEdge {
  ownerUserId: string;
  tenantId: string;
  personExternalId: string;
  personName: string;
  personHeadline: string | null;
  rawCompanyName: string | null;
  rawCompanyDomain: string | null;
  /** CRM company id when the employer matched a known company, else null. */
  resolvedCompanyId: string | null;
  networkDistance: NetworkDistance;
  sharedConnectionsCount: number;
  source: string;
}

/** A company candidate the resolver matches a relation's employer against. */
export interface CompanyCandidate {
  id: string;
  name: string | null;
  domain: string | null;
}

/** Fit of a company against the tenant's primary ICP. */
export interface CompanyFit {
  fitScore: number;
  icpId: string | null;
}

/** One row of the "you're already connected to people at ICP accounts"
 * overlay: a first-degree connection whose employer is an ICP-fit account. */
export interface WarmAsset {
  edge: ConnectionEdge;
  companyId: string;
  fitScore: number;
  icpId: string | null;
}

export type WarmPathKind = "insider" | "intro_path" | "none";

/** A connector the founder can leverage toward an account/contact. */
export interface WarmConnector {
  personExternalId: string;
  personName: string;
  networkDistance: NetworkDistance;
}

/** The warm path into one account (or toward one cold contact). */
export interface WarmPath {
  kind: WarmPathKind;
  /** 0..1. Insider paths score high, intro paths lower, none = 0. */
  strength: number;
  connectors: WarmConnector[];
}
