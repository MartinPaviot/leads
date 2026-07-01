import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CHAT-08 — regression test for a pre-existing gap: callers set
 * `_trace.surfaceType` (traced-ai.ts's TraceMetadata) but recordTrace()
 * never wrote it to a queryable column, only into the untyped `metadata`
 * bag (which AC6's `agentTraces GROUP BY surfaceType` can't query). This
 * affected in-app chat attribution too, not just the new MCP/Slack paths.
 */

const insertedValues: any[] = [];
vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: (v: any) => {
        insertedValues.push(v);
        return Promise.resolve();
      },
    }),
  },
}));

import { recordTrace } from "../observability";

beforeEach(() => {
  insertedValues.length = 0;
});

describe("recordTrace — surface attribution", () => {
  it("persists surfaceType and mcpClient as first-class columns when provided", async () => {
    await recordTrace(
      { agentId: "chat", tenantId: "t1", surfaceType: "mcp", mcpClient: "claude" },
      { latencyMs: 100, status: "ok" },
    );
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0].surfaceType).toBe("mcp");
    expect(insertedValues[0].mcpClient).toBe("claude");
  });

  it("defaults both to null when the caller doesn't set them (e.g. a non-chat background agent)", async () => {
    await recordTrace({ agentId: "enrich-company", tenantId: "t1" }, { latencyMs: 50, status: "ok" });
    expect(insertedValues[0].surfaceType).toBeNull();
    expect(insertedValues[0].mcpClient).toBeNull();
  });

  it("in-app chat surface (e.g. 'contact') is also persisted, not just slack/mcp", async () => {
    await recordTrace({ agentId: "chat", tenantId: "t1", surfaceType: "contact" }, { latencyMs: 80, status: "ok" });
    expect(insertedValues[0].surfaceType).toBe("contact");
    expect(insertedValues[0].mcpClient).toBeNull();
  });
});
