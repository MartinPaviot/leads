import { inngest } from "./client";
import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { ingestInstantlyUnibox } from "@/lib/integrations/instantly-unibox";

/**
 * Cron: pull each connected tenant's Instantly Unibox into `email_received`
 * activities every 15 min, so imported boxes' replies keep flowing into their
 * owning rep's inbox without a manual "Sync inbox" click. Read-only against
 * Instantly + idempotent (dedup on `metadata.instantlyEmailId`) — no sends.
 */
export const cronInstantlyUnibox = inngest.createFunction(
  {
    id: "cron-instantly-unibox",
    name: "Cron: Sync Instantly Unibox",
    retries: 1,
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) => {
    // Tenants that have imported Instantly boxes.
    const tenantIds = await step.run("find-instantly-tenants", async () => {
      const rows = await db
        .selectDistinct({ tenantId: connectedMailboxes.tenantId })
        .from(connectedMailboxes)
        .where(eq(connectedMailboxes.provider, "instantly"));
      return rows.map((r) => r.tenantId);
    });

    let totalInserted = 0;
    for (const tenantId of tenantIds) {
      const res = await step.run(`sync-${tenantId}`, async () => {
        const settings = await getTenantSettings(tenantId);
        if (!settings.instantlyCredentialsEncrypted) return { inserted: 0 };
        let apiKey: string;
        try {
          apiKey = decryptSecret(settings.instantlyCredentialsEncrypted);
        } catch {
          return { inserted: 0 };
        }
        const r = await ingestInstantlyUnibox({ tenantId, apiKey });
        return { inserted: r.inserted, inbound: r.inbound, ok: r.ok };
      });
      totalInserted += res.inserted ?? 0;
    }

    return { tenants: tenantIds.length, inserted: totalInserted };
  },
);
