// Campaign segments (spec 13, _specs/13-segmentation-and-tam-estimate). A segment
// is an ICP version + an archetype (volume|micro|signal) + a stored definition
// AST, sized by a count-only TAM estimate. Distinct from outreach_playbooks
// (outreach tactic). One archetype per segment.
import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./core";

export const segments = pgTable(
  "segments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    campaignId: text("campaign_id"),
    /** ICP version this segment narrows (spec 11). */
    icpVersionId: text("icp_version_id"),
    // volume | micro | signal
    archetype: text("archetype").notNull(),
    /** The segment definition AST (partitionBy / narrowing / signalKey). */
    definition: jsonb("definition").notNull().default({}),
    /** Live signal key the segment binds to (signal archetype). */
    signalBinding: text("signal_binding"),
    estimatedTam: integer("estimated_tam"),
    goal: text("goal"),
    /** Channel -> share (e.g. {email: 0.7, linkedin: 0.3}). */
    channelMix: jsonb("channel_mix").default({}),
    dailySendBudget: integer("daily_send_budget"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("segments_tenant_idx").on(table.tenantId),
    index("segments_campaign_idx").on(table.tenantId, table.campaignId),
  ],
);
