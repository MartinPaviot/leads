import { auth } from "@/auth";
import { db } from "@/db";
import { contacts, companies, sequenceEnrollments } from "@/db/schema";
import { eq, sql, and, isNotNull, notInArray } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sequenceId } = await params;

  try {
    // Get already-enrolled contact IDs for this sequence
    const enrolled = await db
      .select({ contactId: sequenceEnrollments.contactId })
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.sequenceId, sequenceId));

    const enrolledIds = enrolled.map((e) => e.contactId).filter(Boolean) as string[];

    // Find scored contacts not already enrolled, with email addresses
    const candidates = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        score: contacts.score,
        scoreReasons: contacts.scoreReasons,
        companyId: contacts.companyId,
      })
      .from(contacts)
      .where(
        and(
          isNotNull(contacts.score),
          isNotNull(contacts.email),
          enrolledIds.length > 0
            ? sql`${contacts.id} NOT IN (${sql.join(enrolledIds.map(id => sql`${id}`), sql`, `)})`
            : sql`1=1`
        )
      )
      .orderBy(sql`${contacts.score} DESC NULLS LAST`)
      .limit(10);

    // Enrich with company names
    const suggestions = await Promise.all(
      candidates.map(async (contact) => {
        let companyName = "Unknown";
        if (contact.companyId) {
          const [company] = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, contact.companyId))
            .limit(1);
          companyName = company?.name || "Unknown";
        }

        const reasons = (contact.scoreReasons as string[]) || [];
        return {
          contactId: contact.id,
          contactName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown",
          companyName,
          reason: reasons.slice(0, 2).join(". ") || `Score: ${Math.round(contact.score || 0)}`,
          score: Math.round(contact.score || 0),
        };
      })
    );

    return Response.json({ suggestions });
  } catch (error) {
    console.error("Suggestions error:", error);
    return Response.json({ suggestions: [] });
  }
}
