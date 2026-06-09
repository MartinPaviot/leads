import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { createTask } from "@/lib/tasks/task-manager";

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if ((char === "," || char === ";" || char === "\t") && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function detectDelimiter(firstLine: string): string {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const char of firstLine) {
    if (char in counts) counts[char as keyof typeof counts]++;
  }
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

export function buildImportTools(ctx: ToolContext) {
  const { tenantId, authCtx } = ctx;

  return {
    analyzeCSVForImport: makeTool({
      description: `Analyze a CSV file for import into the CRM. Detects entity type (contact/account/deal), maps columns to CRM fields, previews data, and checks for duplicates. Use when the user uploads a CSV or says "import this file", "import my data", "load contacts from CSV".`,
      inputSchema: z.object({
        csvText: z
          .string()
          .describe("The raw CSV text content"),
        entityTypeHint: z
          .enum(["contact", "account", "deal"])
          .optional()
          .describe("User-specified entity type, if known"),
      }),
      execute: async (input) => {
        const { csvText, entityTypeHint } = input;

        if (csvText.length > 10 * 1024 * 1024) {
          return { error: "CSV too large (max 10MB). Split into smaller files." };
        }

        const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          return { error: "CSV must have at least a header row and one data row." };
        }

        const headers = parseCSVLine(lines[0]);
        const sampleRows = lines.slice(1, 6).map(parseCSVLine);
        const totalRows = lines.length - 1;

        // LLM-based mapping (reuse existing)
        let mapping: { entityType: string | null; fieldMap: Record<string, string>; confidence: number };
        try {
          const { mapColumnsWithAI } = await import("./import-mapper");
          mapping = await mapColumnsWithAI(headers, sampleRows, entityTypeHint);
        } catch {
          mapping = heuristicMapping(headers, entityTypeHint);
        }

        // Identify unmapped columns (candidates for custom fields)
        const mappedHeaders = new Set(Object.keys(mapping.fieldMap));
        const unmappedColumns = headers.filter((h) => !mappedHeaders.has(h));

        // Preview mapped data
        const preview = sampleRows.map((row) => {
          const mapped: Record<string, string> = {};
          for (let i = 0; i < headers.length; i++) {
            const crmField = mapping.fieldMap[headers[i]];
            if (crmField && row[i]) {
              mapped[crmField] = row[i].replace(/^["']|["']$/g, "").trim();
            }
          }
          return mapped;
        });

        return {
          entityType: mapping.entityType,
          fieldMap: mapping.fieldMap,
          confidence: mapping.confidence,
          totalRows,
          headers,
          unmappedColumns,
          preview,
          message: `Found ${totalRows} ${mapping.entityType || "unknown"} records. ${unmappedColumns.length} columns not mapped: ${unmappedColumns.join(", ") || "none"}.`,
          nextStep: "Review the mapping above. Say 'import it' to proceed, or adjust the mapping (e.g., 'Map Company to account domain').",
        };
      },
    }),

    executeImport: makeTool({
      description: `Execute a CSV import after the user has reviewed and confirmed the mapping. Creates a background task with progress tracking. Use after analyzeCSVForImport when user confirms.`,
      inputSchema: z.object({
        csvText: z.string().describe("The raw CSV text content"),
        entityType: z.enum(["contact", "account", "deal"]).describe("Entity type to import as"),
        fieldMap: z.record(z.string(), z.string()).describe("Column name to CRM field mapping"),
        dedup: z.boolean().optional().describe("Enable deduplication (default true)"),
        wireRelationships: z.boolean().optional().describe("Wire contacts to companies (default true)"),
      }),
      execute: async (input) => {
        const lines = input.csvText.split("\n").map((l) => l.trim()).filter(Boolean);
        const headers = parseCSVLine(lines[0]);
        const csvRows = lines.slice(1).map(parseCSVLine);
        const importJobId = crypto.randomUUID();

        const taskId = await createTask({
          type: "import",
          title: `Import ${csvRows.length} ${input.entityType}s`,
          tenantId,
          // agentTasks.userId FK -> auth_user.id (AUTH id).
          userId: authCtx.userId,
          progressTotal: csvRows.length,
          metadata: {
            csvRows,
            headers,
            entityType: input.entityType,
            fieldMap: input.fieldMap,
            importJobId,
            dedup: input.dedup ?? true,
            wireRelationships: input.wireRelationships ?? true,
          },
        });

        return {
          taskId,
          importJobId,
          message: `Import started. ${csvRows.length} ${input.entityType} records queued. Track progress in the task card above.`,
          totalRows: csvRows.length,
        };
      },
    }),
  };
}

function heuristicMapping(
  headers: string[],
  hintEntityType?: string
): { entityType: string | null; fieldMap: Record<string, string>; confidence: number } {
  const lower = headers.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ""));
  const fieldMap: Record<string, string> = {};

  const hasEmail = lower.some((h) => h.includes("email"));
  const hasFirstName = lower.some((h) => h.includes("first") || h.includes("prenom"));
  const hasDomain = lower.some((h) => h.includes("domain") || h.includes("website"));
  const hasStage = lower.some((h) => h.includes("stage") || h.includes("status") || h.includes("pipeline"));

  let entityType: string | null = null;
  if (hintEntityType) {
    entityType = hintEntityType;
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
    companyName: ["companyname", "company", "organization", "societe", "entreprise"],
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
