/**
 * CLE-14 — settings action IDs we INTENTIONALLY do NOT register: auth factors
 * (password / MFA) must stay with the human, and billing / plan / payment spend
 * real money and live behind the human only. A boundary test asserts the
 * registered settings id set is DISJOINT from this.
 *
 * Kept in this `_`-prefixed (router-ignored) module, not page.tsx: a Next.js
 * page.tsx may only export the default component + route config, so a named export
 * there fails `next build`'s page-type check.
 */
export const SETTINGS_EXCLUDED_IDS = [
  "settings.changePassword", "settings.enrollMfa", "settings.disableMfa",
  "settings.manageBilling", "settings.upgradePlan", "settings.updatePayment",
] as const;
