import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!contact) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    return Response.json({ contact });
  } catch (error) {
    console.error("Failed to fetch contact:", error);
    return Response.json({ error: "Failed to fetch contact" }, { status: 500 });
  }
}
