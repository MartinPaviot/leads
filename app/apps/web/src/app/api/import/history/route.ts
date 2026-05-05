import { db } from "@/db";
import { importHistory } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const history = await db
      .select()
      .from(importHistory)
      .where(eq(importHistory.tenantId, authCtx.tenantId))
      .orderBy(desc(importHistory.createdAt))
      .limit(20);

    return Response.json({ imports: history });
  } catch (error) {
    console.error("Failed to fetch import history:", error);
    return Response.json({ imports: [] });
  }
}
