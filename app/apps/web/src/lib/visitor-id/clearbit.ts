/**
 * Clearbit Reveal provider for visitor ID (P0-2 follow-up).
 *
 * Endpoint : GET https://reveal.clearbit.com/v1/companies/find?ip=<ip>
 *   Headers: Authorization: Bearer <CLEARBIT_API_KEY>
 *
 * Stub-safe : when `CLEARBIT_API_KEY` is missing, `isAvailable()`
 * returns false and `identify()` returns null. The resolver falls
 * back to Snitcher / RB2B / "none" so the cascade still proceeds.
 *
 * Note on the response shape : Clearbit returns a flat
 * `{ company: { domain, name, ... } }` object directly, no
 * nested `confidence` field by default. We map confidence → null
 * for the schema parity ; any quality-score logic lives in the
 * caller.
 */

import { logger } from "@/lib/observability/logger";
import type { VisitorIdProvider, VisitorIdResult } from "./provider";

const ENDPOINT = "https://reveal.clearbit.com/v1/companies/find";
const TIMEOUT_MS = 4000;

export const clearbitProvider: VisitorIdProvider = {
  name: "clearbit_reveal",
  isAvailable() {
    return Boolean(process.env.CLEARBIT_API_KEY);
  },
  async identify(input) {
    const key = process.env.CLEARBIT_API_KEY;
    if (!key) return null;

    const url = new URL(ENDPOINT);
    url.searchParams.set("ip", input.ip);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          accept: "application/json",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        // 202 = "Reveal is still resolving, try later". 404 = no match.
        if (res.status !== 404 && res.status !== 202) {
          logger.warn("clearbit: non-2xx", { status: res.status });
        }
        return null;
      }
      const body = (await res.json()) as {
        company?: { domain?: string; name?: string } | null;
      };
      const company = body.company;
      if (!company?.domain) return null;
      const out: VisitorIdResult = {
        companyDomain: company.domain.toLowerCase(),
        companyName: company.name ?? null,
        // Clearbit Reveal doesn't ship a per-call confidence field
        // in v1 — surface null so downstream telemetry doesn't pretend.
        confidence: null,
      };
      return out;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        logger.warn("clearbit: timeout", { ip: input.ip });
      } else {
        logger.warn("clearbit: fetch error", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};
