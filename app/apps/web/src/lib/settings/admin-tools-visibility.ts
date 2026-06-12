/**
 * Internal admin tooling (agent eval harness, MCP key management) is not
 * part of the production product yet: `isAdmin` means *workspace* admin,
 * so every customer founder would see these pages. They are hidden from
 * production builds — sidebar entry gone, page 404s — but stay available
 * on `next dev` for internal work. Same pattern as BILLING_PAGE_ENABLED
 * (lib/billing/page-visibility.ts) and TAM_PROPOSALS_ENTRY_ENABLED
 * (lib/tam/entry-visibility.ts).
 *
 * The APIs behind them are untouched: /api/eval/* stays admin-gated and
 * /api/mcp keeps serving any previously issued key.
 *
 * NODE_ENV is inlined into client bundles at build time, so these constants
 * are safe to read from both server and client components.
 */
export const EVALS_PAGE_ENABLED = process.env.NODE_ENV !== "production";
export const MCP_PAGE_ENABLED = process.env.NODE_ENV !== "production";
