import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, authUsers, tenants, users } from "@/db/schema";
import { hashPassword } from "@/lib/password-hash";

/**
 * E2E-only seed endpoint.
 *
 * Gated on `NODE_ENV !== "production"`. Any production build
 * (Vercel, `next build && next start`) sets NODE_ENV=production, so
 * the endpoint returns 404 in prod. Dev/e2e runs with
 * NODE_ENV=development and the gate is open.
 *
 * POST body: {
 *   tenantSlug: string,          // caller-chosen prefix, e.g. "e2e-mail-cal"
 *   email?: string,              // defaults to `${tenantSlug}-${ts}@example.com`
 *   password?: string,           // defaults to "test-password-1234"
 *   role?: "admin" | "member",   // defaults to "member"
 *   tenantName?: string,
 * }
 *
 * Response: { tenantId, authUserId, appUserId, email, password, role }
 *
 * Cleanup is in ../cleanup — DELETE with the tenantId wipes every
 * tenant-scoped row + the auth user + auth account.
 */
export async function POST(req: Request) {
  // M5 — dual gate. `NODE_ENV` alone is too easy to get wrong on a
  // preview deploy (staging builds where NODE_ENV defaults to
  // "development" would have left this endpoint wide open, including
  // `role: "admin"` impersonation). The canonical gate now is the
  // explicit `ENABLE_E2E_SEED=1` env var — only set on the CI
  // pipeline that runs our Playwright suite. The NODE_ENV check
  // stays as a belt-and-braces second wall.
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_E2E_SEED !== "1"
  ) {
    return NextResponse.json({ error: "Seed endpoint disabled" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tenantSlug?: string;
    email?: string;
    password?: string;
    role?: "admin" | "member";
    tenantName?: string;
  };

  const slug = body.tenantSlug || "e2e";
  const ts = Date.now();
  const email = body.email || `${slug}-${ts}@example.test`;
  const password = body.password || "test-password-1234";
  const role = body.role === "admin" ? "admin" : "member";
  const tenantName = body.tenantName || `E2E ${slug} ${ts}`;

  try {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: tenantName })
      .returning();

    const [authUser] = await db
      .insert(authUsers)
      .values({ email, name: `${slug} user` })
      .returning();

    const hash = await hashPassword(password);
    // H12 — e2e mirrors real sign-up: password_hash on authUsers,
    // empty credentials row on authAccounts for provider binding.
    await db
      .update(authUsers)
      .set({ passwordHash: hash })
      .where(eq(authUsers.id, authUser.id));
    await db.insert(authAccounts).values({
      userId: authUser.id,
      // `credentials` isn't in AdapterAccountType's union, but the
      // DrizzleAdapter stores arbitrary strings here. The existing
      // credentials sign-in path reads provider === "credentials"
      // at runtime (src/auth.ts), so the cast is safe.
      type: "credentials" as unknown as "oauth",
      provider: "credentials",
      providerAccountId: authUser.id,
    });

    const [appUser] = await db
      .insert(users)
      .values({
        clerkId: authUser.id,
        tenantId: tenant.id,
        email,
        role,
      })
      .returning();

    return NextResponse.json({
      tenantId: tenant.id,
      authUserId: authUser.id,
      appUserId: appUser.id,
      email,
      password,
      role,
    });
  } catch (err) {
    // Route is dev/e2e-only so leaking `err` isn't a prod risk, but
    // we keep the response shape consistent with other routes — log
    // the detail server-side, return a generic message.
    console.error("_test/seed: failed", err);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
