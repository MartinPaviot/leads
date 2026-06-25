/**
 * Spec 36 — LinkedIn sending-identity + Unipile state. There is NO spec-21
 * analog for LinkedIn (spec 21 is email-mailbox-only and pure-functional), so
 * these tables ARE the LinkedIn identity registry: the connected seat + its
 * auth/health, the viewer-scoped provider_id cache, and durable action events
 * (today LinkedInActionEvent is in-memory only — linkedin.ts:16).
 *
 * Status/seat/degree are free-text + default (mirrors sequence_steps.step_type)
 * so a new value never needs a CREATE TYPE migration. Allowed values are
 * documented inline and enforced in code (lib/sending/linkedin/capacity.ts).
 */

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants, contacts } from "./core";

/**
 * The connected LinkedIn seat (the founder's Sales-Nav account). The Unipile
 * account_id arrives via the hosted-auth callback; `status` gates sendability
 * (only `connected` reports capacity — fail-closed, the spec-21 verifyAuth
 * analog).
 */
export const linkedinAccount = pgTable(
  "linkedin_account",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    /** Whose LinkedIn seat — the warm-path "via user" + sequence sender. Auth-space
     * id (matches connect/route.ts authCtx.userId + connected_mailboxes.userId); no
     * FK, per the auth-space-id convention (auth_user, not the app users table). */
    userId: text("user_id").notNull(),
    /** Adapter behind the LinkedInPort: 'unipile' (default) | 'heyreach'. */
    provider: text("provider").notNull().default("unipile"),
    /** Unipile account_id; null until the hosted-auth callback persists it. */
    unipileAccountId: text("unipile_account_id").unique(),
    /** Profile display name from Unipile. */
    displayName: text("display_name"),
    /** The seat's own profileUrl (its identity). */
    profileUrl: text("profile_url"),
    /** 'classic' | 'sales_navigator' | 'recruiter' — the InMail/search api selector. */
    seatType: text("seat_type").notNull().default("classic"),
    /** 'pending' | 'connected' | 'reconnect_required' | 'checkpoint' | 'disabled'. */
    status: text("status").notNull().default("pending"),
    /** Last status?() health probe. */
    lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
    /** { checkpoint?, rateLimited?, reason? } from the last probe/webhook. */
    healthDetail: jsonb("health_detail").$type<Record<string, unknown>>().default({}),
    /** Steady-state daily caps (mirror lib/sending/linkedin/limits.ts). */
    dailyCapConnect: integer("daily_cap_connect").notNull().default(20),
    dailyCapMessage: integer("daily_cap_message").notNull().default(100),
    /** null = not ramping (mirror SendingMailbox.warmupStartedAt). */
    warmupStartedAt: timestamp("warmup_started_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("linkedin_account_tenant_idx").on(t.tenantId),
    index("linkedin_account_tenant_status_idx").on(t.tenantId, t.status),
    // Per-member send lookup (step -> owner -> seat) + warm-path attribution.
    index("linkedin_account_tenant_user_idx").on(t.tenantId, t.userId),
    // Product rule: at most one CONNECTED seat per member per tenant. Partial
    // unique (free-text status, so a SQL partial index — no enum migration).
    uniqueIndex("linkedin_account_one_connected_per_user")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'connected'`),
  ],
);

/**
 * The viewer-scoped provider_id cache. Unipile targets an opaque `provider_id`
 * (NOT profileUrl), resolved per sending account — so the cache is keyed by
 * (account, contact). `chat_id` enables reply-in-chat (avoids the 1st-degree
 * re-check); `connection_degree` drives the connect vs message vs InMail branch.
 */
export const linkedinProviderIdentity = pgTable(
  "linkedin_provider_identity",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    contactId: text("contact_id").references(() => contacts.id).notNull(),
    /** The seat the id was resolved with / sends from. */
    linkedinAccountId: text("linkedin_account_id").references(() => linkedinAccount.id).notNull(),
    /** Normalized via linkedinPath (db/canonical/identity.ts). */
    profileUrl: text("profile_url").notNull(),
    /** Unipile opaque id — NEVER a canonical identity (vendor-id rule). */
    providerId: text("provider_id").notNull(),
    /** Set after the first message; reused to reply in the same chat. */
    chatId: text("chat_id"),
    /** '1st' | '2nd' | '3rd' | null. */
    connectionDegree: text("connection_degree"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("linkedin_provider_identity_account_contact_uniq").on(t.linkedinAccountId, t.contactId),
    index("linkedin_provider_identity_tenant_profile_idx").on(t.tenantId, t.profileUrl),
  ],
);

/**
 * Spec 36 (T9) — a connected seat's 1st-degree relations (network snapshot).
 * Captured once on connect + refreshed periodically, so matching a sourced
 * contact to "who on the team is already connected" is instant + survives
 * without re-pulling. Each relation's provider_id (Unipile member_id, ACoAA…)
 * pre-populates the send target — a later send skips the per-contact resolve.
 * profile_url is normalized via linkedinPath (the same key contacts dedup on).
 */
export const linkedinRelation = pgTable(
  "linkedin_relation",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    /** Whose network this relation belongs to. */
    linkedinAccountId: text("linkedin_account_id").references(() => linkedinAccount.id).notNull(),
    /** Unipile member_id (ACoAA…) — the viewer-scoped provider_id / send target. */
    providerId: text("provider_id").notNull(),
    /** Normalized via linkedinPath — the match key against contacts.linkedin_url. */
    profileUrl: text("profile_url").notNull(),
    publicIdentifier: text("public_identifier"),
    displayName: text("display_name"),
    headline: text("headline"),
    /** Always '1st' for a relations-list entry (kept explicit for the graph). */
    connectionDegree: text("connection_degree").notNull().default("1st"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("linkedin_relation_account_provider_uniq").on(t.linkedinAccountId, t.providerId),
    index("linkedin_relation_tenant_profile_idx").on(t.tenantId, t.profileUrl),
  ],
);

/**
 * Durable LinkedInActionEvent persistence. Backs actionsToday (the COUNT the
 * daily-limit gate needs, linkedin.ts:45) and makes LinkedIn touches visible to
 * spec-14 overlap + spec-29 rollups. `idempotency_key` unique = the spec-24
 * dedup boundary surviving restarts.
 */
export const linkedinActionEvent = pgTable(
  "linkedin_action_event",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    linkedinAccountId: text("linkedin_account_id").references(() => linkedinAccount.id).notNull(),
    stepId: text("step_id").notNull(),
    contactId: text("contact_id").references(() => contacts.id).notNull(),
    /** 'connect' | 'message'. */
    action: text("action").notNull(),
    providerActionId: text("provider_action_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("linkedin_action_event_today_idx").on(t.tenantId, t.linkedinAccountId, t.action, t.at),
  ],
);
