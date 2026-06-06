/**
 * Daily call-list generation — the "automatic" backbone.
 *
 * Every weekday morning, for each active call campaign, build that day's
 * call list (retries due + fresh callable prospects, capped at the daily
 * quota). The cockpit then reads `getTodaysCallList` and the rep just dials.
 *
 * Runs at 06:00 UTC Mon-Fri so the list is ready before the working day.
 * (Quiet-hours enforcement at dial time keeps calls inside each prospect's
 * 9-18 local window regardless of when the list was built.)
 *
 * Requires Inngest Cloud keys in prod to fire on schedule; runs in the local
 * Inngest dev server today. The generation itself can also be invoked
 * on-demand (campaign POST / a manual "refresh list" action).
 */

import { inngest } from "./client";
import { db } from "@/db";
import { callCampaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateDailyCallList } from "@/lib/voice/campaign";

export const dailyCallListGeneration = inngest.createFunction(
  { id: "daily-call-list-generation", name: "Daily call list generation", retries: 1 },
  { cron: "0 6 * * 1-5" },
  async ({ step }) => {
    const active = await step.run("load-active-campaigns", async () =>
      db
        .select({ id: callCampaigns.id, tenantId: callCampaigns.tenantId })
        .from(callCampaigns)
        .where(eq(callCampaigns.status, "active")),
    );

    let listed = 0;
    let added = 0;
    for (const c of active) {
      const res = await step.run(`gen-${c.id}`, async () => generateDailyCallList(c.id));
      listed += res.listed;
      added += res.newlyAdded;
    }

    return { campaigns: active.length, listed, newlyAdded: added };
  },
);
