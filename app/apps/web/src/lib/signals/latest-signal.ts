/**
 * Persist the freshest detected buying signal onto a company's contacts —
 * the missing writer behind `contacts.properties.latestSignal`, which the
 * call queue (lib/voice/queue.ts) and the Call Mode fiche/script have always
 * read but nothing ever wrote (the campaign queue only synthesized a cadence
 * breadcrumb). Called from the signal-scanner cron after a successful scan.
 *
 * The stored shape matches what every reader already expects:
 *   { type, label, observedAt } — type is the scanner's signalType vocabulary,
 * so downstream voiceability filtering (isVoiceableSignal) keeps working.
 *
 * Write uses a `||` jsonb merge (NOT jsonb_set — it silently no-ops when the
 * parent key is missing; see reference_jsonb-set-missing-intermediate).
 */

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export interface DetectedSignal {
  companyId?: string | null;
  signalType: string;
  title: string;
  detectedAt?: string | null;
}

export interface LatestSignalValue {
  type: string;
  label: string;
  observedAt: string;
}

/**
 * One signal per company — the first one the scanner emitted for it (the
 * scanner orders its own output; first = strongest). Pure, unit-tested.
 */
export function pickLatestSignalPerCompany(
  signals: DetectedSignal[],
  nowIso: string = new Date().toISOString(),
): Map<string, LatestSignalValue> {
  const byCompany = new Map<string, LatestSignalValue>();
  for (const s of signals) {
    const companyId = (s.companyId ?? "").trim();
    const label = (s.title ?? "").trim();
    const type = (s.signalType ?? "").trim();
    if (!companyId || !label || !type) continue;
    if (byCompany.has(companyId)) continue;
    byCompany.set(companyId, { type, label, observedAt: s.detectedAt?.trim() || nowIso });
  }
  return byCompany;
}

/** Merge the freshest signal into every live contact of each company. */
export async function recordLatestSignals(
  tenantId: string,
  signals: DetectedSignal[],
): Promise<number> {
  const picked = pickLatestSignalPerCompany(signals);
  let updated = 0;
  for (const [companyId, value] of picked) {
    const payload = JSON.stringify({ latestSignal: value });
    const res = await db
      .update(contacts)
      .set({
        properties: sql`COALESCE(${contacts.properties}, '{}'::jsonb) || ${payload}::jsonb`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          eq(contacts.companyId, companyId),
          isNull(contacts.deletedAt),
        ),
      );
    updated += (res as unknown as { rowCount?: number }).rowCount ?? 0;
  }
  return updated;
}
