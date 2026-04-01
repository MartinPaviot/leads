import { auth } from "@/auth";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const companyContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.companyId, id));

    return Response.json({ contacts: companyContacts });
  } catch (error) {
    console.error("Failed to fetch contacts for account:", error);
    return Response.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}
