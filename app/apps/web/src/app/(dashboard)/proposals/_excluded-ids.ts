/**
 * CLE-14 — proposals action IDs we INTENTIONALLY do NOT register: file
 * upload/download verbs are human-bound. A boundary test
 * (proposals-actions.boundary.test.ts) asserts the registered id set is disjoint
 * from this.
 *
 * Kept in this `_`-prefixed (router-ignored) module, not page.tsx: a Next.js
 * page.tsx may only export the default component + route config, so a named export
 * there fails `next build`'s page-type check.
 */
export const PROPOSALS_EXCLUDED_IDS = [
  "proposals.uploadTemplate",
  "proposals.submitTemplate",
  "proposals.downloadPdf",
  "proposals.download",
] as const;
