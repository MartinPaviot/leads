/**
 * The methodology documentation (Settings > Documentation and the public
 * /docs section linked from the landing page) is not published to
 * production yet: every page 404s and every entry point to it is hidden
 * from production builds, but everything stays available on `next dev`
 * for internal review. Same pattern as BILLING_PAGE_ENABLED
 * (lib/billing/page-visibility.ts) and the admin tools
 * (lib/settings/admin-tools-visibility.ts).
 *
 * To publish: flip this constant (or swap it to an env flag) and add
 * /docs to the sitemap.
 *
 * NODE_ENV is inlined into client bundles at build time, so this constant
 * is safe to read from both server and client components.
 */
export const DOCS_PAGE_ENABLED = process.env.NODE_ENV !== "production";
