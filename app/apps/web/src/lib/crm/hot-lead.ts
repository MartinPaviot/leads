/**
 * Spec 28 (AC2) — hot-lead terminal: post to Slack and update the CRM deal stage.
 * Composes notifySlack (notify/slack) with the HubSpot adapter's deal-stage
 * update. Both sides are idempotent.
 */

import { notifySlack, type HotLead, type NotifyDeps, type NotifyResult } from "@/lib/notify/slack/notify";
import { HubSpotAdapter, type HubSpotClient } from "@/lib/providers/hubspot/adapter";

export interface HandleHotLeadDeps extends NotifyDeps {
  client: HubSpotClient;
  /** CRM object id of the deal/contact to advance. */
  dealExternalId?: string;
  /** Deal stage to set on a hot lead (per config). */
  hotStage?: string;
}

export interface HandleHotLeadResult {
  slack: NotifyResult;
  dealUpdated: boolean;
}

/** Post the Slack notification and, when configured, advance the CRM deal stage. */
export async function handleHotLead(lead: HotLead, deps: HandleHotLeadDeps): Promise<HandleHotLeadResult> {
  const slack = await notifySlack(lead, deps);

  let dealUpdated = false;
  if (deps.dealExternalId && deps.hotStage) {
    await new HubSpotAdapter(deps.client).updateDealStage(deps.dealExternalId, deps.hotStage);
    dealUpdated = true;
  }
  return { slack, dealUpdated };
}
