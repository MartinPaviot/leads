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

import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { z } from "zod";
import type { FilterCondition, FilterFieldDef } from "@/lib/filters";
import { validateFilters, operatorsForType } from "@/lib/filters";

// ─────────────────────────────────────────────────────────────
// Field catalogs per resource type
// ─────────────────────────────────────────────────────────────
// The LLM sees these catalogs in its system prompt. Keeping them in
// code (rather than auto-deriving from drizzle schema) means we can:
//   - pre-compute example values so the model produces realistic enums
//   - describe intent ("industry is free text in our DB, so use
//     'contains' not 'eq'") without polluting the schema file.

const ACCOUNT_FIELDS: readonly FilterFieldDef[] = [
  { key: "name", label: "Account name", type: "text" },
  { key: "domain", label: "Website / domain", type: "text" },
  { key: "industry", label: "Industry", type: "text" },
  { key: "size", label: "Employee count range", type: "text" },
  { key: "revenue", label: "Annual revenue", type: "text" },
  { key: "score", label: "Fit score (0–100)", type: "number" },
] as const;

const CONTACT_FIELDS: readonly FilterFieldDef[] = [
  { key: "firstName", label: "First name", type: "text" },
  { key: "lastName", label: "Last name", type: "text" },
  { key: "title", label: "Job title", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "companyName", label: "Company name", type: "text" },
] as const;

const FIELD_CATALOGS = {
  account: ACCOUNT_FIELDS,
  contact: CONTACT_FIELDS,
} as const;

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

  const fieldCatalog = FIELD_CATALOGS[resourceType];

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  const catalogDescription = fieldCatalog
    .map((f) => `  - ${f.key} (${f.type}): ${f.label}`)
    .join("\n");

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

Rules:
1. Only emit conditions for fields in the catalog above. If the query mentions something not in the catalog (e.g. location when there's no location field), put that fragment in \`unmatched\` and do NOT invent a field.
2. For free-text fields like "industry" stored as free text in our DB, prefer \`contains\` over \`eq\` (e.g. "SaaS" → industry contains "SaaS", not industry eq "SaaS") — our data is not normalized to a fixed taxonomy.
3. For title/job-role queries, use \`title\` with \`contains\` and the core noun ("CTO", "Head of Sales", "Product Manager"). Do NOT add seniority modifiers to the value unless explicitly asked (e.g. "senior CTOs" → title contains "CTO", not "Senior CTO").
4. For numeric ranges on score (0-100), translate "high" → gte 70, "top" → gte 80, "low" → lte 30. Only if explicitly numeric in the query.
5. Output one filter per distinct criterion. Combine multiple keywords for the same field into a SINGLE condition (the UI applies implicit AND between filters, and contains is already a substring match).
6. Keep reasoning under 200 characters.
7. If the query is unparseable or completely vague, return empty filters and explain in reasoning.

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

    return Response.json({
      filters: final,
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
