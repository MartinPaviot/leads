/**
 * POST /api/filters/parse-nl
 *
 * Smart Search — converts a natural-language query into structured
 * FilterCondition[] that the existing filter system (lib/filters.ts) can
 * apply. Inspired by FuseAI's "Smart Search" on their Prospect Search
 * page, but wired to our own Accounts / Contacts list pages and filter
 * types.
 *
 * Body: { query: string; resourceType: "account" | "contact" }
 * Returns: { filters: FilterCondition[]; reasoning: string; unmatched?: string[] }
 *
 * Intentional constraints:
 * - Model output is restricted to the fields & operators we actually
 *   support in the client-side list filter — hallucinated fields are
 *   dropped and reported in `unmatched`.
 * - Each resource type has its own field catalog so the prompt is tight
 *   and the LLM doesn't have to reason about "is this an account field or
 *   a contact field".
 * - Rate-limited via the existing llm bucket.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";
import type { FilterCondition } from "@/lib/search/filters";
import { validateFilters, operatorsForType } from "@/lib/search/filters";
import { FILTER_FIELD_CATALOGS, scopeSmartFilters } from "@/lib/search/smart-filter-scope";

// Field catalogs (per resource type) + the broad-search scoping rule live in
// lib/search/smart-filter-scope.ts — the single, unit-tested source of truth
// shared with the list pages. The LLM sees the catalog in its prompt; the
// scoping rule strips any text condition the broad search box already covers.

// ─────────────────────────────────────────────────────────────
// LLM output schema — deliberately permissive, validated after
// ─────────────────────────────────────────────────────────────

const rawFilterSchema = z.object({
  filters: z
    .array(
      z.object({
        field: z.string().describe("Exact key from the provided field catalog"),
        operator: z.enum([
          "eq", "neq", "gt", "gte", "lt", "lte",
          "contains", "not-contains", "starts-with", "ends-with",
          "includes-any", "includes-all", "excludes",
          "before", "after", "between", "last-n-days",
          "is-true", "is-false",
        ]),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])
          .describe("Value. For multi-select operators pass array of strings; for contains pass a single string."),
      }),
    )
    .describe("Extracted filter conditions. Empty array if nothing extractable."),
  reasoning: z.string().describe("One sentence explaining what was extracted and what was skipped."),
  unmatched: z.array(z.string()).describe("Query fragments that couldn't be mapped to any field, e.g. 'in Paris' if there's no location field."),
});

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("llm", authCtx.userId);
  if (rl) return rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, resourceType } = (body ?? {}) as {
    query?: unknown;
    resourceType?: unknown;
  };

  if (typeof query !== "string" || query.trim().length === 0) {
    return Response.json({ error: "query (non-empty string) required" }, { status: 400 });
  }
  if (query.length > 500) {
    return Response.json({ error: "query too long (max 500 chars)" }, { status: 400 });
  }
  if (resourceType !== "account" && resourceType !== "contact") {
    return Response.json(
      { error: 'resourceType must be "account" or "contact"' },
      { status: 400 },
    );
  }

  const fieldCatalog = FILTER_FIELD_CATALOGS[resourceType];

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  const catalogDescription = fieldCatalog
    .map((f) => `  - ${f.key} (${f.type}): ${f.label}`)
    .join("\n");

  const searchedCategories = resourceType === "account"
    ? "account name, website/domain, industry and description"
    : "first/last name, email, job title, and each person's company plus its industry";

  const prompt = `You convert a natural-language search query into structured filter conditions for a CRM list.

Resource type: ${resourceType}
Available fields (use EXACTLY these keys — nothing else):
${catalogDescription}

Operators available by field type:
  - text: contains, not-contains, starts-with, ends-with, eq
  - number: eq, neq, gt, gte, lt, lte
  - multi-select: includes-any, includes-all, excludes
  - date-range: before, after, between, last-n-days
  - boolean: is-true, is-false

HOW THIS LIST ALREADY SEARCHES — read this first:
The list has a single broad search box that ALREADY matches the user's words, server-side, across every text category (${searchedCategories}) and resolves sectors by MEANING, not spelling (e.g. "police" → law-enforcement companies, "medical" → health-care, "banks" → financial services). Industry/sector also has its own dedicated column filter.

So your job is NOT to re-type the keywords into text conditions — that is already done, and a redundant literal text condition would only WRONGLY narrow the broad search (it can't see the semantic matches). Extract ONLY the few refinements the broad search cannot express:
  1. Fit score thresholds on \`score\` (0–100): "high"/"good fit" → gte 70, "top"/"best" → gte 80, "low"/"weak" → lte 30, or an explicit number.
  2. Explicit EXCLUSIONS the user states ("not …", "exclude …", "except …") → not-contains / excludes / neq.

Rules:
1. A plain keyword, sector, company name, person name, job title, email or domain is ALREADY handled by the search box → return an empty filters array for it and do NOT list it in \`unmatched\`. (Example: "police", "SaaS", "CTOs", "Acme" → filters: [].)
2. Only emit a condition for an actual score threshold or an explicit exclusion as defined above. Use only keys from the catalog; never invent a field.
3. Put a fragment in \`unmatched\` ONLY when it is a real constraint with no home at all (e.g. a geography/location when there is no location field) — never for words the search box already covers.
4. Keep reasoning under 200 characters.

Query: "${query.trim()}"`;

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: rawFilterSchema,
      prompt,
      _trace: {
        agentId: "smart-search-parser",
        tenantId: authCtx.tenantId,
        inputPreview: `[${resourceType}] ${query.slice(0, 120)}`,
      },
    });

    const raw = object as z.infer<typeof rawFilterSchema>;

    // Post-process: coerce values and drop anything referring to an
    // unknown field or invalid operator. Defense-in-depth — the LLM will
    // sometimes hallucinate a field even when told not to.
    const validKeys = new Set(fieldCatalog.map((f) => f.key));
    const cleaned: FilterCondition[] = [];
    const dropped: string[] = [];

    for (const f of raw.filters ?? []) {
      if (!validKeys.has(f.field)) {
        dropped.push(`${f.field} ${f.operator} ${JSON.stringify(f.value)}`);
        continue;
      }
      // Coerce number-shaped fields
      const def = fieldCatalog.find((x) => x.key === f.field)!;
      let value = f.value;
      if (def.type === "number" && typeof value !== "number") {
        const n = Number(value);
        if (Number.isNaN(n)) {
          dropped.push(`${f.field} (non-numeric value for number field)`);
          continue;
        }
        value = n;
      }
      cleaned.push({ field: f.field, operator: f.operator, value });
    }

    // Final validation against the catalog (catches bad operator per type).
    // If the whole set validates we keep it; otherwise we drop per-condition
    // anything whose operator isn't valid for the field type, keeping the rest.
    const valid = validateFilters(cleaned, [...fieldCatalog]);
    const final = valid.ok
      ? cleaned
      : cleaned.filter((c) => {
          const catalogEntry = fieldCatalog.find((f) => f.key === c.field);
          if (!catalogEntry) return false;
          return operatorsForType(catalogEntry.type).includes(c.operator);
        });

    // Strip any condition the broad full-text search box already covers (a
    // positive text match on a text field). Keeping it would re-filter the
    // server's semantic matches literally — e.g. drop every "Law Enforcement"
    // row for a "police" query the search box matched by meaning — and make
    // the count banner and the table contradict each other. These deferred
    // conditions are handled by the search box, so they are NOT surfaced as
    // "unmatched". Defense-in-depth: the prompt already asks the model not to
    // emit them, this guarantees it regardless of the model.
    const { kept: scoped } = scopeSmartFilters(final, resourceType);

    return Response.json({
      filters: scoped,
      reasoning: raw.reasoning ?? "",
      unmatched: [...(raw.unmatched ?? []), ...dropped],
    });
  } catch (err) {
    console.warn("filters/parse-nl failed", err);
    return Response.json(
      { error: "Failed to parse query", detail: String(err).slice(0, 200) },
      { status: 500 },
    );
  }
}
