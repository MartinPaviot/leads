/**
 * Snitcher provider for visitor ID (MONACO-PARITY-04).
 *
 * Endpoint (per Snitcher v1 docs): GET https://api.snitcher.com/v1/identify
 *   Headers: X-Api-Key: <SNITCHER_API_KEY>
 *   Query:   ip=<ip>&user_agent=<ua>
 *
 * Stubs out gracefully when `SNITCHER_API_KEY` isn't set so dev can
 * still flow through the pixel + track endpoints — `isAvailable()`
 * returns false, `identify()` returns null, the visit row gets
 * inserted with `company_domain = NULL` and the founder sees
 * anonymous traffic counts. The moment Martin adds the key, the
 * identification queue starts producing matches retroactively
 * (queued visits get identified on the next cron tick).
 */

import { logger } from "@/lib/observability/logger";
import type { VisitorIdProvider, VisitorIdResult } from "./provider";

const ENDPOINT = "https://api.snitcher.com/v1/identify";
const TIMEOUT_MS = 4000;

export const snitcherProvider: VisitorIdProvider = {
  name: "snitcher",
  isAvailable() {
    return Boolean(process.env.SNITCHER_API_KEY);
  },
  async identify(input) {
    const key = process.env.SNITCHER_API_KEY;
    if (!key) return null;

    const url = new URL(ENDPOINT);
    url.searchParams.set("ip", input.ip);
    if (input.userAgent) url.searchParams.set("user_agent", input.userAgent);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-Api-Key": key,
          accept: "application/json",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        // 404 is the expected "no match" response — silent.
        if (res.status !== 404) {
          logger.warn("snitcher: non-2xx", { status: res.status });
        }
        return null;
      }
      const body = (await res.json()) as {
        company?: {
          domain?: string;
          name?: string;
          confidence?: number;
        } | null;
      };
      const company = body.company;
      if (!company?.domain) return null;
      const out: VisitorIdResult = {
        companyDomain: company.domain.toLowerCase(),
        companyName: company.name ?? null,
        confidence:
          typeof company.confidence === "number" ? company.confidence : null,
      };
      return out;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        logger.warn("snitcher: timeout", { ip: input.ip });
      } else {
        logger.warn("snitcher: fetch error", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};

/**
 * Resolver — returns the active provider for a tenant. Currently
 * returns Snitcher unconditionally; future per-tenant settings can
 * override (RB2B, Clearbit, none). Keeping this hook here means the
 * call sites don't need to change.
 */
export function getVisitorIdProvider(): VisitorIdProvider {
  return snitcherProvider;
}
