/**
 * Structured API error responses.
 *
 * Every error returned to the client carries a machine-readable `code`
 * alongside the human-readable `message`. Clients can switch on `code`
 * for retry logic, toast messages, or upgrade prompts without parsing
 * free-text strings.
 */

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "PLAN_LIMIT_EXCEEDED"
  | "RATE_LIMITED"
  | "BUDGET_EXCEEDED"
  | "PROVIDER_UNAVAILABLE"
  | "CIRCUIT_OPEN"
  | "CONFLICT"
  | "INTERNAL_ERROR";

const STATUS_MAP: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  PLAN_LIMIT_EXCEEDED: 403,
  RATE_LIMITED: 429,
  BUDGET_EXCEEDED: 402,
  PROVIDER_UNAVAILABLE: 503,
  CIRCUIT_OPEN: 503,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

/**
 * Build a structured JSON error Response.
 *
 * @example
 *   return apiError("VALIDATION_ERROR", "dealIds array required");
 *   return apiError("PLAN_LIMIT_EXCEEDED", "Contact limit reached", { current: 50, limit: 50 });
 */
export function apiError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Response {
  const status = STATUS_MAP[code];
  return Response.json(
    {
      error: {
        code,
        message,
        ...(details && Object.keys(details).length > 0 ? details : {}),
      },
    },
    { status },
  );
}
