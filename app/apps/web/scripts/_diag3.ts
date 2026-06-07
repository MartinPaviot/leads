import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { searchOrganizations } from "@/lib/integrations/apollo-client";
import { enrichContact } from "@/lib/providers/contact-enrichment/waterfall";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";

async function main() {
  const r = await searchOrganizations({
    organization_locations: ["Geneva", "Lausanne", "Vaud", "Valais", "Fribourg", "Neuchâtel", "Jura"],
    q_organization_keyword_tags: ["health care", "manufacturing", "construction", "hospitality", "retail", "financial services", "non-profit organization management", "government administration"],
    organization_num_employees_ranges: ["101,200", "201,500", "501,1000"],
    page: 1, per_page: 100,
  });
  console.log("apollo total_entries:", r.pagination?.total_entries, "returned:", r.organizations?.length);
  console.log("sample:\n  " + (r.organizations ?? []).slice(0, 8).map((o) => `${o.name} | ${o.primary_domain} | ${o.industry} | ${(o as Record<string, unknown>).country}`).join("\n  "));

  const ex = await db.select({ domain: companies.domain }).from(companies).where(and(eq(companies.tenantId, tid), isNull(companies.deletedAt)));
  const known = new Set(ex.map((c) => c.domain?.toLowerCase()).filter(Boolean));
  const overlap = (r.organizations ?? []).filter((o) => known.has((o.primary_domain ?? "").toLowerCase())).length;
  console.log(`overlap of this page with existing 767: ${overlap}/${r.organizations?.length}`);

  // Lusha test on an existing contact (prefer one with a linkedin URL).
  const cands = await db.select().from(contacts).where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt))).limit(5);
  const tc = cands.find((c) => c.linkedinUrl) ?? cands[0];
  if (tc) {
    console.log(`Lusha test on: ${tc.firstName} ${tc.lastName} | ${tc.email} | li=${tc.linkedinUrl ? "yes" : "no"}`);
    const wf = await enrichContact(
      { firstName: tc.firstName ?? undefined, lastName: tc.lastName ?? undefined, email: tc.email ?? undefined, linkedinUrl: tc.linkedinUrl ?? undefined },
      { tenantId: tid },
    );
    console.log("attempts:", (wf.attempts ?? []).map((a) => `${a.provider}:${a.ok ? "ok" : "miss"}`).join(", "));
    console.log("data:", JSON.stringify({ phones: wf.data.phones, mobile: wf.data.mobilePhone, email: wf.data.email, status: wf.data.emailStatus }));
  } else {
    console.log("no contact to test Lusha on");
  }
  await db.$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
