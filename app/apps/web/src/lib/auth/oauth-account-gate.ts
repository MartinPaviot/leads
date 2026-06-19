import { db } from "@/db";
import { authUsers, pendingInvites } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { SELF_SERVE_SIGNUP_ENABLED } from "./self-serve-signup";

/**
 * Invitation-only gate for OAuth sign-in (Google / Microsoft), enforced only
 * when self-serve sign-up is disabled (production default — see
 * self-serve-signup.ts). When self-serve is enabled (dev / restorable), this
 * returns true and OAuth first-login self-provisions a tenant downstream, the
 * original behavior.
 *
 * When the gate is active, an OAuth login is allowed only when:
 *   - an account already exists for that email (a returning user signing back
 *     in), OR
 *   - a still-open invitation was issued to that email (an invited net-new
 *     user choosing "Continue with Google/Microsoft" instead of a password).
 *
 * Everyone else is denied. Wired into the NextAuth `signIn` callback, a
 * `false` return makes Auth.js raise AccessDenied BEFORE the adapter writes
 * any row (verified against @auth/core: `handleAuthorized` → throw, then
 * `handleLoginOrRegister`), so no orphan `auth_user` / tenant is left behind.
 *
 * Pure decision over two indexed lookups so it can be unit-tested without
 * standing up NextAuth. Fail-CLOSED: a blank email — or a thrown DB error,
 * which Auth.js also turns into AccessDenied — denies. An uninvited stranger
 * must never be able to mint a tenant by tripping the lookup.
 */
export async function isOAuthSignInAllowed(
  rawEmail: string | null | undefined,
): Promise<boolean> {
  // Self-serve enabled (non-production): preserve the original behavior —
  // OAuth first-login self-provisions a tenant, so the sign-in is allowed.
  if (SELF_SERVE_SIGNUP_ENABLED) return true;

  const email = (rawEmail ?? "").toLowerCase().trim();
  if (!email) return false;

  // Returning user: an auth account already exists for this email. (When the
  // OAuth account is already linked Auth.js hands us the persisted user; when
  // a same-email credentials account exists but isn't linked, Auth.js
  // short-circuits with OAuthAccountNotLinked before we're consulted. So this
  // lookup is the authoritative "is this already a real account?" check.)
  const [existing] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .limit(1);
  if (existing) return true;

  // Invited net-new user: a pending, unexpired invitation for this exact
  // address. Mirrors the email match resolveUserTenant uses to attach the new
  // user to the inviting tenant (so the OAuth and password invite paths agree).
  const [invite] = await db
    .select({
      status: pendingInvites.status,
      expiresAt: pendingInvites.expiresAt,
    })
    .from(pendingInvites)
    .where(
      and(
        eq(pendingInvites.email, email),
        eq(pendingInvites.status, "pending"),
      ),
    )
    .orderBy(desc(pendingInvites.createdAt))
    .limit(1);
  if (invite && invite.expiresAt.getTime() > Date.now()) return true;

  // No account, no invitation → invitation-only: refuse to self-provision.
  return false;
}
