import { getAuthContext } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { searchPeople, isApolloAvailable } from "@/lib/integrations/apollo-client";
import { getIcpPersonTargeting } from "@/lib/icp/person-targeting";
import { inngest } from "@/inngest/client";

/**
 * Bulk-extract contacts for the selected accounts.
 *
 * POST /api/accounts/extract-contacts { accountIds: string[], perAccount?: number }
 *
 * For each account that has a domain, runs an Apollo people search using
 * the tenant's ICP target roles/seniorities, then inserts any people not
 * already on file (deduped by email within the same company). Returns a
 * per-account breakdown plus totals so the UI can report what happened.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Creating contacts is a write — same gate the contacts API uses.
  const denied = requirePermission(authCtx.role, "contacts:write");
  if (denied) return denied;

  if (!isApolloAvailable()) {
    return Response.json(
      { error: "Apollo API key required to extract contacts" },
      { status: 503 },
    );
  }

  let body: { accountIds?: unknown; perAccount?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accountIds = Array.isArray(body.accountIds)
    ? body.accountIds.filter((x): x is string => typeof x === "string").slice(0, 50)
    : [];
  if (accountIds.length === 0) {
    return Response.json({ error: "accountIds array required" }, { status: 400 });
  }
  const perAccount = Math.min(
    25,
    Math.max(1, typeof body.perAccount === "number" ? body.perAccount : 10),
  );

  // Load the selected accounts (tenant-scoped, non-deleted).
  const accounts = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain })
    .from(companies)
    .where(
      and(
        eq(companies.tenantId, authCtx.tenantId),
        inArray(companies.id, accountIds),
        isNull(companies.deletedAt),
      ),
    );

  // Person targeting = the ICP profiles' person criteria (the same
  // vocabulary the contact scorer matches against), legacy flats as
  // fallback — see lib/icp/person-targeting.
  const targeting = await getIcpPersonTargeting(authCtx.tenantId);
  const seniorities = targeting.seniorities;
  const personTitles = targeting.titles;

  const results: Array<{
    accountId: string;
    name: string;
    found: number;
    created: number;
    skipped: number;
    error?: string;
  }> = [];
  let totalCreated = 0;
  const createdContactIds: string[] = [];

  for (const account of accounts) {
    if (!account.domain) {
      results.push({ accountId: account.id, name: account.name, found: 0, created: 0, skipped: 0, error: "No domain" });
      continue;
    }

    try {
      const search = await searchPeople({
        q_organization_domains: account.domain,
        person_seniorities: seniorities,
        person_titles: personTitles,
        per_page: perAccount,
      });

      const people = search.people ?? [];

      // Dedupe against contacts already on this account (by email).
      const existing = await db
        .select({ email: contacts.email })
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, authCtx.tenantId),
            eq(contacts.companyId, account.id),
            isNull(contacts.deletedAt),
          ),
        );
      const existingEmails = new Set(
        existing.map((c) => c.email?.trim().toLowerCase()).filter(Boolean) as string[],
      );

      const toInsert: Array<typeof contacts.$inferInsert> = [];
      const seenInBatch = new Set<string>();
      for (const p of people) {
        const email = p.email?.trim().toLowerCase() || null;
        // Skip people we already have, and locked/placeholder Apollo emails.
        if (email) {
          if (existingEmails.has(email) || seenInBatch.has(email)) continue;
          if (email.includes("email_not_unlocked") || email.includes("domain.com")) {
            // unusable placeholder — still import the person, just without email
          } else {
            seenInBatch.add(email);
          }
        }
        const usableEmail = email && !email.includes("email_not_unlocked") && !email.includes("domain.com")
          ? email
          : null;
        const phone = p.phone_numbers?.[0]?.raw_number || null;
        toInsert.push({
          tenantId: authCtx.tenantId,
          companyId: account.id,
          firstName: p.first_name?.trim() || null,
          lastName: p.last_name?.trim() || null,
          email: usableEmail,
          title: p.title?.trim() || null,
          phone,
          linkedinUrl: p.linkedin_url || null,
          properties: {
            source: "apollo_extract",
            apolloId: p.id,
            seniority: p.seniority || null,
            departments: p.departments || [],
            city: p.city || null,
            state: p.state || null,
            country: p.country || null,
          },
        });
      }

      let created = 0;
      if (toInsert.length > 0) {
        const inserted = await db.insert(contacts).values(toInsert).returning({ id: contacts.id });
        created = inserted.length;
        for (const row of inserted) createdContactIds.push(row.id);
      }
      totalCreated += created;
      results.push({
        accountId: account.id,
        name: account.name,
        found: people.length,
        created,
        skipped: people.length - created,
      });
    } catch (err) {
      console.warn(`extract-contacts: Apollo search failed for ${account.domain}`, err);
      results.push({ accountId: account.id, name: account.name, found: 0, created: 0, skipped: 0, error: "Apollo search failed" });
    }
  }

  // Fire enrichment + embedding events for the new contacts (best-effort).
  for (const contactId of createdContactIds) {
    inngest
      .send({ name: "contact/created", data: { contactId, tenantId: authCtx.tenantId } })
      .catch(() => { /* non-fatal */ });
  }

  return Response.json({
    success: true,
    totalCreated,
    accountsProcessed: accounts.length,
    results,
  });
}
