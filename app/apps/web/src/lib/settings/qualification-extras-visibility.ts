/**
 * Prod-hidden gate for the marginal-value qualification extras — the BANT / SPIN
 * lens toggle on the scorecard, and the hybrid per-field capture mode.
 *
 * The underlying logic stays fully wired (getFieldApprovalMode still resolves
 * per-field; the BANT/SPIN re-projections still compute) — this only controls
 * whether those controls are OFFERED in the UI, so a founder-led workspace isn't
 * handed power-user controls it doesn't need. Shown in dev, hidden in production;
 * flip on in prod with NEXT_PUBLIC_QUALIFICATION_EXTRAS=1.
 *
 * Mirrors the other UI-visibility gates (billing/page-visibility,
 * docs/page-visibility, settings/admin-tools-visibility). NODE_ENV and
 * NEXT_PUBLIC_* are inlined at build, so this is safe to read from client
 * components.
 */
export const QUALIFICATION_EXTRAS_ENABLED =
  process.env.NEXT_PUBLIC_QUALIFICATION_EXTRAS === "1" ||
  process.env.NODE_ENV !== "production";
