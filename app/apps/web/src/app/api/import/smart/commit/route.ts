import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { companies, contacts, deals } from "@/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { inngest } from "@/inngest/client";

/**
 * Smart Import Commit — imports data using a user-confirmed mapping.
 * Called after the user reviews/edits the mapping from /api/import/smart/preview.
 *
 * POST body: {
 *   csvText: string,
 *   entityType: "contact" | "account" | "deal",
 *   fieldMap: Record<string, string>,
 *   dedup: boolean  // if true, skip rows where email/domain already exists
 * }
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("bulk", authCtx.userId);
  if (rlResponse) return rlResponse;

  const { csvText, entityType, fieldMap, dedup } = await req.json();

  if (!csvText || !entityType || !fieldMap) {
    return Response.json({ error: "csvText, entityType, and fieldMap are required" }, { status: 400 });
  }

  if (csvText.length > 5 * 1024 * 1024) {
    return Response.json({ error: "CSV data too large" }, { status: 413 });
  }

  const validEntityTypes = ["contact", "account", "deal"];
  if (!validEntityTypes.includes(entityType)) {
    return Response.json({ error: "Invalid entityType" }, { status: 400 });
  }

  try {
    const lines = csvText.split("\n").map((l: string) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return Response.json({ error: "CSV must have at least a header and one data row" }, { status: 400 });
    }

    const headers = parseCSVLine(lines[0]);
    const allRows = lines.slice(1).map(parseCSVLine);
    const results = { created: 0, skipped: 0, duplicates: 0, errors: 0 };
    const createdContactIds: string[] = [];

    // Pre-load existing emails/domains for dedup
    let existingEmails = new Set<string>();
    let existingDomains = new Set<string>();

    if (dedup) {
      if (entityType === "contact") {
        const existing = await db
          .select({ email: contacts.email })
          .from(contacts)
          .where(and(eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));
        existingEmails = new Set(existing.map((e) => e.email?.toLowerCase()).filter(Boolean) as string[]);
      } else if (entityType === "account") {
        const existing = await db
          .select({ domain: companies.domain })
          .from(companies)
          .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)));
        existingDomains = new Set(existing.map((e) => e.domain?.toLowerCase()).filter(Boolean) as string[]);
      }
    }

    // Import in batches of 50 for performance
    const batchSize = 50;
    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize);

      for (const row of batch) {
        try {
          const record = applyMapping(headers, row, fieldMap);
          if (!record || Object.keys(record).length === 0) {
            results.skipped++;
            continue;
          }

          // Dedup check
          if (dedup) {
            if (entityType === "contact" && record.email) {
              const emailLower = record.email.toLowerCase();
              if (existingEmails.has(emailLower)) {
                results.duplicates++;
                continue;
              }
              existingEmails.add(emailLower);
            }
            if (entityType === "account" && record.domain) {
              const domainLower = record.domain.toLowerCase();
              if (existingDomains.has(domainLower)) {
                results.duplicates++;
                continue;
              }
              existingDomains.add(domainLower);
            }
          }

          if (entityType === "contact") {
            const [created] = await db.insert(contacts).values({
              tenantId: authCtx.tenantId,
              firstName: record.firstName || "",
              lastName: record.lastName || "",
              email: record.email,
              title: record.title,
              phone: record.phone,
              linkedinUrl: record.linkedinUrl,
            }).returning({ id: contacts.id });
            results.created++;
            if (created) createdContactIds.push(created.id);
          } else if (entityType === "account") {
            await db.insert(companies).values({
              tenantId: authCtx.tenantId,
              name: record.name || "Unknown",
              domain: record.domain,
              industry: record.industry,
              size: record.size,
              revenue: record.revenue,
              description: record.description,
            });
            results.created++;
          } else if (entityType === "deal") {
            const validStages = ["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"] as const;
            const stageInput = (record.stage || "lead") as string;
            const dealStage = (validStages as readonly string[]).includes(stageInput)
              ? (stageInput as (typeof validStages)[number])
              : "lead";
            await db.insert(deals).values({
              tenantId: authCtx.tenantId,
              name: record.name || "Imported Deal",
              stage: dealStage,
              value: record.value ? Number(record.value) : undefined,
            });
            results.created++;
          }
        } catch {
          results.errors++;
        }
      }
    }

    // Fire contact/created events for enrichment + RAG
    if (entityType === "contact" && createdContactIds.length > 0) {
      for (const contactId of createdContactIds.slice(0, 20)) {
        await inngest.send({
          name: "contact/created",
          data: { contactId, tenantId: authCtx.tenantId },
        }).catch((e) => console.warn("smart-import: contact/created event failed", e));
      }
    }

    return Response.json({
      success: true,
      entityType,
      mapping: fieldMap,
      ...results,
      totalRows: allRows.length,
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function applyMapping(
  headers: string[],
  row: string[],
  fieldMap: Record<string, string>,
): Record<string, string> | null {
  const record: Record<string, string> = {};

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
