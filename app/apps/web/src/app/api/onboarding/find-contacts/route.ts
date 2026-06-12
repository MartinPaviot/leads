import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { runSkill } from "@/skills/runner";
import { companyContactFinderSkill } from "@/skills/enrichment/company-contact-finder";
import { leadQualificationSkill } from "@/skills/scoring/lead-qualification";
import { getIcpPersonTargeting } from "@/lib/icp/person-targeting";

/**
 * Find decision-makers at top TAM companies during onboarding.
 * Called after TAM build + scoring to populate contacts.
 * Returns created contacts with qualification results.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Person targeting = ICP profiles' person criteria, legacy fallback
  // (covers the old BUG-WS0-007/008 read-time derivations too) — see
  // lib/icp/person-targeting.
  const targeting = await getIcpPersonTargeting(authCtx.tenantId);
  const roleTitles = targeting.titles ?? [];
  const apolloSeniorities = targeting.seniorities;

  // Get top 10 scored companies
  const topCompanies = await db
    .select()
    .from(companies)
    .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
    .orderBy(desc(companies.score))
    .limit(10);

  if (topCompanies.length === 0) {
    return Response.json({ contactsCreated: 0, contacts: [] });
  }

  let totalCreated = 0;
  const createdContactIds: string[] = [];

  for (const company of topCompanies) {
    if (!company.domain) continue;

    const result = await runSkill(companyContactFinderSkill, {
      companyDomain: company.domain,
      targetTitles: roleTitles.length > 0 ? roleTitles : undefined,
      targetSeniorities: apolloSeniorities,
      maxResults: 3,
    }, { tenantId: authCtx.tenantId, dryRun: false });

    if (!result.success || !result.data) continue;
    const data = result.data as { contacts: Array<{ name: string | null; email: string | null; title: string | null; seniority: string | null; linkedinUrl: string | null; departments: string[] }> };

    for (const person of data.contacts) {
      if (!person.email) continue;

      // Check if contact already exists
      const [existing] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.tenantId, authCtx.tenantId), eq(contacts.email, person.email), isNull(contacts.deletedAt)))
        .limit(1);
      if (existing) continue;

      const nameParts = person.name?.split(" ") ?? [];
      const [inserted] = await db.insert(contacts).values({
        tenantId: authCtx.tenantId,
        companyId: company.id,
        firstName: nameParts[0] || null,
        lastName: nameParts.slice(1).join(" ") || null,
        email: person.email,
        title: person.title || null,
        properties: {
          enrichment_source: "apollo",
          seniority: person.seniority,
          departments: person.departments,
          linkedin_url: person.linkedinUrl,
          auto_onboarding: true,
        },
      }).returning({ id: contacts.id });

      createdContactIds.push(inserted.id);
      totalCreated++;
    }
  }

  // Qualify all created contacts — scoring is the stored ICP-profile
  // fit now; the skill no longer takes ad-hoc roles/industries.
  let qualifiedCount = 0;
  if (createdContactIds.length > 0) {
    const qualResult = await runSkill(leadQualificationSkill, {
      contactIds: createdContactIds,
      minScoreThreshold: 40,
    }, { tenantId: authCtx.tenantId, dryRun: false });

    if (qualResult.success && qualResult.data) {
      const qData = qualResult.data as { totalQualified: number };
      qualifiedCount = qData.totalQualified;
    }
  }

  // Fetch created contacts for response
  const createdContacts = createdContactIds.length > 0
    ? await db.select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        title: contacts.title,
        score: contacts.score,
        companyId: contacts.companyId,
      }).from(contacts).where(and(eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
        .orderBy(desc(contacts.score)).limit(20)
    : [];

  return Response.json({
    contactsCreated: totalCreated,
    contactsQualified: qualifiedCount,
    contacts: createdContacts.map((c) => ({
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      email: c.email,
      title: c.title,
      score: c.score,
    })),
  });
}
