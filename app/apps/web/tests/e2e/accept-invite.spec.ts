import { test } from "@playwright/test";

/**
 * BUGFIX-02 T8+T9 — accept-invite + sign-up consume token.
 *
 * SKIPPED until test infra is extended:
 *   - Need a test-mode Resend that captures the outgoing invite email
 *     (subject + body with token URL) without actually delivering.
 *   - Need the RESEND_API_KEY env plumbed into the Playwright webServer
 *     env block and a programmatic "drain captured emails" helper.
 *
 * Happy-path script the test will drive once that exists:
 *   1. seed(admin) + login, POST /api/settings/members/invite
 *   2. Read captured invite token from Resend test inbox
 *   3. Logout → visit /accept-invite?token=... → redirect /sign-up?invite=...
 *   4. Fill sign-up form with a known password
 *   5. Assert post-signup: user lands on /home, authCtx.tenantId matches
 *      the admin's tenant, authCtx.role matches the invite.role
 */
test.describe("accept-invite", () => {
  test.skip("admin invite → email → accept → new member joins tenant", async () => {
    // Blocked on Resend capture infra.
  });
});
