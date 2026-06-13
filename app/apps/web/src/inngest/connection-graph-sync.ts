/**
 * Connection-graph ingestion job (_specs/CONNECTION-GRAPH).
 *
 * ⚠️ DORMANT — defined but deliberately NOT registered in
 * `app/api/inngest/route.ts`, given NO cron, and triggered by an event
 * that NOTHING in live code emits. So even if this branch merged, the job
 * could never fire in production. On top of that the handler hard-returns
 * when `isConnectionGraphEnabled()` is false (prod default). Triple-gated.
 *
 * When the feature is integrated: register it in the route, wire the
 * DB-backed deps (resolve against `companies`, upsert `connection_edges`,
 * save the cursor on `linkedin_accounts`), and emit
 * `linkedin/graph.sync.requested` from the account-connect flow + a daily
 * drip cron. The orchestration itself (ingestRelations) is already tested.
 */

import { inngest } from "./client";
import { isConnectionGraphEnabled } from "@/lib/connection-graph/config";
import { resolveGraphProvider } from "@/lib/connection-graph/provider";
import { ingestRelations } from "@/lib/connection-graph/ingest";
import { resolveCompany } from "@/lib/connection-graph/company-resolution";
import { logger } from "@/lib/observability/logger";

type GraphSyncEvent = {
  data: {
    tenantId: string;
    ownerUserId: string;
    externalAccountId: string;
    startCursor?: string | null;
  };
};

export const connectionGraphSync = inngest.createFunction(
  {
    id: "connection-graph-sync",
    name: "Connection graph: ingest relations (dormant)",
    retries: 2,
    // Event-only, never emitted by live code today. No cron.
    triggers: [{ event: "linkedin/graph.sync.requested" }],
  },
  async ({ event }: { event: GraphSyncEvent }) => {
    if (!isConnectionGraphEnabled()) {
      return { skipped: "feature_disabled" };
    }
    const provider = resolveGraphProvider();
    if (!provider) {
      return { skipped: "no_provider" };
    }

    const { tenantId, ownerUserId, externalAccountId, startCursor } = event.data;

    // DB-backed deps are wired at integration time. Until then the job is
    // unreachable (not registered + flag off), so this throws loudly if
    // someone enables it without finishing the wiring — never a silent
    // live LinkedIn call.
    void ingestRelations;
    void resolveCompany;
    void provider;
    logger.warn("connection-graph-sync.not_wired", {
      tenantId,
      ownerUserId,
      externalAccountId,
      startCursor: startCursor ?? null,
    });
    throw new Error(
      "connection-graph-sync: DB deps not wired. Complete _specs/CONNECTION-GRAPH integration before enabling.",
    );
  },
);
