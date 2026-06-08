/** Export the romand call list to CSV (throwaway). Phones first, then verified emails. */
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { writeFileSync } from "node:fs";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const OUT = "C:/Users/marti/leads/_reports/romand-call-list.csv";

function country(p: string | null): string {
  if (!p) return "";
  const c = p.replace(/\s/g, "");
  return /^\+41/.test(c) ? "CH" : /^\+33/.test(c) ? "FR" : c.startsWith("+") ? c.slice(0, 3) : "";
}

async function main() {
  const rows = await db
    .select({
      fn: contacts.firstName, ln: contacts.lastName, title: contacts.title, phone: contacts.phone,
      email: contacts.email, li: contacts.linkedinUrl, props: contacts.properties, company: companies.name, domain: companies.domain, industry: companies.industry,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt)));

  const enriched = rows.map((r) => {
    const status = (r.props as Record<string, unknown> | null)?.email_status as string | undefined;
    return { ...r, emailStatus: status ?? "", country: country(r.phone) };
  });
  // phones first, then verified-email, then the rest; alpha by company within
  enriched.sort((a, b) => {
    const pa = a.phone ? 0 : a.emailStatus === "verified" ? 1 : 2;
    const pb = b.phone ? 0 : b.emailStatus === "verified" ? 1 : 2;
    return pa - pb || (a.company ?? "").localeCompare(b.company ?? "");
  });

  const header = "firstName,lastName,title,company,phone,phoneCountry,email,emailStatus,linkedin,industry,domain";
  const esc = (s: unknown) => { const v = String(s ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const body = enriched.map((r) => [r.fn, r.ln, r.title, r.company, r.phone, r.country, r.email, r.emailStatus, r.li, r.industry, r.domain].map(esc).join(",")).join("\n");
  writeFileSync(OUT, header + "\n" + body, "utf8");

  const phones = enriched.filter((r) => r.phone).length;
  const verified = enriched.filter((r) => r.emailStatus === "verified").length;
  console.log(`exported ${enriched.length} contacts -> ${OUT}`);
  console.log(`  withPhone=${phones}  verifiedEmail=${verified}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
