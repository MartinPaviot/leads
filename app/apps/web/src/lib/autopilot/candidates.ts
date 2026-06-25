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

const KNOWN_INVALID = "invalid";

export interface ContactRow {
  id: string;
  companyId: string | null;
  email: string | null;
  emailStatus: string | null;
  score: number | null;
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
  const cos = await database
    .select({ id: companies.id, priorityScore: companies.priorityScore, computedAt: companies.priorityScoreComputedAt })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), eq(companies.targetingStatus, "targeted"), isNull(companies.excludedReason), isNull(companies.deletedAt)))
    .orderBy(sql`${companies.priorityScore} desc nulls last`)
    .limit(Math.floor(limit));
  if (cos.length === 0) return EMPTY;

  const companyIds = cos.map((c) => c.id);
  const scoreByCompany = new Map<string, CompanyScore>(
    cos.map((c) => [c.id, { priorityScore: c.priorityScore, priorityScoreComputedAt: c.computedAt ? c.computedAt.getTime() : null }]),
  );

  // 2. Their live contacts → best reachable per company.
  const conRows = (await database
    .select({ id: contacts.id, companyId: contacts.companyId, email: contacts.email, emailStatus: contacts.emailStatus, score: contacts.score })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt), inArray(contacts.companyId, companyIds)))) as ContactRow[];

  const bestByCompany = pickBestContacts(conRows);
  const candidates = buildCandidates(bestByCompany, scoreByCompany);
  if (candidates.length === 0) return EMPTY;

  const contactIds = candidates.map((c) => c.contactId);
  const emailByContact = new Map<string, string>();
  for (const [, c] of bestByCompany) if (c.email) emailByContact.set(c.id, c.email.toLowerCase().trim());

  // 3. Already-enrolled (active) among the candidates.
  const enrolled = await database
    .select({ contactId: sequenceEnrollments.contactId })
    .from(sequenceEnrollments)
    .where(and(eq(sequenceEnrollments.tenantId, tenantId), inArray(sequenceEnrollments.contactId, contactIds), eq(sequenceEnrollments.status, "active")));
  const alreadyEnrolledContactIds = new Set(enrolled.map((e) => e.contactId).filter((x): x is string => !!x));

  // 4. Suppressed (opt-out) among the candidate emails → back to contactIds.
  const emails = [...new Set(emailByContact.values())];
  const optouts = emails.length
    ? await database
        .select({ emailAddress: emailOptouts.emailAddress })
        .from(emailOptouts)
        .where(and(eq(emailOptouts.tenantId, tenantId), inArray(sql`lower(${emailOptouts.emailAddress})`, emails)))
    : [];
  const suppressedEmails = new Set(optouts.map((o) => o.emailAddress.toLowerCase().trim()));
  const suppressedContactIds = new Set<string>();
  for (const [cid, email] of emailByContact) if (suppressedEmails.has(email)) suppressedContactIds.add(cid);

  return { candidates, alreadyEnrolledContactIds, suppressedContactIds };
}
