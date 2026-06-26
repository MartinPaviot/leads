/**
 * Proven sequence-template library — types.
 *
 * The Monaco moat is SELECTION + COMPOSITION: a STRUCTURALLY DIFFERENT sequence
 * per why-now (trigger), not one cadence reworded. The router already routes a
 * prospect to the active sequence whose `campaignConfig.triggerSignalTypes`
 * matches its top signal (`lib/sequences/triggers.ts`, `sequence-router.ts`) —
 * but a tenant has nothing trigger-specific to route TO. This library is that
 * missing set: one proven, multi-channel, recipient-benefit-framed sequence per
 * trigger, instantiable into `sequences` + `sequence_steps` rows that carry the
 * routing metadata so the router lands each cohort on its own why-now cadence.
 *
 * A template is DATA (no IO) so it is reviewable, diff-able and unit-testable;
 * `instantiate.ts` turns it into rows. Copy is the FLOOR + fallback the live
 * send path personalizes (`inngest/functions.ts:624-720`): the step body is
 * var-interpolated, then `personalizeStepEmail` enriches it per prospect, then
 * the grounded copy engine may override — so template bodies must read well as-is
 * AND give the LLM a strong skeleton.
 */

import type { KnownSignalType } from "@/lib/sequences/triggers";

/**
 * Channel discriminator — mirrors `sequence_steps.stepType` (the per-channel
 * dispatch contract in `lib/sequence-dispatch/registry.ts`). Email is live;
 * `linkedin_message` is multi-channel (founder directive E1 — sequences must be
 * multi-channel "1+1=4"); the template carries the LinkedIn touch even where the
 * live dispatch of that channel is still being wired.
 */
export type TemplateStepType = "email" | "linkedin_message" | "phone_task";

/**
 * Persona the template's angle + tone is tuned for. NOT a routing axis yet
 * (routing is trigger + ICP; persona is `contacts.properties.seniority`, free
 * text). Carried so a future persona→sequence split can read it, and so the
 * copy layer can bias tone. Maps loosely onto seniority.
 */
export type PersonaClass = "founder" | "exec" | "vp" | "manager" | "ic";

/** One step of a proven sequence. */
export interface TemplateStep {
  stepNumber: number;
  stepType: TemplateStepType;
  /** Days to wait AFTER the previous step before this one fires (0 = same day). */
  delayDays: number;
  /** Subject line (ignored for non-email channels). Supports `{{firstName}}` etc. */
  subjectTemplate: string;
  /** Body / message. Supports `{{firstName}}` `{{lastName}}` `{{fullName}}` `{{title}}`. */
  bodyTemplate: string;
  /**
   * What NEW value this touch adds (Monaco rule: every follow-up must add value,
   * never "just bumping this"). Documents intent + lets a lint enforce it later.
   */
  valueAdded: string;
  /** Channel-specific config → `sequence_steps.channelConfig` (e.g. a LinkedIn note). */
  channelConfig?: Record<string, unknown>;
}

/** A proven, trigger-specific sequence template. */
export interface ProvenSequenceTemplate {
  /** Stable slug, also the dedupe key when seeding (e.g. "post-funding"). */
  id: string;
  /** Human name shown in-product (e.g. "Post-funding — congrats, no pitch"). */
  name: string;
  /** One line: the why-now + who it's for. */
  description: string;
  /** Signals that route a prospect here → `campaignConfig.triggerSignalTypes`. */
  triggerSignalTypes: KnownSignalType[];
  /** Personas the angle is tuned for (tone bias; not routing yet). */
  personaFit: PersonaClass[];
  /**
   * The recipient-benefit angle — framed as what's in it for THEM, never the
   * sender's milestone (Monaco rule: funding is congrats/help, never "you raised,
   * buy my thing"). One sentence; the spine every step serves.
   */
  recipientBenefitAngle: string;
  /** Base language of the copy floor (the copy engine localizes per prospect). */
  lang: "fr" | "en";
  /** The cadence. Ordered by stepNumber; mixes channels for multi-channel reach. */
  steps: TemplateStep[];
}

/** Channels a template touches, derived from its steps. */
export function templateChannels(t: ProvenSequenceTemplate): TemplateStepType[] {
  return [...new Set(t.steps.map((s) => s.stepType))];
}
