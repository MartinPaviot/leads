/**
 * Spec 28 — CRM sync (HubSpot) + Slack hot-lead notify. See
 * _specs/28-crm-sync-and-slack-notify/RECONCILE.md.
 */

export {
  type CrmEntityType,
  type CrmEntity,
  type CrmFieldMapping,
  type HubSpotClient,
  CrmRateLimitError,
  HubSpotAdapter,
  mapManagedFields,
  upsertKey,
} from "@/lib/providers/hubspot/adapter";

export {
  type MeterOp,
  type SyncDeps,
  type SyncResult,
  syncToCrm,
} from "./sync";

export {
  type HotLead,
  type SlackClient,
  type SlackIdempotencyStore,
  type NotifyDeps,
  type NotifyResult,
  formatHotLeadMessage,
  notifySlack,
} from "@/lib/notify/slack/notify";

export {
  type HandleHotLeadDeps,
  type HandleHotLeadResult,
  handleHotLead,
} from "./hot-lead";
