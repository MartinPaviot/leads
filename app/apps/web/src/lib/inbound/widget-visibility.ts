/**
 * The "Hot inbounds" speed-to-lead widget on Up next (/home) is OFF: on a real
 * founder's mailbox it surfaces subscription/no-reply noise rather than genuine
 * inbound buyers, so it adds no signal. It now never renders in any environment
 * (previously prod-hidden / dev-only; turned fully off 2026-06-19 at the
 * founder's request). Flip back to `process.env.NODE_ENV !== "production"` to
 * restore the dev-only behaviour.
 *
 * Same pattern as BILLING_PAGE_ENABLED (lib/billing/page-visibility.ts) and
 * EVALS_PAGE_ENABLED (lib/settings/admin-tools-visibility.ts). The API behind
 * it (/api/dashboard/hot-inbounds) and the rest of the inbound-recognition
 * pipeline are untouched, so re-enabling is a one-line change.
 */
export const HOT_INBOUNDS_WIDGET_ENABLED = false;
