/**
 * Canonical paginated response helper.
 *
 * Every list endpoint should use this to build its Response. The shape
 * returned is the canonical `PaginatedResponse<T>`:
 *
 *   { items, pagination: { page, pageSize, total, totalPages, hasMore } }
 *
 * For backward compatibility, callers can pass a `legacyKey` (e.g.
 * "accounts", "contacts", "deals") which adds an alias so existing
 * consumers keep working while new code targets `items`.
 */

interface PaginationInput {
  page: number;
  pageSize: number;
  total: number;
}

export function paginatedResponse<T>(
  items: T[],
  pagination: PaginationInput,
  legacyKey?: string,
  /** Extra top-level fields merged into the body (e.g. `facets` for filter
   *  dropdown options). Kept optional so existing callers are unaffected. */
  extra?: Record<string, unknown>,
): Response {
  const { page, pageSize, total } = pagination;
  const totalPages = Math.ceil(total / pageSize);
  const hasMore = page * pageSize < total;

  const body: Record<string, unknown> = {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasMore,
    },
  };

  // Backward-compatible alias — callers that still read `response.accounts`
  // or `response.contacts` continue to work until they migrate to `items`.
  if (legacyKey) {
    body[legacyKey] = items;
  }

  if (extra) {
    Object.assign(body, extra);
  }

  return Response.json(body);
}
