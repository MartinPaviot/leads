/**
 * HTTP response helper for quota-exceeded errors.
 *
 * 402 "Payment Required" is the natural HTTP code. We use a stable response
 * shape that the frontend can intercept at its fetch layer and turn into a
 * toast / upgrade modal without parsing free-text error strings.
 */

import { QuotaExceededError } from "@/lib/pricing/quota";

export interface QuotaExceededResponseBody {
  error: string;
  code: "quota_exceeded";
  feature: "contacts" | "emails" | "ai_queries";
  current: number;
  limit: number;
  plan: string;
  upgradeUrl: string;
}

export function quotaExceededResponse(err: QuotaExceededError): Response {
  const body: QuotaExceededResponseBody = {
    error: err.message,
    code: "quota_exceeded",
    feature: err.feature,
    current: err.current,
    limit: err.limit,
    plan: err.plan,
    upgradeUrl: "/pricing",
  };
  return Response.json(body, { status: 402 });
}

/**
 * Convenience: run a route handler body and convert any QuotaExceededError it
 * throws into a 402. Other errors propagate unchanged.
 */
export async function withQuotaErrorHandling<T extends Response>(
  fn: () => Promise<T>
): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return quotaExceededResponse(err);
    }
    throw err;
  }
}
