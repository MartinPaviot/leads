/**
 * Spec 18 — voice guide + asset blocks persistence. Versioned, workspace/campaign/
 * lang-scoped copy building blocks (positioning / offer / proof / cta) + a brand
 * voice guide. Append-only with supersede: exactly one `is_current` row per scope;
 * prior versions are retained (AC3). The pure resolution/versioning lives in
 * lib/copy/assets/*; this is just the storage the DrizzleAssetStore drives.
 */

import { pgTable, text, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./core";

export const copyAssetBlock = pgTable(
  "copy_asset_block",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id),
    campaignId: text("campaign_id"), // null = workspace default; value = campaign override
    lang: text("lang").notNull(), // 'en' | 'fr'
    kind: text("kind").notNull(), // positioning | offer | proof | cta
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    isCurrent: boolean("is_current").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("copy_asset_block_scope_idx").on(table.tenantId, table.lang, table.kind, table.isCurrent),
  ],
);

/**
 * Spec 19/20 — copy-engine shadow samples. Each row is a grounded message the copy
 * engine produced for a contact, stored for comparison against the live draft path
 * (the shadow never replaces a live send). `personalizationLevel` high = grounded +
 * cited; low = segment fallback. Written behind COPY_ENGINE_SHADOW.
 */
export const copyShadowSample = pgTable(
  "copy_shadow_sample",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id),
    contactId: text("contact_id").notNull(),
    lang: text("lang").notNull(),
    personalizationLevel: text("personalization_level").notNull(), // high | low
    subject: text("subject"),
    body: text("body").notNull(),
    flags: jsonb("flags").notNull().default([]),
    evidenceCount: integer("evidence_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("copy_shadow_sample_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("copy_shadow_sample_contact_idx").on(table.contactId),
  ],
);

export const copyVoiceGuide = pgTable(
  "copy_voice_guide",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id),
    lang: text("lang").notNull(),
    favoredPhrasings: jsonb("favored_phrasings").notNull().default([]),
    formats: jsonb("formats").notNull().default([]),
    topics: jsonb("topics").notNull().default([]), // [{ topic, pov }]
    bannedWords: jsonb("banned_words").notNull().default([]),
    frFormality: text("fr_formality").notNull().default("vouvoiement"),
    version: integer("version").notNull().default(1),
    isCurrent: boolean("is_current").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("copy_voice_guide_scope_idx").on(table.tenantId, table.lang, table.isCurrent),
  ],
);
