import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: vi.fn() },
}));

vi.mock("@/db/schema", () => ({
  notificationPreferences: { userId: "userId" },
  tenants: { id: "id", settings: "settings" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const route = await import("@/app/api/notifications/preferences/route");

// GET issues two queries in a Promise.all, each ending in `.limit(1)`:
//   1. notificationPreferences (per-user)
//   2. tenants.settings (tenant-level, carries the Slack webhook)
// The chain shares one cursor; results are consumed in construction order.
function makeChain(results: unknown[]) {
  let i = 0;
  const chain: Record<string, any> = {};
  const resolve = () => {
    const r = results[i] ?? [];
    i++;
    return Promise.resolve(r);
  };
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => resolve());
  chain.then = (cb: any) => resolve().then(cb);
  return chain;
}

describe("GET /api/notifications/preferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await route.GET();
    expect(res.status).toBe(401);
  });

  it("returns the tenant's stored Slack webhook so it re-hydrates after reload", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    vi.mocked(db.select).mockReturnValue(makeChain([
      [{ emailEnabled: true, inAppEnabled: false, preferences: { deal_won: { email: true, inApp: true } } }], // prefs
      [{ settings: { slackWebhookUrl: "https://hooks.slack.com/services/T/B/X" } }], // tenant
    ]) as never);

    const res = await route.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.slackWebhook).toBe("https://hooks.slack.com/services/T/B/X");
    expect(data.emailEnabled).toBe(true);
  });

  it("returns slackWebhook=null when none is stored (defaults branch)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    vi.mocked(db.select).mockReturnValue(makeChain([
      [], // no prefs row -> defaults branch
      [{ settings: {} }], // tenant, no webhook
    ]) as never);

    const res = await route.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.preferences.deal_risk).toBeTruthy(); // defaults branch fired
    expect(data.slackWebhook).toBeNull();
  });
});
