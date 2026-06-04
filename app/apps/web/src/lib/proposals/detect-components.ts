/**
 * LLM component detection: read a template's extracted text + outline and
 * propose its component map. Pure (no DB writes) so it is reusable from the
 * upload route, the detection skill, and chat. Retries once on an invalid
 * model response, then throws DetectionUnavailable so callers can degrade
 * cleanly (the "proofread-only" promise must never rest on a fabricated map).
 */

import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { getModelForTask } from "@/lib/ai/ai-provider";
import {
  detectionSchema,
  componentMapSchema,
  isKnownDataKey,
  normalizeToken,
  findAnchorOffset,
  DATA_KEYS,
  type ComponentMap,
  type DetectionResult,
} from "./component-map";

// Structural heading shape (matches ooxml.DocHeading / ingest-docx).
type Heading = { level: number; text: string; offset: number };

export interface DetectionMeta {
  truncated: boolean;
  model: string | null;
  componentCount: number;
}

export class DetectionUnavailable extends Error {
  reason: "missing_required_data" | "below_quality_threshold";
  constructor(
    reason: "missing_required_data" | "below_quality_threshold",
    message: string,
  ) {
    super(message);
    this.name = "DetectionUnavailable";
    this.reason = reason;
  }
}

const MAX_TEXT_CHARS = 24_000;

function buildPrompt(outlineText: string, windowText: string): string {
  return `You are analyzing a commercial proposal TEMPLATE so it can later be auto-filled for a specific prospect. Map the document into an ordered list of COMPONENTS.

A "section" is a block of prose that gets (re)written per prospect — e.g. Executive Summary, Context/Problem, Proposed Solution, Scope, Methodology, Timeline, Pricing, About Us, Terms, Next Steps. For a section, set dataKey to null.

A "field" is a short variable value to substitute — e.g. client company name, contact name, date, amount. For a field, set dataKey to the BEST match from this fixed vocabulary:
${DATA_KEYS.map((k) => `  - ${k}`).join("\n")}

Rules:
- Preserve document order.
- Never drop a recognizable section. If unsure of its purpose, still return it with a best-effort label and confidence "low".
- placeholderToken: a snake_case token in double braces, e.g. {{executive_summary}} or {{client_name}}.
- anchorIndex: the NUMBER of the OUTLINE entry that begins this component (e.g. 0, 1, 2), or null if it has no heading. Prefer this over free text.
- anchorHeading: optionally copy that heading's exact text, or null.
- required: true for components essential to a proposal (executive summary, proposed solution, pricing), false otherwise.
- confidence: "high" | "medium" | "low".

OUTLINE:
${outlineText}

DOCUMENT TEXT:
${windowText}`;
}

export async function detectComponents(
  text: string,
  outline: Heading[],
  opts: { tenantId: string },
): Promise<{ componentMap: ComponentMap; meta: DetectionMeta }> {
  if (!text.trim()) {
    throw new DetectionUnavailable(
      "missing_required_data",
      "Template has no extractable text to analyze",
    );
  }

  const model = getModelForTask("chat");
  if (!model) {
    throw new DetectionUnavailable(
      "missing_required_data",
      "No LLM model configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)",
    );
  }

  const truncated = text.length > MAX_TEXT_CHARS;
  const windowText = truncated ? text.slice(0, MAX_TEXT_CHARS) : text;
  const outlineText =
    outline.map((h, i) => `${i}: ${h.text}`).join("\n") || "(no headings detected)";
  const basePrompt = buildPrompt(outlineText, windowText);

  let detection: DetectionResult | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2 && detection === null; attempt++) {
    try {
      const result = await tracedGenerateObject({
        model,
        schema: detectionSchema,
        prompt:
          attempt === 0
            ? basePrompt
            : `${basePrompt}\n\nYour previous response was not valid. Return ONLY a JSON object matching the schema.`,
        _trace: {
          agentId: "skill-proposal-detect-components",
          tenantId: opts.tenantId,
        },
      });
      detection = result.object as DetectionResult;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!detection) {
    throw new DetectionUnavailable(
      "below_quality_threshold",
      `Component detection failed: ${String(lastErr).slice(0, 200)}`,
    );
  }

  const components = detection.components.map((c, i) => {
    // PROPOSAL-008: prefer the outline index so the stored anchor is the
    // extractor's EXACT heading text (drift-proof), not the model's paraphrase.
    const fromIdx =
      c.anchorIndex != null && c.anchorIndex >= 0 && c.anchorIndex < outline.length
        ? outline[c.anchorIndex]
        : null;
    return {
      id: crypto.randomUUID(),
      kind: c.kind,
      label: c.label,
      placeholderToken: normalizeToken(c.placeholderToken, c.label),
      // Only fields carry a dataKey; coerce unknown keys to null so the
      // confirm step surfaces them for the user to fix.
      dataKey: c.kind === "field" && isKnownDataKey(c.dataKey) ? c.dataKey : null,
      anchor: {
        headingText: fromIdx ? fromIdx.text : c.anchorHeading,
        offset: fromIdx ? fromIdx.offset : findAnchorOffset(outline, text, c.anchorHeading),
      },
      required: c.required,
      confidence: c.confidence,
      order: i,
    };
  });

  const componentMap: ComponentMap = componentMapSchema.parse({
    version: 1,
    components,
  });

  const modelId =
    (model as { modelId?: string }).modelId ?? null;

  return {
    componentMap,
    meta: { truncated, model: modelId, componentCount: components.length },
  };
}
