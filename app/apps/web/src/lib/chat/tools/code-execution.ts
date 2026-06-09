import { z } from "zod";
import { makeTool, type ToolContext } from "./context";

export function buildCodeExecutionTools(ctx: ToolContext) {
  const { tenantId, authCtx } = ctx;

  return {
    executeCode: makeTool({
      description: `Write and execute JavaScript code to analyze CRM data at scale. The code runs in a sandbox with pre-loaded CRM data available as global variables: contacts[], accounts[], deals[], activities[], notes[]. Also available: groupBy(), sum(), avg(), median(), count(), unique(), sortBy(), daysBetween(), daysAgo(), monthOf(), chart(). Use when the user's question requires data processing, aggregation, custom scoring, or analysis beyond what simple queries provide. Examples: "win rate by company size", "deal velocity trends", "pipeline aging analysis", "score contacts by engagement".`,
      inputSchema: z.object({
        code: z
          .string()
          .describe(
            "JavaScript code to execute. CRM data is pre-loaded as global arrays (contacts, accounts, deals, activities, notes). Return the result as the last expression. Use chart({type, data, ...}) to output a chart spec."
          ),
        dataQuery: z
          .string()
          .optional()
          .describe(
            "Describe what CRM data is needed (e.g., 'deals from last 6 months', 'all contacts with accounts'). This determines which entities are pre-fetched."
          ),
        description: z
          .string()
          .optional()
          .describe("Brief description of what the code does (shown to user)"),
      }),
      execute: async (input) => {
        const { executeInSandbox } = await import("@/lib/sandbox/executor");

        const result = await executeInSandbox({
          tenantId,
          // codeExecutions.userId FK -> auth_user.id (AUTH id).
          userId: authCtx.userId,
          code: input.code,
          dataQuery: input.dataQuery,
        });

        if (!result.success) {
          return {
            error: result.error,
            logs: result.logs,
            executionTimeMs: result.executionTimeMs,
            hint: "The code failed. You can rewrite it and try again.",
          };
        }

        return {
          result: result.output,
          logs: result.logs,
          executionTimeMs: result.executionTimeMs,
          chartSpec: result.chartSpec ?? null,
          description: input.description,
        };
      },
    }),
  };
}
