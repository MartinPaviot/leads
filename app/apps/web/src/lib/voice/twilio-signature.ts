/**
 * Self-contained Twilio webhook signature validation.
 *
 * Twilio signs each webhook as base64(HMAC-SHA1(authToken, url + sorted
 * POST params)). We implement it directly with node:crypto so validation
 * does NOT depend on the Twilio SDK module being pre-loaded on the current
 * serverless instance (the SDK's validateRequest throws if the module
 * wasn't warmed by a prior createCall/token call — flaky on cold lambdas).
 *
 * Docs: https://www.twilio.com/docs/usage/security#validating-requests
 */

import crypto from "node:crypto";

export function validateTwilioSignature(opts: {
  authToken: string;
  /** Full URL exactly as Twilio called it, including query string. */
  url: string;
  /** Parsed POST form params (empty object for GET/no-body). */
  params: Record<string, string>;
  /** The X-Twilio-Signature header value. */
  signature: string | null;
}): boolean {
  const { authToken, url, params, signature } = opts;
  if (!signature || !authToken) return false;
  // URL, then each param key+value appended in alphabetical key order.
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
