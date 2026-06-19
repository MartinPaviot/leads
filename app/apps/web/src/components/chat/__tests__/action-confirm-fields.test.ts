import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  buildConfirmFields,
  collectEditedParams,
  riskBadgesFor,
  type ConfirmField,
  type ConfirmFieldError,
} from "../action-confirm-fields";

/** The JSON-Schema subset CLE-04 puts on the wire is exactly z.toJSONSchema. */
const smokeSchema = z.toJSONSchema(
  z.object({
    stage: z.enum(["A", "B"]),
    value: z.number().optional(),
    notify: z.boolean(),
    tags: z.array(z.string()),
    meta: z.object({ x: z.number() }),
  }),
);

function field(fields: ConfirmField[], key: string): ConfirmField {
  const f = fields.find((x) => x.key === key);
  if (!f) throw new Error(`no field ${key}`);
  return f;
}

describe("buildConfirmFields (AC-9, E-1, E-2)", () => {
  const fields = buildConfirmFields(smokeSchema, {
    stage: "B",
    value: 3,
    notify: true,
    tags: ["x", "y"],
    meta: { x: 1 },
  });

  it("maps enum → enum field with options, pre-filled", () => {
    const f = field(fields, "stage");
    expect(f.kind).toBe("enum");
    if (f.kind === "enum") {
      expect(f.options).toEqual(["A", "B"]);
      expect(f.value).toBe("B");
      expect(f.required).toBe(true);
    }
  });

  it("maps optional number → number field, not required, pre-filled as string", () => {
    const f = field(fields, "value");
    expect(f.kind).toBe("number");
    if (f.kind === "number") {
      expect(f.required).toBe(false);
      expect(f.value).toBe("3");
    }
  });

  it("maps boolean → boolean field", () => {
    const f = field(fields, "notify");
    expect(f.kind).toBe("boolean");
    if (f.kind === "boolean") expect(f.value).toBe(true);
  });

  it("maps array → complex (read-only + raw JSON)", () => {
    const f = field(fields, "tags");
    expect(f.kind).toBe("complex");
    if (f.kind === "complex") expect(JSON.parse(f.rawJson)).toEqual(["x", "y"]);
  });

  it("maps nested object → complex", () => {
    const f = field(fields, "meta");
    expect(f.kind).toBe("complex");
    if (f.kind === "complex") expect(JSON.parse(f.rawJson)).toEqual({ x: 1 });
  });

  it("flags a very large string for textarea (E-2)", () => {
    const big = "x".repeat(200);
    const f = buildConfirmFields(z.toJSONSchema(z.object({ body: z.string() })), { body: big });
    const s = field(f, "body");
    expect(s.kind).toBe("string");
    if (s.kind === "string") expect(s.multiline).toBe(true);
  });

  it("a short string is single-line", () => {
    const f = buildConfirmFields(z.toJSONSchema(z.object({ name: z.string() })), { name: "Acme" });
    const s = field(f, "name");
    if (s.kind === "string") expect(s.multiline).toBe(false);
  });

  it("includes a param with no matching schema property as editable complex (never hidden)", () => {
    const f = buildConfirmFields(z.toJSONSchema(z.object({ a: z.string() })), { a: "x", extra: { k: 1 } });
    const e = field(f, "extra");
    expect(e.kind).toBe("complex");
  });
});

describe("collectEditedParams (AC-2, AC-5, E-1)", () => {
  it("coerces number strings to numbers and keeps booleans", () => {
    const fields: ConfirmField[] = [
      { key: "value", kind: "number", label: "Value", value: "42", required: false },
      { key: "notify", kind: "boolean", label: "Notify", value: false, required: true },
      { key: "stage", kind: "enum", label: "Stage", value: "B", options: ["A", "B"], required: true },
    ];
    expect(collectEditedParams(fields)).toEqual({ value: 42, notify: false, stage: "B" });
  });

  it("parses a valid complex field back to an object/array", () => {
    const fields: ConfirmField[] = [
      { key: "tags", kind: "complex", label: "Tags", rawJson: '["a","b"]', required: true },
    ];
    expect(collectEditedParams(fields)).toEqual({ tags: ["a", "b"] });
  });

  it("throws a typed field error on malformed complex JSON (E-1)", () => {
    const fields: ConfirmField[] = [
      { key: "meta", kind: "complex", label: "Meta", rawJson: "{not json", required: true },
    ];
    try {
      collectEditedParams(fields);
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as ConfirmFieldError;
      expect(err.field).toBe("meta");
      expect(err.message).toContain("Meta");
    }
  });

  it("omits empty optional scalars but surfaces a cleared required scalar", () => {
    const fields: ConfirmField[] = [
      { key: "opt", kind: "string", label: "Opt", value: "", required: false, multiline: false },
      { key: "req", kind: "string", label: "Req", value: "", required: true, multiline: false },
      { key: "n", kind: "number", label: "N", value: "", required: true },
    ];
    const out = collectEditedParams(fields);
    expect("opt" in out).toBe(false); // omitted
    expect(out.req).toBe(""); // cleared required → "" so Zod reports it
    expect("n" in out).toBe(false); // empty number omitted → Zod reports missing
  });
});

describe("riskBadgesFor (AC-6, brand no-emoji)", () => {
  const base = { mutating: true, outbound: false, reversible: true, cost: "free" as const };

  it("outbound → Sends externally", () => {
    expect(riskBadgesFor({ ...base, outbound: true }).map((b) => b.label)).toContain("Sends externally");
  });
  it("money → Costs money (danger)", () => {
    const b = riskBadgesFor({ ...base, cost: "money" });
    expect(b.find((x) => x.label === "Costs money")?.tone).toBe("danger");
  });
  it("credits → Uses credits (warn)", () => {
    expect(riskBadgesFor({ ...base, cost: "credits" }).map((b) => b.label)).toContain("Uses credits");
  });
  it("irreversible mutation → Permanent", () => {
    expect(riskBadgesFor({ ...base, reversible: false }).map((b) => b.label)).toContain("Permanent");
  });
  it("reversible free mutation → single neutral Updates a record", () => {
    const b = riskBadgesFor(base);
    expect(b).toHaveLength(1);
    expect(b[0]).toEqual({ label: "Updates a record", tone: "neutral" });
  });
  it("read-only action → no badges", () => {
    expect(riskBadgesFor({ mutating: false, outbound: false, reversible: false, cost: "free" })).toEqual([]);
  });
  it("no badge label contains an emoji", () => {
    const all = [
      ...riskBadgesFor({ mutating: true, outbound: true, reversible: false, cost: "money" }),
      ...riskBadgesFor({ mutating: true, outbound: false, reversible: false, cost: "credits" }),
      ...riskBadgesFor({ mutating: true, outbound: false, reversible: true, cost: "free" }),
    ];
    const emoji = /\p{Extended_Pictographic}/u;
    for (const b of all) expect(emoji.test(b.label)).toBe(false);
  });
});
