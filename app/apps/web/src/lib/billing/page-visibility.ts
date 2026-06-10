/**
 * Self-serve billing (Stripe plans page) is not part of the production
 * product yet: the page and every entry point to it are hidden from
 * production builds, but stay available on `next dev` for local work.
 *
 * NODE_ENV is inlined into client bundles at build time, so this constant
 * is safe to read from both server and client components.
 */
export const BILLING_PAGE_ENABLED = process.env.NODE_ENV !== "production";
