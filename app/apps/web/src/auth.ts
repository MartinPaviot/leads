import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
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

/** Resolve (or create) a tenant + app user for the given auth user */
async function resolveUserTenant(authUserId: string, email: string) {
  // Check if app-level user already exists
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, authUserId))
    .limit(1);

  if (existing) return { tenantId: existing.tenantId, userId: existing.id };

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

  return { tenantId: tenant.id, userId: user.id };
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
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email as string;
        const password = credentials.password as string;

        // Look up the auth user by email
        const [user] = await db
          .select()
          .from(authUsers)
          .where(eq(authUsers.email, email))
          .limit(1);

        if (!user) return null;

        // Verify password hash (stored in authUsers.image field repurposed,
        // or in a dedicated password field if added). For now, check the
        // auth_account table for a credentials-type entry with hashed password.
        const [credAccount] = await db
          .select()
          .from(authAccounts)
          .where(eq(authAccounts.userId, user.id))
          .limit(1);

        // If no credentials account exists, reject
        if (!credAccount || credAccount.provider !== "credentials") return null;

        // The access_token field stores the bcrypt hash for credentials provider
        const storedHash = credAccount.access_token;
        if (!storedHash) return null;

        const isValid = await bcrypt.compare(password, storedHash);
        if (!isValid) return null;

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
        const { tenantId, userId } = await resolveUserTenant(
          user.id,
          user.email
        );
        token.tenantId = tenantId;
        token.appUserId = userId;
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
      }
      return session;
    },
  },
});
