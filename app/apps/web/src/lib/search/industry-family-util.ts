/**
 * Pure helpers + taxonomy for sector families. Split out of industry-family.ts
 * so they can be unit-tested without pulling in the AI SDK (the classifier's
 * import chain trips a local-only vitest flake). No server-only deps here.
 */
import { FAMILY_LABELS, type IndustryFamily } from "@/lib/ui/industry-style";

export { FAMILY_LABELS };
export type { IndustryFamily };

export const FAMILY_KEYS = Object.keys(FAMILY_LABELS) as IndustryFamily[];

/** Industries (verbatim) whose family is one of `families`. */
export function familiesToIndustries(
  map: Record<string, IndustryFamily>,
  families: string[],
): string[] {
  const want = new Set(families);
  return Object.entries(map)
    .filter(([, fam]) => want.has(fam))
    .map(([ind]) => ind);
}

/** Roll up per-industry counts into per-family counts. */
export function familyCounts(
  map: Record<string, IndustryFamily>,
  industryCounts: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [ind, n] of Object.entries(industryCounts)) {
    const fam = map[ind];
    if (fam) out[fam] = (out[fam] ?? 0) + n;
  }
  return out;
}
