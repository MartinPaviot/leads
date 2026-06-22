/**
 * Spec 33 — the lawful-basis hard gate read by the senders (23/24) and the
 * sequence engine (25). A contact may be processed only with a recorded, valid
 * lawful basis, a clean data source, and (for sending) an opt-out in the message.
 * Block is the default; pure function of contact + policy. Cannot be bypassed —
 * every send path calls it. Blast radius: compliance/lawful-basis/* only.
 */

import { sourcePolicy, acceptableBases, requiresOptOut, type BasisType, type Jurisdiction } from "./policy";

export interface LawfulBasis {
  type: BasisType;
  /** Documented LIA reference (required for legitimate_interest). */
  assessmentId?: string;
  /** Consent timestamp (required for consent). */
  consentAt?: number;
}

export interface ComplianceContact {
  id: string;
  lawfulBasis?: LawfulBasis | null;
  /** spec-00 field-source provenance. */
  source?: string | null;
  jurisdiction?: Jurisdiction | null;
}

export type BlockReason =
  | "no_lawful_basis"
  | "li_without_assessment"
  | "consent_without_record"
  | "basis_invalid_for_jurisdiction"
  | "prohibited_source";

export interface LawfulBasisResult {
  allowed: boolean;
  reason?: BlockReason;
  /** Audit fields (AC4). */
  audit: {
    contactId: string;
    basis?: BasisType;
    source: string | null;
    sourcePolicy: "clean" | "prohibited";
    jurisdiction: string | null;
  };
}

/** AC1/AC2/AC5 — assert a contact may be enrolled/sent. Block is the default. */
export function assertLawfulBasis(contact: ComplianceContact): LawfulBasisResult {
  const source = contact.source ?? null;
  const policy = sourcePolicy(source);
  const jurisdiction = contact.jurisdiction ?? null;
  const audit = { contactId: contact.id, basis: contact.lawfulBasis?.type, source, sourcePolicy: policy, jurisdiction };
  const block = (reason: BlockReason): LawfulBasisResult => ({ allowed: false, reason, audit });

  const basis = contact.lawfulBasis;
  // AC1 — a basis must be recorded.
  if (!basis) return block("no_lawful_basis");
  if (basis.type === "legitimate_interest" && !basis.assessmentId) return block("li_without_assessment");
  if (basis.type === "consent" && !basis.consentAt) return block("consent_without_record");

  // AC5 — the basis must be valid for the jurisdiction.
  if (!acceptableBases(jurisdiction).includes(basis.type)) return block("basis_invalid_for_jurisdiction");

  // AC2 — the data source must be outreach-clean.
  if (policy === "prohibited") return block("prohibited_source");

  return { allowed: true, audit };
}

// ── AC3 opt-out presence ──

const OPT_OUT = /unsubscribe|opt[\s-]?out|désinscri|désabonn|\{\{?\s*unsubscribe/i;

/** Whether a message body carries an opt-out mechanism. */
export function hasOptOut(body: string): boolean {
  return OPT_OUT.test(body ?? "");
}

export interface MessageComplianceResult {
  allowed: boolean;
  reason?: "missing_opt_out";
}

/** AC3 — a sendable message must include the opt-out mechanism where required. */
export function assertMessageOptOut(body: string, jurisdiction?: Jurisdiction | null): MessageComplianceResult {
  if (requiresOptOut(jurisdiction) && !hasOptOut(body)) return { allowed: false, reason: "missing_opt_out" };
  return { allowed: true };
}
