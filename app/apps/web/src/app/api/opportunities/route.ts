import { db } from "@/db";
import { deals, companies, users } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { and, eq, gte, lte, sql, desc, asc, inArray, isNull } from "drizzle-orm";
import { logAudit } from "@/lib/infra/audit-log";
import { apiError } from "@/lib/infra/api-errors";
import { paginatedResponse } from "@/lib/infra/api-response";
import { z } from "zod";

const VALID_STAGES = ["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"] as const;

const createDealSchema = z.object({
  name: z.string().min(1, "Name is required").max(500),
  stage: z.enum(VALID_STAGES).optional().default("lead"),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  value: z.union([z.number(), z.string()]).optional(),
  expectedCloseDate: z.string().optional(),
  closeDate: z.string().optional(),
});

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url, "http://localhost");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") || "100", 10)));
    const offset = (page - 1) * pageSize;

    // Server-side filters
    const stageFilter = url.searchParams.get("stage"); // comma-separated stages
    const minValue = url.searchParams.get("minValue");
    const maxValue = url.searchParams.get("maxValue");
    const sortBy = url.searchParams.get("sortBy") || "updatedAt"; // updatedAt, value, name, createdAt
    const sortDirection = url.searchParams.get("sortDir") === "asc" ? "asc" : "desc";

    const conditions = [eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)];

    if (stageFilter) {
      const validStages = ["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"] as const;
      const stages = stageFilter
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is (typeof validStages)[number] =>
          (validStages as readonly string[]).includes(s),
        );
      if (stages.length > 0) {
        conditions.push(inArray(deals.stage, stages));
      }
    }
    if (minValue) {
      const parsed = parseInt(minValue, 10);
      if (!isNaN(parsed)) conditions.push(gte(deals.value, parsed));
    }
    if (maxValue) {
      const parsed = parseInt(maxValue, 10);
      if (!isNaN(parsed)) conditions.push(lte(deals.value, parsed));
    }

    const whereClause = and(...conditions);

    // Sort
    const orderFn = sortDirection === "asc" ? asc : desc;
    const orderCol =
      sortBy === "value" ? deals.value
      : sortBy === "name" ? deals.name
      : sortBy === "createdAt" ? deals.createdAt
      : deals.updatedAt;

    const [result, countResult] = await Promise.all([
      db
        .select({
          id: deals.id,
          tenantId: deals.tenantId,
          name: deals.name,
          stage: deals.stage,
          value: deals.value,
          currency: deals.currency,
          companyId: deals.companyId,
          contactId: deals.contactId,
          ownerId: deals.ownerId,
          summary: deals.summary,
          expectedCloseDate: deals.expectedCloseDate,
          properties: deals.properties,
          score: deals.score,
          scoreReasons: deals.scoreReasons,
          createdAt: deals.createdAt,
          updatedAt: deals.updatedAt,
          companyName: companies.name,
          companyDomain: companies.domain,
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
        })
        .from(deals)
        .leftJoin(companies, eq(deals.companyId, companies.id))
        .leftJoin(users, eq(deals.ownerId, users.id))
        .where(whereClause)
        .orderBy(orderFn(orderCol))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deals)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    // Canonical paginated response. Legacy key `deals` preserved for
    // existing consumers; `hasMore` added via the shared helper.
    return paginatedResponse(result, { page, pageSize, total }, "deals");
  } catch (error) {
    console.error("Failed to fetch deals:", error);
    return Response.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  try {
    const raw = await req.json();
    const parsed = createDealSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid deal data", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { name, stage, companyId, contactId, value, expectedCloseDate, closeDate, ownerId } = parsed.data;

    const [deal] = await db
      .insert(deals)
      .values({
        name: name.trim(),
        stage: stage || "lead",
        companyId: companyId || null,
        contactId: contactId || null,
        ownerId: ownerId || authCtx.appUserId || null,
        value: value ? parseInt(String(value)) : null,
        expectedCloseDate: (expectedCloseDate || closeDate) ? new Date((expectedCloseDate || closeDate)!) : null,
        tenantId: authCtx.tenantId,
      })
      .returning();

    await logAudit({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      action: "create",
      entityType: "deal",
      entityId: deal.id,
      metadata: {
        name: deal.name,
        stage: deal.stage,
        value: deal.value,
      },
    });

    return Response.json({ deal }, { status: 201 });
  } catch (error) {
    console.error("Failed to create deal:", error);
    return apiError("INTERNAL_ERROR", "Failed to create deal");
  }
}
