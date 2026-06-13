import { describe, expect, it, afterEach, vi } from "vitest";
import {
  isConnectionGraphEnabled,
  configuredGraphProviderId,
} from "@/lib/connection-graph/config";
import { resolveGraphProvider } from "@/lib/connection-graph/provider";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("connection-graph gating (prod safety)", () => {
  it("is disabled by default — the prod posture", () => {
    delete process.env.LINKEDIN_GRAPH_ENABLED;
    expect(isConnectionGraphEnabled()).toBe(false);
    // The single gate: no provider when disabled, so nothing can run.
    expect(resolveGraphProvider()).toBeNull();
  });

  it("only 'true' enables it; other values stay off", () => {
    for (const v of ["", "false", "1", "yes", "TRUE "]) {
      process.env.LINKEDIN_GRAPH_ENABLED = v;
      const expected = v.trim().toLowerCase() === "true";
      expect(isConnectionGraphEnabled()).toBe(expected);
    }
  });

  it("returns null when enabled but no provider configured", () => {
    process.env.LINKEDIN_GRAPH_ENABLED = "true";
    delete process.env.LINKEDIN_GRAPH_PROVIDER;
    expect(resolveGraphProvider()).toBeNull();
  });

  it("constructs the Unipile provider only when enabled + configured", () => {
    process.env.LINKEDIN_GRAPH_ENABLED = "true";
    process.env.LINKEDIN_GRAPH_PROVIDER = "unipile";
    process.env.UNIPILE_DSN = "https://api.example.com:1234";
    process.env.UNIPILE_API_KEY = "k";
    const p = resolveGraphProvider();
    expect(p?.id).toBe("unipile");
  });

  it("throws (never silently no-ops to a live call) when Unipile config is missing", () => {
    process.env.LINKEDIN_GRAPH_ENABLED = "true";
    process.env.LINKEDIN_GRAPH_PROVIDER = "unipile";
    delete process.env.UNIPILE_DSN;
    delete process.env.UNIPILE_API_KEY;
    expect(() => resolveGraphProvider()).toThrow(/UNIPILE_DSN/);
  });

  it("reads the configured provider id", () => {
    process.env.LINKEDIN_GRAPH_PROVIDER = "Self_Hosted";
    expect(configuredGraphProviderId()).toBe("self_hosted");
  });
});
