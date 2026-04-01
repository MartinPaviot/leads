/**
 * Shared UI utilities for consistent design system token usage across pages.
 * All colors reference CSS custom properties defined in globals.css.
 */

/** Hash a string to an index 0-9 for badge color assignment */
export function badgeColorIndex(str: string): number {
  if (!str) return 0;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 10;
}

/** 10-hue badge color palette referencing CSS custom properties */
export const BADGE_COLORS: Array<{ bg: string; text: string }> = [
  { bg: "var(--color-badge-0-bg)", text: "var(--color-badge-0)" },
  { bg: "var(--color-badge-1-bg)", text: "var(--color-badge-1)" },
  { bg: "var(--color-badge-2-bg)", text: "var(--color-badge-2)" },
  { bg: "var(--color-badge-3-bg)", text: "var(--color-badge-3)" },
  { bg: "var(--color-badge-4-bg)", text: "var(--color-badge-4)" },
  { bg: "var(--color-badge-5-bg)", text: "var(--color-badge-5)" },
  { bg: "var(--color-badge-6-bg)", text: "var(--color-badge-6)" },
  { bg: "var(--color-badge-7-bg)", text: "var(--color-badge-7)" },
  { bg: "var(--color-badge-8-bg)", text: "var(--color-badge-8)" },
  { bg: "var(--color-badge-9-bg)", text: "var(--color-badge-9)" },
];

/** Get badge color for a category string */
export function getBadgeColor(str: string): { bg: string; text: string } {
  return BADGE_COLORS[badgeColorIndex(str)];
}

/** Lifecycle stage styling using CSS custom properties */
export const LIFECYCLE_CONFIG: Record<string, { bg: string; text: string }> = {
  new: { bg: "rgba(255,255,255,0.06)", text: "var(--color-text-secondary)" },
  prospecting: { bg: "var(--color-badge-0-bg)", text: "var(--color-badge-0)" },
  opportunity: { bg: "var(--color-badge-2-bg)", text: "var(--color-badge-2)" },
  customer: { bg: "var(--color-badge-1-bg)", text: "var(--color-badge-1)" },
  disqualified: { bg: "var(--color-badge-5-bg)", text: "var(--color-badge-5)" },
  inbound: { bg: "var(--color-badge-9-bg)", text: "var(--color-badge-9)" },
  nurture: { bg: "var(--color-badge-8-bg)", text: "var(--color-badge-8)" },
};

/** Get lifecycle stage style with fallback */
export function getLifecycleStyle(stage: string): { bg: string; text: string } {
  return LIFECYCLE_CONFIG[stage] || LIFECYCLE_CONFIG.new;
}

/** Pipeline stage dot colors using CSS custom properties */
export const STAGE_COLORS: Record<string, string> = {
  lead: "var(--color-text-muted)",
  qualification: "var(--color-text-tertiary)",
  demo: "var(--color-badge-3)",       // orange
  trial: "var(--color-badge-9)",      // amber
  proposal: "var(--color-badge-9)",   // amber
  negotiation: "var(--color-badge-1)", // green
  won: "var(--color-badge-0)",        // blue
  lost: "var(--color-badge-5)",       // red
};

/** Map numeric score to letter grade */
export function letterGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

/** Map numeric score to heat label with CSS var color and emoji */
export function heatLabel(score: number): { label: string; color: string; icon: string } {
  if (score >= 80) return { label: "Burning", color: "var(--color-success)", icon: "🔥" };
  if (score >= 60) return { label: "Warm", color: "var(--color-warning)", icon: "☀️" };
  if (score >= 40) return { label: "Cool", color: "var(--color-info)", icon: "" };
  return { label: "Cold", color: "var(--color-text-tertiary)", icon: "" };
}

/** Combined score display — returns null for null/undefined scores */
export function formatScore(score: number | null | undefined): {
  grade: string;
  heat: string;
  color: string;
  icon: string;
} | null {
  if (score == null) return null;
  const s = Math.round(score);
  const heat = heatLabel(s);
  return {
    grade: letterGrade(s),
    heat: heat.label,
    color: heat.color,
    icon: heat.icon,
  };
}

/** Risk level styling using CSS custom properties */
export const RISK_STYLES: Record<string, { bg: string; text: string }> = {
  high: { bg: "var(--color-error-soft)", text: "var(--color-error)" },
  medium: { bg: "var(--color-warning-soft)", text: "var(--color-warning)" },
  low: { bg: "var(--color-success-soft)", text: "var(--color-success)" },
};

/** Enrichment status indicator colors */
export const ENRICHMENT_COLORS = {
  enriching: "var(--color-warning)",
  done: "var(--color-success)",
  failed: "var(--color-error)",
  pending: "var(--color-text-tertiary)",
} as const;
