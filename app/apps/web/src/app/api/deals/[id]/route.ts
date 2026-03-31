import { auth } from "@/auth";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [deal] = await db
      .select()
      .from(deals)
      .where(eq(deals.id, id))
      .limit(1);

    if (!deal) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    return Response.json({ deal });
  } catch (error) {
    console.error("Failed to fetch deal:", error);
    return Response.json({ error: "Failed to fetch deal" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { name, stage, value, summary } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updates.name = name.trim();
    if (stage) updates.stage = stage;
    if (value !== undefined) updates.value = value ? parseInt(value) : null;
    if (summary !== undefined) updates.summary = summary;

    const [updated] = await db
      .update(deals)
      .set(updates)
      .where(eq(deals.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }

    return Response.json({ deal: updated });
  } catch (error) {
    console.error("Failed to update deal:", error);
    return Response.json({ error: "Failed to update deal" }, { status: 500 });
  }
}
