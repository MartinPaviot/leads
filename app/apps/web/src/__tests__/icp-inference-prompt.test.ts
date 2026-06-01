import { describe, expect, it } from "vitest";
import {
  MAX_INFERRED_ICPS,
  buildInferencePrompt,
  inferenceResponseSchema,
} from "@/lib/icp/inference-prompt";
import type { ResolvedCatalogRow } from "@/lib/icp/catalog-db";

const CATALOG: ResolvedCatalogRow[] = [
  { fieldKey: "industry", label: "Industry", source: "apollo_search", valueType: "multi_select", operators: ["in", "eq"], apolloParam: "q_organization_keyword_tags", isCustom: false },
  { fieldKey: "employee_count", label: "Employee count", source: "apollo_search", valueType: "range", operators: ["between"], apolloParam: "organization_num_employees_ranges", isCustom: false },
  { fieldKey: "technologies", label: "Technologies", source: "apollo_search", valueType: "multi_select", operators: ["in"], apolloParam: "currently_using_any_of_technology_uids", isCustom: false },
];

describe("buildInferencePrompt", () => {
  it("lists every catalog field with its key, type and operators", () => {
    const p = buildInferencePrompt({ catalog: CATALOG });
    expect(p).toContain("industry (Industry; multi_select; operators: in/eq)");
    expect(p).toContain("employee_count");
    expect(p).toContain("technologies (Technologies; multi_select; operators: in)");
  });

  it("includes the business context when provided", () => {
    const p = buildInferencePrompt({
      productDescription: "Sovereign cloud infra for EU regulated cos",
      salesMotion: "Founder-led",
      bestCustomers: ["acme.com", "globex.io"],
      catalog: CATALOG,
    });
    expect(p).toContain("Sovereign cloud infra");
    expect(p).toContain("Founder-led");
    expect(p).toContain("acme.com, globex.io");
  });

  it("instructs the model to use ONLY listed fields", () => {
    const p = buildInferencePrompt({ catalog: CATALOG });
    expect(p).toMatch(/ONLY the fieldKeys/);
  });

  it("documents the value shape per operator", () => {
    const p = buildInferencePrompt({ catalog: CATALOG });
    expect(p).toMatch(/in → array/);
    expect(p).toMatch(/between → \{ min, max \}/);
  });

  it("handles an empty business context gracefully", () => {
    const p = buildInferencePrompt({ catalog: CATALOG });
    expect(p).toContain("no description provided");
  });
});

describe("inferenceResponseSchema", () => {
  it("accepts a well-formed set of candidate ICPs", () => {
    const r = inferenceResponseSchema.parse({
      icps: [
        {
          name: "SaaS scale-up",
          description: "B2B software 50-150",
          priority: 0,
          criteria: [
            { fieldKey: "industry", operator: "in", value: ["Computer Software"], weight: 3, isRequired: false },
            { fieldKey: "employee_count", operator: "between", value: { min: 50, max: 150 }, weight: 2, isRequired: false },
          ],
        },
      ],
    });
    expect(r.icps).toHaveLength(1);
  });

  it("rejects more than MAX_INFERRED_ICPS", () => {
    const many = Array.from({ length: MAX_INFERRED_ICPS + 1 }, (_, i) => ({
      name: `ICP ${i}`,
      description: "x",
      priority: i,
      criteria: [],
    }));
    expect(() => inferenceResponseSchema.parse({ icps: many })).toThrow();
  });

  it("rejects a negative priority", () => {
    expect(() =>
      inferenceResponseSchema.parse({
        icps: [{ name: "X", description: "y", priority: -1, criteria: [] }],
      }),
    ).toThrow();
  });
});
