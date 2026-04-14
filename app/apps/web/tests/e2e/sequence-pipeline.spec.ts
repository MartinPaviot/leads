import { test } from "@playwright/test";

/**
 * BUGFIX-04 T11 — sequence pipeline full e2e.
 *
 * SKIPPED until test infra is extended:
 *   - Need Inngest dev server running alongside Next.js during the
 *     test run so sendSequenceStep actually fires.
 *   - Need Resend test mode so outboundEmails rows flip from `queued`
 *     to `sent` (otherwise we can't assert delivery).
 *   - Need an /api/_test/inject-reply helper that simulates an
 *     inbound email reply via EmailEngine webhook payload so we can
 *     assert the enrollment flips to `replied`.
 *
 * Happy-path script the test will drive once that exists:
 *   1. seed(admin) + login
 *   2. POST /api/sequences with 2 steps, delayDays 0
 *   3. POST /api/sequences/:id/enroll with a test contact
 *   4. Tick 4 minutes (or call the cron endpoint directly)
 *   5. Poll /api/sequences/:id/analytics: expect emails.sent === 2
 *   6. POST /api/_test/inject-reply for step 1
 *   7. Poll analytics: expect enrollment.replied === 1
 */
test.describe("sequence-pipeline", () => {
  test.skip("2-step sequence sends both emails, reply pauses enrollment", async () => {
    // Blocked on Inngest dev + Resend test mode + reply injector.
  });
});
