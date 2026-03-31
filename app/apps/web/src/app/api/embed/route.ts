import { auth } from "@/auth";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { embedEntity, contactToText, companyToText } from "@/lib/embeddings";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { scope } = body; // "all", "contacts", "companies"

    let embedded = 0;

    if (scope === "all" || scope === "contacts") {
      const allContacts = await db.select().from(contacts);
      for (const contact of allContacts) {
        const text = contactToText({
          firstName: contact.firstName,
          lastName: contact.lastName,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          properties: contact.properties as Record<string, unknown> | null,
          companyName: null,
        });
        if (text.trim()) {
          await embedEntity("default", "contact", contact.id, text);
          embedded++;
        }
      }
    }

    if (scope === "all" || scope === "companies") {
      const allCompanies = await db.select().from(companies);
      for (const company of allCompanies) {
        const text = companyToText({
          name: company.name,
          domain: company.domain,
          industry: company.industry,
          revenue: company.revenue,
          size: company.size,
          description: company.description,
        });
        if (text.trim()) {
          await embedEntity("default", "company", company.id, text);
          embedded++;
        }
      }
    }

    return Response.json({ success: true, embedded });
  } catch (error) {
    console.error("Embedding failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Embedding failed: ${message}` }, { status: 500 });
  }
}
