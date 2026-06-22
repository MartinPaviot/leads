/**
 * Spec 21 (AC2) — sending-domain authentication. Verifies SPF, DKIM (2048-bit),
 * and DMARC for a sending domain and gates: a domain is not-sendable until all
 * three pass. Distinct from inbox/sender-auth.ts, which parses the RECEIVED
 * Authentication-Results header — this verifies the domain WE send from, via an
 * injected DNS/provider lookup (so it stays pure and needs no schema).
 */

/** DKIM minimum key length (AC2). */
export const MIN_DKIM_BITS = 2048;

export interface DnsAuthRecords {
  spfPass: boolean;
  dmarcPass: boolean;
  dkimPass: boolean;
  /** DKIM public-key length in bits. */
  dkimBits: number;
}

export interface AuthStatus {
  domain: string;
  spf: boolean;
  /** DKIM passes AND the key is at least 2048-bit. */
  dkim: boolean;
  dmarc: boolean;
  /** All three pass → the domain may send. */
  sendable: boolean;
  /** Which checks failed, for the UI / diagnostics. */
  failures: string[];
}

/** Pure verdict from already-fetched records. */
export function verifyAuth(domain: string, records: DnsAuthRecords): AuthStatus {
  const dkim = records.dkimPass && records.dkimBits >= MIN_DKIM_BITS;
  const failures: string[] = [];
  if (!records.spfPass) failures.push("spf");
  if (!dkim) failures.push(records.dkimPass ? `dkim-weak:${records.dkimBits}bit` : "dkim");
  if (!records.dmarcPass) failures.push("dmarc");
  return { domain, spf: records.spfPass, dkim, dmarc: records.dmarcPass, sendable: failures.length === 0, failures };
}

/** Async verify via an injected DNS/provider lookup (read-only, idempotent). */
export async function verifyDomainAuth(
  domain: string,
  lookup: (domain: string) => Promise<DnsAuthRecords>,
): Promise<AuthStatus> {
  return verifyAuth(domain, await lookup(domain));
}
