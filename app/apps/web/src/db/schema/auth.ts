import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
  boolean,
  varchar,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ============================================================
// AUTH.JS REQUIRED TABLES (for DrizzleAdapter)
// ============================================================

export const authUsers = pgTable("auth_user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // H12 — dedicated bcrypt hash storage. Historically the credentials
  // provider re-used `authAccounts.access_token`, which mixed OAuth
  // tokens and password hashes in a single column. Any future code
  // that read `access_token` for an OAuth flow could have grabbed a
  // bcrypt hash by accident; keeping them apart removes the footgun.
  // Read/write sites use the helpers in `src/lib/password-hash.ts`.
  // Old rows are migrated opportunistically on successful sign-in.
  passwordHash: text("password_hash"),
  // SOC2 T7 — JWTs issued before this instant are rejected by
  // lib/auth/session-guard, so changing/resetting the password revokes
  // every pre-existing session instead of leaving them valid up to 8h.
  passwordChangedAt: timestamp("password_changed_at", { mode: "date" }),
});

/**
 * SOC2 T4 — TOTP MFA state, one row per auth user. The table pre-existed
 * in prod (empty); this definition matches its live columns exactly.
 * `secret` holds the AES-256-GCM ciphertext (v1. format) of the base32
 * TOTP secret — never plaintext. `backup_codes` holds a JSON array of
 * SHA-256 hex digests of the single-use recovery codes. `last_used_at`
 * stores the timestamp of the last accepted TOTP step so the same code
 * cannot be replayed inside its validity window.
 */
export const userMfaSecrets = pgTable("user_mfa_secrets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes"),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const authAccounts = pgTable(
  "auth_account",
  {
    userId: text("userId")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const authSessions = pgTable("auth_session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const authVerificationTokens = pgTable(
  "auth_verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

// Saved filter / sort / column views per user per resource (T1-F4).
// Each row is a named view like "My high-intent SaaS" that combines a
// filter tree + sort + columns. The `is_default` flag picks which view
// auto-loads for the user on navigation.
export const savedViews = pgTable(
  "saved_views",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters").notNull(),
    sort: jsonb("sort"),
    columns: jsonb("columns"),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("saved_views_user_resource_idx").on(table.userId, table.resource),
  ]
);

// Per-user, per-resource preferences (T1-F5). Keyed by userId + resource
// (e.g. "accounts" | "contacts" | "opportunities") + key name. Stores
// JSONB so callers own their schema. Used by the DisplayPanel to
// remember column visibility / order / density between sessions.
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_preferences_user_resource_key_idx").on(
      table.userId,
      table.resource,
      table.key
    ),
  ]
);

// Password reset tokens for the Credentials provider (T0.8). The raw token
// is never stored — only a SHA-256 hex digest — so a DB leak can't be used
// to hijack pending resets.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestedIp: text("requested_ip"),
    requestedUserAgent: text("requested_user_agent"),
  },
  (table) => [
    index("password_reset_tokens_token_hash_idx").on(table.tokenHash),
    index("password_reset_tokens_user_id_idx").on(table.userId),
    index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
  ]
);

// Email-verification tokens for the Credentials sign-up flow (S2). Same
// security model as `passwordResetTokens`: the raw token is emailed to
// the user and only its SHA-256 digest is stored, so a DB leak can't be
// replayed to verify someone else's email. 24-hour TTL, one outstanding
// token per user (older ones get marked used at issue time).
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestedIp: text("requested_ip"),
    requestedUserAgent: text("requested_user_agent"),
  },
  (table) => [
    index("email_verification_tokens_token_hash_idx").on(table.tokenHash),
    index("email_verification_tokens_user_id_idx").on(table.userId),
    index("email_verification_tokens_expires_at_idx").on(table.expiresAt),
  ]
);

// Sign-in failure log for I6 brute-force protection. We never store the
// raw email — only `sha256(normalized_email)` — so an attacker who reads
// this table can't enumerate registered accounts. The window is small
// (15 min) so the table stays tiny; old rows are pruned opportunistically
// during writes.
export const failedSignInAttempts = pgTable(
  "failed_signin_attempts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    identifierHash: text("identifier_hash").notNull(),
    ip: text("ip"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("failed_signin_attempts_identifier_idx").on(table.identifierHash),
    index("failed_signin_attempts_attempted_at_idx").on(table.attemptedAt),
  ]
);
