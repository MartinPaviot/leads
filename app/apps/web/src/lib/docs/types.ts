/**
 * Documentation content model: the Elevay method as ordered steps.
 *
 * The docs are not articles; they are one operating method, read in
 * order, grouped into phases. Steps are plain data (strings, never JSX)
 * so the same content renders inside the settings shell and on the
 * marketing site, and so tests can walk every string and enforce the
 * house copy rules (no emoji, no em/en dashes, no provider or competitor
 * names, Elevay branding).
 *
 * Inline emphasis uses `**bold**` only, parsed by lib/docs/inline.ts.
 */

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "callout"; title?: string; text: string }
  /** A concrete worked example (Elevay itself as the example company). */
  | { type: "example"; title?: string; lines: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export type DocPhase =
  | "Foundations"
  | "Build the machine"
  | "Run outbound"
  | "Win the deal"
  | "Learn and compound";

export interface DocStep {
  /** URL segment, kebab-case, unique across all steps. */
  slug: string;
  /** 1-based position in the method; drives numbering and prev/next. */
  step: number;
  phase: DocPhase;
  title: string;
  /** One-liner shown on the method index and used as meta description. */
  description: string;
  blocks: DocBlock[];
}
