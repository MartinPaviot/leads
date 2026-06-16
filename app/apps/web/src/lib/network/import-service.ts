/**
 * Network import service — parse a LinkedIn `Connections.csv`, dedup against
 * the tenant's existing contacts, upsert companies by name, insert the new
 * people tagged `network`, and score them through the normal ICP engine.
 *
 * The route is thin glue over this; the testable logic lives in the pure
 * parser (`linkedin-connections`) and planner (`import-plan`). DB writes mirror
 * the existing CSV importer (`app/api/import/route.ts`) and contact scorer
 * (`app/api/score-contacts/route.ts`).
 */
import { db } from "@/db";
import { companies, contacts, importHistory } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import {
  hasContactScorableCriteria,
  scoreContactIcpBatch,
} from "@/lib/scoring/contact-icp-fit";
import { parseLinkedInConnections } from "./linkedin-connections";
import { planNetworkImport } from "./import-plan";

export interface NetworkImportResult {
  ok: boolean;
  headerFound: boolean;
  /** Connections parsed (after in-file dedup). */
  parsed: number;
  duplicatesInFile: number;
  skipped: number;
  alreadyInDb: number;
  imported: number;
  companiesCreated: number;
  scored: number;
  error?: string;
}

const INSERT_CHUNK = 100;

export async function importLinkedInConnections(params: {
  tenantId: string;
  userId: string | null;
  csv: string;
  score?: boolean;
}): Promise<NetworkImportResult> {
  const { tenantId, userId, csv, score = true } = params;

  const parsed = parseLinkedInConnections(csv);
  const empty: NetworkImportResult = {
    ok: false,
    headerFound: false,
    parsed: 0,
    duplicatesInFile: 0,
    skipped: 0,
    alreadyInDb: 0,
    imported: 0,
    companiesCreated: 0,
    scored: 0,
  };
  if (!parsed.headerFound) {
    return { ...empty, error: "Not a LinkedIn Connections export (no header row found)." };
  }

  // Existing tenant contacts — so we never re-create people we already have.
  const existing = await db
    .select({ linkedinUrl: contacts.linkedinUrl, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)));
  const existingLinkedinUrls = existing
    .map((r) => r.linkedinUrl)
    .filter((v): v is string => !!v);
  const existingEmails = existing.map((r) => r.email).filter((v): v is string => !!v);

  const plan = planNetworkImport({
    connections: parsed.connections,
    existingLinkedinUrls,
    existingEmails,
  });

  // Upsert companies by name (tenant-scoped); build name -> id.
  const companyIdByName = new Map<string, string>();
  let companiesCreated = 0;
  for (const name of plan.companyNames) {
    const found = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.tenantId, tenantId), eq(companies.name, name), isNull(companies.deletedAt)))
      .limit(1);
    if (found[0]) {
      companyIdByName.set(name, found[0].id);
      continue;
    }
    const [created] = await db
      .insert(companies)
      .values({ name, tenantId })
      .returning({ id: companies.id });
    if (created) {
      companyIdByName.set(name, created.id);
      companiesCreated++;
    }
  }

  // Insert the new contacts, tagged as network.
  const importedAt = new Date().toISOString();
  const insertedIds: string[] = [];
  for (let i = 0; i < plan.toInsert.length; i += INSERT_CHUNK) {
    const values = plan.toInsert.slice(i, i + INSERT_CHUNK).map((d) => ({
      tenantId,
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      title: d.title,
      linkedinUrl: d.linkedinUrl,
      companyId: d.companyName ? companyIdByName.get(d.companyName) ?? null : null,
      properties: {
        network: true,
        ...(d.networkConnectedOn ? { networkConnectedOn: d.networkConnectedOn } : {}),
        networkImportedAt: importedAt,
      },
    }));
    if (values.length === 0) continue;
    const rows = await db.insert(contacts).values(values).returning({ id: contacts.id });
    for (const r of rows) insertedIds.push(r.id);
  }

  // Score the freshly imported cohort through the SAME engine as everything
  // else — never a parallel scorer. A missing/empty ICP is not fatal: the
  // contacts are kept and will be picked up by the next recompute.
  let scored = 0;
  if (score && insertedIds.length > 0) {
    try {
      const activeIcps = await loadActiveIcps(tenantId);
      if (hasContactScorableCriteria(activeIcps)) {
        const r = await scoreContactIcpBatch(tenantId, insertedIds, activeIcps);
        scored = r.scored;
      }
    } catch (e) {
      console.error("Network import scoring failed (contacts kept):", e);
    }
  }

  // Best-effort audit row (mirrors the CSV importer). user_id is NOT NULL on
  // import_history, so only log when we have one (the route always does).
  if (userId) {
    try {
      await db.insert(importHistory).values({
        tenantId,
        userId,
        fileName: "linkedin_connections.csv",
        recordType: "contacts",
        totalRows: parsed.totalRows,
        createdCount: insertedIds.length,
        skippedCount: parsed.skipped,
        companiesCreated,
        status: "completed",
      });
    } catch (e) {
      console.error("Network import history log failed (non-fatal):", e);
    }
  }

  return {
    ok: true,
    headerFound: true,
    parsed: parsed.connections.length,
    duplicatesInFile: parsed.duplicates,
    skipped: parsed.skipped,
    alreadyInDb: plan.alreadyInDb,
    imported: insertedIds.length,
    companiesCreated,
    scored,
  };
}
