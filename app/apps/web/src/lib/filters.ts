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
