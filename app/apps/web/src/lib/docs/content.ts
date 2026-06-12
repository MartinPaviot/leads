import type { DocArticle, DocBlock, DocCategory } from "./types";
import { methodArticles } from "./articles/method";
import { tamArticles } from "./articles/tam";
import { outboundArticles } from "./articles/outbound";

/** Display order of categories everywhere (index pages, sidebars). */
export const DOC_CATEGORIES: DocCategory[] = ["Method", "TAM", "Outbound"];

export const CATEGORY_TAGLINES: Record<DocCategory, string> = {
  Method: "How the engine works and the doctrines it enforces.",
  TAM: "Your market as a finite, named, living asset.",
  Outbound: "One playbook per channel, sized for founder-led sales.",
};

/** Canonical reading order: also drives prev/next navigation. */
export const docArticles: DocArticle[] = [
  ...methodArticles,
  ...tamArticles,
  ...outboundArticles,
];

export function getDocBySlug(slug: string): DocArticle | undefined {
  return docArticles.find((a) => a.slug === slug);
}

export function docsByCategory(): Array<{ category: DocCategory; articles: DocArticle[] }> {
  return DOC_CATEGORIES.map((category) => ({
    category,
    articles: docArticles.filter((a) => a.category === category),
  })).filter((g) => g.articles.length > 0);
}

export function getAdjacentDocs(slug: string): {
  prev: DocArticle | null;
  next: DocArticle | null;
} {
  const i = docArticles.findIndex((a) => a.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? docArticles[i - 1] : null,
    next: i < docArticles.length - 1 ? docArticles[i + 1] : null,
  };
}

/** Every human-readable string of a block, for tests and read-time. */
export function collectBlockStrings(block: DocBlock): string[] {
  switch (block.type) {
    case "p":
    case "h2":
    case "h3":
      return [block.text];
    case "ul":
    case "ol":
      return [...block.items];
    case "callout":
      return block.title ? [block.title, block.text] : [block.text];
    case "table":
      return [...block.headers, ...block.rows.flat()];
  }
}

export function collectDocStrings(article: DocArticle): string[] {
  return [
    article.title,
    article.description,
    ...article.blocks.flatMap(collectBlockStrings),
  ];
}

/** Rough reading time at ~200 words/min, floored at 2 minutes. */
export function estimateReadMinutes(article: DocArticle): number {
  const words = collectDocStrings(article)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(2, Math.round(words / 200));
}
