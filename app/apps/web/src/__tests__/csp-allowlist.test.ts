/**
 * Audit-2026-05-08 L2 regression — F16 CSP allowlist.
 *
 * Pins the contract that the production Content-Security-Policy
 * allows the PostHog EU ingest + asset hosts the SDK depends on.
 *
 * Background : the H10 + H11 hardening moved `connect-src` from a
 * permissive `https:` blanket to an explicit allowlist of vendor
 * hosts. The PostHog rollout in commits 36deb11 / ac1d20a / 9184505
 * wired autocapture, session replay, identify, and three typed
 * events ; without the matching CSP entry every fetch to
 * `eu.i.posthog.com` would have been silently dropped by the
 * browser in production. fetches that fail CSP throw silently
 * server-side ; the page console emits a single line nobody reads.
 * The fix landed at f484f98.
 *
 * If a future header-hardening pass deletes either entry, this
 * test fires before the change merges.
 *
 * We grep the source rather than load the config module : the
 * config wraps in `withSentryConfig` and pulls heavy deps that
 * complicate the test surface. The contract we pin is "these exact
 * strings appear in next.config.ts" — text scan is sufficient.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NEXT_CONFIG_PATH = join(__dirname, "..", "..", "next.config.ts");

describe("F16 — CSP allowlist guards production analytics", () => {
  const config = readFileSync(NEXT_CONFIG_PATH, "utf8");

  it("connect-src allowlist contains the PostHog EU ingest host", () => {
    expect(config).toContain('"https://eu.i.posthog.com"');
  });

  it("connect-src allowlist contains the PostHog EU asset host", () => {
    expect(config).toContain('"https://eu-assets.i.posthog.com"');
  });

  it("script-src directive allows the asset host (replay bundle)", () => {
    // The replay worker is dynamically imported by posthog-js after
    // init ; without this on script-src the lazy-load is blocked.
    const scriptSrcLine = config
      .split("\n")
      .find((line) => line.includes("script-src 'self'"));
    expect(scriptSrcLine).toBeDefined();
    expect(scriptSrcLine!).toContain("https://eu-assets.i.posthog.com");
  });

  it("the connect-src array is the explicit allowlist (not the legacy 'https:' blanket)", () => {
    // If somebody reverts H10/H11 and the config goes back to
    // `connect-src 'self' https:` we want the test to flag it —
    // not because the blanket is *wrong* (PostHog would still
    // work), but because the security posture would have silently
    // regressed without a corresponding spec change.
    expect(config).toContain("const connectSrc = [");
    expect(config).toContain("'self'");
  });
});
