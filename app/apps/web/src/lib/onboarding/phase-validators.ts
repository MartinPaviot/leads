/**
 * Per-phase Zod validators for the 7-phase onboarding (MONACO-PARITY-03).
 *
 * Sam Blond verbatim: "Onboarding is where Monaco wins or loses."
 * Each phase has a hard validation gate — the user cannot advance
 * until the phase's validator returns ok and the phase's checklist
 * items pass. The validators here own only the input-shape part;
 * checklist gates that depend on DB state (TAM size, email sync,
 * etc.) live in `checklist.ts`.
 */

import { z } from "zod";

// ── Phase 1 — Diagnostic ────────────────────────────────────
// Captures the founder's situation, current stack, and a one-line
// ICP. The ICP must contain at least industry + size range + buyer
// title — without these the TAM build is guesswork.
export const phase1Schema = z.object({
  situation: z.enum([
    "founder_solo",
    "founder_team",
    "founder_with_sdr",
    "team_5plus",
    "other",
  ]),
  dealsToDate: z.number().int().min(0).max(100000),
  currentStack: z.array(z.string()).optional().default([]),
  icp: z
    .object({
      industry: z.string().min(2),
      sizeRange: z.string().min(2),
      buyerPersona: z.string().min(2),
      raw: z.string().min(20),
    })
    .refine(
      (icp) => icp.industry && icp.sizeRange && icp.buyerPersona,
      "ICP must include industry, size range, and buyer persona",
    ),
});

// ── Phase 2 — ICP & TAM ─────────────────────────────────────
// User lists 5 best closed-won customers (or 5 ideal prospects) and
// 3 anti-ICP companies. The TAM build is triggered server-side; this
// payload only captures the seeds.
export const phase2Schema = z.object({
  bestCustomers: z.array(z.string().min(2)).min(1).max(20),
  antiIcp: z.array(z.string().min(2)).min(1).max(20),
  /** Set true once the user has marked ≥3 A/Burning accounts as
   *  relevant during the live TAM stream. The relevance count is
   *  re-checked server-side by `checklist.tamRelevance`. */
  relevanceConfirmed: z.boolean().default(false),
});

// ── Phase 3 — Email & Calendar ──────────────────────────────
// Captures which provider was connected. The actual OAuth happens
// in the existing flow — this just records the user's choice for
// the wizard's resumability.
export const phase3Schema = z.object({
  emailProvider: z.enum(["gmail", "outlook", "none"]),
  calendarProvider: z.enum(["google", "microsoft", "none"]),
  recallConnected: z.boolean().default(false),
});

// ── Phase 4 — Signal Configuration ──────────────────────────
// At least 3 custom signals — Monaco's hard rule per Forward-Deployed
// AE JD. Each signal is a phrase the founder writes in their voice.
export const phase4Schema = z.object({
  preBuiltSelected: z.array(z.string()).default([]),
  customSignals: z
    .array(
      z.object({
        question: z.string().min(10),
        rationale: z.string().min(10),
      }),
    )
    .min(3, "Configure at least 3 custom signals"),
});

// ── Phase 5 — Voice & Sequences ─────────────────────────────
// Voice capture (5 emails OR 1 loom) is soft — the gate is whether
// the user has approved at least one sequence and started it in
// `manual` (per-email approval) mode.
export const phase5Schema = z.object({
  voiceSamples: z
    .object({
      emails: z.array(z.string()).default([]),
      loomUrl: z.string().url().optional(),
    })
    .refine(
      (v) => v.emails.length >= 5 || !!v.loomUrl,
      "Provide 5 emails OR a 60s Loom",
    ),
  approvedSequenceIds: z
    .array(z.string())
    .min(1, "Approve and start at least 1 sequence"),
});

// ── Phase 6 — Pipeline Setup ────────────────────────────────
// Stages must be at least 3 and the user must explicitly confirm
// (so we don't silently install the defaults and let them drift).
export const phase6Schema = z.object({
  stages: z
    .array(z.object({ id: z.string(), name: z.string().min(2) }))
    .min(3, "Pipeline needs ≥3 stages"),
  confirmedAt: z.string(),
});

// ── Phase 7 — Coaching Activation ───────────────────────────
// At least one chat query so we know the founder grasped the
// surface. Counted server-side from `chat_messages`.
export const phase7Schema = z.object({
  firstQueryDone: z.boolean(),
});

export const phaseSchemas: Record<number, z.ZodTypeAny> = {
  1: phase1Schema,
  2: phase2Schema,
  3: phase3Schema,
  4: phase4Schema,
  5: phase5Schema,
  6: phase6Schema,
  7: phase7Schema,
};

export function getPhaseSchema(phase: number): z.ZodTypeAny | null {
  return phaseSchemas[phase] ?? null;
}
