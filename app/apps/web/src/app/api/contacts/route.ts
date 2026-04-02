import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { eq } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db
      .select()
      .from(contacts)
      .where(eq(contacts.tenantId, authCtx.tenantId))
      .limit(200);
    return Response.json({ contacts: result });
  } catch (error) {
    console.error("Failed to fetch contacts:", error);
    return Response.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}
