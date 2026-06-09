import { describe, it, expect } from "vitest";
import { detectFromSignals } from "@/lib/tech-detect/detect";
import type { PageSignals } from "@/lib/tech-detect/detect";

const empty: PageSignals = { scriptHosts: [], html: "", headers: {}, cookies: [], metaGenerator: null };
const s = (over: Partial<PageSignals>): PageSignals => ({ ...empty, ...over });

describe("detectFromSignals", () => {
  it("detects WordPress from the meta generator (strongest evidence wins)", () => {
    const tools = detectFromSignals(s({ metaGenerator: "WordPress 6.5.2", html: "/wp-content/themes/x" }));
    const wp = tools.find((t) => t.id === "wordpress");
    expect(wp).toBeDefined();
    expect(wp?.replaceable).toBe(true);
    expect(wp?.evidence.kind).toBe("meta"); // meta beats the html marker
    expect(wp?.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("detects HubSpot from a script host, citing the exact host as evidence", () => {
    const tools = detectFromSignals(s({ scriptHosts: ["js.hs-scripts.com"] }));
    const hs = tools.find((t) => t.id === "hubspot");
    expect(hs?.category).toBe("crm");
    expect(hs?.evidence).toEqual({ kind: "script", value: "js.hs-scripts.com" });
  });

  it("flags analytics / CDN as NOT replaceable (detected, but not the target)", () => {
    const tools = detectFromSignals(s({ scriptHosts: ["www.google-analytics.com"], headers: { server: "cloudflare" } }));
    expect(tools.find((t) => t.id === "google-analytics")?.replaceable).toBe(false);
    expect(tools.find((t) => t.id === "cloudflare")?.replaceable).toBe(false);
  });

  it("sorts replaceable SaaS first", () => {
    const tools = detectFromSignals(s({ scriptHosts: ["www.google-analytics.com", "js.hs-scripts.com"] }));
    expect(tools[0].id).toBe("hubspot");
    expect(tools[0].replaceable).toBe(true);
  });

  it("detects Shopify from a response header", () => {
    const tools = detectFromSignals(s({ headers: { "x-shopify-stage": "production" } }));
    expect(tools.find((t) => t.id === "shopify")?.evidence.kind).toBe("header");
  });

  it("returns nothing for a benign page (no false positives)", () => {
    expect(detectFromSignals(s({ html: "<html><body>Bienvenue sur notre fondation</body></html>" }))).toEqual([]);
  });

  it("emits exactly one entry per tool even with multiple signatures", () => {
    const tools = detectFromSignals(s({ metaGenerator: "WordPress 6.5", html: "/wp-content/ and /wp-includes/" }));
    expect(tools.filter((t) => t.id === "wordpress")).toHaveLength(1);
  });
});
