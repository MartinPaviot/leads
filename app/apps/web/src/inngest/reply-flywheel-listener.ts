/**
 * P3 — outcome→learn loop for inbox replies. Listens for "outcome/resolved"
 * (emitted by lib/outcomes/resolve.ts — previously emitted, never consumed
 * anywhere in the codebase). Only acts on the "draft_reply" actionType this
 * module itself creates (lib/outcomes/reply-flywheel.ts#watchReplyOutcome);
 * every other actionType/outcome in the system (deal-advance, task,
 * autopilot agent actions via agent-reactor.ts) passes through untouched —
 * see lib/outcomes/reply-flywheel.ts for the full design + why this is safe.
 */
import { inngest } from "./client";
import { db } from "@/db";
import { actionOutcomes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recordFlywheelCandidate } from "@/lib/evals/flywheel";
import { shouldPromoteReplyOutcome, type ReplySnapshot } from "@/lib/outcomes/reply-flywheel";
import logger from "@/lib/observability/logger";

export const replyFlywheelListener = inngest.createFunction(
  {
    id: "reply-flywheel-listener",
    retries: 2,
    triggers: [{ event: "outcome/resolved" }],
  },
  async ({ event, step }: { event: any; step: any }) => {
    const { tenantId, outcomeId, actionType, positivity } = event.data as {
      tenantId: string;
      outcomeId: string;
      actionType: string;
      positivity: number;
    };

    if (!shouldPromoteReplyOutcome(actionType, positivity)) {
      return { skipped: "not-a-promotable-reply" };
    }

    const snapshot = await step.run("load-snapshot", async () => {
      const [row] = await db
        .select({ entitySnapshot: actionOutcomes.entitySnapshot })
        .from(actionOutcomes)
        .where(eq(actionOutcomes.id, outcomeId))
        .limit(1);
      return (row?.entitySnapshot ?? null) as ReplySnapshot | null;
    });

    if (!snapshot?.agentId || !snapshot.output) {
      return { skipped: "snapshot-missing" };
    }

    const result = await step.run("record-candidate", () =>
      recordFlywheelCandidate(snapshot.agentId, snapshot.input || "", snapshot.output, tenantId),
    );

    logger.info?.("reply-flywheel-listener: candidate recorded", { tenantId, recorded: !!result });
    return { recorded: !!result };
  },
);
