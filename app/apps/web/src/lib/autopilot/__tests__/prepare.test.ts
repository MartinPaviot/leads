import { describe, it, expect, vi, beforeEach } from "vitest";

const buildIntelligenceBrief = vi.fn();
const generateCopyMessage = vi.fn();
vi.mock("@/lib/campaign-engine/build-intelligence-brief", () => ({ buildIntelligenceBrief: (...a: unknown[]) => buildIntelligenceBrief(...a) }));
vi.mock("@/lib/copy/personalization/db-shadow", () => ({ generateCopyMessage: (...a: unknown[]) => generateCopyMessage(...a) }));

import { prepareProspect } from "../prepare";

beforeEach(() => {
  buildIntelligenceBrief.mockClear();
  generateCopyMessage.mockReset();
  generateCopyMessage.mockResolvedValue({ ran: true, message: { personalization_level: "high" }, evidenceCount: 2 });
});

describe("prepareProspect", () => {
  it("default (no forceRefresh): does NOT scrape, just generates (brief is built cached inside generateCopyMessage)", async () => {
    const out = await prepareProspect("t1", "c1", "co1");
    expect(buildIntelligenceBrief).not.toHaveBeenCalled();
    expect(generateCopyMessage).toHaveBeenCalledWith("c1", "t1", { lang: undefined });
    expect(out).toMatchObject({ ran: true, message: { personalization_level: "high" } });
  });

  it("forceRefresh: scrapes a fresh brief FIRST, then generates", async () => {
    const order: string[] = [];
    buildIntelligenceBrief.mockImplementation(async () => { order.push("brief"); return {}; });
    generateCopyMessage.mockImplementation(async () => { order.push("copy"); return { ran: true, message: {}, evidenceCount: 1 }; });
    await prepareProspect("t1", "c1", "co1", { forceRefresh: true, lang: "fr" });
    expect(buildIntelligenceBrief).toHaveBeenCalledWith("co1", "t1", "c1", { forceRefresh: true });
    expect(generateCopyMessage).toHaveBeenCalledWith("c1", "t1", { lang: "fr" });
    expect(order).toEqual(["brief", "copy"]); // refresh before generate
  });

  it("passes the copy outcome through unchanged — incl. a low-personalization fallback (never-invent)", async () => {
    generateCopyMessage.mockResolvedValue({ ran: true, message: { personalization_level: "low", flags: ["no-evidence"] }, evidenceCount: 0 });
    expect(await prepareProspect("t1", "c1", "co1")).toMatchObject({ ran: true, message: { personalization_level: "low" } });
  });

  it("passes a no-context result through (ran:false)", async () => {
    generateCopyMessage.mockResolvedValue({ ran: false, reason: "no_prospect_context" });
    expect(await prepareProspect("t1", "c1", "co1")).toEqual({ ran: false, reason: "no_prospect_context" });
  });
});
