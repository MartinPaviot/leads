# DOCS-001 — Design

## System fit

Static, code-defined documentation. No DB, no API, no LLM. One content
registry consumed by two surfaces:

- Public: `(marketing)/docs` + `(marketing)/docs/[slug]` with a light
  marketing shell (logo header + minimal footer), light-only palette.
- In-app: `(dashboard)/settings/docs` + `settings/docs/[slug]` inside the
  settings shell (SettingsHeader convention, CSS-variable tokens, dark-ready).

## Data model (in code, no migration)

`lib/docs/types.ts`
- `DocBlock` union: `p | h2 | h3 | ul | ol | callout | table`
- `DocArticle { slug, category: "Method"|"TAM"|"Outbound", title, description, blocks }`
- Inline emphasis: `**bold**` only, parsed by a pure helper
  (`lib/docs/inline.ts`) so it is unit-testable without React.

`lib/docs/content.ts`
- Aggregates `lib/docs/articles/{method,tam,outbound}.ts`
- Helpers: `getDocBySlug`, `getAdjacentDocs`, `docsByCategory`,
  `estimateReadMinutes`, `collectDocStrings` (test + read-time walker).

## Visibility gate

`lib/docs/page-visibility.ts` → `DOCS_PAGE_ENABLED = NODE_ENV !== "production"`.
Same pattern as BILLING_PAGE_ENABLED / admin-tools-visibility. Applied at:
1. all four route files (`notFound()` when disabled),
2. settings sidebar item (`ready: DOCS_PAGE_ENABLED`, new Resources section),
3. landing header/footer links (conditional render, absent from prod DOM).

To publish later: flip the constant (or swap to an env flag) + add /docs to
sitemap. One-line change.

## Rendering

`components/docs/doc-blocks.tsx` server component. A `tone` prop picks the
palette: `marketing` (fixed light gray classes, immune to the app dark
class) vs `app` (CSS variables, follows app theme). Tables wrapped in
`overflow-x-auto` so they cannot blow the settings max-w-2xl column.

## Failure handling

- Unknown slug → `notFound()`.
- Gate disabled → `notFound()` before any content import is rendered.
- No client JS needed anywhere except existing landing page.

## Security

Static strings only. No user input, no dangerouslySetInnerHTML in docs
rendering (the inline parser returns text segments, never HTML).
