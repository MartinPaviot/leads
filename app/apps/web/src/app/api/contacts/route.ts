import { db } from "@/db";
import { contacts, companies, activities } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { and, eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { embedEntity, contactToText } from "@/lib/embeddings";
import { extractDomain } from "@/lib/util/email";

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

    // Enrich with company info and last interaction
    const contactIds = result.map((c) => c.id);
    const companyIds = [...new Set(result.map((c) => c.companyId).filter(Boolean))] as string[];

    // Fetch company names/domains
    const companyMap: Record<string, { name: string; domain: string | null }> = {};
    try {
      if (companyIds.length > 0) {
        const companyRows = await db
          .select({ id: companies.id, name: companies.name, domain: companies.domain })
          .from(companies)
          .where(sql`${companies.id} = ANY(ARRAY[${sql.join(companyIds.map(id => sql`${id}`), sql`, `)}]::text[])`);
        for (const c of companyRows) {
          companyMap[c.id] = { name: c.name, domain: c.domain };
        }
      }
    } catch (e) {
      console.warn("Failed to fetch companies:", e);
    }

    // Fetch last interaction per contact
    const lastInteractions: Record<string, { date: Date; summary: string | null }> = {};
    try {
      if (contactIds.length > 0) {
        const interactions = await db.execute(sql`
          SELECT DISTINCT ON (entity_id)
            entity_id,
            occurred_at,
            summary
          FROM activities
          WHERE entity_id = ANY(ARRAY[${sql.join(contactIds.map(id => sql`${id}`), sql`, `)}]::text[])
            AND entity_type = 'contact'
            AND tenant_id = ${authCtx.tenantId}
          ORDER BY entity_id, occurred_at DESC
        `);
        for (const row of interactions as unknown as Array<{ entity_id: string; occurred_at: Date; summary: string | null }>) {
          lastInteractions[row.entity_id] = { date: row.occurred_at, summary: row.summary };
        }
      }
    } catch (e) {
      console.warn("Failed to fetch last interactions:", e);
    }

    const enrichedContacts = result.map((c) => ({
      ...c,
      companyName: c.companyId ? companyMap[c.companyId]?.name || null : null,
      companyDomain: c.companyId ? companyMap[c.companyId]?.domain || null : null,
      lastInteraction: lastInteractions[c.id] || null,
    }));

    // K1 — dual shape (same pattern as /api/accounts A1): legacy keys
    // preserved for current consumers + canonical `items` / `hasMore`
    // added so `usePaginatedList<Contact>` consumes it without a shim.
    const hasMore = page * pageSize < total;
    return Response.json({
      contacts: enrichedContacts,
      items: enrichedContacts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasMore,
      },
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
    let { firstName, lastName, email, title, phone, companyId, additionalEmails, additionalCompanyIds } = body;

    // Parse `name` into firstName/lastName as fallback
    if (!firstName && !lastName && body.name) {
      const parts = String(body.name).trim().split(/\s+/);
      firstName = parts[0] || null;
      lastName = parts.slice(1).join(" ") || null;
    }

    if (!email && !firstName && !lastName) {
      return Response.json({ error: "At least email or name required" }, { status: 400 });
    }

    // K12 — auto-match contact → account by email domain when the
    // caller didn't pick one explicitly. We only attach an existing
    // company; we don't auto-create one (out of scope here — the
    // caller can hit POST /api/accounts first if they want a new
    // account). Skip personal-mailbox domains so a sarah@gmail.com
    // doesn't accidentally land on whichever tenant happens to have
    // a placeholder "gmail.com" company row.
    const PERSONAL_DOMAINS = new Set([
      "gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr",
      "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr",
      "live.com", "icloud.com", "aol.com", "me.com", "msn.com",
      "protonmail.com", "proton.me", "pm.me", "fastmail.com",
      "yandex.com", "gmx.com", "mail.com", "zoho.com",
    ]);
    if (!companyId && email) {
      const domain = extractDomain(email);
      if (domain && !PERSONAL_DOMAINS.has(domain)) {
        const [match] = await db
          .select({ id: companies.id })
          .from(companies)
          .where(
            and(
              eq(companies.tenantId, authCtx.tenantId),
              eq(companies.domain, domain)
            )
          )
          .limit(1);
        if (match) companyId = match.id;
      }
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
