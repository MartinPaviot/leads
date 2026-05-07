import { describe, it, expect } from "vitest";
import {
  resolveProviderName,
  resolveProvider,
  noneProvider,
  VALID_PROVIDER_NAMES,
  type ProviderRegistry,
} from "@/lib/visitor-id/provider-resolver";
import type { VisitorIdProvider } from "@/lib/visitor-id/provider";

function stubProvider(
  name: string,
  available: boolean,
): VisitorIdProvider {
  return {
    name,
    isAvailable: () => available,
    identify: async () => null,
  };
}

const fullyAvailableRegistry: ProviderRegistry = {
  snitcher: stubProvider("snitcher", true),
  rb2b: stubProvider("rb2b", true),
  clearbit_reveal: stubProvider("clearbit_reveal", true),
  none: noneProvider,
};

describe("resolveProviderName", () => {
  it("returns 'snitcher' on null / undefined settings", () => {
    expect(resolveProviderName(null)).toBe("snitcher");
    expect(resolveProviderName(undefined)).toBe("snitcher");
  });

  it("returns 'snitcher' when key absent", () => {
    expect(resolveProviderName({})).toBe("snitcher");
    expect(resolveProviderName({ unrelated: "value" })).toBe("snitcher");
  });

  it("returns the explicit setting when valid", () => {
    expect(resolveProviderName({ visitorIdProvider: "snitcher" })).toBe("snitcher");
    expect(resolveProviderName({ visitorIdProvider: "rb2b" })).toBe("rb2b");
    expect(resolveProviderName({ visitorIdProvider: "clearbit_reveal" })).toBe(
      "clearbit_reveal",
    );
    expect(resolveProviderName({ visitorIdProvider: "none" })).toBe("none");
  });

  it("falls back to 'snitcher' on unknown / invalid value", () => {
    expect(resolveProviderName({ visitorIdProvider: "yolo" })).toBe("snitcher");
    expect(resolveProviderName({ visitorIdProvider: 42 })).toBe("snitcher");
    expect(resolveProviderName({ visitorIdProvider: null })).toBe("snitcher");
  });

  it("VALID_PROVIDER_NAMES contains all four allowed values", () => {
    expect(VALID_PROVIDER_NAMES.has("snitcher")).toBe(true);
    expect(VALID_PROVIDER_NAMES.has("rb2b")).toBe(true);
    expect(VALID_PROVIDER_NAMES.has("clearbit_reveal")).toBe(true);
    expect(VALID_PROVIDER_NAMES.has("none")).toBe(true);
  });
});

describe("resolveProvider", () => {
  it("returns the explicit per-tenant provider when available", () => {
    const out = resolveProvider({
      settings: { visitorIdProvider: "rb2b" },
      registry: fullyAvailableRegistry,
    });
    expect(out.name).toBe("rb2b");
  });

  it("returns Snitcher by default", () => {
    const out = resolveProvider({
      settings: null,
      registry: fullyAvailableRegistry,
    });
    expect(out.name).toBe("snitcher");
  });

  it("falls back to Snitcher when chosen provider is unavailable", () => {
    const registry: ProviderRegistry = {
      snitcher: stubProvider("snitcher", true),
      rb2b: stubProvider("rb2b", false), // RB2B has no key
      clearbit_reveal: stubProvider("clearbit_reveal", true),
      none: noneProvider,
    };
    const out = resolveProvider({
      settings: { visitorIdProvider: "rb2b" },
      registry,
    });
    expect(out.name).toBe("snitcher");
  });

  it("falls back to 'none' provider when both chosen + Snitcher are unavailable", () => {
    const registry: ProviderRegistry = {
      snitcher: stubProvider("snitcher", false),
      rb2b: stubProvider("rb2b", false),
      clearbit_reveal: stubProvider("clearbit_reveal", false),
      none: noneProvider,
    };
    const out = resolveProvider({
      settings: { visitorIdProvider: "clearbit_reveal" },
      registry,
    });
    expect(out.name).toBe("none");
  });

  it("explicit 'none' choice returns the none provider directly", () => {
    const out = resolveProvider({
      settings: { visitorIdProvider: "none" },
      registry: fullyAvailableRegistry,
    });
    expect(out.name).toBe("none");
  });

  it("Snitcher unavailable + tenant chose Snitcher → none provider", () => {
    const registry: ProviderRegistry = {
      snitcher: stubProvider("snitcher", false),
      rb2b: stubProvider("rb2b", true),
      clearbit_reveal: stubProvider("clearbit_reveal", true),
      none: noneProvider,
    };
    const out = resolveProvider({
      settings: { visitorIdProvider: "snitcher" },
      registry,
    });
    // Tenant explicitly chose snitcher → no implicit jump to rb2b.
    // When the chosen one is unavailable AND the chosen one IS
    // snitcher, the "snitcher fallback" branch doesn't fire ; we go
    // directly to none.
    expect(out.name).toBe("none");
  });
});

describe("noneProvider behavior", () => {
  it("is always available", () => {
    expect(noneProvider.isAvailable()).toBe(true);
  });

  it("identify always returns null", async () => {
    expect(await noneProvider.identify({ ip: "1.2.3.4" })).toBeNull();
  });

  it("name is 'none'", () => {
    expect(noneProvider.name).toBe("none");
  });
});
