// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

/**
 * Settings IA — the retired /settings/inbox-notifications page (per-event opt-in +
 * digest cadence + quiet hours) folds into the single Notifications page as an
 * "Inbox" section. This proves the fold-in: the section LOADS from
 * /api/inbox/notifications and auto-saves changes back to the same endpoint —
 * so no inbox-notification config is lost when that page becomes a redirect.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/settings/notifications",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import NotificationsSettingsPage from "@/app/(dashboard)/settings/notifications/page";
import { __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

const FIXTURE_GENERAL = { preferences: {}, slackWebhook: "" };
const FIXTURE_INBOX = {
  events: [
    { id: "reply", label: "New reply", description: "A prospect replied.", default: true },
    { id: "mention", label: "You're mentioned", description: "Someone mentioned you.", default: false },
  ],
  prefs: { events: {}, digest: "morning", dndStart: null, dndEnd: null },
};

let fetchMock: ReturnType<typeof vi.fn>;
function jsonRes(data: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}
function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const m = init?.method ?? "GET";
  if (u === "/api/notifications/preferences") return jsonRes(FIXTURE_GENERAL);
  if (u === "/api/inbox/notifications" && m === "GET") return jsonRes(FIXTURE_INBOX);
  if (u === "/api/inbox/notifications" && m === "PUT") return jsonRes({ prefs: FIXTURE_INBOX.prefs });
  return jsonRes({});
}
function bodyOf(call: unknown[]) {
  return JSON.parse(((call[1] as RequestInit)?.body as string) || "{}");
}
function callsTo(url: string, method: string) {
  return fetchMock.mock.calls.filter((c) => String(c[0]) === url && (c[1]?.method ?? "GET") === method);
}

beforeEach(() => {
  __resetPageActionsForTest();
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Notifications — folded-in inbox section", () => {
  it("renders the Inbox section loaded from /api/inbox/notifications", async () => {
    render(<NotificationsSettingsPage />);
    await waitFor(() => expect(screen.getByText("Do not disturb")).toBeTruthy(), { timeout: 8000 });
    expect(screen.getByText("New reply")).toBeTruthy();
    expect(screen.getByText("You're mentioned")).toBeTruthy();
  });

  it("auto-saves a digest change to /api/inbox/notifications (not the general endpoint)", async () => {
    render(<NotificationsSettingsPage />);
    await waitFor(() => expect(screen.getByText("Do not disturb")).toBeTruthy(), { timeout: 8000 });

    fireEvent.click(screen.getByRole("button", { name: /Morning \+ evening/i }));

    await waitFor(() => expect(callsTo("/api/inbox/notifications", "PUT").length).toBe(1));
    expect(bodyOf(callsTo("/api/inbox/notifications", "PUT")[0]).digest).toBe("morning_evening");
    // the inbox change must NOT leak into the general preferences endpoint
    expect(callsTo("/api/notifications/preferences", "PUT").length).toBe(0);
  });
});
