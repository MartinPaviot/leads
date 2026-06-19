import { describe, it, expect } from "vitest";
import { z } from "zod";
import { jsonSchemaToZod } from "@/lib/chat/page-actions/manifest-validate";

describe("jsonSchemaToZod (CLE-04 server-side gate)", () => {
  it("validates a z.object schema round-tripped through z.toJSONSchema", () => {
    const js = z.toJSONSchema(z.object({ a: z.string(), b: z.number().optional() }));
    const v = jsonSchemaToZod(js);
    expect(v.safeParse({ a: "x" }).success).toBe(true);
    expect(v.safeParse({ a: "x", b: 2 }).success).toBe(true);
    expect(v.safeParse({}).success).toBe(false); // missing required `a`
    expect(v.safeParse({ a: "x", b: "y" }).success).toBe(false); // `b` wrong type
  });

  it("validates enums", () => {
    const v = jsonSchemaToZod(z.toJSONSchema(z.object({ s: z.enum(["won", "lost"]) })));
    expect(v.safeParse({ s: "won" }).success).toBe(true);
    expect(v.safeParse({ s: "nope" }).success).toBe(false);
  });

  it("validates arrays", () => {
    const v = jsonSchemaToZod(z.toJSONSchema(z.object({ ids: z.array(z.string()) })));
    expect(v.safeParse({ ids: ["a", "b"] }).success).toBe(true);
    expect(v.safeParse({ ids: [1] }).success).toBe(false);
  });

  it("an unknown construct degrades to accept (the client gate is authoritative)", () => {
    expect(jsonSchemaToZod({ weird: true }).safeParse("anything").success).toBe(true);
  });
});
