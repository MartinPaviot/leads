/**
 * Deal Briefing Inngest Functions (C1)
 *
 * - generateDealBrief: on-demand briefing for specific deals
 * - scheduledDealDigest: weekday morning digest of all open deals
 */

import { inngest } from "./client";
import { briefAllOpenDeals, buildDealBrief } from "@/lib/deal-briefing";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * On-demand deal briefing. Triggered by chat tool or API.
 */
export const generateDealBrief = inngest.createFunction(
  {
    id: "generate-deal-brief",
    retries: 1,
    triggers: [{ event: "deal/brief-requested" }],
  },
  async ({ event, step }: {
    event: { data: { tenantId: string; dealIds?: string[]; scope: "all_open" | "specific" } };
    step: any;
  }) => {
    const { tenantId, dealIds, scope } = event.data;

    if (scope === "specific" && dealIds && dealIds.length > 0) {
      const briefs = await step.run("brief-specific-deals", async () => {
        const results = await Promise.all(
          dealIds.map((id: string) =>
            buildDealBrief(id, tenantId).catch((err: unknown) => {
              console.warn(`deal-briefing: failed for ${id}:`, err);
              return null;
            }),
          ),
        );
        return results.filter((b: unknown) => b !== null);
      });

      return { briefs, count: briefs.length };
    }

    // Scope: all_open
    const briefs = await step.run("brief-all-open", async () => {
      return briefAllOpenDeals(tenantId);
    });

    return { briefs, count: briefs.length };
  },
);

/**
 * Scheduled deal digest — runs weekdays at 7am UTC.
 * Generates briefs for all open deals per tenant, stores a
 * notification for each admin user.
 */
export const scheduledDealDigest = inngest.createFunction(
  {
    id: "scheduled-deal-digest",
    retries: 1,
    triggers: [{ cron: "0 7 * * 1-5" }],
  },
  async ({ step }: { step: any }) => {
    // Get all tenants with admin users
    const tenantUsers = await step.run("list-tenants", async () => {
      const rows = await db
        .select({
          tenantId: users.tenantId,
          userId: users.id,
        })
        .from(users)
        .where(eq(users.role, "admin"));

      const map = new Map<string, string[]>();
      for (const r of rows) {
        if (!r.tenantId) continue;
        const list = map.get(r.tenantId) || [];
        list.push(r.userId);
        map.set(r.tenantId, list);
      }
      return Array.from(map.entries()).map(([tenantId, userIds]) => ({
        tenantId,
        userIds,
      }));
    });

    let totalBriefs = 0;

    for (const { tenantId, userIds } of tenantUsers) {
      const briefs = await step.run(`brief-${tenantId}`, async () => {
        return briefAllOpenDeals(tenantId, { maxDeals: 15 });
      });

      if (briefs.length === 0) continue;
      totalBriefs += briefs.length;

      // Create notification for each user
      const critical = briefs.filter(
        (b: { riskLevel: string }) => b.riskLevel === "critical" || b.riskLevel === "high",
      );
      const title = critical.length > 0
        ? `Daily brief: ${briefs.length} deals, ${critical.length} need attention`
        : `Daily brief: ${briefs.length} open deals`;

      const body = briefs
        .slice(0, 5)
        .map(
          (b: { riskLevel: string; dealName: string; stage: string; summary: string }) =>
            `${b.riskLevel === "critical" || b.riskLevel === "high" ? "!" : "-"} ${b.dealName} (${b.stage}): ${b.summary.slice(0, 100)}`,
        )
        .join("\n");

      await step.run(`notify-${tenantId}`, async () => {
        const notifs = userIds.map((userId: string) => ({
          id: crypto.randomUUID(),
          tenantId,
          userId,
          type: "system" as const,
          title,
          body: body.slice(0, 1000),
          entityType: "deal" as const,
          entityId: null,
          read: false,
          emailSent: false,
        }));

        if (notifs.length > 0) {
          await db.insert(notifications).values(notifs);
        }
      });
    }

    return { tenantsProcessed: tenantUsers.length, totalBriefs };
  },
);
