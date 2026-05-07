import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { enrichPerson } from "@/lib/integrations/apollo-client";
import type { SkillRunOptions } from "@/skills/types";
import type { ChampionTrackerInput, ChampionTrackerOutput } from "./schema";

export async function championTrackerHandler(
  input: ChampionTrackerInput,
  options: SkillRunOptions,
): Promise<ChampionTrackerOutput> {
  const changes: ChampionTrackerOutput["changes"] = [];
  let creditsUsed = 0;

  const contactRecords = await db
    .select()
    .from(contacts)
    .where(and(
      inArray(contacts.id, input.contactIds),
      eq(contacts.tenantId, options.tenantId),
    ));

  // Batch fetch companies
  const companyIds = contactRecords.map((c) => c.companyId).filter((id): id is string => !!id);
  const companyRecords = companyIds.length > 0
    ? await db.select().from(companies).where(inArray(companies.id, companyIds))
    : [];
  const companyMap = new Map(companyRecords.map((c) => [c.id, c]));

  for (const contact of contactRecords) {
    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null;
    const previousCompany = contact.companyId ? companyMap.get(contact.companyId)?.name ?? null : null;
    const previousTitle = contact.title;

    if (!input.detectJobChange || !contact.email) {
      changes.push({
        contactId: contact.id,
        contactName,
        changeType: "no_change",
        previousTitle,
        currentTitle: previousTitle,
        previousCompany,
        currentCompany: previousCompany,
        newCompanyDomain: null,
        signalStrength: "low",
        recommendation: "No email on file — cannot re-enrich",
      });
      continue;
    }

    // Re-enrich via Apollo to detect changes
    const enriched = await enrichPerson({
      email: contact.email,
      first_name: contact.firstName ?? undefined,
      last_name: contact.lastName ?? undefined,
    }).catch(() => null);

    creditsUsed++;

    if (!enriched) {
      changes.push({
        contactId: contact.id,
        contactName,
        changeType: "no_change",
        previousTitle,
        currentTitle: previousTitle,
        previousCompany,
        currentCompany: previousCompany,
        newCompanyDomain: null,
        signalStrength: "low",
        recommendation: "Could not re-enrich — Apollo returned no match",
      });
      continue;
    }

    const currentTitle = enriched.title;
    const currentCompanyName = enriched.organization?.name ?? null;
    const currentCompanyDomain = enriched.organization?.website_url
      ? new URL(enriched.organization.website_url).hostname.replace("www.", "")
      : null;

    // Detect change type
    const companyChanged = currentCompanyName && previousCompany
      && currentCompanyName.toLowerCase() !== previousCompany.toLowerCase();
    const titleChanged = currentTitle && previousTitle
      && currentTitle.toLowerCase() !== previousTitle.toLowerCase();

    if (companyChanged) {
      changes.push({
        contactId: contact.id,
        contactName,
        changeType: "company_change",
        previousTitle,
        currentTitle,
        previousCompany,
        currentCompany: currentCompanyName,
        newCompanyDomain: currentCompanyDomain,
        signalStrength: "high",
        recommendation: `Champion moved to ${currentCompanyName} — reach out within 48h. They know your product and can champion it at their new company.`,
      });

      // Update contact in DB
      const props = (contact.properties as Record<string, unknown>) ?? {};
      await db.update(contacts).set({
        title: currentTitle,
        properties: {
          ...props,
          previousCompany,
          previousTitle,
          championChangeDetectedAt: new Date().toISOString(),
        },
      }).where(eq(contacts.id, contact.id));
    } else if (titleChanged) {
      changes.push({
        contactId: contact.id,
        contactName,
        changeType: "title_change",
        previousTitle,
        currentTitle,
        previousCompany,
        currentCompany: currentCompanyName || previousCompany,
        newCompanyDomain: null,
        signalStrength: "medium",
        recommendation: `Title changed from "${previousTitle}" to "${currentTitle}" — could mean promotion or new responsibilities. Good reason to re-engage.`,
      });

      await db.update(contacts).set({ title: currentTitle }).where(eq(contacts.id, contact.id));
    } else {
      changes.push({
        contactId: contact.id,
        contactName,
        changeType: "no_change",
        previousTitle,
        currentTitle: currentTitle || previousTitle,
        previousCompany,
        currentCompany: currentCompanyName || previousCompany,
        newCompanyDomain: null,
        signalStrength: "low",
        recommendation: "No change detected",
      });
    }
  }

  // Sort: changes first, then by signal strength
  const strengthOrder = { high: 0, medium: 1, low: 2 };
  changes.sort((a, b) => strengthOrder[a.signalStrength] - strengthOrder[b.signalStrength]);

  const changesDetected = changes.filter((c) => c.changeType !== "no_change").length;

  return {
    totalTracked: contactRecords.length,
    changesDetected,
    changes,
    noChanges: contactRecords.length - changesDetected,
    creditsUsed,
  };
}
