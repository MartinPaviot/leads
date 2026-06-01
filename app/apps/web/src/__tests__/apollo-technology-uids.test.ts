import { describe, expect, it } from "vitest";
import { toTechnologyUid, toTechnologyUids } from "@/lib/icp/apollo-technology-uids";

describe("toTechnologyUid", () => {
  it("maps known Pilae stack names to their Apollo slug", () => {
    expect(toTechnologyUid("Datadog")).toBe("datadog");
    expect(toTechnologyUid("New Relic")).toBe("new_relic");
    expect(toTechnologyUid("MongoDB Atlas")).toBe("mongodb");
    expect(toTechnologyUid("LaunchDarkly")).toBe("launchdarkly");
    expect(toTechnologyUid("PagerDuty")).toBe("pagerduty");
  });

  it("is case-insensitive on the dictionary lookup", () => {
    expect(toTechnologyUid("DATADOG")).toBe("datadog");
    expect(toTechnologyUid("new relic")).toBe("new_relic");
  });

  it("maps cloud aliases", () => {
    expect(toTechnologyUid("AWS")).toBe("amazon_aws");
    expect(toTechnologyUid("Amazon Web Services")).toBe("amazon_aws");
    expect(toTechnologyUid("Azure")).toBe("microsoft_azure");
  });

  it("falls back to slug normalisation for unknown names", () => {
    expect(toTechnologyUid("Some New Tool")).toBe("some_new_tool");
    expect(toTechnologyUid("Ruby on Rails")).toBe("ruby_on_rails");
    expect(toTechnologyUid("Node.js")).toBe("node_js");
  });

  it("collapses runs of non-alphanumerics and trims underscores", () => {
    expect(toTechnologyUid("  Foo --- Bar  ")).toBe("foo_bar");
    expect(toTechnologyUid("C++")).toBe("c");
  });
});

describe("toTechnologyUids", () => {
  it("maps + dedupes an array", () => {
    expect(toTechnologyUids(["Datadog", "datadog", "New Relic"])).toEqual([
      "datadog",
      "new_relic",
    ]);
  });

  it("handles a scalar", () => {
    expect(toTechnologyUids("Okta")).toEqual(["okta"]);
  });

  it("handles null / undefined", () => {
    expect(toTechnologyUids(null)).toEqual([]);
    expect(toTechnologyUids(undefined)).toEqual([]);
  });
});
