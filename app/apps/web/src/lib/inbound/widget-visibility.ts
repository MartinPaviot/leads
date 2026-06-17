/**
 * The "Hot inbounds" speed-to-lead widget on Up next (/home) is not part of
 * the production product right now: on a real founder's mailbox it surfaces
 * subscription/no-reply noise rather than genuine inbound buyers, so it adds
 * no signal. It's hidden from production builds — the widget never renders on
 * Up next — but stays available on `next dev` for internal work while we
 * tighten inbound qualification.
 *
 * Same pattern as BILLING_PAGE_ENABLED (lib/billing/page-visibility.ts) and
 * EVALS_PAGE_ENABLED (lib/settings/admin-tools-visibility.ts). The API behind
 * it (/api/dashboard/hot-inbounds) and the rest of the inbound-recognition
 * pipeline are untouched.
 *
 * NODE_ENV is inlined into client bundles at build time, so this constant is
 * safe to read from both server and client components.
 */
export const HOT_INBOUNDS_WIDGET_ENABLED = process.env.NODE_ENV !== "production";
