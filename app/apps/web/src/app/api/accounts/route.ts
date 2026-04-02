import { db } from "@/db";
import { companies } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";

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
        .select()
        .from(companies)
        .where(eq(companies.tenantId, authCtx.tenantId))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(companies)
        .where(eq(companies.tenantId, authCtx.tenantId)),
    ]);

    const total = countResult[0]?.count ?? 0;

    return Response.json({
      accounts,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, domain } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const [account] = await db
      .insert(companies)
      .values({
        name: name.trim(),
        domain: domain?.trim() || null,
        tenantId: authCtx.tenantId,
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
    return Response.json({ error: "Failed to create account" }, { status: 500 });
  }
}
