import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const embedEntity = vi.fn().mockResolvedValue(undefined);
const ingestEpisode = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/ai/embeddings", () => ({ embedEntity: (...a: unknown[]) => embedEntity(...a) }));
vi.mock("@/lib/ai/context-graph", () => ({ ingestEpisode: (...a: unknown[]) => ingestEpisode(...a) }));

import { captureInboundEmailToBrain } from "../inbound-email-brain";

const base = {
  tenantId: "t1",
  entityType: "contact" as const,
  entityId: "c1",
  fromHeader: "Jane <jane@acme.com>",
  subject: "Re: proposal",
  text: "Yes, we are good to go — send the contract.",
  messageId: "m1",
  occurredAt: new Date("2026-07-01T10:00:00Z"),
};

describe("captureInboundEmailToBrain", () => {
  beforeEach(() => {
    embedEntity.mockClear();
    ingestEpisode.mockClear();
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("embeds (entity-keyed) AND ingests an episode for an attributed inbound email", () => {
    captureInboundEmailToBrain(base);
    expect(embedEntity).toHaveBeenCalledTimes(1);
    expect(embedEntity).toHaveBeenCalledWith(
      "t1",
      "contact",
      "c1-email-m1",
      expect.stringContaining("good to go"),
    );
    expect(ingestEpisode).toHaveBeenCalledTimes(1);
    const [tenant, content, type, id] = ingestEpisode.mock.calls[0];
    expect(tenant).toBe("t1");
    expect(type).toBe("email");
    expect(id).toBe("m1");
    expect(content).toContain("Inbound email from Jane <jane@acme.com>");
    expect(content).toContain("good to go");
  });

  it("does NOT embed without OPENAI_API_KEY, but STILL ingests the episode", () => {
    delete process.env.OPENAI_API_KEY;
    captureInboundEmailToBrain(base);
    expect(embedEntity).not.toHaveBeenCalled();
    expect(ingestEpisode).toHaveBeenCalledTimes(1);
  });

  it("does NOT embed for an unattributed (unassigned) capture, still ingests the episode", () => {
    captureInboundEmailToBrain({ ...base, entityType: "unassigned", entityId: "" });
    expect(embedEntity).not.toHaveBeenCalled();
    expect(ingestEpisode).toHaveBeenCalledTimes(1);
    expect(ingestEpisode.mock.calls[0][1]).toContain("Inbound email from");
  });

  it("still embeds without a messageId — falls back to the occurredAt key; episode id is undefined", () => {
    captureInboundEmailToBrain({ ...base, messageId: null });
    expect(embedEntity).toHaveBeenCalledTimes(1);
    expect(embedEntity.mock.calls[0][2]).toBe(`c1-email-${base.occurredAt.getTime()}`);
    expect(ingestEpisode).toHaveBeenCalledTimes(1);
    expect(ingestEpisode.mock.calls[0][3]).toBeUndefined();
  });

  it("captures nothing when the text is empty or null", () => {
    captureInboundEmailToBrain({ ...base, text: "" });
    captureInboundEmailToBrain({ ...base, text: null });
    expect(embedEntity).not.toHaveBeenCalled();
    expect(ingestEpisode).not.toHaveBeenCalled();
  });

  it("captures nothing without a tenantId", () => {
    captureInboundEmailToBrain({ ...base, tenantId: "" });
    expect(embedEntity).not.toHaveBeenCalled();
    expect(ingestEpisode).not.toHaveBeenCalled();
  });

  it("truncates the body (5000 for embed, 3000 for episode)", () => {
    const big = "x".repeat(9000);
    captureInboundEmailToBrain({ ...base, text: big });
    const embedText = embedEntity.mock.calls[0][3] as string;
    const episodeText = ingestEpisode.mock.calls[0][1] as string;
    expect((embedText.match(/x/g) || []).length).toBe(5000);
    expect((episodeText.match(/x/g) || []).length).toBe(3000);
  });

  it("never throws even when a primitive rejects (fail-soft, fire-and-forget)", () => {
    embedEntity.mockRejectedValueOnce(new Error("openai down"));
    ingestEpisode.mockRejectedValueOnce(new Error("graph down"));
    expect(() => captureInboundEmailToBrain(base)).not.toThrow();
  });
});
