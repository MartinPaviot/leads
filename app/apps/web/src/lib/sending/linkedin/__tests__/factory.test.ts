import { describe, it, expect, afterEach, vi } from "vitest";
import { selectedLinkedInProvider, buildLinkedInPort } from "../factory";

const resolveTarget = () => ({ providerId: "PVD_1" });

afterEach(() => vi.unstubAllEnvs());

describe("selectedLinkedInProvider", () => {
  it("reads + lowercases the env flag, defaulting to none", () => {
    vi.stubEnv("LINKEDIN_OUTREACH_PROVIDER", "UNIPILE");
    expect(selectedLinkedInProvider()).toBe("unipile");
    vi.stubEnv("LINKEDIN_OUTREACH_PROVIDER", "heyreach");
    expect(selectedLinkedInProvider()).toBe("heyreach");
    vi.stubEnv("LINKEDIN_OUTREACH_PROVIDER", "");
    expect(selectedLinkedInProvider()).toBe("none");
  });
});

describe("buildLinkedInPort", () => {
  it("returns null when the flag is unset (fail-closed — no accidental sends)", () => {
    vi.stubEnv("LINKEDIN_OUTREACH_PROVIDER", "");
    expect(buildLinkedInPort({ resolveTarget })).toBeNull();
  });

  it("returns the Unipile adapter when provider=unipile AND config is present", () => {
    vi.stubEnv("LINKEDIN_OUTREACH_PROVIDER", "unipile");
    vi.stubEnv("UNIPILE_DSN", "https://api8.unipile.com:13443");
    vi.stubEnv("UNIPILE_API_KEY", "key_123");
    const port = buildLinkedInPort({ resolveTarget });
    expect(port).not.toBeNull();
    expect(typeof port!.connect).toBe("function");
    expect(typeof port!.message).toBe("function");
  });

  it("returns null when provider=unipile but config is missing (no key/DSN)", () => {
    vi.stubEnv("LINKEDIN_OUTREACH_PROVIDER", "unipile");
    vi.stubEnv("UNIPILE_DSN", "");
    vi.stubEnv("UNIPILE_API_KEY", "");
    expect(buildLinkedInPort({ resolveTarget })).toBeNull();
  });

  it("returns the HeyReach adapter when provider=heyreach and a client is supplied", () => {
    vi.stubEnv("LINKEDIN_OUTREACH_PROVIDER", "heyreach");
    const heyReachClient = { postConnect: vi.fn(), postMessage: vi.fn() };
    const port = buildLinkedInPort({ resolveTarget, heyReachClient });
    expect(port).not.toBeNull();
    expect(typeof port!.connect).toBe("function");
  });
});
