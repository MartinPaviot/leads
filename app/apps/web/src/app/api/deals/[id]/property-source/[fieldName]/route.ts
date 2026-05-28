/**
 * GET /api/deals/[id]/property-source/[fieldName]
 *
 * P0-5 task 5.5 — source attribution for a single deal property.
 * The deal page UI hits this on hover of a [ⓘ] glyph next to an
 * auto-filled field, and renders the resulting tooltip.
 *
 * Response shape :
 *   {
 *     value: <unwrapped current value>,
 *     source: "email" | "meeting" | "manual" | "import" | "legacy",
 *     sourceDate: ISO string,
 *     manual: boolean,
 *     confidence: 0..1 | null,
 *     history: [{ value, source, date, manual, confidence? }]   // capped at 10
 *   }
 *
 * Returns 404 when the deal doesn't exist (or isn't in the tenant)
 * AND when the field is absent from the deal's properties. The UI
 * treats both as "no attribution available" — no need to distinguish.
 *
 * Reads only — no DB writes. Tenant-scoped by `getAuthContext`.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  getDealPropertyEntry,
} from "@/lib/deal-autofill/property-accessor";
import type { PropertyEntry } from "@/lib/deal-autofill/conflict-resolution";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fieldName: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, fieldName } = await params;

  // Defensive : reject suspicious field names. The legitimate set is
  // bounded by FIELD_CONFLICT_RULES + free-form custom fields, but we
  // never want path-traversal-shaped or overlong inputs landing in a
  // jsonb path.
  if (
    !fieldName ||
    fieldName.length > 80 ||
    !/^[a-zA-Z0-9_-]+$/.test(fieldName)
  ) {
    return Response.json({ error: "Invalid field name" }, { status: 400 });
  }

  const [deal] = await db
    .select({
      properties: deals.properties,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)))
    .limit(1);

  if (!deal) {
    return Response.json({ error: "Deal not found" }, { status: 404 });
  }

  const props = (deal.properties ?? {}) as Record<string, unknown>;

  // Pull the entry — accessor handles legacy synthesis.
  const entry = getDealPropertyEntry<unknown>(
    props,
    fieldName,
    deal.updatedAt ?? undefined,
  );

  if (!entry) {
    return Response.json(
      { error: "Field not set on this deal" },
      { status: 404 },
    );
  }

  // History is stored under `<fieldName>_history` per the accessor's
  // appendToPropertyHistory contract.
  const historyKey = `${fieldName}_history`;
  const historyRaw = props[historyKey];
  const history: Array<PropertyEntry> = Array.isArray(historyRaw)
    ? (historyRaw as Array<PropertyEntry>)
    : [];

  return Response.json({
    fieldName,
    value: entry.value,
    source: entry.source,
    sourceDate:
      entry.date instanceof Date
        ? entry.date.toISOString()
        : new Date(entry.date).toISOString(),
    manual: entry.manual,
    confidence: entry.confidence ?? null,
    history: history.slice(-10).map((h) => ({
      value: h.value,
      source: h.source,
      date:
        h.date instanceof Date
          ? h.date.toISOString()
          : new Date(h.date).toISOString(),
      manual: h.manual,
      confidence: h.confidence ?? null,
    })),
  });
}
