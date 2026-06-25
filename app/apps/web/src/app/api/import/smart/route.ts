import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { companies, contacts, deals } from "@/db/schema";

/**
 * Smart Import — AI-powered CRM data import.
 * Accepts CSV text, uses LLM to map columns to CRM fields,
 * then imports the data.
 *
 * POST body: { csvText: string, entityType?: "contact" | "account" | "deal" }
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("bulk", authCtx.userId);
  if (rlResponse) return rlResponse;

  const { csvText, entityType } = await req.json();

  if (!csvText || typeof csvText !== "string") {
    return Response.json({ error: "csvText is required" }, { status: 400 });
  }

  // File size limit: 5MB
  if (csvText.length > 5 * 1024 * 1024) {
    return Response.json({ error: "CSV data too large. Maximum size is 5MB." }, { status: 413 });
  }

  try {
    // Parse CSV headers and sample rows
    const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return Response.json({ error: "CSV must have at least a header row and one data row" }, { status: 400 });
    }

    const headers = parseCSVLine(lines[0]);
    const sampleRows = lines.slice(1, 6).map(parseCSVLine);

    // Use LLM to map columns
    const mapping = await mapColumnsWithAI(headers, sampleRows, entityType);

    if (!mapping.entityType) {
      return Response.json({
        error: "Could not determine entity type from CSV",
        suggestedMapping: mapping,
      }, { status: 400 });
    }

    // Parse all rows
    const allRows = lines.slice(1).map(parseCSVLine);
    const results = { created: 0, skipped: 0, errors: 0 };

    for (const row of allRows) {
      try {
        const record = applyMapping(headers, row, mapping.fieldMap);
        if (!record || Object.keys(record).length === 0) {
          results.skipped++;
          continue;
        }

        if (mapping.entityType === "contact") {
          await db.insert(contacts).values({
            tenantId: authCtx.tenantId,
            firstName: record.firstName || "",
            lastName: record.lastName || "",
            email: record.email,
            title: record.title,
            phone: record.phone,
          });
          results.created++;
        } else if (mapping.entityType === "account") {
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
        } else if (mapping.entityType === "deal") {
          const validStages = ["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"] as const;
          const stageInput = (record.stage || "lead") as string;
          const dealStage = validStages.includes(stageInput as any) ? (stageInput as typeof validStages[number]) : "lead";
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

    return Response.json({
      success: true,
      entityType: mapping.entityType,
      mapping: mapping.fieldMap,
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

interface ColumnMapping {
  entityType: "contact" | "account" | "deal" | null;
  fieldMap: Record<string, string>; // CSV header → CRM field
  confidence: number;
}

async function mapColumnsWithAI(
  headers: string[],
  sampleRows: string[][],
  hintEntityType?: string,
): Promise<ColumnMapping> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    // Fallback: simple heuristic mapping
    return heuristicMapping(headers, hintEntityType);
  }

  const prompt = `Map these CSV columns to CRM fields. Return JSON.

CSV Headers: ${JSON.stringify(headers)}
Sample data:
${sampleRows.map((row) => headers.map((h, i) => `${h}: ${row[i] || ""}`).join(", ")).join("\n")}
${hintEntityType ? `User specified entity type: ${hintEntityType}` : ""}

CRM field options:
- Contact fields: firstName, lastName, email, title, phone, linkedinUrl
- Account fields: name, domain, industry, size, revenue, description
- Deal fields: name, stage (lead/qualification/demo/trial/proposal/negotiation/won/lost), value

Return JSON:
{
  "entityType": "contact" | "account" | "deal",
  "fieldMap": { "CSV Column Name": "crmFieldName", ... },
  "confidence": 0.0-1.0
}

Only map columns you're confident about. Skip ambiguous columns.`;

  try {
    let result: ColumnMapping;

    if (anthropicKey) {
      const { anthropic } = await import("@ai-sdk/anthropic");
      const { generateText } = await import("ai");
      const response = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        prompt,
      });
      result = JSON.parse(response.text.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
    } else {
      const { openai } = await import("@ai-sdk/openai");
      const { generateText } = await import("ai");
      const response = await generateText({
        model: openai("gpt-4o-mini"),
        prompt,
      });
      result = JSON.parse(response.text.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
    }

    return result;
  } catch {
    return heuristicMapping(headers, hintEntityType);
  }
}

function heuristicMapping(headers: string[], hintEntityType?: string): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ""));
  const fieldMap: Record<string, string> = {};

  // Detect entity type
  const hasEmail = lower.some((h) => h.includes("email"));
  const hasFirstName = lower.some((h) => h.includes("first") || h.includes("prenom"));
  const hasDomain = lower.some((h) => h.includes("domain") || h.includes("website") || h.includes("url"));
  const hasStage = lower.some((h) => h.includes("stage") || h.includes("status") || h.includes("pipeline"));

  let entityType: "contact" | "account" | "deal" | null = null;
  if (hintEntityType) {
    entityType = hintEntityType as any;
  } else if (hasFirstName && hasEmail) {
    entityType = "contact";
  } else if (hasDomain || lower.some((h) => h.includes("company") || h.includes("organization"))) {
    entityType = "account";
  } else if (hasStage || lower.some((h) => h.includes("deal") || h.includes("opportunity"))) {
    entityType = "deal";
  } else if (hasEmail) {
    entityType = "contact";
  }

  // Map common patterns
  const mappings: Record<string, string[]> = {
    firstName: ["firstname", "first", "prenom", "givenname"],
    lastName: ["lastname", "last", "nom", "surname", "familyname"],
    email: ["email", "mail", "emailaddress", "courriel"],
    title: ["title", "jobtitle", "position", "role", "titre", "poste"],
    phone: ["phone", "tel", "telephone", "mobile", "cell"],
    name: ["name", "companyname", "company", "organization", "societe", "entreprise", "dealname", "opportunityname"],
    domain: ["domain", "website", "url", "siteweb"],
    industry: ["industry", "sector", "industrie", "secteur"],
    size: ["size", "employees", "headcount", "taille", "effectif"],
    revenue: ["revenue", "arr", "mrr", "ca", "chiffredaffaires"],
    stage: ["stage", "status", "pipeline", "etape", "statut"],
    value: ["value", "amount", "dealvalue", "montant", "valeur"],
    description: ["description", "notes", "about", "bio"],
    linkedinUrl: ["linkedin", "linkedinurl", "linkedinprofile"],
  };

  for (let i = 0; i < headers.length; i++) {
    const normalized = lower[i];
    for (const [crmField, patterns] of Object.entries(mappings)) {
      if (patterns.some((p) => normalized.includes(p))) {
        fieldMap[headers[i]] = crmField;
        break;
      }
    }
  }

  return { entityType, fieldMap, confidence: 0.6 };
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

  // Must have at least one identifying field
  if (!record.email && !record.name && !record.firstName && !record.domain) {
    return null;
  }

  return record;
}
