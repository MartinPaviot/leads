import { describe, it, expect, vi, afterEach } from "vitest";

// The constant reads process.env.NODE_ENV at module-eval time, so each
// case stubs the env then re-imports a fresh copy of the module.
async function gateUnder(nodeEnv: string): Promise<boolean> {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.resetModules();
  const mod = await import("../entry-visibility");
  return mod.TAM_PROPOSALS_ENTRY_ENABLED;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("TAM_PROPOSALS_ENTRY_ENABLED", () => {
  it("is disabled in production builds (button hidden, count not fetched)", async () => {
    expect(await gateUnder("production")).toBe(false);
  });

  it("stays enabled on next dev so TAM-lifecycle work keeps its entry point", async () => {
    expect(await gateUnder("development")).toBe(true);
  });
});
