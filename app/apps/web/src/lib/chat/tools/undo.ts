import { z } from "zod";
import {
  getLastReversibleCall,
  reverseToolCall,
} from "@/lib/chat/tool-call-log";
import { makeTool, type ToolContext } from "./context";

export function buildUndoTools(ctx: ToolContext) {
  const { tenantId, userId } = ctx;

  return {
    undoLastAction: makeTool({
      description:
        "Undo the most recent reversible action taken by the chat: a CRM create/update/delete with a stored snapshot, a reversible page action (re-runs its inverse live on the page), or an outbound email still inside its send window (cancels it before it leaves). Scoped to the current user. Returns { reverted } on success or { error } if there is nothing to undo, the snapshot isn't reversible, or an outbound email was already sent past its window (it can't be unsent). Use when the user says 'undo that', 'revert', 'take it back', 'cancel that email'.",
      inputSchema: z.object({
        eventId: z
          .string()
          .optional()
          .describe(
            "Specific tool_call_events id to revert. If omitted, the most recent reversible call is used."
          ),
      }),
      execute: async (input) => {
        let eventId = input.eventId;
        if (!eventId) {
          const last = await getLastReversibleCall(tenantId, userId);
          if (!last) return { error: "No reversible action found" };
          eventId = last.id;
        }
        const result = await reverseToolCall(tenantId, userId, eventId);
        if (!result.ok) return { error: result.error };
        // CLE-11: a Page Action reversal returns an invokeAction directive (the
        // inverse runs on the live page). Spread it so the dock dispatches it —
        // the same shape invokePageAction returns. Outbound cancels and
        // server-owned reversals carry no directive → plain { reverted }.
        const { directive } = result;
        return {
          reverted: {
            eventId,
            reversedAction: result.reversedAction,
          },
          ...(directive ?? {}),
        };
      },
    }),
  };
}
