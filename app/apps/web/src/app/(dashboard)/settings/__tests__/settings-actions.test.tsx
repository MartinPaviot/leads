// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-14 — the /settings/* cluster. Each settings sub-page is its own route and
 * registers EXACTLY ONE safe-config page action when mounted. This file mounts
 * each page on its own (the registry is reset between cases), proves the single
 * action it contributes, its metadata (all confirm:risky / mutating:true), the
 * one fetch URL+body each run issues, and off-page degradation after unmount.
 * The security/money boundary itself is frozen in the sibling boundary test.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings",
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));
// Not used by these five pages, but mocked defensively (CLE-14 spec) so a
// transitive import never reaches the real implementation at mount.
vi.mock("@/hooks/use-custom-fields", () => ({
  usePipelineStages: () => ({ stages: [], loading: false }),
  useCustomFields: () => ({ fields: [], loading: false }),
}));

import AutonomySettingsPage from "@/app/(dashboard)/settings/autonomy/page";
import NotificationsSettingsPage from "@/app/(dashboard)/settings/notifications/page";
import StagesSettingsPage from "@/app/(dashboard)/settings/stages/page";
import CustomSignalsPage from "@/app/(dashboard)/settings/signals/page";
import WorkspaceSettingsPage from "@/app/(dashboard)/settings/workspace/page";
import {
  getActionManifest,
  runRegisteredAction,
  __resetPageActionsForTest,
} from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

const FIXTURE_WORKSPACE = {
  name: "Acme",
  companyDomains: ["acme.com"],
  logoUrl: null,
  agentApprovalMode: "review-each",
};
const FIXTURE_SENDING = {
  mode: "primary-with-caps",
  sendingDailyCapPrimary: 50,
  sendingAllowColdOnPrimary: false,
  providers: { instantly: { connected: false } },
  pendingManagedRequest: null,
};
const FIXTURE_AUTONOMY = {
  config: {
    level: "copilot",
    permissions: {},
    guardrails: { maxEmailsPerDay: 40, maxNewProspectsPerWeek: 25, maxEmailsPerProspect: 5, neverContact: [] },
    brand: {},
  },
  trustScore: { overall: 50, trend: "stable", actionsCount: 0, approvalsWithoutEdit: 0, rejections: 0, suggestedLevel: "copilot", readyForUpgrade: false, shouldDowngrade: false },
  thresholds: null,
};
const FIXTURE_NOTIF_PREFS = {
  emailEnabled: true,
  inAppEnabled: true,
  preferences: {
    deal_risk: { email: true, inApp: true, slack: false },
    deal_won: { email: true, inApp: true, slack: false },
  },
  slackWebhook: "",
};
const FIXTURE_STAGES = {
  stages: [
    { id: "lead", name: "Lead", description: "", category: "in_progress", aiFillMode: "suggest" },
    { id: "won", name: "Won", description: "", category: "done", aiFillMode: "off" },
  ],
};
const FIXTURE_SIGNALS = { signals: [] };

let fetchMock: ReturnType<typeof vi.fn>;

function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u === "/api/settings/workspace" && method === "GET") return jsonRes(FIXTURE_WORKSPACE);
  if (u === "/api/settings/workspace" && method === "PUT") return jsonRes({ success: true });
  if (u === "/api/settings/sending-infra") return jsonRes(FIXTURE_SENDING);
  if (u === "/api/settings/autonomy" && method === "GET") return jsonRes(FIXTURE_AUTONOMY);
  if (u === "/api/settings/autonomy" && method === "PUT") return jsonRes({ config: FIXTURE_AUTONOMY.config, trustScore: 50, levelChangeApplied: true });
  if (u === "/api/notifications/preferences" && method === "GET") return jsonRes(FIXTURE_NOTIF_PREFS);
  if (u === "/api/notifications/preferences" && method === "PUT") return jsonRes({ success: true });
  if (u === "/api/settings/stages" && method === "GET") return jsonRes(FIXTURE_STAGES);
  if (u === "/api/settings/stages" && method === "PUT") return jsonRes({ success: true });
  if (u === "/api/custom-signals" && method === "GET") return jsonRes(FIXTURE_SIGNALS);
  if (u === "/api/custom-signals" && method === "POST") return jsonRes({ signal: { id: "sig1" } });
  return jsonRes({});
}

function installFetch() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
}

// crypto.randomUUID is used by the stages page (addStage + the action's
// normalisation). happy-dom provides it; ensure it exists without going through
// vi.stubGlobal (whose unstub can leave crypto undefined for later tests).
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => "uuid-" + Math.random().toString(36).slice(2) },
    configurable: true,
  });
}

beforeEach(() => {
  __resetPageActionsForTest();
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function callsTo(url: string | RegExp, method = "GET") {
  return fetchMock.mock.calls.filter((c) => {
    const u = String(c[0]);
    const m = c[1]?.method ?? "GET";
    const match = typeof url === "string" ? u === url : url.test(u);
    return match && m === method;
  });
}
function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse(((call[1] as RequestInit)?.body as string) || "{}");
}
/** Settle pending state/effects once. A single act-wrapped microtask tick is
 *  enough here (and, unlike a tight setTimeout(0) loop, doesn't wedge happy-dom
 *  across the suite). */
async function settle() {
  await act(async () => { await Promise.resolve(); });
}

async function mountAndWait(Comp: React.ComponentType, id: string) {
  render(<Comp />);
  await waitFor(() => {
    expect(getActionManifest().map((a) => a.id)).toContain(id);
  }, { timeout: 8000 });
}

/* ── per-page manifest membership: each registers exactly its one id ── */

describe("CLE-14 /settings — per-page single-action membership", () => {
  it("autonomy -> only settings.setAutonomyLevel", async () => {
    await mountAndWait(AutonomySettingsPage, "settings.setAutonomyLevel");
    expect(getActionManifest().map((a) => a.id)).toEqual(["settings.setAutonomyLevel"]);
  });
  it("notifications -> only settings.updateNotificationPrefs", async () => {
    await mountAndWait(NotificationsSettingsPage, "settings.updateNotificationPrefs");
    expect(getActionManifest().map((a) => a.id)).toEqual(["settings.updateNotificationPrefs"]);
  });
  it("stages -> only settings.editPipelineStages", async () => {
    await mountAndWait(StagesSettingsPage, "settings.editPipelineStages");
    expect(getActionManifest().map((a) => a.id)).toEqual(["settings.editPipelineStages"]);
  });
  it("signals -> only settings.addSignal", async () => {
    await mountAndWait(CustomSignalsPage, "settings.addSignal");
    expect(getActionManifest().map((a) => a.id)).toEqual(["settings.addSignal"]);
  });
  it("workspace -> only settings.updateWorkspaceName", async () => {
    await mountAndWait(WorkspaceSettingsPage, "settings.updateWorkspaceName");
    expect(getActionManifest().map((a) => a.id)).toEqual(["settings.updateWorkspaceName"]);
  });
});

/* ── metadata: every settings action is a risky, mutating, free config write ── */

describe("CLE-14 /settings — action metadata", () => {
  const cases: Array<[string, React.ComponentType]> = [
    ["settings.setAutonomyLevel", AutonomySettingsPage],
    ["settings.updateNotificationPrefs", NotificationsSettingsPage],
    ["settings.editPipelineStages", StagesSettingsPage],
    ["settings.addSignal", CustomSignalsPage],
    ["settings.updateWorkspaceName", WorkspaceSettingsPage],
  ];
  for (const [id, Comp] of cases) {
    it(`${id} is mutating:true, reversible:true, cost:free, confirm:risky, not outbound`, async () => {
      await mountAndWait(Comp, id);
      const a = getActionManifest().find((m) => m.id === id)!;
      expect(a.mutating).toBe(true);
      expect(a.reversible).toBe(true);
      expect(a.cost).toBe("free");
      expect(a.confirm).toBe("risky");
      expect(a.outbound).toBe(false);
    });
  }
});

/* ── each run -> the correct fetch URL + body ── */

describe("CLE-14 /settings — setAutonomyLevel (PUT /api/settings/autonomy {level})", () => {
  it("PUTs the chosen level; bad enum -> invalid_params, no PUT", async () => {
    await mountAndWait(AutonomySettingsPage, "settings.setAutonomyLevel");
    const r = await runRegisteredAction("settings.setAutonomyLevel", { level: "autonomous" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("autonomous");
    const put = callsTo("/api/settings/autonomy", "PUT");
    expect(put.length).toBe(1);
    expect(bodyOf(put[0])).toEqual({ level: "autonomous" });

    const bad = await runRegisteredAction("settings.setAutonomyLevel", { level: "yolo" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("invalid_params");
    expect(callsTo("/api/settings/autonomy", "PUT").length).toBe(1); // unchanged
  });

  it("server reject -> ok:false (rolled back)", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/settings/autonomy" && (init?.method ?? "GET") === "PUT") {
        return Promise.resolve(jsonRes({ error: "Trust score must be >= 80 to enable strategic mode" }, false, 403));
      }
      return Promise.resolve(router(url, init));
    });
    await mountAndWait(AutonomySettingsPage, "settings.setAutonomyLevel");
    const r = await runRegisteredAction("settings.setAutonomyLevel", { level: "strategic" });
    expect(r.ok).toBe(false);
  });
});

describe("CLE-14 /settings — updateNotificationPrefs (PUT /api/notifications/preferences)", () => {
  it("PUTs the full preferences map with the one flipped channel", async () => {
    await mountAndWait(NotificationsSettingsPage, "settings.updateNotificationPrefs");
    const r = await runRegisteredAction("settings.updateNotificationPrefs", {
      key: "deal_risk", channel: "email", enabled: false,
    });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Disabled");
    expect(r.summary).toContain("deal_risk");
    const put = callsTo("/api/notifications/preferences", "PUT");
    expect(put.length).toBe(1);
    const body = bodyOf(put[0]) as { preferences: Record<string, { email: boolean }> };
    expect(body.preferences.deal_risk.email).toBe(false);

    const bad = await runRegisteredAction("settings.updateNotificationPrefs", {
      key: "ghost_key", channel: "email", enabled: true,
    });
    expect(bad.ok).toBe(false);
    expect(callsTo("/api/notifications/preferences", "PUT").length).toBe(1); // unchanged
  });

  it("bad channel -> invalid_params, no PUT", async () => {
    await mountAndWait(NotificationsSettingsPage, "settings.updateNotificationPrefs");
    const before = callsTo("/api/notifications/preferences", "PUT").length;
    const bad = await runRegisteredAction("settings.updateNotificationPrefs", {
      key: "deal_risk", channel: "sms", enabled: true,
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("invalid_params");
    expect(callsTo("/api/notifications/preferences", "PUT").length).toBe(before);
  });
});

describe("CLE-14 /settings — editPipelineStages (PUT /api/settings/stages {stages})", () => {
  it("PUTs the whole list; reports the count", async () => {
    await mountAndWait(StagesSettingsPage, "settings.editPipelineStages");
    const r = await runRegisteredAction("settings.editPipelineStages", {
      stages: [
        { id: "lead", name: "Lead", category: "in_progress" },
        { name: "Qualified", category: "in_progress", aiFillMode: "auto", wipLimit: 5 },
        { id: "won", name: "Won", category: "done" },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("3 stages");
    const put = callsTo("/api/settings/stages", "PUT");
    expect(put.length).toBe(1);
    const body = bodyOf(put[0]) as { stages: Array<{ name: string }> };
    expect(body.stages.length).toBe(3);
    expect(body.stages.map((s) => s.name)).toEqual(["Lead", "Qualified", "Won"]);

    const empty = await runRegisteredAction("settings.editPipelineStages", { stages: [] });
    expect(empty.ok).toBe(false);
    expect(empty.error).toBe("invalid_params"); // .min(1) rejects before run
    expect(callsTo("/api/settings/stages", "PUT").length).toBe(1); // unchanged
  });
});

describe("CLE-14 /settings — addSignal (POST /api/custom-signals)", () => {
  it("POSTs name+description; trims; says 'Added'", async () => {
    await mountAndWait(CustomSignalsPage, "settings.addSignal");
    const r = await runRegisteredAction("settings.addSignal", {
      name: "  SOC2  ", description: "  Mentions a SOC 2 report on the trust page  ",
    });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain('"SOC2"');
    const post = callsTo("/api/custom-signals", "POST");
    expect(post.length).toBe(1);
    expect(bodyOf(post[0])).toEqual({ name: "SOC2", description: "Mentions a SOC 2 report on the trust page" });

    const bad = await runRegisteredAction("settings.addSignal", { name: "x", description: "" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("invalid_params"); // empty description rejected before run
    expect(callsTo("/api/custom-signals", "POST").length).toBe(1); // unchanged
  });
});

describe("CLE-14 /settings — updateWorkspaceName (PUT /api/settings/workspace {name})", () => {
  it("PUTs the trimmed name; says 'renamed'", async () => {
    await mountAndWait(WorkspaceSettingsPage, "settings.updateWorkspaceName");
    const r = await runRegisteredAction("settings.updateWorkspaceName", { name: "  Globex  " });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain('"Globex"');
    const put = callsTo("/api/settings/workspace", "PUT");
    expect(put.length).toBe(1);
    expect(bodyOf(put[0])).toEqual({ name: "Globex" });

    const blank = await runRegisteredAction("settings.updateWorkspaceName", { name: "   " });
    expect(blank.ok).toBe(false);
    expect(callsTo("/api/settings/workspace", "PUT").length).toBe(1); // unchanged
  });
});

/* ── off-page degradation: after unmount the id is gone + run refuses ── */

describe("CLE-14 /settings — off-page degradation", () => {
  const cases: Array<[string, React.ComponentType]> = [
    ["settings.setAutonomyLevel", AutonomySettingsPage],
    ["settings.updateNotificationPrefs", NotificationsSettingsPage],
    ["settings.editPipelineStages", StagesSettingsPage],
    ["settings.addSignal", CustomSignalsPage],
    ["settings.updateWorkspaceName", WorkspaceSettingsPage],
  ];
  for (const [id, Comp] of cases) {
    it(`after unmount ${id} is unregistered and runs refuse`, async () => {
      await mountAndWait(Comp, id);
      cleanup();
      await settle();
      expect(getActionManifest().map((a) => a.id)).not.toContain(id);
      const r = await runRegisteredAction(id, {});
      expect(r.ok).toBe(false);
      expect(r.error).toBe("action_not_registered");
    });
  }
});
