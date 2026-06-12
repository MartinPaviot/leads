/**
 * Documentation content model.
 *
 * Articles are plain data (strings, never JSX) so the same content renders
 * inside the settings shell and on the marketing site, and so tests can
 * walk every string and enforce the house copy rules (no emoji, no em/en
 * dashes, no provider or competitor names, Elevay branding).
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
  | { type: "table"; headers: string[]; rows: string[][] };

export type DocCategory = "Method" | "TAM" | "Outbound";

export interface DocArticle {
  /** URL segment, kebab-case, unique across all articles. */
  slug: string;
  category: DocCategory;
  title: string;
  /** One-liner shown on index cards and used as meta description. */
  description: string;
  blocks: DocBlock[];
}
