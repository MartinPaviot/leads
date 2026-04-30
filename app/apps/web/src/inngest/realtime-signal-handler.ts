/**
 * Real-Time Signal Handler (Inngest)
 *
 * Listens for `signals/evaluate-realtime` events and evaluates signals
 * immediately via fast heuristics (no LLM). Non-blocking from the
 * caller's perspective -- callers fire-and-forget via inngest.send().
 *
 * This replaces the weekly batch gap (competitive gap #3) with
 * event-driven detection that runs within seconds of the triggering
 * event (email synced, meeting completed, enrichment returned, etc.).
 */

import { inngest } from "./client";
import {
  evaluateSignalsRealTime,
  type SignalTriggerEvent,
} from "@/lib/signals/real-time-detector";

export const evaluateRealtimeSignals = inngest.createFunction(
  {
    id: "evaluate-realtime-signals",
    name: "Real-Time Signal Evaluator",
    retries: 1,
    // Bound concurrency per tenant so a bulk email sync doesn't
    // spawn hundreds of parallel evaluations
    concurrency: [{ limit: 5, key: "event.data.tenantId" }],
    // Throttle: max 60 evaluations per minute per tenant
    throttle: { limit: 60, period: "1m", key: "event.data.tenantId" },
    triggers: [{ event: "signals/evaluate-realtime" }],
  },
  async ({ event }) => {
    const triggerEvent = event.data as SignalTriggerEvent;

    if (!triggerEvent?.type || !triggerEvent?.tenantId) {
      return { error: "Invalid event payload: missing type or tenantId" };
    }

    const result = await evaluateSignalsRealTime(triggerEvent);

    return {
      eventType: triggerEvent.type,
      tenantId: triggerEvent.tenantId,
      signalsDetected: result.signalsDetected.length,
      notificationsSent: result.notificationsSent,
      signals: result.signalsDetected.map((s) => ({
        type: s.type,
        entityId: s.entityId,
        confidence: s.confidence,
      })),
    };
  },
);
