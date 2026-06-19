/**
 * Pure helpers for the CLE-05 action confirmation card. No React, no server
 * deps — fully unit-testable in isolation.
 *
 *  - buildConfirmFields: derive an editable field model from an action's
 *    paramsJsonSchema (the `z.toJSONSchema` subset, CLE-04 §2.4) + the directive
 *    params, so the card can render scalars inline-editable and complex params
 *    as a read-only preview + "Edit as JSON" fallback.
 *  - collectEditedParams: re-assemble an `editedParams` object from the (possibly
 *    edited) field values; throws a typed `{ field, message }` on malformed
 *    complex JSON (E-1) so the card can block Approve and surface it inline.
 *  - riskBadgesFor: derive the risk badge set from a manifest entry's policy
 *    scalars (AC-6) — same scalars `decideAction` saw server-side, so the badge
 *    can never drift from the gate.
 *
 * Deliberately permissive: the authoritative validation is the live Zod schema
 * inside runRegisteredAction (CLE-03 §2.3), which re-checks edited params before
 * the handler runs. This module shapes the editor; it is not the security gate.
 */

/** A long string switches the editor to a textarea (E-2). */
const TEXTAREA_LEN_THRESHOLD = 80;
const TEXTAREA_MAXLENGTH_THRESHOLD = 200;

export type ConfirmField =
  | { key: string; kind: "string"; label: string; value: string; required: boolean; multiline: boolean }
  | { key: string; kind: "number"; label: string; value: string; required: boolean }
  | { key: string; kind: "boolean"; label: string; value: boolean; required: boolean }
  | { key: string; kind: "enum"; label: string; value: string; options: string[]; required: boolean }
  | { key: string; kind: "complex"; label: string; rawJson: string; required: boolean };

/** A typed error thrown by collectEditedParams on malformed complex-field JSON. */
export interface ConfirmFieldError {
  field: string;
  message: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** "dealId" → "Deal Id"; mirrors action-card.tsx's humanizer. */
function humanize(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A property schema may be wrapped (nullable/optional) as anyOf/oneOf — unwrap a single concrete branch. */
function unwrap(schema: unknown): Record<string, unknown> | null {
  if (!isRecord(schema)) return null;
  const branches = (Array.isArray(schema.anyOf) && schema.anyOf) || (Array.isArray(schema.oneOf) && schema.oneOf);
  if (branches) {
    // Pick the first non-null branch (e.g. nullable string -> string).
    const concrete = branches.find((b) => isRecord(b) && b.type !== "null");
    if (isRecord(concrete)) return concrete;
  }
  return schema;
}

/** Collect enum members from a property schema (handles `enum` and single-member `const`). */
function enumOptions(schema: Record<string, unknown>): string[] | null {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((v) => String(v));
  }
  if (typeof schema.const === "string") return [schema.const];
  return null;
}

function classify(
  key: string,
  rawSchema: unknown,
  params: Record<string, unknown>,
  required: boolean,
): ConfirmField {
  const label = humanize(key);
  const has = Object.prototype.hasOwnProperty.call(params, key);
  const raw = params[key];
  const schema = unwrap(rawSchema);

  // No usable schema for this key → editable raw JSON (never silently hidden).
  if (!schema) {
    return { key, kind: "complex", label, required, rawJson: jsonFor(has ? raw : null) };
  }

  const opts = enumOptions(schema);
  if (opts) {
    return { key, kind: "enum", label, required, value: has && raw != null ? String(raw) : "", options: opts };
  }

  const type = schema.type;
  if (type === "boolean") {
    return { key, kind: "boolean", label, required, value: Boolean(raw) };
  }
  if (type === "number" || type === "integer") {
    return { key, kind: "number", label, required, value: has && raw != null ? String(raw) : "" };
  }
  if (type === "string") {
    const value = has && raw != null ? String(raw) : "";
    const maxLength = typeof schema.maxLength === "number" ? schema.maxLength : 0;
    const multiline = value.length > TEXTAREA_LEN_THRESHOLD || maxLength > TEXTAREA_MAXLENGTH_THRESHOLD;
    return { key, kind: "string", label, required, value, multiline };
  }
  // array / object / union / unknown → complex (read-only preview + Edit as JSON).
  return { key, kind: "complex", label, required, rawJson: jsonFor(has ? raw : defaultFor(schema)) };
}

function jsonFor(v: unknown): string {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return "null";
  }
}

/** A minimal placeholder for a complex field absent from params. */
function defaultFor(schema: Record<string, unknown>): unknown {
  if (schema.type === "array") return [];
  if (schema.type === "object") return {};
  return null;
}

/**
 * Build the editable field list from the entry's paramsJsonSchema + the directive
 * params. Iterates schema properties in declared order, then appends any param
 * keys the schema does not describe (so nothing is silently un-editable).
 */
export function buildConfirmFields(
  paramsJsonSchema: unknown,
  params: Record<string, unknown>,
): ConfirmField[] {
  const root = isRecord(paramsJsonSchema) ? paramsJsonSchema : {};
  const properties = isRecord(root.properties) ? root.properties : {};
  const required = new Set(Array.isArray(root.required) ? root.required.map(String) : []);

  const fields: ConfirmField[] = [];
  const seen = new Set<string>();

  for (const key of Object.keys(properties)) {
    seen.add(key);
    fields.push(classify(key, properties[key], params, required.has(key)));
  }
  // Params with no matching schema property (additionalProperties) → editable raw.
  for (const key of Object.keys(params)) {
    if (seen.has(key)) continue;
    fields.push({ key, kind: "complex", label: humanize(key), required: false, rawJson: jsonFor(params[key]) });
  }
  return fields;
}

/**
 * Re-assemble an editedParams object from the field values. Scalars coerce by
 * kind; complex fields JSON.parse their raw text, throwing a typed
 * {@link ConfirmFieldError} on malformed JSON (E-1). Empty optional scalars are
 * omitted (not injected as ""); empty required scalars are omitted too, so the
 * downstream Zod re-validation reports the missing field (AC-5).
 */
export function collectEditedParams(fields: ConfirmField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f.kind) {
      case "boolean":
        out[f.key] = f.value;
        break;
      case "number": {
        const t = f.value.trim();
        if (t === "") break; // omit → missing (Zod reports required) / optional
        out[f.key] = Number(t); // NaN flows through and fails Zod number (AC-5)
        break;
      }
      case "string":
      case "enum": {
        if (f.value === "") {
          if (f.required) out[f.key] = ""; // surface the cleared required field to Zod
          break; // omit empty optional scalars
        }
        out[f.key] = f.value;
        break;
      }
      case "complex": {
        try {
          out[f.key] = JSON.parse(f.rawJson);
        } catch {
          const err: ConfirmFieldError = { field: f.key, message: `Invalid JSON in ${f.label}` };
          throw err;
        }
        break;
      }
    }
  }
  return out;
}

export interface RiskBadge {
  label: string;
  tone: "danger" | "warn" | "neutral";
}

/**
 * Derive the risk badge set from a manifest entry's policy scalars (AC-6). No
 * emoji (brand rule). A plain reversible free mutation gets a single neutral
 * label so badges signal real risk rather than decorating everything; a
 * read-only action gets none.
 */
export function riskBadgesFor(entry: {
  mutating: boolean;
  outbound: boolean;
  reversible: boolean;
  cost: "free" | "credits" | "money";
}): RiskBadge[] {
  const out: RiskBadge[] = [];
  if (entry.outbound) out.push({ label: "Sends externally", tone: "warn" });
  if (entry.cost === "money") out.push({ label: "Costs money", tone: "danger" });
  else if (entry.cost === "credits") out.push({ label: "Uses credits", tone: "warn" });
  if (entry.mutating && !entry.reversible) out.push({ label: "Permanent", tone: "danger" });
  if (out.length === 0 && entry.mutating) out.push({ label: "Updates a record", tone: "neutral" });
  return out;
}
