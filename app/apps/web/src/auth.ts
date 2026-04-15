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
  getLockoutStatus,
  recordFailedSignIn,
} from "./lib/auth-lockout";

/**
 * I6 — thrown when a sign-in is rejected because the account has hit the
 * failed-attempt threshold. NextAuth v5 will URL-encode `.code` as
 * `?code=AccountLocked` on the redirect; the sign-in page reads it and
 * surfaces the friendly lockout copy from `SIGN_IN_ERROR_COPY`.
 */
class AccountLockedError extends CredentialsSignin {
  code = "AccountLocked";
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

  // First login — create tenant + user
  const [tenant] = await db
    .insert(tenants)
    .values({ name: email.split("@")[1] || "default" })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      clerkId: authUserId,
      tenantId: tenant.id,
      email,
    })
    .returning();

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
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
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;
        const ip =
          (request?.headers?.get?.("x-forwarded-for") ?? "")
            .split(",")[0]
            .trim() || null;

        // I6: short-circuit if this account is currently locked. We run
        // this BEFORE the DB look-up so a locked account doesn't even
        // touch bcrypt — and we do it for unknown emails too so an
        // attacker can't tell a locked-real account apart from an
        // unknown one (same response shape, same timing class).
        const lockout = await getLockoutStatus(email);
        if (lockout.locked) {
          throw new AccountLockedError();
        }

        // Look up the auth user by email
        const [user] = await db
          .select()
          .from(authUsers)
          .where(eq(authUsers.email, email))
          .limit(1);

        if (!user) {
          await recordFailedSignIn(email, ip);
          return null;
        }

        // Verify password hash (stored in authUsers.image field repurposed,
        // or in a dedicated password field if added). For now, check the
        // auth_account table for a credentials-type entry with hashed password.
        const [credAccount] = await db
          .select()
          .from(authAccounts)
          .where(eq(authAccounts.userId, user.id))
          .limit(1);

        // If no credentials account exists, reject
        if (!credAccount || credAccount.provider !== "credentials") {
          await recordFailedSignIn(email, ip);
          return null;
        }

        // The access_token field stores the bcrypt hash for credentials provider
        const storedHash = credAccount.access_token;
        if (!storedHash) {
          await recordFailedSignIn(email, ip);
          return null;
        }

        const isValid = await bcrypt.compare(password, storedHash);
        if (!isValid) {
          await recordFailedSignIn(email, ip);
          return null;
        }

        // Success — wipe the failure counter so a few legit typos earlier
        // in the session don't accumulate over weeks toward an eventual
        // false-positive lockout.
        await clearFailedSignIns(email);

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
  },
  session: {
    strategy: "jwt",
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
            "@/lib/email-verification"
          );
          await markEmailVerified(user.id);
        } catch (err) {
          console.warn("auth: failed to stamp emailVerified for OAuth user", err);
        }
      }

      // Store Google access token in JWT for Gmail API access
      if (account?.provider === "google") {
        token.googleAccessToken = account.access_token;
        token.googleRefreshToken = account.refresh_token;
        token.googleTokenExpiry = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;

        // Trigger initial email/calendar sync via Inngest
        if (token.tenantId && token.appUserId) {
          inngest.send({
            name: "google/oauth-connected",
            data: {
              userId: user?.id || (token.id as string),
              tenantId: token.tenantId as string,
              appUserId: token.appUserId as string,
            },
          }).catch((err) => console.warn("Failed to trigger OAuth sync:", err));
        }
      }

      // Store Microsoft access token for Graph API access
      if (account?.provider === "microsoft-entra-id") {
        token.microsoftAccessToken = account.access_token;
        token.microsoftRefreshToken = account.refresh_token;
        token.microsoftTokenExpiry = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;

        // Trigger initial email/calendar sync via Inngest
        if (token.tenantId && token.appUserId) {
          inngest.send({
            name: "microsoft/oauth-connected",
            data: {
              userId: user?.id || (token.id as string),
              tenantId: token.tenantId as string,
              appUserId: token.appUserId as string,
            },
          }).catch((err) => console.warn("Failed to trigger Microsoft sync:", err));
        }
      }

      // Refresh Google token if expired
      if (
        token.googleRefreshToken &&
        token.googleTokenExpiry &&
        Date.now() > (token.googleTokenExpiry as number) - 5 * 60 * 1000
      ) {
        try {
          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              grant_type: "refresh_token",
              refresh_token: token.googleRefreshToken as string,
            }),
          });
          const data = await response.json();
          if (data.access_token) {
            token.googleAccessToken = data.access_token;
            token.googleTokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
          }
        } catch (err) {
          console.error("Failed to refresh Google token:", err);
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        (session as any).tenantId = token.tenantId as string;
        (session as any).appUserId = token.appUserId as string;
        (session as any).role = (token.role as string) || "member";
      }
      return session;
    },
  },
});
