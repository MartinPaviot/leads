/**
 * getIcpPersonTargeting — sourcing reads the SAME person vocabulary the
 * contact scorer matches against. Locks: ICP-first (union, norm-dedup,
 * seniorities only when configured), legacy flats fallback (explicit
 * seniority selection, else the historical keyword heuristic), and the
 * all-empty case (no facets sent at all).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/icp/fit-recompute-core", () => ({ loadActiveIcps: vi.fn() }));
vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: vi.fn(),
  deriveTargetRoles: vi.fn(),
}));

import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import { getTenantSettings, deriveTargetRoles } from "@/lib/config/tenant-settings";
import { getIcpPersonTargeting } from "@/lib/icp/person-targeting";

const icp = (criteria: Array<Record<string, unknown>>) => ({
  id: "i",
  name: "I",
  priority: 1,
  criteria,
});
const crit = (fieldKey: string, value: unknown) => ({
  id: "c",
  fieldKey,
  operator: "in",
  value,
  weight: 1,
  isRequired: false,
});

describe("getIcpPersonTargeting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantSettings).mockResolvedValue({} as never);
    vi.mocked(deriveTargetRoles).mockReturnValue("");
  });

  it("uses the ICP profiles' person criteria — union, norm-deduped, no invented seniorities", async () => {
    vi.mocked(loadActiveIcps).mockResolvedValue([
      icp([crit("person_titles", ["CEO", "IT Manager"])]),
      icp([crit("person_titles", ["ceo", "CTO"]), crit("industry", ["software"])]),
    ] as never);

    const t = await getIcpPersonTargeting("t1");
    expect(t.source).toBe("icp_profiles");
    expect(t.titles).toEqual(["CEO", "IT Manager", "CTO"]);
    expect(t.seniorities).toBeUndefined();
    expect(getTenantSettings).not.toHaveBeenCalled();
  });

  it("sends ICP seniorities only when actually configured", async () => {
    vi.mocked(loadActiveIcps).mockResolvedValue([
      icp([crit("person_titles", ["CEO"]), crit("person_seniorities", ["c_suite", "owner"])]),
    ] as never);

    const t = await getIcpPersonTargeting("t1");
    expect(t.titles).toEqual(["CEO"]);
    expect(t.seniorities).toEqual(["c_suite", "owner"]);
  });

  it("falls back to the legacy flats when no profile has person criteria", async () => {
    vi.mocked(loadActiveIcps).mockResolvedValue([icp([crit("industry", ["software"])])] as never);
    vi.mocked(deriveTargetRoles).mockReturnValue("VP Engineering, CTO");

    const t = await getIcpPersonTargeting("t1");
    expect(t.source).toBe("legacy_settings");
    expect(t.titles).toEqual(["VP Engineering", "CTO"]);
    // historical keyword heuristic: cto → c_suite, vp → vp
    expect(t.seniorities).toEqual(expect.arrayContaining(["c_suite", "vp"]));
  });

  it("never goes unfiltered: nothing configured falls back to decision-maker seniorities", async () => {
    vi.mocked(loadActiveIcps).mockResolvedValue([] as never);
    vi.mocked(deriveTargetRoles).mockReturnValue("");

    const t = await getIcpPersonTargeting("t1");
    expect(t.source).toBe("legacy_settings");
    expect(t.titles).toBeUndefined();
    expect(t.seniorities).toEqual(["c_suite", "vp", "director", "founder"]);
  });

  it("legacy explicit seniority selection wins over the roles heuristic", async () => {
    vi.mocked(loadActiveIcps).mockResolvedValue([] as never);
    vi.mocked(deriveTargetRoles).mockReturnValue("CEO");
    vi.mocked(getTenantSettings).mockResolvedValue({ targetSeniorities: ["Owner"] } as never);

    const t = await getIcpPersonTargeting("t1");
    expect(t.source).toBe("legacy_settings");
    expect(t.titles).toEqual(["CEO"]);
    // senioritiesToApollo (real) maps the UI label — NOT the regex guess
    // that would have said c_suite for "CEO".
    expect(t.seniorities).toEqual(["owner"]);
  });
});
