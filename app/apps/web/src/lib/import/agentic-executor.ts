import { db } from "@/db";
import { contacts, companies, deals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { findContactDuplicate, findCompanyDuplicate, findDealDuplicate } from "./dedup";
import { wireContactToCompany, extractDomainFromEmail } from "./relationship-wirer";
import type { TaskContext } from "@/lib/tasks/task-manager";
import { registerTaskExecutor } from "@/inngest/agent-task-runner";
import logger from "@/lib/observability/logger";

interface ImportCheckpoint {
  lastProcessedRow: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ row: number; error: string }>;
}

interface ImportJobConfig {
  csvRows: string[][];
  headers: string[];
  entityType: "contact" | "account" | "deal";
  fieldMap: Record<string, string>;
  importJobId: string;
  dedup: boolean;
  wireRelationships: boolean;
}

const BATCH_SIZE = 200;
const VALID_DEAL_STAGES = [
  "lead", "qualification", "demo", "trial",
  "proposal", "negotiation", "won", "lost",
] as const;

export function registerImportExecutor() {
  registerTaskExecutor("import", async (task, ctx) => {
    const config = task.checkpoint as unknown as ImportJobConfig
      ?? (task.result as unknown as ImportJobConfig);

    if (!config?.csvRows) {
      await ctx.fail("Import config missing from task checkpoint");
      return;
    }

    await executeImport(config, ctx);
  });
}

export async function executeImport(
  config: ImportJobConfig,
  ctx: TaskContext
): Promise<void> {
  const { csvRows, headers, entityType, fieldMap, importJobId, dedup, wireRelationships } = config;

  // Resume from checkpoint if available
  const checkpoint = await ctx.getCheckpoint<ImportCheckpoint>();
  let startRow = checkpoint?.lastProcessedRow ?? 0;
  let created = checkpoint?.created ?? 0;
  let updated = checkpoint?.updated ?? 0;
  let skipped = checkpoint?.skipped ?? 0;
  let errors = checkpoint?.errors ?? 0;
  const errorDetails = checkpoint?.errorDetails ?? [];

  const totalRows = csvRows.length;

  for (let i = startRow; i < totalRows; i += BATCH_SIZE) {
    if (await ctx.isCancelled()) {
      await ctx.saveCheckpoint({
        lastProcessedRow: i,
        created, updated, skipped, errors, errorDetails,
      });
      return;
    }

    const batch = csvRows.slice(i, i + BATCH_SIZE);
    const records = batch.map((row) => applyMapping(headers, row, fieldMap));

    for (let j = 0; j < records.length; j++) {
      const record = records[j];
      const rowIndex = i + j;

      if (!record) {
        skipped++;
        continue;
      }

      try {
        switch (entityType) {
          case "contact":
            await importContact(record, ctx.tenantId, importJobId, dedup, wireRelationships);
            break;
          case "account":
            await importAccount(record, ctx.tenantId, importJobId, dedup);
            break;
          case "deal":
            await importDeal(record, ctx.tenantId, importJobId, dedup);
            break;
        }

        // Determine if it was a create or update based on dedup
        if (dedup && record._wasMerged) {
          updated++;
        } else {
          created++;
        }
      } catch (err) {
        errors++;
        if (errorDetails.length < 50) {
          errorDetails.push({
            row: rowIndex + 2, // +2 for header row + 0-index
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    await ctx.updateProgress(
      Math.min(i + BATCH_SIZE, totalRows),
      `${entityType}s: ${created} created, ${updated} merged, ${errors} errors`
    );

    await ctx.saveCheckpoint({
      lastProcessedRow: Math.min(i + BATCH_SIZE, totalRows),
      created, updated, skipped, errors, errorDetails,
    });
  }

  await ctx.complete({
    created,
    updated,
    skipped,
    errors,
    errorDetails: errorDetails.slice(0, 20),
    totalRows,
    entityType,
  });
}

async function importContact(
  record: Record<string, string> & { _wasMerged?: boolean },
  tenantId: string,
  importJobId: string,
  dedup: boolean,
  wireRelationships: boolean
): Promise<void> {
  const email = record.email?.toLowerCase().trim() || null;

  if (dedup && email) {
    const match = await findContactDuplicate(tenantId, email, record.firstName, record.lastName);
    if (match) {
      // Merge: update null fields only
      const updates: Record<string, unknown> = {};
      const [existing] = await db.select().from(contacts)
        .where(and(eq(contacts.id, match.id), eq(contacts.tenantId, tenantId)))
        .limit(1);

      if (existing) {
        if (!existing.firstName && record.firstName) updates.firstName = record.firstName;
        if (!existing.lastName && record.lastName) updates.lastName = record.lastName;
        if (!existing.title && record.title) updates.title = record.title;
        if (!existing.phone && record.phone) updates.phone = record.phone;
        if (!existing.linkedinUrl && record.linkedinUrl) updates.linkedinUrl = record.linkedinUrl;

        if (Object.keys(updates).length > 0) {
          await db.update(contacts).set({ ...updates, updatedAt: new Date() })
            .where(eq(contacts.id, match.id));
        }
      }
      record._wasMerged = true;
      return;
    }
  }

  let companyId: string | null = null;
  if (wireRelationships) {
    const domain = email ? extractDomainFromEmail(email) : null;
    companyId = await wireContactToCompany(
      tenantId,
      record.companyName || null,
      domain || record.domain || null,
      importJobId
    );
  }

  await db.insert(contacts).values({
    tenantId,
    firstName: record.firstName || null,
    lastName: record.lastName || null,
    email,
    title: record.title || null,
    phone: record.phone || null,
    linkedinUrl: record.linkedinUrl || null,
    companyId,
    properties: { importJobId },
  });
}

async function importAccount(
  record: Record<string, string> & { _wasMerged?: boolean },
  tenantId: string,
  importJobId: string,
  dedup: boolean
): Promise<void> {
  const domain = record.domain?.toLowerCase().trim()
    .replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "") || null;

  if (dedup) {
    const match = await findCompanyDuplicate(tenantId, domain, record.name);
    if (match) {
      const updates: Record<string, unknown> = {};
      const [existing] = await db.select().from(companies)
        .where(and(eq(companies.id, match.id), eq(companies.tenantId, tenantId)))
        .limit(1);

      if (existing) {
        if (!existing.domain && domain) updates.domain = domain;
        if (!existing.industry && record.industry) updates.industry = record.industry;
        if (!existing.size && record.size) updates.size = record.size;
        if (!existing.description && record.description) updates.description = record.description;

        if (Object.keys(updates).length > 0) {
          await db.update(companies).set({ ...updates, updatedAt: new Date() })
            .where(eq(companies.id, match.id));
        }
      }
      record._wasMerged = true;
      return;
    }
  }

  await db.insert(companies).values({
    tenantId,
    name: record.name || "Unknown",
    domain,
    industry: record.industry || null,
    size: record.size || null,
    revenue: record.revenue || null,
    description: record.description || null,
    properties: { importJobId },
  });
}

async function importDeal(
  record: Record<string, string> & { _wasMerged?: boolean },
  tenantId: string,
  importJobId: string,
  dedup: boolean
): Promise<void> {
  if (dedup) {
    const match = await findDealDuplicate(tenantId, record.name);
    if (match) {
      record._wasMerged = true;
      return;
    }
  }

  const stageInput = (record.stage || "lead").toLowerCase();
  const stage = VALID_DEAL_STAGES.includes(stageInput as any)
    ? (stageInput as (typeof VALID_DEAL_STAGES)[number])
    : "lead";

  await db.insert(deals).values({
    tenantId,
    name: record.name || "Imported Deal",
    stage,
    value: record.value ? Number(record.value) : null,
    properties: { importJobId },
  });
}

function applyMapping(
  headers: string[],
  row: string[],
  fieldMap: Record<string, string>
): (Record<string, string> & { _wasMerged?: boolean }) | null {
  const record: Record<string, string> & { _wasMerged?: boolean } = {};

  for (let i = 0; i < headers.length; i++) {
    const crmField = fieldMap[headers[i]];
    if (crmField && row[i]) {
      record[crmField] = row[i].replace(/^["']|["']$/g, "").trim();
    }
  }

  if (!record.email && !record.name && !record.firstName && !record.domain) {
    return null;
  }

  return record;
}
