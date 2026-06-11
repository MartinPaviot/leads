/**
 * ICP create/update validation (P2, _specs/multi-icp). Pure — no DB.
 *
 * Validates an ICP payload (name + criteria) against the field catalog
 * resolved by the caller. The API route fetches the catalog (standard
 * global rows + tenant custom rows), passes it here, and rejects with
 * the returned error before touching the DB. Both the rule-builder
 * POST and the AI-inference apply path route through this so neither
 * can persist an incoherent criterion.
 *
 * Rules:
 *   - name: 1-120 chars after trim
 *   - status: draft | active | archived
 *   - priority: integer >= 0
 *   - each criterion: fieldKey must exist in the catalog; operator must
 *     be in that field's allowed operators; value shape must match the
 *     operator (array for in, {min,max} for between, scalar for eq/gt/…,
 *     boolean for exists).
 */

import type { CriterionOperator } from "./field-catalog";

export type CatalogEntry = {
  fieldKey: string;
  operators: CriterionOperator[];
  valueType: string;
};

export type CriterionInput = {
  fieldKey: string;
  operator: string;
  value: unknown;
  weight?: number;
  isRequired?: boolean;
};

export type IcpInput = {
  name?: unknown;
  status?: unknown;
  priority?: unknown;
  description?: unknown;
  criteria?: unknown;
};

export type ValidationResult =
  | {
      ok: true;
      value: {
        name: string;
        status: "draft" | "active" | "archived";
        priority: number;
        description: string | null;
        criteria: Array<{
          fieldKey: string;
          operator: CriterionOperator;
          value: unknown;
          weight: number;
          isRequired: boolean;
        }>;
      };
    }
  | { ok: false; error: string };

const VALID_STATUS = new Set(["draft", "active", "archived"]);

function validateValueShape(
  operator: CriterionOperator,
  value: unknown,
): string | null {
  switch (operator) {
    case "in":
      if (!Array.isArray(value) || value.length === 0) {
        return "operator 'in' requires a non-empty array value";
      }
      return null;
    case "between": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return "operator 'between' requires a { min, max } object";
      }
      const v = value as { min?: unknown; max?: unknown };
      const hasMin = v.min !== undefined && v.min !== null;
      const hasMax = v.max !== undefined && v.max !== null;
      if (!hasMin && !hasMax) {
        return "operator 'between' requires at least one of min / max";
      }
      return null;
    }
    case "exists":
      if (typeof value !== "boolean") {
        return "operator 'exists' requires a boolean value";
      }
      return null;
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      if (typeof value !== "number" && typeof value !== "string") {
        return `operator '${operator}' requires a numeric value`;
      }
      return null;
    case "eq":
    case "contains":
      if (value === null || value === undefined || value === "") {
        return `operator '${operator}' requires a non-empty value`;
      }
      return null;
    default:
      return `unknown operator '${operator}'`;
  }
}

/**
 * Validate an ICP payload. `catalog` is the resolved field catalog
 * (standard + tenant custom) the criteria are checked against.
 */
export function validateIcpInput(
  input: IcpInput,
  catalog: CatalogEntry[],
): ValidationResult {
  // name
  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return { ok: false, error: "name is required" };
  }
  const name = input.name.trim();
  if (name.length > 120) {
    return { ok: false, error: "name must be <= 120 characters" };
  }

  // status (optional, defaults to draft)
  const status = input.status === undefined ? "draft" : input.status;
  if (typeof status !== "string" || !VALID_STATUS.has(status)) {
    return {
      ok: false,
      error: "status must be one of draft | active | archived",
    };
  }

  // priority (optional, defaults to 100)
  const priority = input.priority === undefined ? 100 : input.priority;
  if (
    typeof priority !== "number" ||
    !Number.isInteger(priority) ||
    priority < 0
  ) {
    return { ok: false, error: "priority must be a non-negative integer" };
  }

  // description (optional)
  const description =
    input.description === undefined || input.description === null
      ? null
      : String(input.description);

  // criteria
  if (input.criteria !== undefined && !Array.isArray(input.criteria)) {
    return { ok: false, error: "criteria must be an array" };
  }
  const rawCriteria = (input.criteria as CriterionInput[] | undefined) ?? [];
  const catalogByKey = new Map(catalog.map((c) => [c.fieldKey, c]));

  const criteria: Array<{
    fieldKey: string;
    operator: CriterionOperator;
    value: unknown;
    weight: number;
    isRequired: boolean;
  }> = [];

  for (let i = 0; i < rawCriteria.length; i++) {
    const c = rawCriteria[i];
    if (!c || typeof c.fieldKey !== "string") {
      return { ok: false, error: `criterion ${i}: fieldKey is required` };
    }
    const field = catalogByKey.get(c.fieldKey);
    if (!field) {
      return {
        ok: false,
        error: `criterion ${i}: unknown field '${c.fieldKey}' (not in catalog)`,
      };
    }
    if (typeof c.operator !== "string") {
      return { ok: false, error: `criterion ${i}: operator is required` };
    }
    if (!field.operators.includes(c.operator as CriterionOperator)) {
      return {
        ok: false,
        error: `criterion ${i}: operator '${c.operator}' not allowed for field '${c.fieldKey}' (allowed: ${field.operators.join(", ")})`,
      };
    }
    const shapeErr = validateValueShape(c.operator as CriterionOperator, c.value);
    if (shapeErr) {
      return { ok: false, error: `criterion ${i}: ${shapeErr}` };
    }
    const weight =
      c.weight === undefined ? 1 : typeof c.weight === "number" ? c.weight : NaN;
    if (!Number.isFinite(weight) || weight < 0) {
      return { ok: false, error: `criterion ${i}: weight must be >= 0` };
    }
    criteria.push({
      fieldKey: c.fieldKey,
      operator: c.operator as CriterionOperator,
      value: c.value,
      weight,
      isRequired: c.isRequired === true,
    });
  }

  // An active ICP with no criteria matches nothing yet still occupies a
  // priority slot — and the 2026-06-01 migration proved empty actives
  // accumulate as inert shells (96 in prod). Keep it a draft until it
  // has at least one criterion (_specs/icp-unification R8.1).
  if (status === "active" && criteria.length === 0) {
    return {
      ok: false,
      error: "An active ICP needs at least one criterion — save it as a draft until it has criteria",
    };
  }

  return {
    ok: true,
    value: { name, status: status as "draft" | "active" | "archived", priority, description, criteria },
  };
}
