import { db } from "@/db";
import { companies, activities, users } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { and, eq, sql, desc, isNull } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { apiError } from "@/lib/infra/api-errors";
import { paginatedResponse } from "@/lib/infra/api-response";
import { z } from "zod";

const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(500),
  domain: z.string().max(253).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const patchAccountSchema = z.object({
  id: z.string().uuid(),
  customFields: z.record(z.string(), z.unknown()),
});

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)));
    const offset = (page - 1) * pageSize;

    const [accounts, countResult] = await Promise.all([
      db
        .select({
          id: companies.id,
          name: companies.name,
          domain: companies.domain,
          industry: companies.industry,
          size: companies.size,
          revenue: companies.revenue,
          description: companies.description,
          score: companies.score,
          scoreReasons: companies.scoreReasons,
          ownerId: companies.ownerId,
          properties: companies.properties,
          createdAt: companies.createdAt,
          updatedAt: companies.updatedAt,
          tenantId: companies.tenantId,
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
        })
        .from(companies)
        .leftJoin(users, eq(companies.ownerId, users.id))
        .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(companies)
        .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt))),
    ]);

    const total = countResult[0]?.count ?? 0;

    // Fetch last interaction per account (most recent activity linked to each company's contacts)
    const lastInteractions: Record<string, { date: Date; summary: string | null }> = {};

    try {
      if (accounts.length > 0) {
        const accountIds = accounts.map((a) => a.id);
        const interactions = await db.execute(sql`
          SELECT DISTINCT ON (c.company_id)
            c.company_id,
            a.occurred_at,
            a.summary
          FROM activities a
          JOIN contacts c ON c.id = a.entity_id AND a.entity_type = 'contact'
          WHERE c.company_id = ANY(ARRAY[${sql.join(accountIds.map(id => sql`${id}`), sql`, `)}]::text[])
            AND a.tenant_id = ${authCtx.tenantId}
          ORDER BY c.company_id, a.occurred_at DESC
        `);
        for (const row of interactions as unknown as Array<{ company_id: string; occurred_at: Date; summary: string | null }>) {
          lastInteractions[row.company_id] = { date: row.occurred_at, summary: row.summary };
        }
      }
    } catch (e) {
      // Non-critical: accounts still load without last interaction
      console.warn("Failed to fetch last interactions:", e);
    }

    const enrichedAccounts = accounts.map((a) => ({
      ...a,
      lastInteraction: lastInteractions[a.id] || null,
    }));

    // A1 — canonical paginated response via shared helper.
    // Legacy key `accounts` preserved for existing consumers.
    return paginatedResponse(enrichedAccounts, { page, pageSize, total }, "accounts");
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  try {
    const raw = await req.json();
    const parsed = createAccountSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid account data", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { name, domain, properties: customProperties } = parsed.data;

    const [account] = await db
      .insert(companies)
      .values({
        name: name.trim(),
        domain: domain?.trim() || null,
        tenantId: authCtx.tenantId,
        properties: customProperties || {},
      })
      .returning();

    // Fire enrichment event for background processing
    await inngest.send({
      name: "company/created",
      data: { companyId: account.id, tenantId: authCtx.tenantId },
    }).catch(console.warn);

    return Response.json({ account }, { status: 201 });
  } catch (error) {
    console.error("Failed to create account:", error);
    return apiError("INTERNAL_ERROR", "Failed to create account");
  }
}

/** Update custom field values on an account */
export async function PATCH(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  try {
    const raw = await req.json();
    const parsed = patchAccountSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "id and customFields required", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { id, customFields } = parsed.data;

    // Get current properties
    const [existing] = await db.select().from(companies)
      .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
      .limit(1);

    if (!existing) {
      return apiError("NOT_FOUND", "Account not found");
    }

    const currentProps = (existing.properties || {}) as Record<string, unknown>;
    const currentCustom = (currentProps.customFields || {}) as Record<string, unknown>;

    const [updated] = await db.update(companies).set({
      properties: {
        ...currentProps,
        customFields: { ...currentCustom, ...customFields },
      },
      updatedAt: new Date(),
    }).where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)))
      .returning();

    return Response.json({ account: updated });
  } catch (error) {
    console.error("Failed to update custom fields:", error);
    return apiError("INTERNAL_ERROR", "Failed to update");
  }
}
