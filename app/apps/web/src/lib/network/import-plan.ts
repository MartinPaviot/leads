/**
 * Network import planner — decide which parsed LinkedIn connections are NEW
 * to this tenant vs. already-present, and shape the rows to insert.
 *
 * Pure (no I/O): the route loads the tenant's existing contact handles and
 * hands them in as sets, so this decision logic is unit-testable without a DB.
 * In-file dedup already happened in the parser; this layer dedups against what
 * the tenant ALREADY has (same LinkedIn URL or email).
 */
import { normalizeLinkedInUrl, type LinkedInConnection } from "./linkedin-connections";

export interface NetworkContactDraft {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  linkedinUrl: string | null;
  title: string | null;
  companyName: string | null;
  networkConnectedOn: string | null;
}

export interface NetworkImportPlanInput {
  connections: LinkedInConnection[];
  /** Existing tenant contacts' LinkedIn URLs (raw — normalized here). */
  existingLinkedinUrls?: Iterable<string>;
  /** Existing tenant contacts' emails (lowercased here). */
  existingEmails?: Iterable<string>;
}

export interface NetworkImportPlan {
  toInsert: NetworkContactDraft[];
  /** Connections skipped because the tenant already has that person. */
  alreadyInDb: number;
  /** Distinct, non-empty company names referenced by the rows to insert. */
  companyNames: string[];
}

export function planNetworkImport(input: NetworkImportPlanInput): NetworkImportPlan {
  const urls = new Set<string>();
  for (const u of input.existingLinkedinUrls ?? []) {
    const n = normalizeLinkedInUrl(u);
    if (n) urls.add(n);
  }
  const emails = new Set<string>();
  for (const e of input.existingEmails ?? []) {
    const v = (e ?? "").trim().toLowerCase();
    if (v) emails.add(v);
  }

  const toInsert: NetworkContactDraft[] = [];
  const companyNames = new Set<string>();
  let alreadyInDb = 0;

  for (const c of input.connections) {
    const inDb =
      (c.linkedinUrl != null && urls.has(c.linkedinUrl)) ||
      (c.email != null && emails.has(c.email));
    if (inDb) {
      alreadyInDb++;
      continue;
    }
    if (c.company) companyNames.add(c.company);
    toInsert.push({
      firstName: c.firstName || null,
      lastName: c.lastName || null,
      email: c.email,
      linkedinUrl: c.linkedinUrl,
      title: c.position,
      companyName: c.company,
      networkConnectedOn: c.connectedOn,
    });
  }

  return { toInsert, alreadyInDb, companyNames: [...companyNames] };
}
