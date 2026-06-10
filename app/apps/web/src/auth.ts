import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import {
  authUsers,
  authAccounts,
  authSessions,
  authVerificationTokens,
  tenants,
  users,
} from "./db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { inngest } from "./inngest/client";
import {
  clearFailedSignIns,
  getIpLockoutStatus,
  getLockoutStatus,
  recordFailedSignIn,
} from "./lib/auth/auth-lockout";

/**
 * A fixed bcrypt hash at the project's current cost factor, used purely
 * as a timing target for the unknown-email / no-credentials-account
 * rejection path. The plaintext ("timing-safe-sentinel-DO-NOT-USE") is
 * not actually a valid password for any user — `bcrypt.compare` will
 * return `false`, but it will spend the same CPU budget as a real
 * rejection would. Generated at cost 12.
 */
const TIMING_SAFE_DUMMY_HASH =
  "$2a$12$CwTycUXWue0Thq9StjUM0uJ8SeaO5C7PBIW.VtTJPNjHRIKsY7tqW";

async function timingSafeCompareAndRecord(
  password: string,
  email: string,
  ip: string | null
): Promise<void> {
  // Run the dummy compare first, THEN record the failure. Order doesn't
  // matter for correctness (we always return null to the caller) but
  // doing the bcrypt work before the DB insert keeps the observable
  // latency stack-up identical to the happy-path failure.
  try {
    await bcrypt.compare(password, TIMING_SAFE_DUMMY_HASH);
  } catch {
    // bcryptjs only throws on malformed hashes — ours is valid — so
    // this branch shouldn't trigger. Swallow for belt-and-braces.
  }
  await recordFailedSignIn(email, ip);
}

/**
 * I6 — thrown when a sign-in is rejected because the account has hit the
 * failed-attempt threshold. NextAuth v5 will URL-encode `.code` as
 * `?code=AccountLocked` on the redirect; the sign-in page reads it and
 * surfaces the friendly lockout copy from `SIGN_IN_ERROR_COPY`.
 */
class AccountLockedError extends CredentialsSignin {
  code = "AccountLocked";
}

/** SOC2 T4 — password was correct but the account has TOTP enabled and
 *  no (or an invalid) code was supplied. The sign-in page reveals the
 *  authentication-code field on these codes. */
class MfaRequiredError extends CredentialsSignin {
  code = "MfaRequired";
}
class InvalidTotpError extends CredentialsSignin {
  code = "InvalidTotp";
}

/** Resolve (or create) a tenant + app user for the given auth user */
async function resolveUserTenant(authUserId: string, email: string) {
  // Check if app-level user already exists
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, authUserId))
    .limit(1);

  if (existing) return { tenantId: existing.tenantId, userId: existing.id, role: existing.role || "member" };

  // First login — create tenant + user. The tenant creator is the
  // founder: they get the admin role explicitly (the column default is
  // "member", which would lock the founder out of every admin-gated
  // surface — billing, members, settings, number purchase). Users who
  // arrive via an invite get the invite's role in the accept flow.
  //
  // Both inserts run in ONE withTenantTx pinned to the new tenant id:
  // atomic (no orphan tenant row if the user insert fails) and the
  // SET LOCAL context satisfies the 0074 users WITH CHECK regardless of
  // what any pooled backend carries (2026-06-10 incident: a stale
  // session-level app.tenant_id rejected this insert for every new
  // sign-up — _audit/2026-06-10-rls-session-poison.md).
  const newTenantId = crypto.randomUUID();
  const { withTenantTx } = await import("@/db/rls");
  const { tenant, user } = await withTenantTx(newTenantId, async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ id: newTenantId, name: email.split("@")[1] || "default" })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({
        clerkId: authUserId,
        tenantId: tenant.id,
        email,
        role: "admin",
      })
      .returning();
    return { tenant, user };
  });

  // WS-1: attribute the signup if this email was previously exposed to an
  // Elevay-branded meeting bot. Non-blocking — never fail signup.
  try {
    const { attributeSignupFromExposure } = await import("@/lib/recording/channel");
    const result = await attributeSignupFromExposure(tenant.id, email);
    if (result.status === "attributed") {
      console.log(`[WS-1] Signup attributed: tenant=${tenant.id} referrer=${result.referringTenantId} exposures=${result.exposureCount}`);
    }
  } catch (err) {
    console.warn(`[WS-1] Signup attribution failed for tenant ${tenant.id}:`, err);
  }

  return { tenantId: tenant.id, userId: user.id, role: user.role || "member" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pnpm dual-resolves drizzle-orm via @neondatabase peer; types are structurally identical
const baseAdapter = DrizzleAdapter(db as any, {
  usersTable: authUsers as any,
  accountsTable: authAccounts as any,
  sessionsTable: authSessions as any,
  verificationTokensTable: authVerificationTokens as any,
});

// SOC2 T1 — OAuth tokens are encrypted at rest. `linkAccount` is the
// single write path for fresh provider tokens (initial sign-in /
// re-consent); refresh-time writes go through lib/integrations/* which
// encrypt too. Readers (getGmailClient & co) decrypt tolerantly, so
// pre-encryption rows keep working until scripts/encrypt-oauth-tokens.ts
// has backfilled them.
const adapter: typeof baseAdapter = {
  ...baseAdapter,
  async linkAccount(account) {
    const { encryptOAuthToken } = await import(
      "@/lib/crypto/oauth-token-crypto"
    );
    await baseAdapter.linkAccount!({
      ...account,
      access_token: encryptOAuthToken(account.access_token as string | undefined) ?? undefined,
      refresh_token: encryptOAuthToken(account.refresh_token as string | undefined) ?? undefined,
      id_token: encryptOAuthToken(account.id_token as string | undefined) ?? undefined,
    });
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            // Explicitly OFF. With this set to true an attacker who
            // registers first via credentials on a victim's email
            // would have their account silently linked the moment the
            // victim OAuth-signs-in → takeover. Users that hit the
            // "email already in use" error go through the explicit
            // link flow (current-password reauth) instead.
            allowDangerousEmailAccountLinking: false,
            authorization: {
              params: {
                scope:
                  "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly",
                access_type: "offline",
                prompt: "consent",
              },
            },
          }),
        ]
      : []),
    // Microsoft OAuth — ready when MICROSOFT_CLIENT_ID env var is set
    ...(process.env.MICROSOFT_CLIENT_ID
      ? [
          MicrosoftEntraId({
            clientId: process.env.MICROSOFT_CLIENT_ID,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
            // See Google provider above for the rationale.
            allowDangerousEmailAccountLinking: false,
            authorization: {
              params: {
                scope: "openid email profile offline_access Mail.Read Calendars.Read",
              },
            },
          }),
        ]
      : []),
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authentication code", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;
        const ip =
          (request?.headers?.get?.("x-forwarded-for") ?? "")
            .split(",")[0]
            .trim() || null;

        // I6 + L4: short-circuit if either the account OR the source
        // IP is currently locked out. Per-email protects a specific
        // victim from brute-force; per-IP protects against credential
        // stuffing that spreads across many accounts to stay under
        // the per-email cap. Both checks BEFORE the DB lookup so a
        // locked attempt doesn't even touch bcrypt — and we keep the
        // same response shape as the unknown-email path so an
        // attacker can't distinguish locked from unknown via timing
        // or error details.
        const lockout = await getLockoutStatus(email);
        if (lockout.locked) {
          throw new AccountLockedError();
        }
        const ipLockout = await getIpLockoutStatus(ip);
        if (ipLockout.locked) {
          throw new AccountLockedError();
        }

        // Look up the auth user by email
        const [user] = await db
          .select()
          .from(authUsers)
          .where(eq(authUsers.email, email))
          .limit(1);

        // H4 — timing-oracle mitigation. Every rejection path below
        // burns one `bcrypt.compare` against a real hash so an attacker
        // can't tell an unknown email (previously: no bcrypt, fast
        // reject) from a known email with a wrong password (slow
        // reject) via response-time diffing. `TIMING_SAFE_DUMMY_HASH`
        // is a bcrypt hash at the current project cost factor.
        if (!user) {
          await timingSafeCompareAndRecord(password, email, ip);
          return null;
        }

        // H12 — prefer the dedicated `password_hash` column. Fall
        // back to the legacy `auth_account.access_token` location for
        // any row the migration hasn't yet touched (e.g. a login that
        // happens before the UPDATE in 0018_auth_user_password_hash
        // runs). Once we read from the fallback, we opportunistically
        // copy into the new column on successful login so the app
        // self-heals without a separate backfill job.
        let storedHash: string | null = user.passwordHash ?? null;
        let migratedFromAccountRow = false;
        if (!storedHash) {
          const [credAccount] = await db
            .select()
            .from(authAccounts)
            .where(eq(authAccounts.userId, user.id))
            .limit(1);

          if (!credAccount || credAccount.provider !== "credentials") {
            await timingSafeCompareAndRecord(password, email, ip);
            return null;
          }

          storedHash = credAccount.access_token ?? null;
          migratedFromAccountRow = !!storedHash;
        }

        if (!storedHash) {
          await timingSafeCompareAndRecord(password, email, ip);
          return null;
        }

        const isValid = await bcrypt.compare(password, storedHash);
        if (!isValid) {
          await recordFailedSignIn(email, ip);
          return null;
        }

        // SOC2 T5 — a deactivated (offboarded) member must not sign back
        // in even with a valid password. Checked after the bcrypt compare
        // so the rejection is indistinguishable from a wrong password.
        const [appUser] = await db
          .select({ deactivatedAt: users.deactivatedAt })
          .from(users)
          .where(eq(users.clerkId, user.id))
          .limit(1);
        if (appUser?.deactivatedAt) {
          return null;
        }

        // SOC2 T4 — second factor. Only enforced AFTER the bcrypt check
        // succeeded, so MfaRequired never leaks whether a password was
        // right for an account the attacker is probing (they had it).
        const { isMfaEnabled, verifyMfaCode } = await import("@/lib/auth/mfa");
        if (await isMfaEnabled(user.id)) {
          const totpCode = ((credentials.totp as string) || "").trim();
          if (!totpCode) {
            throw new MfaRequiredError();
          }
          const mfaOk = await verifyMfaCode(user.id, totpCode);
          if (!mfaOk) {
            await recordFailedSignIn(email, ip);
            throw new InvalidTotpError();
          }
        }

        // Success — wipe the failure counter so a few legit typos earlier
        // in the session don't accumulate over weeks toward an eventual
        // false-positive lockout.
        await clearFailedSignIns(email);

        // Roll-forward: copy the legacy hash into the new column so
        // the next login doesn't need the fallback path.
        if (migratedFromAccountRow) {
          try {
            await db
              .update(authUsers)
              .set({ passwordHash: storedHash })
              .where(eq(authUsers.id, user.id));
          } catch (err) {
            console.warn("auth: password_hash backfill failed (non-fatal)", err);
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    }),
  ],
  pages: {
    signIn: "/sign-in",
    // Error fallback. Without this, NextAuth ships its own bare
    // `/api/auth/error` page that reads as "the product is broken"
    // when really the OAuth provider was unreachable from the user's
    // network. Routing back to /sign-in lets `resolveSignInErrorCopy`
    // surface a friendly message tied to the existing UI.
    error: "/sign-in",
  },
  session: {
    strategy: "jwt",
    // H6 — NextAuth v5's default 30-day JWT means a stolen cookie is
    // usable for a month with no server-side revocation. 8h keeps the
    // UX of "log in once per workday" while capping the blast radius
    // of a leaked session. `updateAge: 60 * 60` issues a rolling
    // refresh after an hour of continued use, so active users aren't
    // bounced mid-session.
    maxAge: 8 * 60 * 60,
    updateAge: 60 * 60,
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user && user.id && user.email) {
        token.id = user.id;
        // Resolve tenant on first sign-in
        const { tenantId, userId, role } = await resolveUserTenant(
          user.id,
          user.email
        );
        token.tenantId = tenantId;
        token.appUserId = userId;
        token.role = role;
      }
      // S2: OAuth IdPs have already verified the email (Google's OIDC
      // payload carries `email_verified: true`, MS Entra likewise) so we
      // can stamp it on first sign-in instead of forcing a redundant
      // confirmation round-trip.
      if (
        user?.id &&
        (account?.provider === "google" ||
          account?.provider === "microsoft-entra-id")
      ) {
        try {
          const { markEmailVerified } = await import(
            "@/lib/emails/email-verification"
          );
          await markEmailVerified(user.id);
        } catch (err) {
          console.warn("auth: failed to stamp emailVerified for OAuth user", err);
        }
      }

      // H2 — OAuth access/refresh tokens used to be copied into the
      // JWT here so the client could short-circuit server lookups.
      // They now live ONLY in `auth_account` (server-side). A stolen
      // cookie therefore doesn't hand the attacker a months-valid
      // refresh token with full mailbox+calendar scope. Server code
      // that needs to call Gmail/Graph calls `getGmailClient(userId)`
      // / `getOutlookClient(userId)` which both read+refresh the
      // tokens server-side with a `.on("tokens", ...)` persistence
      // hook.
      //
      // We still fire the "oauth-connected" events to kick off the
      // initial sync on first sign-in with each provider.
      if (account?.provider === "google" && token.tenantId && token.appUserId) {
        inngest
          .send({
            name: "google/oauth-connected",
            data: {
              userId: user?.id || (token.id as string),
              tenantId: token.tenantId as string,
              appUserId: token.appUserId as string,
            },
          })
          .catch((err) => console.warn("Failed to trigger OAuth sync:", err));
        // WS-0 — start the TTFAA timer. Idempotent per tenant via
        // `settings.ttfaaSessionId`; safe to call on every initial OAuth
        // sign-in without double-firing. `account` is only set on the
        // initial sign-in (not on token refresh), so this block already
        // runs once per OAuth cycle.
        void import("@/lib/observability/ttfaa").then(({ markTtfaaStarted }) =>
          markTtfaaStarted({
            userId: user?.id || (token.id as string),
            tenantId: token.tenantId as string,
            provider: "google",
          }).catch((err) =>
            console.warn("ttfaa: markTtfaaStarted (google) failed", err)
          )
        );
      }
      if (
        account?.provider === "microsoft-entra-id" &&
        token.tenantId &&
        token.appUserId
      ) {
        inngest
          .send({
            name: "microsoft/oauth-connected",
            data: {
              userId: user?.id || (token.id as string),
              tenantId: token.tenantId as string,
              appUserId: token.appUserId as string,
            },
          })
          .catch((err) => console.warn("Failed to trigger Microsoft sync:", err));
        // WS-0 — same TTFAA timer start for Microsoft OAuth.
        void import("@/lib/observability/ttfaa").then(({ markTtfaaStarted }) =>
          markTtfaaStarted({
            userId: user?.id || (token.id as string),
            tenantId: token.tenantId as string,
            provider: "microsoft-entra-id",
          }).catch((err) =>
            console.warn("ttfaa: markTtfaaStarted (microsoft) failed", err)
          )
        );
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        (session as any).tenantId = token.tenantId as string;
        (session as any).appUserId = token.appUserId as string;
        (session as any).role = (token.role as string) || "member";
        // SOC2 T7 — surface the JWT issue time so getAuthContext can
        // reject tokens minted before the last password change.
        (session as any).issuedAt = (token as any).iat as number | undefined;
      }
      return session;
    },
  },
  events: {
    // SOC2 T6 (CC6.1) — successful authentications are audit-logged,
    // not just failures. Best-effort: a logging hiccup must never block
    // a legitimate sign-in; logAudit itself reports failures to Sentry.
    async signIn({ user, account }) {
      if (!user?.id) return;
      try {
        const [appUser] = await db
          .select({ id: users.id, tenantId: users.tenantId })
          .from(users)
          .where(eq(users.clerkId, user.id))
          .limit(1);
        if (!appUser) return; // first-ever sign-in: app user not created yet
        const { logAudit } = await import("@/lib/infra/audit-log");
        await logAudit({
          tenantId: appUser.tenantId,
          userId: appUser.id,
          action: "login",
          entityType: "user",
          entityId: appUser.id,
          metadata: {
            event: "sign_in",
            provider: account?.provider ?? "credentials",
          },
        });
      } catch (err) {
        console.warn("auth: failed to audit-log successful sign-in", err);
      }
    },
  },
});
