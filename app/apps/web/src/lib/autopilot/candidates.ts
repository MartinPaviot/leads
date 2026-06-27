/**
 * Spec 37 (B3.1) — daily-autopilot candidate loading. Reads the top targeted
 * accounts by `companies.priority_score` (already computed daily by
 * signal-score-daily), picks the best reachable contact per company, and returns
 * the `ProspectCandidate[]` that the pure `selectProspects` (B1.1) consumes, plus
 * the already-enrolled + suppressed contact-id sets for its exclusion predicates.
 *
 * Ranking is NOT recomputed (priority_score is the signal×fit×accessibility score
 * from signal-score-daily). This only reads + shapes. Pure helpers are split out so
 * the best-contact logic is unit-tested without IO.
 *
 * Blast radius: lib/autopilot/* only.
 */

import { db as defaultDb } from "@/db";
import { companies, contacts, sequenceEnrollments, emailOptouts } from "@/db/schema";
import { and, eq, isNull, inArray, sql } from "drizzle-orm";
import type { ProspectCandidate } from "./select";
import { personFromSignals, type SignalEntry, type SignalPerson } from "@/lib/signals/record-signal";
import { resolveHintedContact } from "./signal-person";

const KNOWN_INVALID = "invalid";

export interface ContactRow {
  id: string;
  companyId: string | null;
  email: string | null;
  emailStatus: string | null;
  score: number | null;
  // For Monaco signal→person resolution (best-effort; absent on legacy rows).
  linkedinUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
}

/** Email-channel reachability: a present email that isn't verified-invalid. */
export function isReachable(c: Pick<ContactRow, "email" | "emailStatus">): boolean {
  return !!c.email && c.email.trim().length > 0 && c.emailStatus !== KNOWN_INVALID;
}

/**
 * Best reachable contact per company: highest `score` (nulls lowest), ties broken by
 * contactId asc (deterministic). Unreachable contacts are dropped. Pure.
 */
export function pickBestContacts(rows: ContactRow[]): Map<string, ContactRow> {
  const best = new Map<string, ContactRow>();
  for (const c of rows) {
    if (!c.companyId || !isReachable(c)) continue;
    const cur = best.get(c.companyId);
    if (!cur) {
      best.set(c.companyId, c);
      continue;
    }
    const sc = c.score ?? Number.NEGATIVE_INFINITY;
    const scur = cur.score ?? Number.NEGATIVE_INFINITY;
    if (sc > scur || (sc === scur && c.id < cur.id)) best.set(c.companyId, c);
  }
  return best;
}

/** Highest-score contact of a NON-EMPTY list; tie → lowest id (deterministic). */
function bestByScore(contacts: ContactRow[]): ContactRow {
  return contacts.reduce((best, c) => {
    const sc = c.score ?? Number.NEGATIVE_INFINITY;
    const sb = best.score ?? Number.NEGATIVE_INFINITY;
    return sc > sb || (sc === sb && c.id < best.id) ? c : best;
  });
}

/**
 * Best contact per company, but PREFER the contact the freshest signal names
 * (Monaco signal→person) when it resolves. CRITICAL: both the hint AND the
 * score-best fall-back pick only from ELIGIBLE contacts (reachable AND not
 * opted-out AND not already enrolled — via `isEligible`). A hint to an
 * ineligible contact must NOT win, else the company's single candidate becomes
 * un-sendable and the whole (often top-priority) account is silently dropped
 * instead of falling back to a viable alternate contact. The hint only ever
 * re-targets WITHIN a company's own eligible contacts. Pure.
 */
export function pickContactsForCompanies(
  rows: ContactRow[],
  hintByCompany: Map<string, SignalPerson>,
  isEligible: (c: ContactRow) => boolean = isReachable,
): Map<string, ContactRow> {
  // Eligible contacts grouped by company — the only pool either path may pick.
  const eligibleByCompany = new Map<string, ContactRow[]>();
  for (const c of rows) {
    if (!c.companyId || !isEligible(c)) continue;
    const arr = eligibleByCompany.get(c.companyId);
    if (arr) arr.push(c);
    else eligibleByCompany.set(c.companyId, [c]);
  }

  const out = new Map<string, ContactRow>();
  for (const [companyId, contactsForCo] of eligibleByCompany) {
    const hint = hintByCompany.get(companyId);
    const hinted = hint ? resolveHintedContact(contactsForCo, hint) : null;
    out.set(companyId, hinted ?? bestByScore(contactsForCo));
  }
  return out;
}

export interface CompanyScore {
  priorityScore: number | null;
  /** epoch ms, for the selector's tie-break. */
  priorityScoreComputedAt: number | null;
}

/** Build the ProspectCandidate rows from the best-contact-per-company + the score map. Pure. */
export function buildCandidates(
  bestByCompany: Map<string, ContactRow>,
  scoreByCompany: Map<string, CompanyScore>,
): ProspectCandidate[] {
  const out: ProspectCandidate[] = [];
  for (const [companyId, c] of bestByCompany) {
    const s = scoreByCompany.get(companyId);
    out.push({
      contactId: c.id,
      companyId,
      priorityScore: s?.priorityScore ?? null,
      priorityScoreComputedAt: s?.priorityScoreComputedAt ?? null,
      reachable: true,
    });
  }
  return out;
}

export interface CandidatePool {
  candidates: ProspectCandidate[];
  /** Contacts already in an active sequence — for selectProspects' isAlreadyEnrolled. */
  alreadyEnrolledContactIds: Set<string>;
  /** Contacts whose email is opted-out — for selectProspects' isSuppressed. */
  suppressedContactIds: Set<string>;
}

const EMPTY: CandidatePool = { candidates: [], alreadyEnrolledContactIds: new Set(), suppressedContactIds: new Set() };

/**
 * B3.1 — load up to `limit` targeted candidate companies (highest priority_score),
 * their best reachable contact, and the already-enrolled + suppressed sets. The
 * caller (the cron) feeds these into `selectProspects` to take the top `budget`.
 */
export async function loadCandidates(tenantId: string, limit: number, database: typeof defaultDb = defaultDb): Promise<CandidatePool> {
  if (!Number.isFinite(limit) || limit <= 0) return EMPTY;

  // 1. Top targeted, non-excluded, live companies by priority_score (desc, nulls last).
  //    `properties` carries signals[] → the signal→person hint for routing.
  const cos = await database
    .select({ id: companies.id, priorityScore: companies.priorityScore, computedAt: companies.priorityScoreComputedAt, properties: companies.properties })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), eq(companies.targetingStatus, "targeted"), isNull(companies.excludedReason), isNull(companies.deletedAt)))
    .orderBy(sql`${companies.priorityScore} desc nulls last`)
    .limit(Math.floor(limit));
  if (cos.length === 0) return EMPTY;

  const companyIds = cos.map((c) => c.id);
  const scoreByCompany = new Map<string, CompanyScore>(
    cos.map((c) => [c.id, { priorityScore: c.priorityScore, priorityScoreComputedAt: c.computedAt ? c.computedAt.getTime() : null }]),
  );

  // Monaco signal→person: the contact the freshest signal names (if any) per company.
  const hintByCompany = new Map<string, SignalPerson>();
  for (const c of cos) {
    const props = c.properties as { signals?: SignalEntry[] } | null;
    const person = personFromSignals(props?.signals);
    if (person) hintByCompany.set(c.id, person);
  }

  // 2. Their live contacts → best reachable per company (signal-hinted, else score-best).
  const conRows = (await database
    .select({ id: contacts.id, companyId: contacts.companyId, email: contacts.email, emailStatus: contacts.emailStatus, score: contacts.score, linkedinUrl: contacts.linkedinUrl, firstName: contacts.firstName, lastName: contacts.lastName, title: contacts.title })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt), inArray(contacts.companyId, companyIds)))) as ContactRow[];

  // 3. Eligibility over the FULL reachable pool (BEFORE picking): a contact is
  //    eligible if reachable AND not opted-out AND not already in an active
  //    sequence. Computing this up front lets the picker prefer the signal-hinted
  //    contact ONLY when eligible, else fall back to the best eligible contact —
  //    so a hint to an opted-out/enrolled person never strands the account.
  const reachable = conRows.filter((c) => !!c.companyId && isReachable(c));
  const reachableIds = reachable.map((c) => c.id);
  const emailById = new Map<string, string>();
  for (const c of reachable) if (c.email) emailById.set(c.id, c.email.toLowerCase().trim());

  // sequence_enrollments has no tenant_id column — reachableIds are already this
  // tenant's (tenant-scoped contacts query), so contactId + active is sufficient.
  const enrolled = reachableIds.length
    ? await database
        .select({ contactId: sequenceEnrollments.contactId })
        .from(sequenceEnrollments)
        .where(and(inArray(sequenceEnrollments.contactId, reachableIds), eq(sequenceEnrollments.status, "active")))
    : [];
  const enrolledIds = new Set(enrolled.map((e) => e.contactId).filter((x): x is string => !!x));

  const allEmails = [...new Set(emailById.values())];
  const optouts = allEmails.length
    ? await database
        .select({ emailAddress: emailOptouts.emailAddress })
        .from(emailOptouts)
        .where(and(eq(emailOptouts.tenantId, tenantId), inArray(sql`lower(${emailOptouts.emailAddress})`, allEmails)))
    : [];
  const suppressedEmails = new Set(optouts.map((o) => o.emailAddress.toLowerCase().trim()));

  const isEligible = (c: ContactRow): boolean =>
    isReachable(c) && !enrolledIds.has(c.id) && !(c.email ? suppressedEmails.has(c.email.toLowerCase().trim()) : false);

  // 4. Pick the hinted-if-eligible, else best-eligible, contact per company.
  const bestByCompany = pickContactsForCompanies(conRows, hintByCompany, isEligible);
  const candidates = buildCandidates(bestByCompany, scoreByCompany);
  if (candidates.length === 0) return EMPTY;

  // The chosen are eligible by construction, so these exclusion sets (kept for
  // selectProspects' defense-in-depth filter) are normally empty — surface any
  // chosen id that is nonetheless flagged, restricted to the candidates.
  const candidateIds = new Set(candidates.map((c) => c.contactId));
  const alreadyEnrolledContactIds = new Set([...enrolledIds].filter((id) => candidateIds.has(id)));
  const suppressedContactIds = new Set<string>();
  for (const c of candidates) {
    const email = emailById.get(c.contactId);
    if (email && suppressedEmails.has(email)) suppressedContactIds.add(c.contactId);
  }

  return { candidates, alreadyEnrolledContactIds, suppressedContactIds };
}
