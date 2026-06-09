import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { buildQueue } from "@/lib/voice/queue";

/**
 * Call Mode tools (read-only). Surfaces the same prioritised cold-call
 * queue the Call Mode page builds — composite intent × accessibility ×
 * deal-value score, DNC + quiet-hours flagged — so the chat can answer
 * "who should I call today" without the user leaving the conversation.
 *
 * Placing an actual call is intentionally NOT exposed here: dialing is a
 * Twilio side-effect that belongs behind the Call Mode UI's explicit
 * controls, not a chat tool call.
 */
export function buildCallTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    getCallList: makeTool({
      description:
        `Get today's prioritised cold-call list (the Call Mode queue): highest-intent, reachable contacts sorted by a composite intent × accessibility × deal-value score, each flagged for Do-Not-Call and quiet hours with its local time. Use when the user asks "who should I call today", "my call list", "call queue", "who's worth phoning at [account]".`,
      inputSchema: z.object({
        limit: z.number().optional().describe("Max contacts to return (default 20)"),
        companyId: z.string().optional().describe("Restrict the queue to one account's contacts"),
      }),
      execute: async (input) => {
        const items = await buildQueue(
          tenantId,
          input.limit ?? 20,
          input.companyId ? { companyIds: [input.companyId] } : {},
        );
        return {
          count: items.length,
          callList: items.map((i) => ({
            contactId: i.contactId,
            name: i.contactName,
            title: i.title,
            company: i.companyName,
            phone: i.phone,
            score: Math.round(i.score * 100) / 100,
            localTime: i.localTime,
            inQuietHours: i.inQuietHours,
            onDnc: i.onDnc,
            signal: i.latestSignal?.label ?? null,
          })),
        };
      },
    }),
  };
}
