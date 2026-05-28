/**
 * GET /api/playbook    — list entries with optional ?type= filter
 * POST /api/playbook   — manually add an entry (founder review path)
 *
 * Tenant-scoped. Sorts by `perfScore DESC NULLS LAST` so the entries
 * the team has rated highly surface first; NULL-perf entries (newly
 * captured, not yet rated) appear after, sorted by recency.
 *
 * The POST path routes through `validatePlaybookEntry` so the manual
 * UI cannot bypass the same rules the LLM extractor must satisfy
 * (B4 sink contract).
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { playbookEntries } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  PLAYBOOK_ENTRY_TYPES,
  isPlaybookEntryType,
  validatePlaybookEntry,
} from "@/lib/playbook/capture";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type");
  const limitParam = url.searchParams.get("limit");

  const limit = (() => {
    if (!limitParam) return DEFAULT_LIMIT;
    const n = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
  })();

  const conditions = [eq(playbookEntries.tenantId, authCtx.tenantId)];
  if (typeParam) {
    if (!isPlaybookEntryType(typeParam)) {
      return Response.json(
        {
          error: `Invalid type filter '${typeParam}' — must be one of ${PLAYBOOK_ENTRY_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }
    conditions.push(eq(playbookEntries.type, typeParam));
  }

  const entries = await db
    .select({
      id: playbookEntries.id,
      type: playbookEntries.type,
      content: playbookEntries.content,
      sourceActivityId: playbookEntries.sourceActivityId,
      outcomeLabel: playbookEntries.outcomeLabel,
      perfScore: playbookEntries.perfScore,
      createdAt: playbookEntries.createdAt,
      updatedAt: playbookEntries.updatedAt,
    })
    .from(playbookEntries)
    .where(and(...conditions))
    .orderBy(
      // NULLS LAST: top-performers surface first, fresh-untrated come
      // after sorted by recency.
      sql`${playbookEntries.perfScore} DESC NULLS LAST`,
      desc(playbookEntries.createdAt),
    )
    .limit(limit);

  return Response.json({ entries, count: entries.length });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    type?: string;
    content?: string;
    outcomeLabel?: string | null;
    perfScore?: number | null;
    sourceActivityId?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = validatePlaybookEntry({
    type: body.type ?? "",
    content: body.content ?? "",
    outcomeLabel: body.outcomeLabel ?? null,
    perfScore: body.perfScore ?? null,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const [inserted] = await db
    .insert(playbookEntries)
    .values({
      tenantId: authCtx.tenantId,
      type: result.entry.type,
      content: result.entry.content,
      outcomeLabel: result.entry.outcomeLabel,
      perfScore: result.entry.perfScore,
      sourceActivityId: body.sourceActivityId ?? null,
    })
    .returning();

  return Response.json({ entry: inserted }, { status: 201 });
}
