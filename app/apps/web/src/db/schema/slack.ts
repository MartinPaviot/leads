/**
 * CHAT-08 Part A — Slack integration tables. Schema only for this pass;
 * everything downstream (Bolt app, OAuth flow, slash command) is blocked on
 * Slack app credentials from a human (see _specs/CHAT-08-external-reach/design.md).
 */
import { pgTable, text, timestamp, jsonb, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants, users } from "./core";

export const slackInstallationStatusEnum = pgEnum("slack_installation_status", ["active", "revoked"]);
export const pendingSlackApprovalStatusEnum = pgEnum("pending_slack_approval_status", [
  "pending",
  "approved",
  "denied",
  "expired",
]);

/**
 * One row per Slack workspace installation. A workspace can only be
 * installed to ONE LeadSens tenant at a time (unique on slackTeamId alone,
 * not tenant+team) — cross-tenant Slack is explicitly out of scope
 * (requirements.md "Out of scope").
 */
export const slackInstallations = pgTable(
  "slack_installations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    slackTeamId: text("slack_team_id").notNull(),
    slackTeamName: text("slack_team_name"),
    // AES-256-GCM via lib/crypto/settings-encryption.ts — same encryptSecret/
    // decryptSecret helper connectedMailboxes.secretEncrypted already uses.
    // Never store the raw bot token.
    botTokenEncrypted: text("bot_token_encrypted").notNull(),
    installedByUserId: text("installed_by_user_id").references(() => users.id),
    status: slackInstallationStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("slack_installations_team_idx").on(table.slackTeamId),
    index("slack_installations_tenant_idx").on(table.tenantId),
  ],
);

/**
 * A mutation the resolver would normally turn into an in-app ActionCard,
 * surfaced instead as a Slack interactive Approve/Deny message (AC4).
 * Created BEFORE the tool runs — on Approve, the handler re-checks
 * resolveCapabilities (role/plan may have changed since propose) then calls
 * the SAME tool.execute() the in-app path uses, and writes a toolCallEvents
 * row exactly like that path does. No parallel execution/bookkeeping.
 */
export const pendingSlackApprovals = pgTable(
  "pending_slack_approvals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    slackTeamId: text("slack_team_id").notNull(),
    requestedByUserId: text("requested_by_user_id").references(() => users.id).notNull(),
    toolName: text("tool_name").notNull(),
    args: jsonb("args").notNull().default({}),
    slackChannelId: text("slack_channel_id").notNull(),
    // Lets the handler edit the interactive message in place on approve/deny
    // instead of posting a new one.
    slackMessageTs: text("slack_message_ts").notNull(),
    status: pendingSlackApprovalStatusEnum("status").notNull().default("pending"),
    // 15 min floor (office-hours pitfall #5 — Slack's own interactive
    // buttons degrade past that window regardless of what we set here).
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pending_slack_approvals_tenant_idx").on(table.tenantId),
    index("pending_slack_approvals_status_idx").on(table.status),
  ],
);
