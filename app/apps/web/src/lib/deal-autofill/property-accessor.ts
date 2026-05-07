/**
 * Deal property accessor — backwards-compat wrapper (P0-5 task 5.2).
 *
 * The autofill convention shift moves `deals.properties[key]` from
 *   `Record<string, primitive | array>`         (old, pre-P0-5)
 * to
 *   `Record<string, PropertyEntry>` where
 *   `PropertyEntry = { value, source, date, manual, confidence? }`
 *
 * Existing rows in production still use the old shape. Rather than
 * forcing an immediate migration that risks data loss, we keep both
 * shapes readable during the rollout window and offer a writer that
 * always produces the new shape. After backfill, all rows use the
 * new shape ; the legacy path stays as defensive code.
 *
 * All accessors are pure — no IO, no side effects — so tests cover
 * every branch deterministically.
 */

import type { PropertyEntry } from "./conflict-resolution";

/**
 * Probe : does this jsonb value look like a new-shape PropertyEntry ?
 *
 * Heuristic : an object with at least `value`, `source`, `date`,
 * `manual` keys. We don't require all of them — just enough that we
 * couldn't accidentally classify e.g. `{ industry: "Devtools" }` as
 * a PropertyEntry.
 */
export function isPropertyEntry(v: unknown): v is PropertyEntry {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  // The combination of these four signals is what disambiguates
  // a wrapped entry from an arbitrary nested object.
  return (
    "value" in o &&
    "source" in o &&
    "date" in o &&
    "manual" in o &&
    typeof o.manual === "boolean"
  );
}

/**
 * Read a property — returns the unwrapped value regardless of which
 * shape lives on disk. Returns `undefined` when the field is absent.
 *
 * Used by anything that doesn't care about source attribution :
 * existing components that just want "what's the budget ?".
 */
export function getDealProperty<T = unknown>(
  properties: Record<string, unknown> | null | undefined,
  fieldName: string,
): T | undefined {
  if (!properties || typeof properties !== "object") return undefined;
  const raw = (properties as Record<string, unknown>)[fieldName];
  if (raw === undefined) return undefined;
  if (isPropertyEntry(raw)) return raw.value as T;
  return raw as T;
}

/**
 * Read the full PropertyEntry. Returns `null` when the field is
 * absent. When the field is in legacy shape, synthesises an entry
 * with `manual: true` (assumption : pre-P0-5 fields were all manual
 * since autofill didn't touch them yet) and `source: "legacy"`.
 *
 * Used by source-attribution UI : the tooltip that shows "from email
 * Oct 15 (confidence 0.92)".
 */
export function getDealPropertyEntry<T = unknown>(
  properties: Record<string, unknown> | null | undefined,
  fieldName: string,
  legacyDateFallback?: Date | string,
): PropertyEntry<T> | null {
  if (!properties || typeof properties !== "object") return null;
  const raw = (properties as Record<string, unknown>)[fieldName];
  if (raw === undefined) return null;
  if (isPropertyEntry(raw)) return raw as PropertyEntry<T>;
  // Legacy : synthesise.
  return {
    value: raw as T,
    source: "legacy",
    date: legacyDateFallback ?? new Date(0),
    manual: true,
  };
}

/**
 * Write a property in the new shape. Use this for ALL writes after
 * P0-5 ships — never write the raw value directly. Returns a new
 * properties object ; doesn't mutate the input.
 */
export function setDealProperty<T = unknown>(
  properties: Record<string, unknown> | null | undefined,
  fieldName: string,
  entry: PropertyEntry<T>,
): Record<string, unknown> {
  const base = properties && typeof properties === "object" ? { ...properties } : {};
  base[fieldName] = {
    value: entry.value,
    source: entry.source,
    date: entry.date instanceof Date ? entry.date.toISOString() : entry.date,
    manual: entry.manual,
    ...(entry.confidence !== undefined ? { confidence: entry.confidence } : {}),
  };
  return base;
}

/**
 * Append to the field's history. The new shape stores prior values
 * under `<fieldName>_history` as an array of PropertyEntry. Used by
 * the cascade when a `latest_wins` resolution overwrites a previous
 * value — we keep the older entry for audit.
 */
export function appendToPropertyHistory<T = unknown>(
  properties: Record<string, unknown> | null | undefined,
  fieldName: string,
  oldEntry: PropertyEntry<T>,
  maxHistory: number = 10,
): Record<string, unknown> {
  const base = properties && typeof properties === "object" ? { ...properties } : {};
  const historyKey = `${fieldName}_history`;
  const existingRaw = base[historyKey];
  const existing: unknown[] = Array.isArray(existingRaw) ? existingRaw : [];
  const next = [
    ...existing,
    {
      value: oldEntry.value,
      source: oldEntry.source,
      date:
        oldEntry.date instanceof Date
          ? oldEntry.date.toISOString()
          : oldEntry.date,
      manual: oldEntry.manual,
      ...(oldEntry.confidence !== undefined
        ? { confidence: oldEntry.confidence }
        : {}),
    },
  ];
  // Cap retained history per field — old entries beyond the cap drop.
  // Keeps `properties` jsonb bounded so a chatty integration doesn't
  // bloat the row over months.
  base[historyKey] = next.slice(-maxHistory);
  return base;
}

/**
 * Migrate one legacy row's properties to the new shape in-memory.
 * Used by the backfill script. Idempotent : already-migrated rows
 * pass through unchanged.
 */
export function migrateLegacyProperties(
  properties: Record<string, unknown> | null | undefined,
  fallbackUpdatedAt: Date | string,
): Record<string, unknown> {
  if (!properties || typeof properties !== "object") return {};
  const out: Record<string, unknown> = {};
  const fallbackDate =
    fallbackUpdatedAt instanceof Date
      ? fallbackUpdatedAt.toISOString()
      : fallbackUpdatedAt;
  for (const [key, raw] of Object.entries(properties)) {
    if (key.endsWith("_history")) {
      // History arrays already in new shape, copy through.
      out[key] = raw;
      continue;
    }
    if (isPropertyEntry(raw)) {
      out[key] = raw;
      continue;
    }
    // Wrap legacy primitive/array as manual entry.
    out[key] = {
      value: raw,
      source: "legacy",
      date: fallbackDate,
      manual: true,
    };
  }
  return out;
}
