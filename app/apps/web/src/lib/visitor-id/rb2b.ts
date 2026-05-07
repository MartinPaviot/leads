/**
 * RB2B provider for visitor ID (P0-2 follow-up).
 *
 * RB2B's API : POST https://api.rb2b.com/v1/identify
 *   Headers: X-Api-Key: <RB2B_API_KEY>
 *   Body:    { ip, user_agent, url }
 *
 * Stub-safe : when `RB2B_API_KEY` is missing, `isAvailable()` returns
 * false and `identify()` returns null. The resolver falls back to
 * Snitcher (or "none" provider) so the cascade still proceeds.
 *
 * Privacy posture : same as Snitcher. We only request firmographic
 * resolution — never person-level identification.
 */

import { logger } from "@/lib/observability/logger";
import type { VisitorIdProvider, VisitorIdResult } from "./provider";

const ENDPOINT = "https://api.rb2b.com/v1/identify";
const TIMEOUT_MS = 4000;

export const rb2bProvider: VisitorIdProvider = {
  name: "rb2b",
  isAvailable() {
    return Boolean(process.env.RB2B_API_KEY);
  },
  async identify(input) {
    const key = process.env.RB2B_API_KEY;
    if (!key) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "X-Api-Key": key,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ip: input.ip,
          user_agent: input.userAgent ?? null,
          url: input.url ?? null,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        // 404 / 204 are the expected "no match" responses across
        // these providers — no log noise for those.
        if (res.status !== 404 && res.status !== 204) {
          logger.warn("rb2b: non-2xx", { status: res.status });
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
        logger.warn("rb2b: timeout", { ip: input.ip });
      } else {
        logger.warn("rb2b: fetch error", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};
