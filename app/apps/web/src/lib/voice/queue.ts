/**
 * Cold-call queue prioritisation.
 *
 * Composite score = intentScore × accessibilityScore × dealValueWeight,
 * where:
 *   - intentScore (0..1): from contact.score and the freshest signal
 *   - accessibilityScore (0..1): mobile direct = 1.0, switchboard = 0.4
 *   - dealValueWeight (0.5..2.0): boosts contacts tied to larger deals
 *
 * The queue then filters by DNC and quiet hours and returns the top N.
 */

import { db } from "@/db";
import { contacts, companies, deals } from "@/db/schema";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { batchDncCheck } from "./dnc";
import { checkQuietHours, resolveTimezone } from "./quiet-hours";
import { parseE164 } from "./number-selector";

export interface QueueItem {
  contactId: string;
  contactName: string;
  title: string | null;
  companyName: string | null;
  phone: string;
  score: number;
  intentScore: number;
  accessibilityScore: number;
  dealValueWeight: number;
  localTime: string;
  localTimezone: string;
  inQuietHours: boolean;
  onDnc: boolean;
  latestSignal: { type: string; label: string } | null;
}

interface ContactProperties {
  timezone?: string | null;
  phoneType?: "mobile" | "direct" | "switchboard" | null;
  latestSignal?: { type: string; label: string } | null;
  [key: string]: unknown;
}

interface CompanyProperties {
  timezone?: string | null;
  countryCode?: string | null;
  [key: string]: unknown;
}

export async function buildQueue(
  tenantId: string,
  limit = 100,
): Promise<QueueItem[]> {
  // Top candidates by raw contact score, joined to company for tz +
  // latest active deal for value weighting. The 3× over-fetch covers
  // attrition through DNC / quiet-hours / no-phone filters.
  const rows = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      phone: contacts.phone,
      score: contacts.score,
      contactProperties: contacts.properties,
      companyName: companies.name,
      companyProperties: companies.properties,
      dealValue: sql<number | null>`MAX(${deals.value})`,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .leftJoin(deals, eq(deals.contactId, contacts.id))
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        isNotNull(contacts.phone),
        isNull(contacts.deletedAt),
      ),
    )
    .groupBy(
      contacts.id,
      companies.name,
      companies.properties,
    )
    .orderBy(sql`${contacts.score} DESC NULLS LAST`)
    .limit(limit * 3);

  const phoneNumbers = rows.map((r) => r.phone!).filter(Boolean);
  const dncSet = await batchDncCheck(tenantId, phoneNumbers);

  const now = new Date();
  const items: QueueItem[] = [];

  for (const r of rows) {
    if (!r.phone) continue;
    const onDnc = dncSet.has(r.phone);
    if (onDnc) continue;

    const cprops = (r.contactProperties as ContactProperties) ?? {};
    const coprops = (r.companyProperties as CompanyProperties) ?? {};
    const parsed = parseE164(r.phone);
    const tz = resolveTimezone(
      cprops.timezone ?? coprops.timezone,
      parsed.countryCode ?? coprops.countryCode,
    );
    const qh = checkQuietHours(now, tz);
    if (qh.inQuietHours) continue;

    const intentScore = Math.min(1, Math.max(0, (r.score ?? 0) / 100));
    const accessibilityScore =
      cprops.phoneType === "mobile"
        ? 1.0
        : cprops.phoneType === "direct"
          ? 0.7
          : cprops.phoneType === "switchboard"
            ? 0.4
            : 0.5;
    const dealValueWeight = r.dealValue
      ? Math.min(2.0, Math.max(0.5, Math.log10(r.dealValue + 1) / 2))
      : 1.0;
    const composite = intentScore * accessibilityScore * dealValueWeight;

    items.push({
      contactId: r.contactId,
      contactName:
        `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Unknown",
      title: r.title,
      companyName: r.companyName,
      phone: r.phone,
      score: composite,
      intentScore,
      accessibilityScore,
      dealValueWeight,
      localTime: qh.localTime,
      localTimezone: tz,
      inQuietHours: false,
      onDnc: false,
      latestSignal: cprops.latestSignal ?? null,
    });

    if (items.length >= limit) break;
  }

  return items.sort((a, b) => b.score - a.score);
}
