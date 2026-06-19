/**
 * Shared type for the skills page + its components. Kept out of page.tsx because a
 * Next.js page.tsx may only export the default component + route config (a named
 * export there fails `next build`'s page-type check).
 */
export interface SkillEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  scope: "system" | "workspace" | "user";
  isEditable: boolean;
  useCount: number;
  lastUsedAt: string | null;
  hasSteps: boolean;
  steps?: string[];
  constraints?: string[];
  parameters?: string[];
  guidelines?: string;
  costEstimate?: string;
}
