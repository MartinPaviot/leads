/**
 * Filter model — shared by the FilterBuilder UI, the `/api/views`
 * persistence endpoint, and any server-side list handler that wants
 * to apply a saved view.
 *
 * Kept as a simple flat array of `{ field, operator, value }` rather
 * than a tree. Good enough for the 13 CRITIQUE list pages; boolean
 * groupings (AND/OR nesting) can land in v2 without breaking this
 * shape because every existing row is an implicit AND at the top.
 */

export type FilterOperator =
  // number
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  // text
  | "contains"
  | "not-contains"
  | "starts-with"
  | "ends-with"
  // multi-select
  | "includes-any"
  | "includes-all"
  | "excludes"
  // date
  | "before"
  | "after"
  | "between"
  | "last-n-days"
  // boolean
  | "is-true"
  | "is-false";

export type FilterValue =
  | string
  | number
  | boolean
  | string[]
  | [string, string] // date range
  | null;

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: FilterValue;
}

export interface FilterFieldDef {
  key: string;
  label: string;
  type: "number" | "text" | "multi-select" | "date-range" | "boolean";
  options?: readonly string[];
}

const OPERATORS_BY_TYPE: Record<FilterFieldDef["type"], FilterOperator[]> = {
  number: ["eq", "neq", "gt", "gte", "lt", "lte"],
  text: ["contains", "not-contains", "starts-with", "ends-with", "eq"],
  "multi-select": ["includes-any", "includes-all", "excludes"],
  "date-range": ["before", "after", "between", "last-n-days"],
  boolean: ["is-true", "is-false"],
};

/** Operators valid for a given field type. Pure — drives the UI. */
export function operatorsForType(type: FilterFieldDef["type"]): FilterOperator[] {
  return OPERATORS_BY_TYPE[type];
}

/** Validate a list of filter conditions against a field catalog. Pure. */
export function validateFilters(
  filters: FilterCondition[],
  fields: FilterFieldDef[]
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const f of filters) {
    const def = byKey.get(f.field);
    if (!def) {
      errors.push(`Unknown field: ${f.field}`);
      continue;
    }
    if (!operatorsForType(def.type).includes(f.operator)) {
      errors.push(`Operator "${f.operator}" not valid for field "${f.field}" (type ${def.type})`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Serialize filter conditions into URL query parameters. The shape is
 * `filter[<field>][<op>]=<value>` (or repeated for array values) so
 * server handlers can reconstruct the conditions without a custom
 * parser. Pure.
 */
export function filtersToQuery(filters: FilterCondition[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const f of filters) {
    const key = `filter[${f.field}][${f.operator}]`;
    const v = f.value;
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) params.append(key, String(item));
    } else {
      params.set(key, String(v));
    }
  }
  return params;
}

/**
 * Apply a list of FilterCondition to an in-memory array of rows. Pure.
 *
 * Implicit AND across conditions. Each condition evaluates against
 * `row[condition.field]`. Missing / nullish values are treated as
 * empty string for text ops and as 0 for numeric ops (conservative
 * — a row with null size does NOT match "size contains small").
 *
 * Used by list pages that want to filter client-side (no URL round-trip,
 * no new API). The /api/filters/parse-nl endpoint returns conditions
 * that are fed straight into this function.
 *
 * Not exhaustive — date operators are passed through as string compares,
 * which is enough for ISO-8601 dates stored as strings. Upgrade when we
 * need calendar-aware semantics.
 */
export function applyFilters<T extends object>(
  rows: readonly T[],
  filters: readonly FilterCondition[],
): T[] {
  if (filters.length === 0) return [...rows];
  return rows.filter((row) => filters.every((c) => matches(row, c)));
}

function matches(row: object, c: FilterCondition): boolean {
  const raw = (row as Record<string, unknown>)[c.field];
  switch (c.operator) {
    // --- text ---
    case "contains":
      return asString(raw).toLowerCase().includes(asString(c.value).toLowerCase());
    case "not-contains":
      return !asString(raw).toLowerCase().includes(asString(c.value).toLowerCase());
    case "starts-with":
      return asString(raw).toLowerCase().startsWith(asString(c.value).toLowerCase());
    case "ends-with":
      return asString(raw).toLowerCase().endsWith(asString(c.value).toLowerCase());

    // --- equality (works for text and number) ---
    case "eq":
      return asString(raw).toLowerCase() === asString(c.value).toLowerCase();
    case "neq":
      return asString(raw).toLowerCase() !== asString(c.value).toLowerCase();

    // --- number ---
    case "gt":
      return asNumber(raw) > asNumber(c.value);
    case "gte":
      return asNumber(raw) >= asNumber(c.value);
    case "lt":
      return asNumber(raw) < asNumber(c.value);
    case "lte":
      return asNumber(raw) <= asNumber(c.value);

    // --- multi-select ---
    case "includes-any": {
      const values = asStringArray(c.value).map((v) => v.toLowerCase());
      const cell = asString(raw).toLowerCase();
      return values.some((v) => cell.includes(v));
    }
    case "includes-all": {
      const values = asStringArray(c.value).map((v) => v.toLowerCase());
      const cell = asString(raw).toLowerCase();
      return values.every((v) => cell.includes(v));
    }
    case "excludes": {
      const values = asStringArray(c.value).map((v) => v.toLowerCase());
      const cell = asString(raw).toLowerCase();
      return values.every((v) => !cell.includes(v));
    }

    // --- boolean ---
    case "is-true":
      return raw === true;
    case "is-false":
      return raw === false || raw == null;

    // --- date (string ISO compare; good enough for most cases) ---
    case "before":
      return asString(raw) < asString(c.value);
    case "after":
      return asString(raw) > asString(c.value);
    case "between": {
      const [lo, hi] = asStringArray(c.value);
      const cell = asString(raw);
      return cell >= lo && cell <= hi;
    }
    case "last-n-days": {
      const n = asNumber(c.value);
      if (!isFinite(n) || n <= 0) return true;
      const cutoff = Date.now() - n * 86_400_000;
      const t = Date.parse(asString(raw));
      return Number.isFinite(t) && t >= cutoff;
    }

    default:
      return true; // unknown operator → don't drop the row
  }
}

function asString(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return NaN;
}
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asString);
  if (v == null) return [];
  return [String(v)];
}

/** Parse a URL query string back into filter conditions. Pure. */
export function filtersFromQuery(search: string | URLSearchParams): FilterCondition[] {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const grouped = new Map<string, FilterCondition>();
  for (const [k, v] of params.entries()) {
    const m = /^filter\[([^\]]+)\]\[([^\]]+)\]$/.exec(k);
    if (!m) continue;
    const field = m[1];
    const operator = m[2] as FilterOperator;
    const id = `${field}|${operator}`;
    const existing = grouped.get(id);
    if (existing) {
      if (Array.isArray(existing.value)) (existing.value as string[]).push(v);
      else existing.value = [String(existing.value), v];
    } else {
      grouped.set(id, { field, operator, value: v });
    }
  }
  return Array.from(grouped.values());
}
