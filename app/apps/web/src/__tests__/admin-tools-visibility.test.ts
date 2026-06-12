import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The eval harness and MCP key pages are internal admin tooling: hidden
 * from production builds (sidebar entry + page 404), available on dev.
 * The constants are computed at module load from NODE_ENV, so each case
 * stubs the env and re-imports a fresh copy of the module.
 */
async function loadWithNodeEnv(nodeEnv: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  return import("@/lib/settings/admin-tools-visibility");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("admin-tools-visibility", () => {
  it("hides the evals and MCP pages in production builds", async () => {
    const mod = await loadWithNodeEnv("production");
    expect(mod.EVALS_PAGE_ENABLED).toBe(false);
    expect(mod.MCP_PAGE_ENABLED).toBe(false);
  });

  it("keeps the evals and MCP pages available on next dev", async () => {
    const mod = await loadWithNodeEnv("development");
    expect(mod.EVALS_PAGE_ENABLED).toBe(true);
    expect(mod.MCP_PAGE_ENABLED).toBe(true);
  });

  it("keeps the pages available under test so suites can exercise them", async () => {
    const mod = await loadWithNodeEnv("test");
    expect(mod.EVALS_PAGE_ENABLED).toBe(true);
    expect(mod.MCP_PAGE_ENABLED).toBe(true);
  });
});
