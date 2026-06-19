/**
 * Noise classification (B4) — decides whether an inbound conversation is NOISE
 * (cold/automated/newsletter mail to demote out of the attention lane) without
 * ever demoting real human mail.
 *
 * Like reply-worthy.ts, it does NOT classify anything itself — it COMPOSES
 * signals the read model already computes (isMachineSent, isBulk, generalIntent,
 * replyWorthy, importanceTier, a prior-human-relationship flag) plus the user's
 * not-noise override. Pure: no DB, no network, no LLM, no clock.
 *
 * CARDINAL SIN = demoting a reply-worthy human thread. The KEEP guards (override,
 * reply-worthy, prior-human) run FIRST, so a thread the founder would actually
 * reply to is structurally impossible to demote. Demotion is read-time + fully
 * reversible (the override un-demotes); no row is ever deleted.
 */

import type { GeneralIntent } from "@/lib/inbox/general-intent";

export interface NoiseInput {
  isMachineSent: boolean;
  isBulk: boolean;
  generalIntent: GeneralIntent | null;
  replyWorthy: boolean;
  importanceTier: 1 | 2 | 3 | 4;
  /** We have emailed this human counterparty before — a real 1:1 relationship. */
  hasPriorHumanReply: boolean;
  /** A stored not-noise override matches this sender/thread. */
  overridden: boolean;
}

export interface NoiseResult {
  noise: boolean;
  reasons: string[];
}

/**
 * No-reply intents that mark mail as noise. DELIBERATELY NARROWER than
 * reply-worthy.ts's six families: it EXCLUDES invoice_billing and
 * security_account, because a time-sensitive invoice or OTP/verification code
 * must never be demoted out of sight (QUALITY-BENCH section 2 — keep time-sensitive
 * codes). This is the one intentional divergence from reply-worthy, unit-tested.
 */
const NOISE_INTENTS: ReadonlySet<GeneralIntent> = new Set<GeneralIntent>([
  "promotion_newsletter",
  "notification",
  "automated_no_reply",
  "receipt_confirmation",
]);

/**
 * Decide whether to demote a conversation as noise. First-match-wins; the KEEP
 * guards (steps 0-2) precede every demotion signal so the cardinal sin can't fire.
 */
export function classifyNoise(input: NoiseInput): NoiseResult {
  // 0. An explicit not-noise override wins absolutely — over every signal.
  if (input.overridden === true) {
    return { noise: false, reasons: ["user marked not-noise"] };
  }
  // 1. Reply-worthy human mail is never noise.
  if (input.replyWorthy === true && input.isMachineSent !== true) {
    return { noise: false, reasons: ["reply-worthy human mail"] };
  }
  // 2. A prior 1:1 relationship keeps the thread.
  if (input.hasPriorHumanReply === true) {
    return { noise: false, reasons: ["prior 1:1 relationship"] };
  }
  // 3. Machine-sent senders are noise.
  if (input.isMachineSent === true) {
    return { noise: true, reasons: ["machine-sent sender"] };
  }
  // 4. No-reply intents (the narrow four) are noise.
  if (input.generalIntent !== null && NOISE_INTENTS.has(input.generalIntent)) {
    return { noise: true, reasons: ["no-reply intent", `intent: ${input.generalIntent}`] };
  }
  // 5. Bulk/marketing mail that isn't reply-worthy is noise.
  if (input.isBulk === true && input.replyWorthy !== true) {
    return { noise: true, reasons: ["bulk/marketing mail"] };
  }
  // 6. Bottom-tier importance on cold, non-reply-worthy mail is noise.
  //    (hasPriorHumanReply is already false here — step 2 returned otherwise.)
  if (input.importanceTier === 4 && input.replyWorthy !== true) {
    return { noise: true, reasons: ["low importance + cold"] };
  }
  // 7. Default: keep (recall bias — never hide ambiguous human mail).
  return { noise: false, reasons: ["default human mail (recall bias)"] };
}
