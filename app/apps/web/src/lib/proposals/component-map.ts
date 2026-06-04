/**
 * The component map is the contract that PROPOSAL-002/003/004 consume.
 * It describes a template as an ordered list of components — "sections"
 * (prose generated per prospect) and "fields" (short variable values
 * mapped to Elevay data via a fixed dataKey vocabulary).
 */

import { z } from "zod";

export const COMPONENT_KINDS = ["section", "field"] as const;
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

/**
 * The closed vocabulary a "field" can bind to. `null` means a "section"
 * whose prose is LLM-generated from the info base (no direct mapping).
 * Keep in sync with the fill step (PROPOSAL-002) which resolves these.
 */
export const DATA_KEYS = [
  "company.name",
  "company.industry",
  "company.description",
  "contact.name",
  "contact.title",
  "contact.email",
  "deal.name",
  "deal.summary",
  "deal.amount", // resolved via getDealAmountDisplay — never raw projectAmount+platformArr
  "date.today",
  "seller.companyName",
  "seller.productDescription",
] as const;

export type DataKey = (typeof DATA_KEYS)[number];

export function isKnownDataKey(k: unknown): k is DataKey {
  return typeof k === "string" && (DATA_KEYS as readonly string[]).includes(k);
}

// ── The normalized, stored map ──────────────────────────────────────

export const componentSchema = z.object({
  id: z.string(),
  kind: z.enum(COMPONENT_KINDS),
  label: z.string(),
  placeholderToken: z.string(),
  dataKey: z.string().nullable(),
  anchor: z.object({
    headingText: z.string().nullable(),
    offset: z.number().nullable(),
  }),
  required: z.boolean(),
  confidence: z.enum(CONFIDENCE_LEVELS),
  order: z.number(),
});

export const componentMapSchema = z.object({
  version: z.literal(1),
  components: z.array(componentSchema),
});

export type Component = z.infer<typeof componentSchema>;
export type ComponentMap = z.infer<typeof componentMapSchema>;

// ── What the LLM returns (no id/order — assigned by us) ─────────────

export const detectedComponentSchema = z.object({
  kind: z.enum(COMPONENT_KINDS),
  label: z.string(),
  placeholderToken: z.string(),
  dataKey: z.string().nullable(),
  // PROPOSAL-008: index into the numbered outline that begins this component.
  // Preferred over free-text; the stored anchor uses the outline's exact text.
  anchorIndex: z.number().nullable(),
  anchorHeading: z.string().nullable(),
  required: z.boolean(),
  confidence: z.enum(CONFIDENCE_LEVELS),
});

export const detectionSchema = z.object({
  components: z.array(detectedComponentSchema),
});

export type DetectedComponent = z.infer<typeof detectedComponentSchema>;
export type DetectionResult = z.infer<typeof detectionSchema>;

// ── Helpers ─────────────────────────────────────────────────────────

/** Coerce an LLM-suggested token into a stable {{snake_case}} form. */
export function normalizeToken(token: string, label: string): string {
  const inner = (token || label || "field")
    .replace(/[{}]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `{{${inner || "field"}}}`;
}

/** Locate where a component's anchor heading begins in the text. */
export function findAnchorOffset(
  outline: Array<{ text: string; offset: number }>,
  text: string,
  heading: string | null,
): number | null {
  if (!heading) return null;
  const hit = outline.find((h) => h.text === heading);
  if (hit) return hit.offset;
  const idx = text.indexOf(heading);
  return idx >= 0 ? idx : null;
}

export interface MapValidationError {
  componentId: string | null;
  error: string;
}

/**
 * A confirmed (mapped) template must be complete enough for the fill step:
 * non-empty, every component labelled, every field bound to a known dataKey.
 */
export function validateConfirmedMap(map: unknown): {
  ok: boolean;
  errors: MapValidationError[];
} {
  const parsed = componentMapSchema.safeParse(map);
  if (!parsed.success) {
    return { ok: false, errors: [{ componentId: null, error: "invalid_map_shape" }] };
  }
  const errors: MapValidationError[] = [];
  const { components } = parsed.data;
  if (components.length === 0) {
    errors.push({ componentId: null, error: "empty_map" });
  }
  for (const c of components) {
    if (!c.label.trim()) {
      errors.push({ componentId: c.id, error: "missing_label" });
    }
    if (c.kind === "field" && !isKnownDataKey(c.dataKey)) {
      errors.push({ componentId: c.id, error: "field_missing_or_unknown_dataKey" });
    }
  }
  return { ok: errors.length === 0, errors };
}
