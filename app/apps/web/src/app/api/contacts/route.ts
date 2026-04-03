import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { embedEntity, contactToText } from "@/lib/embeddings";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)));
    const offset = (page - 1) * pageSize;
    const emailSearch = url.searchParams.get("email")?.trim().toLowerCase();

    // Build where clause — optionally filter by email (primary OR additionalEmails)
    const baseWhere = eq(contacts.tenantId, authCtx.tenantId);
    const whereClause = emailSearch
      ? sql`${baseWhere} AND (
          lower(${contacts.email}) = ${emailSearch}
          OR ${contacts.properties}->>'additionalEmails' IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(${contacts.properties}->'additionalEmails') AS ae
              WHERE lower(ae) = ${emailSearch}
            )
        )`
      : baseWhere;

    const [result, countResult] = await Promise.all([
      db
        .select()
        .from(contacts)
        .where(whereClause)
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return Response.json({
      contacts: result,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Failed to fetch contacts:", error);
    return Response.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { firstName, lastName, email, title, phone, companyId, additionalEmails, additionalCompanyIds } = body;

    if (!email && !firstName && !lastName) {
      return Response.json({ error: "At least email or name required" }, { status: 400 });
    }

    // Build properties with multi-email and multi-account data
    const properties: Record<string, unknown> = {};
    if (Array.isArray(additionalEmails) && additionalEmails.length > 0) {
      properties.additionalEmails = additionalEmails
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e && e !== email?.trim()?.toLowerCase());
    }
    if (Array.isArray(additionalCompanyIds) && additionalCompanyIds.length > 0) {
      properties.additionalCompanyIds = additionalCompanyIds.filter(
        (id: string) => id && id !== companyId
      );
    }

    const [contact] = await db
      .insert(contacts)
      .values({
        tenantId: authCtx.tenantId,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        email: email?.trim()?.toLowerCase() || null,
        title: title?.trim() || null,
        phone: phone?.trim() || null,
        companyId: companyId || null,
        properties,
      })
      .returning();

    // Fire enrichment event
    await inngest.send({
      name: "contact/created",
      data: { contactId: contact.id, tenantId: authCtx.tenantId },
    }).catch(console.warn);

    // Auto-embed for RAG
    if (process.env.OPENAI_API_KEY) {
      const text = contactToText({
        firstName: contact.firstName,
        lastName: contact.lastName,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
      });
      if (text.trim()) {
        embedEntity(authCtx.tenantId, "contact", contact.id, text).catch(console.warn);
      }
    }

    return Response.json({ contact }, { status: 201 });
  } catch (error) {
    console.error("Failed to create contact:", error);
    return Response.json({ error: "Failed to create contact" }, { status: 500 });
  }
}
