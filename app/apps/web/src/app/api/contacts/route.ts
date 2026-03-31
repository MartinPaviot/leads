import { db } from "@/db";
import { contacts } from "@/db/schema";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db.select().from(contacts).limit(200);
    return Response.json({ contacts: result });
  } catch (error) {
    console.error("Failed to fetch contacts:", error);
    return Response.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}
