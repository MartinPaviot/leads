import * as vm from "node:vm";
import { db } from "@/db";
import { codeExecutions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchCrmData, type CrmDataSet } from "./crm-bridge";
import logger from "@/lib/observability/logger";

export interface SandboxResult {
  success: boolean;
  output: unknown;
  logs: string[];
  executionTimeMs: number;
  error?: string;
  chartSpec?: Record<string, unknown>;
}

interface ExecuteOptions {
  tenantId: string;
  userId: string;
  code: string;
  dataQuery?: string;
  chatThreadId?: string;
  mode?: "read" | "write";
  parentExecutionId?: string;
  iteration?: number;
  dataOverride?: CrmDataSet;
}

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_SIZE = 100_000;

export async function executeInSandbox(
  options: ExecuteOptions
): Promise<SandboxResult> {
  const start = Date.now();
  const logs: string[] = [];

  // 1. Create execution record
  const [execution] = await db
    .insert(codeExecutions)
    .values({
      tenantId: options.tenantId,
      userId: options.userId,
      code: options.code,
      dataQuery: options.dataQuery,
      mode: options.mode ?? "read",
      status: "running",
      chatThreadId: options.chatThreadId,
      parentExecutionId: options.parentExecutionId,
      iteration: options.iteration ?? 1,
    })
    .returning();

  try {
    // 2. Pre-fetch CRM data
    const data =
      options.dataOverride ??
      (await fetchCrmData(options.tenantId, parseDataQuery(options.dataQuery)));

    // 3. Build sandbox context
    const sandbox = buildSandboxContext(data, logs);

    // 4. Wrap user code in an IIFE that returns the result
    const wrappedCode = `
      "use strict";
      (function() {
        ${options.code}
      })();
    `;

    // 5. Execute in VM with timeout
    const context = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false },
    });

    const script = new vm.Script(wrappedCode, {
      filename: "sandbox.js",
    });

    const rawOutput = script.runInContext(context, {
      timeout: TIMEOUT_MS,
      breakOnSigint: true,
    });

    // 6. Sanitize output
    const output = sanitizeOutput(rawOutput);
    const chartSpec = sandbox.__chartSpec as Record<string, unknown> | undefined;
    const executionTimeMs = Date.now() - start;

    // 7. Update execution record
    await db
      .update(codeExecutions)
      .set({
        status: "completed",
        output: { result: output, logs } as Record<string, unknown>,
        executionTimeMs,
      })
      .where(eq(codeExecutions.id, execution.id));

    return {
      success: true,
      output,
      logs,
      executionTimeMs,
      chartSpec: chartSpec ?? undefined,
    };
  } catch (err) {
    const executionTimeMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);

    const status =
      errorMsg.includes("Script execution timed out") ? "timeout" : "failed";

    await db
      .update(codeExecutions)
      .set({
        status,
        error: errorMsg.slice(0, 2000),
        executionTimeMs,
      })
      .where(eq(codeExecutions.id, execution.id));

    logger.warn("Sandbox execution failed", {
      executionId: execution.id,
      error: errorMsg,
      executionTimeMs,
    });

    return {
      success: false,
      output: null,
      logs,
      executionTimeMs,
      error: errorMsg,
    };
  }
}

function buildSandboxContext(
  data: CrmDataSet,
  logs: string[]
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    // CRM data (pre-fetched, read-only)
    contacts: Object.freeze([...data.contacts]),
    accounts: Object.freeze([...data.accounts]),
    deals: Object.freeze([...data.deals]),
    activities: Object.freeze([...data.activities]),
    notes: Object.freeze([...data.notes]),

    // Console capture
    console: {
      log: (...args: unknown[]) => {
        if (logs.length < 100) {
          logs.push(args.map(String).join(" "));
        }
      },
      warn: (...args: unknown[]) => {
        if (logs.length < 100) {
          logs.push(`[warn] ${args.map(String).join(" ")}`);
        }
      },
      error: (...args: unknown[]) => {
        if (logs.length < 100) {
          logs.push(`[error] ${args.map(String).join(" ")}`);
        }
      },
    },

    // Utility functions
    JSON: JSON,
    Math: Math,
    Date: Date,
    Number: Number,
    String: String,
    Array: Array,
    Object: Object,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    undefined: undefined,
    null: null,
    true: true,
    false: false,
    Infinity: Infinity,
    NaN: NaN,
    Map: Map,
    Set: Set,
    RegExp: RegExp,

    // Chart output helper — the context object is mutated by chart()
    __chartSpec: undefined as unknown,
    chart: (spec: unknown) => {
      ctx.__chartSpec = spec;
      return spec;
    },

    // Aggregation helpers
    groupBy: <T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> => {
      const result: Record<string, T[]> = {};
      for (const item of arr) {
        const key = keyFn(item);
        if (!result[key]) result[key] = [];
        result[key].push(item);
      }
      return result;
    },

    sum: (arr: number[]): number => arr.reduce((a, b) => a + b, 0),
    avg: (arr: number[]): number =>
      arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length,
    median: (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    },
    count: (arr: unknown[]): number => arr.length,
    unique: <T>(arr: T[]): T[] => [...new Set(arr)],
    sortBy: <T>(arr: T[], keyFn: (item: T) => number | string, order: "asc" | "desc" = "asc"): T[] => {
      return [...arr].sort((a, b) => {
        const va = keyFn(a);
        const vb = keyFn(b);
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return order === "desc" ? -cmp : cmp;
      });
    },

    // Date helpers
    daysBetween: (a: string, b: string): number => {
      const da = new Date(a);
      const db = new Date(b);
      return Math.round(Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
    },
    daysAgo: (dateStr: string): number => {
      const d = new Date(dateStr);
      return Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    },
    monthOf: (dateStr: string): string => {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    },
  };

  return ctx;
}

function parseDataQuery(
  query?: string
): { entities?: Array<"contacts" | "accounts" | "deals" | "activities" | "notes">; filters?: Record<string, string> } {
  if (!query) return {};

  const result: {
    entities?: Array<"contacts" | "accounts" | "deals" | "activities" | "notes">;
    filters?: Record<string, string>;
  } = {};

  const lower = query.toLowerCase();
  const entities: Array<"contacts" | "accounts" | "deals" | "activities" | "notes"> = [];

  if (lower.includes("contact")) entities.push("contacts");
  if (lower.includes("account") || lower.includes("compan")) entities.push("accounts");
  if (lower.includes("deal") || lower.includes("pipeline") || lower.includes("opportunit")) entities.push("deals");
  if (lower.includes("activit") || lower.includes("email") || lower.includes("meeting")) entities.push("activities");
  if (lower.includes("note")) entities.push("notes");

  if (entities.length > 0) result.entities = entities;

  // Extract date filters
  const dateMatch = lower.match(/last\s+(\d+)\s+(day|week|month)/);
  if (dateMatch) {
    const num = parseInt(dateMatch[1]);
    const unit = dateMatch[2];
    const d = new Date();
    if (unit === "day") d.setDate(d.getDate() - num);
    else if (unit === "week") d.setDate(d.getDate() - num * 7);
    else if (unit === "month") d.setMonth(d.getMonth() - num);
    result.filters = { dateFrom: d.toISOString() };
  }

  // Extract stage filter
  const stageMatch = lower.match(/stage[:\s]+(won|lost|lead|qualification|demo|trial|proposal|negotiation)/);
  if (stageMatch) {
    result.filters = { ...result.filters, stage: stageMatch[1] };
  }

  return result;
}

function sanitizeOutput(output: unknown): unknown {
  const str = JSON.stringify(output);
  if (!str) return null;
  if (str.length > MAX_OUTPUT_SIZE) {
    if (Array.isArray(output)) {
      return {
        _truncated: true,
        totalRows: output.length,
        sample: output.slice(0, 100),
        message: `Result truncated: ${output.length} rows, showing first 100`,
      };
    }
    return { _truncated: true, message: "Output too large" };
  }
  return output;
}
