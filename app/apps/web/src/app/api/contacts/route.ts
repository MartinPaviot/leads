import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { eq, sql } from "drizzle-orm";

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

    const [result, countResult] = await Promise.all([
      db
        .select()
        .from(contacts)
        .where(eq(contacts.tenantId, authCtx.tenantId))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(eq(contacts.tenantId, authCtx.tenantId)),
    ]);

    const total = countResult[0]?.count ?? 0;

    return Response.json({
      contacts: result,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Failed to fetch contacts:", error);
    return Response.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}
