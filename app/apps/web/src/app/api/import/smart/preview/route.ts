import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";

/**
 * Smart Import Preview — runs LLM column mapping WITHOUT inserting data.
 * Returns the proposed mapping + preview so the user can review/edit
 * before committing.
 *
 * POST body: { csvText: string, entityType?: "contact" | "account" | "deal" }
 * Response: { entityType, fieldMap, confidence, headers, previewRows, totalRows }
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

  if (csvText.length > 5 * 1024 * 1024) {
    return Response.json({ error: "CSV data too large. Maximum size is 5MB." }, { status: 413 });
  }

  try {
    const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return Response.json({ error: "CSV must have at least a header row and one data row" }, { status: 400 });
    }

    const headers = parseCSVLine(lines[0]);
    const sampleRows = lines.slice(1, 6).map(parseCSVLine);
    const totalRows = lines.length - 1;

    // Run LLM mapping
    const mapping = await mapColumnsWithAI(headers, sampleRows, entityType);

    // Build preview: show how the first 5 rows would look after mapping
    const previewRows = sampleRows.map((row) => {
      const mapped: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        const crmField = mapping.fieldMap[headers[i]];
        if (crmField && row[i]) {
          mapped[crmField] = row[i].replace(/^["']|["']$/g, "").trim();
        }
      }
      return mapped;
    });

    return Response.json({
      entityType: mapping.entityType,
      fieldMap: mapping.fieldMap,
      confidence: mapping.confidence,
      headers,
      sampleData: sampleRows,
      previewRows,
      totalRows,
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

// ── CSV parsing + mapping (shared with commit route) ─────

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
  fieldMap: Record<string, string>;
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
    return heuristicMapping(headers, hintEntityType);
  }

  const prompt = `Map these CSV columns to CRM fields. Return JSON only, no markdown.

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
      const text = response.text;
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      result = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    } else {
      const { openai } = await import("@ai-sdk/openai");
      const { generateText } = await import("ai");
      const response = await generateText({
        model: openai("gpt-4o-mini"),
        prompt,
      });
      const text = response.text;
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      result = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    }

    return result;
  } catch {
    return heuristicMapping(headers, hintEntityType);
  }
}

function heuristicMapping(headers: string[], hintEntityType?: string): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ""));
  const fieldMap: Record<string, string> = {};

  const hasEmail = lower.some((h) => h.includes("email"));
  const hasFirstName = lower.some((h) => h.includes("first") || h.includes("prenom"));
  const hasDomain = lower.some((h) => h.includes("domain") || h.includes("website") || h.includes("url"));
  const hasStage = lower.some((h) => h.includes("stage") || h.includes("status") || h.includes("pipeline"));

  let entityType: "contact" | "account" | "deal" | null = null;
  if (hintEntityType) {
    entityType = hintEntityType as "contact" | "account" | "deal";
  } else if (hasFirstName && hasEmail) {
    entityType = "contact";
  } else if (hasDomain || lower.some((h) => h.includes("company") || h.includes("organization"))) {
    entityType = "account";
  } else if (hasStage || lower.some((h) => h.includes("deal") || h.includes("opportunity"))) {
    entityType = "deal";
  } else if (hasEmail) {
    entityType = "contact";
  }

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
