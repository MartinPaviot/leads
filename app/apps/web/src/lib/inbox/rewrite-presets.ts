/**
 * Rewrite presets (INBOX-C04) — the client-safe data + type for the composer
 * menu, split out of rewrite.ts. Importing the preset list into a client
 * component must NOT drag rewrite.ts's server-only AI/db stack (traced-ai → db →
 * postgres, which needs Node's fs/perf_hooks) into the browser bundle. This file
 * has zero runtime imports; rewrite.ts re-exports these for server + test callers.
 */

export interface RewritePreset {
  id: string;
  label: string;
  instruction: string;
}

/** GTM rewrite presets surfaced in the composer menu. */
export const REWRITE_PRESETS: RewritePreset[] = [
  { id: "shorter", label: "Make it shorter", instruction: "make it more concise — cut filler, keep every concrete point" },
  { id: "warmer", label: "Warmer tone", instruction: "make the tone warmer and more personal, without being effusive" },
  { id: "formal", label: "More formal", instruction: "make the tone more formal and professional" },
  { id: "direct", label: "More direct", instruction: "make it more direct and confident, lead with the ask" },
  { id: "objection", label: "Counter the objection", instruction: "address the prospect's stated objection directly and reassure, without overpromising" },
];
