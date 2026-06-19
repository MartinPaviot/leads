import { z } from "zod";

/**
 * Build a permissive Zod validator from the JSON Schema of a manifest entry.
 * The manifest carries `paramsJsonSchema` (the deterministic output of CLE-03's
 * `z.toJSONSchema` for plain `z.object` param schemas) — not a Zod object (the
 * run/Zod are stripped for serialization). This reconstructs a structural
 * validator for the server-side gate (CLE-04 AC-4).
 *
 * Covers the subset z.toJSONSchema emits for plain z.object param schemas:
 * object with typed properties + `required` + enums + arrays + nested objects.
 * Unknown/unsupported constructs degrade to z.unknown() (accept) — server-side
 * validation is the FIRST of two gates; the client re-validates against the LIVE
 * Zod schema (CLE-03), so a permissive server gate cannot let a bad call run.
 *
 * Internal — not a §3 contract. Why not `ajv`: a heavy new dep for a tiny known
 * subset, and it would not give us a Zod object. Why not `z.fromJSONSchema`:
 * Zod 4 ships `toJSONSchema` but no stable inverse.
 */
export function jsonSchemaToZod(schema: unknown): z.ZodType {
  if (!isObject(schema)) return z.unknown();
  const type = schema["type"];

  if (type === "object" || isObject(schema["properties"])) {
    const props = (schema["properties"] as Record<string, unknown>) ?? {};
    const required = new Set(Array.isArray(schema["required"]) ? (schema["required"] as string[]) : []);
    const shape: Record<string, z.ZodType> = {};
    for (const [key, propSchema] of Object.entries(props)) {
      let zt = jsonSchemaToZod(propSchema);
      if (!required.has(key)) zt = zt.optional();
      shape[key] = zt;
    }
    return z.object(shape);
  }

  if (Array.isArray(schema["enum"])) {
    return z.enum(schema["enum"] as [string, ...string[]]);
  }
  if (type === "array") {
    return z.array(jsonSchemaToZod(schema["items"]));
  }
  switch (type) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "null":
      return z.null();
    default:
      return z.unknown();
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
