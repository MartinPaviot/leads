// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-14 — the REQUIRED boundary test for the /sequences cluster.
 *
 * The campaign wizard registers EXACTLY ONE page action while mounted —
 * sequences.wizardAdvance (step navigation only). Its send-bearing handlers
 * (approveAll / launchCampaign) are NEVER registered: the agent prepares and
 * navigates, the human approves and launches (README §2). The frozen
 * SEQUENCES_WIZARD_EXCLUDED_IDS is asserted disjoint from what is registered,
 * with a substring sweep that allows only the one legitimate "launch" id —
 * sequences.launch (which lives on the DETAIL page, not the wizard).
 */

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { CampaignWizard, SEQUENCES_WIZARD_EXCLUDED_IDS } from "@/components/campaign-wizard";
import {
  getActionManifest,
  __resetPageActionsForTest,
} from "@/lib/chat/page-actions/registry";

async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => {
  __resetPageActionsForTest();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" } as Response)));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CLE-14 wizard boundary — excluded set is frozen + disjoint", () => {
  it("the wizard registers ONLY sequences.wizardAdvance", async () => {
    render(React.createElement(CampaignWizard, { onClose: () => {}, onComplete: () => {} }));
    await waitFor(() => expect(getActionManifest().map((a) => a.id)).toContain("sequences.wizardAdvance"));
    await flush();
    const wizardIds = getActionManifest().map((a) => a.id);
    expect(wizardIds).toEqual(["sequences.wizardAdvance"]);
    // wizardAdvance is a pure navigation: not mutating, never confirm.
    const adv = getActionManifest().find((a) => a.id === "sequences.wizardAdvance")!;
    expect(adv.mutating).toBe(false);
    expect(adv.outbound).toBe(false);
    expect(adv.confirm).toBe("never");
  });

  it("the registered wizard id set is disjoint from SEQUENCES_WIZARD_EXCLUDED_IDS", async () => {
    render(React.createElement(CampaignWizard, { onClose: () => {}, onComplete: () => {} }));
    await waitFor(() => expect(getActionManifest().map((a) => a.id)).toContain("sequences.wizardAdvance"));
    await flush();
    const ids = getActionManifest().map((a) => a.id);
    for (const banned of SEQUENCES_WIZARD_EXCLUDED_IDS) {
      expect(ids).not.toContain(banned);
    }
    expect(SEQUENCES_WIZARD_EXCLUDED_IDS.filter((b) => (ids as string[]).includes(b))).toEqual([]);
  });

  it("the excluded set names the send-bearing verbs (frozen content)", () => {
    expect([...SEQUENCES_WIZARD_EXCLUDED_IDS]).toEqual([
      "sequences.wizardApproveAll",
      "sequences.wizardLaunch",
      "sequences.wizardSend",
    ]);
    // The excluded set must NOT contain "launch"-via-wizard masquerading as a
    // safe id — every excluded id references an explicitly send-bearing verb.
    const lowered = SEQUENCES_WIZARD_EXCLUDED_IDS.map((s) => s.toLowerCase());
    expect(lowered.some((s) => s.includes("approveall"))).toBe(true);
    expect(lowered.some((s) => s.includes("wizardlaunch"))).toBe(true);
    expect(lowered.some((s) => s.includes("send"))).toBe(true);
  });

  it("substring sweep: no registered wizard id mentions a send-bearing verb", async () => {
    render(React.createElement(CampaignWizard, { onClose: () => {}, onComplete: () => {} }));
    await waitFor(() => expect(getActionManifest().map((a) => a.id)).toContain("sequences.wizardAdvance"));
    await flush();
    const ids = getActionManifest().map((a) => a.id);
    // The wizard must never expose approve-all / launch / send. NOTE: the only
    // legitimate "launch" id in the whole cluster is sequences.launch on the
    // DETAIL page — it is NOT a wizard id, so the wizard set must be free of
    // "launch" entirely.
    const FORBIDDEN = ["approveall", "wizardlaunch", "send", "launch"];
    for (const id of ids) {
      const lower = id.toLowerCase();
      for (const bad of FORBIDDEN) {
        expect(lower.includes(bad), `wizard id "${id}" must not contain "${bad}"`).toBe(false);
      }
    }
    // No wizard action declares cost:"money".
    expect(getActionManifest().some((a) => a.cost === "money")).toBe(false);
  });
});
