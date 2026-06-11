/**
 * The TAM proposal review flow ("Proposals (n)" button on the Accounts
 * header -> /tam/review) is not part of the production product yet: the
 * entry point is hidden from production builds but stays available on
 * `next dev` for local work. Same pattern as BILLING_PAGE_ENABLED
 * (lib/billing/page-visibility.ts). The /tam/review page itself and the
 * proposal APIs/crons are untouched.
 *
 * NODE_ENV is inlined into client bundles at build time, so this constant
 * is safe to read from both server and client components.
 */
export const TAM_PROPOSALS_ENTRY_ENABLED = process.env.NODE_ENV !== "production";
