/**
 * Daily call-list generation — the "automatic" backbone.
 *
 * Runs every morning (06:00 UTC, all 7 days); each active campaign decides for
 * itself whether today is one of ITS working days and whether its list should
 * regenerate today (daily vs weekly), per the rhythm the user set in
 * onboarding. So nothing about the frequency is hardcoded — a campaign that
 * only calls Tue/Thu, or rebuilds its list weekly, is honoured here.
 *
 * The list = retries due + fresh callable prospects, capped at the daily quota.
 * Quiet-hours enforcement at dial time keeps calls inside each prospect's local
 * window regardless of when the list was built.
 *
 * Requires Inngest Cloud keys in prod to fire on schedule; runs in the local
 * Inngest dev server today. Generation can also be invoked on-demand.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { callCampaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateDailyCallList } from "@/lib/voice/campaign";

/** Honour the campaign's user-defined working days + list frequency. */
function shouldGenerateToday(targetFilter: unknown, now: Date): boolean {
  const tf = (targetFilter || {}) as { workingDays?: number[]; listFrequency?: string };
  const workingDays = Array.isArray(tf.workingDays) && tf.workingDays.length > 0 ? tf.workingDays : [1, 2, 3, 4, 5];
  const dow = now.getUTCDay(); // 0 = Sunday
  if (!workingDays.includes(dow)) return false;
  if (tf.listFrequency === "weekly") {
    // Only on the first working day of the week (Sunday ordered last).
    const order = (d: number) => (d === 0 ? 7 : d);
    const firstWorking = workingDays.slice().sort((a, b) => order(a) - order(b))[0];
    return dow === firstWorking;
  }
  return true; // daily
}

export const dailyCallListGeneration = inngest.createFunction(
  {
    id: "daily-call-list-generation",
    name: "Daily call list generation",
    retries: 1,
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step }) => {
    const active = await step.run("load-active-campaigns", async () =>
      db
        .select({ id: callCampaigns.id, tenantId: callCampaigns.tenantId, targetFilter: callCampaigns.targetFilter })
        .from(callCampaigns)
        .where(eq(callCampaigns.status, "active")),
    );

    const now = new Date();
    let listed = 0;
    let added = 0;
    let ran = 0;
    for (const c of active) {
      if (!shouldGenerateToday(c.targetFilter, now)) continue;
      ran++;
      const res = await step.run(`gen-${c.id}`, async () => generateDailyCallList(c.id));
      listed += res.listed;
      added += res.newlyAdded;
      // Auto-verify today's roles on LinkedIn (gated on APIFY_TOKEN in the
      // worker; TTL-cached so recent checks aren't re-paid).
      if (res.listedContactIds.length > 0) {
        await step.sendEvent(`verify-${c.id}`, {
          name: "call-list/verify-roles",
          data: { tenantId: c.tenantId, contactIds: res.listedContactIds },
        });
      }
    }

    return { campaigns: active.length, generated: ran, listed, newlyAdded: added };
  },
);
