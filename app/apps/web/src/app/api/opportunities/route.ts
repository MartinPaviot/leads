import { db } from "@/db";
import { deals } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { eq } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db.select().from(deals).where(eq(deals.tenantId, authCtx.tenantId)).limit(100);
    return Response.json({ deals: result });
  } catch (error) {
    console.error("Failed to fetch deals:", error);
    return Response.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, stage, companyId, value } = body;

    if (!name || typeof name !== "string") {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const [deal] = await db
      .insert(deals)
      .values({
        name: name.trim(),
        stage: stage || "lead",
        companyId: companyId || null,
        value: value ? parseInt(value) : null,
        tenantId: authCtx.tenantId,
      })
      .returning();

    return Response.json({ deal }, { status: 201 });
  } catch (error) {
    console.error("Failed to create deal:", error);
    return Response.json({ error: "Failed to create deal" }, { status: 500 });
  }
}
