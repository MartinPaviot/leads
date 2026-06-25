/**
 * Spec 17 (A2) — a zero-cost, zero-key concrete `VerifyProvider` for the email
 * verification waterfall: domain-level deliverability via DNS MX lookup. It catches
 * the worst bounce class (dead / typo / no-mail domains) for free, so the spec-17
 * pre-send gate (`isEmailKnownUnsendable`) stops being a no-op — until a paid
 * mailbox-level verifier (ZeroBounce/Hunter/…) is slotted in behind the same
 * `VerifyProvider` seam.
 *
 * Deliberately conservative: a resolving domain returns `{domainOk:true}` →
 * `statusFromSignal` maps it to `unknown` (NOT `valid` — we never claim a mailbox
 * is deliverable without an SMTP probe). Only a definitive NXDOMAIN/ENODATA marks
 * `invalid`; a transient DNS error returns `null` (→ `unknown`, retried later) so a
 * blip never permanently condemns a real domain.
 *
 * `resolveMx` injected → unit-testable without live DNS.
 */

import { promises as dnsPromises } from "dns";
import type { VerifyProvider, VerifySignal } from "./verify-email";

export type MxResolver = (domain: string) => Promise<{ exchange: string; priority: number }[]>;

/** Common disposable/throwaway domains — never a real business recipient. */
export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "trashmail.com", "yopmail.com", "getnada.com", "throwawaymail.com", "maildrop.cc",
  "sharklasers.com", "guerrillamailblock.com", "dispostable.com", "mintemail.com",
]);

/** DNS error codes that mean the domain definitively cannot receive mail. */
const HARD_DNS_FAILURES = new Set(["ENOTFOUND", "ENODATA"]);

export function mxVerifyProvider(deps: { resolveMx?: MxResolver } = {}): VerifyProvider {
  const resolveMx = deps.resolveMx ?? ((d: string) => dnsPromises.resolveMx(d));
  return {
    name: "mx-dns",
    cost: 0,
    async verify(email: string): Promise<VerifySignal | null> {
      const domain = email.split("@")[1]?.toLowerCase().trim();
      if (!domain) return { domainOk: false };
      if (DISPOSABLE_DOMAINS.has(domain)) return { disposable: true, domainOk: true };
      try {
        const mx = await resolveMx(domain);
        return { domainOk: Array.isArray(mx) && mx.length > 0 };
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code && HARD_DNS_FAILURES.has(code)) return { domainOk: false }; // no such domain / no MX
        return null; // transient (timeout / SERVFAIL) → unknown, don't condemn
      }
    },
  };
}
