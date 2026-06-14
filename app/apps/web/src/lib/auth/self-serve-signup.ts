/**
 * Self-serve account creation is PROD-HIDDEN, not removed.
 *
 * Elevay is sales-led / invitation-only in production: an OAuth
 * (Google / Microsoft) first login must NOT spin up a brand-new workspace
 * there. But the self-provisioning path stays fully intact and is restored by
 * flipping this gate — same pattern as BILLING_PAGE_ENABLED /
 * DOCS_PAGE_ENABLED / admin-tools-visibility (kept alive under `next dev`,
 * 404'd / denied in production).
 *
 * When ENABLED (non-production, e.g. local dev): OAuth first-login
 * self-provisions a tenant where the user is the founder-admin — the original
 * behavior, kept verbatim so it can be tested and turned back on.
 *
 * When DISABLED (production default): only an existing account or an open
 * invitation may sign in via OAuth; everyone else is denied with AccessDenied
 * BEFORE any row is written, and the server-side tenant-creation branch refuses
 * to run as a backstop.
 *
 * To restore self-serve in production, change this constant (it intentionally
 * mirrors the NODE_ENV gate the rest of the prod-hidden surfaces use).
 */
export const SELF_SERVE_SIGNUP_ENABLED = process.env.NODE_ENV !== "production";
