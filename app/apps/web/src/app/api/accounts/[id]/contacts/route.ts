import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const companyContacts = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, id), eq(contacts.tenantId, authCtx.tenantId)));

    return Response.json({ contacts: companyContacts });
  } catch (error) {
    console.error("Failed to fetch contacts for account:", error);
    return Response.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}
