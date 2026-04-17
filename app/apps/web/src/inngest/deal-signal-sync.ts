/**
 * ROX-GAP-2: Auto-fill deal fields from conversation signals.
 *
 * When enrichment-email-extract extracts signals (budget, objections,
 * next steps, competitors) from an email, this function cascades those
 * signals to the associated deal's properties JSONB.
 *
 * Append semantics: never overwrites manually-set values, accumulates
 * history so the user can see evolution over time.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { deals, contacts } from "@/db/schema";
import { and, eq, notInArray, desc } from "drizzle-orm";

export const syncSignalsToDeal = inngest.createFunction(
  {
    id: "sync-signals-to-deal",
    retries: 1,
    triggers: [{ event: "enrichment/signals-extracted" }],
  },
  async ({ event }: {
    event: {
      data: {
        tenantId: string;
        activityId: string;
        contactId?: string;
        entityId?: string;
        entityType?: string;
        signals: {
          objections?: string[];
          next_steps?: string[];
          champion_signals?: string[];
          budget_mentions?: string[];
          competitor_mentions?: string[];
          timeline_mentions?: string[];
          sentiment?: string;
        };
      };
    };
  }) => {
    const { tenantId, signals, contactId, entityId, entityType } = event.data;

    if (!signals || Object.keys(signals).length === 0) {
      return { skipped: "no signals" };
    }

    // Find the contact — either directly or via the activity's entity
    let resolvedContactId = contactId;
    if (!resolvedContactId && entityType === "contact" && entityId) {
      resolvedContactId = entityId;
    }

    if (!resolvedContactId) {
      return { skipped: "no contact linked" };
    }

    // Find open deals for this contact
    const openDeals = await db
      .select({ id: deals.id, properties: deals.properties })
      .from(deals)
      .where(
        and(
          eq(deals.tenantId, tenantId),
          eq(deals.contactId, resolvedContactId),
          notInArray(deals.stage, ["won", "lost"]),
        ),
      )
      .orderBy(desc(deals.updatedAt))
      .limit(1); // Pick the most recently updated open deal

    if (openDeals.length === 0) {
      // No deal — store on the contact instead (future use)
      return { skipped: "no open deal for contact" };
    }

    const deal = openDeals[0];
    const props = (deal.properties || {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    let updated = false;

    // Budget mentions → properties.budget (latest) + properties.budgetHistory (append)
    if (signals.budget_mentions?.length) {
      const history = (props.budgetHistory as Array<{ value: string; date: string }>) || [];
      for (const bm of signals.budget_mentions) {
        if (!history.some((h) => h.value === bm)) {
          history.push({ value: bm, date: now });
        }
      }
      props.budgetHistory = history;
      // Only set primary budget if not manually set
      if (!props.budgetManuallySet) {
        props.budget = signals.budget_mentions[signals.budget_mentions.length - 1];
      }
      updated = true;
    }

    // Objections → properties.objections (accumulate, dedup)
    if (signals.objections?.length) {
      const existing = (props.objections as string[]) || [];
      for (const obj of signals.objections) {
        if (!existing.includes(obj)) {
          existing.push(obj);
        }
      }
      props.objections = existing;
      updated = true;
    }

    // Next steps → properties.nextSteps (accumulate, dedup)
    if (signals.next_steps?.length) {
      const existing = (props.nextSteps as string[]) || [];
      for (const ns of signals.next_steps) {
        if (!existing.includes(ns)) {
          existing.push(ns);
        }
      }
      props.nextSteps = existing;
      updated = true;
    }

    // Competitors → properties.competitors (accumulate, dedup)
    if (signals.competitor_mentions?.length) {
      const existing = (props.competitors as string[]) || [];
      for (const cm of signals.competitor_mentions) {
        if (!existing.includes(cm)) {
          existing.push(cm);
        }
      }
      props.competitors = existing;
      updated = true;
    }

    // Champion signals → properties.championSignals
    if (signals.champion_signals?.length) {
      const existing = (props.championSignals as string[]) || [];
      for (const cs of signals.champion_signals) {
        if (!existing.includes(cs)) {
          existing.push(cs);
        }
      }
      props.championSignals = existing;
      updated = true;
    }

    // Timeline mentions → properties.timeline
    if (signals.timeline_mentions?.length) {
      props.timeline = signals.timeline_mentions[signals.timeline_mentions.length - 1];
      updated = true;
    }

    if (!updated) {
      return { skipped: "no new signals to sync" };
    }

    props.lastSignalUpdate = now;

    await db
      .update(deals)
      .set({ properties: props, updatedAt: new Date() })
      .where(eq(deals.id, deal.id));

    return { dealId: deal.id, fieldsUpdated: Object.keys(props).filter((k) => k !== "lastSignalUpdate").length };
  },
);
