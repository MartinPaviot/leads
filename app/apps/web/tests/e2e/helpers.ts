import { expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Shared helpers for E2E tests: seeding tenant/user fixtures via
 * /api/test-e2e/seed, logging in via the Credentials provider, and
 * cleaning up via /api/test-e2e/cleanup.
 *
 * All helpers assume ENABLE_E2E_SEED=1 is set on the running web
 * server — Playwright's webServer block in playwright.config.ts
 * injects it automatically.
 */

export interface SeededUser {
  tenantId: string;
  authUserId: string;
  appUserId: string;
  email: string;
  password: string;
  role: "admin" | "member";
  /** Present only when `seedCompany: true` was passed to the seed call. */
  companyId?: string;
}

export async function seedUser(
  request: APIRequestContext,
  opts: {
    tenantSlug: string;
    role?: "admin" | "member";
    email?: string;
    password?: string;
    tenantName?: string;
    /** WS-0 — when true, seed one dummy company so dashboard summary
     * reports totalAccounts >= 1 without running Apollo/TAM. */
    seedCompany?: boolean;
  }
): Promise<SeededUser> {
  const res = await request.post("/api/test-e2e/seed", { data: opts });
  if (!res.ok()) {
    throw new Error(`seedUser failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as SeededUser;
}

export async function cleanupTenant(
  request: APIRequestContext,
  tenantId: string,
  emailPrefix?: string
): Promise<void> {
  const res = await request.post("/api/test-e2e/cleanup", {
    data: { tenantId, emailPrefix },
  });
  if (!res.ok()) {
    console.warn(`cleanupTenant warning: ${res.status()} ${await res.text()}`);
  }
}

/**
 * Drive the /sign-in Credentials form. Leaves the page at /home on
 * success (or wherever NextAuth redirects to).
 */
export async function loginAs(page: Page, user: SeededUser): Promise<void> {
  // Drive the NextAuth CSRF-protected credentials endpoint directly
  // rather than the server-action form. The form path goes through a
  // server action that occasionally crashes the Turbopack dev server
  // mid-request on Windows; the HTTP POST path is the same server
  // under the hood but doesn't kill the long-lived SSR session, so
  // subsequent navigations succeed.
  const csrfRes = await page.request.get("/api/auth/csrf");
  if (!csrfRes.ok()) {
    throw new Error(`loginAs: CSRF fetch failed: ${csrfRes.status()}`);
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const loginRes = await page.request.post("/api/auth/callback/credentials", {
    form: {
      email: user.email,
      password: user.password,
      csrfToken,
      callbackUrl: "/home",
      json: "true",
    },
    maxRedirects: 0,
  });
  // NextAuth responds 200/302 on success with Set-Cookie containing
  // the session token.
  if (![200, 302].includes(loginRes.status())) {
    throw new Error(
      `loginAs: credentials callback returned ${loginRes.status()}: ${await loginRes.text()}`
    );
  }

  // Verify the session cookie was actually set. If NextAuth rejected
  // the credentials it returns 302 with no session cookie.
  const cookies = await page.context().cookies();
  const hasAuthCookie = cookies.some((c) =>
    /authjs.session-token|next-auth.session-token/.test(c.name)
  );
  expect(hasAuthCookie, "expected a session cookie after credentials login").toBe(true);
}

/**
 * Convenience: seed + login in one step. Caller is responsible for
 * calling cleanupTenant() in afterEach / afterAll.
 */
export async function seedAndLogin(
  request: APIRequestContext,
  page: Page,
  opts: Parameters<typeof seedUser>[1]
): Promise<SeededUser> {
  const user = await seedUser(request, opts);
  await loginAs(page, user);
  return user;
}
