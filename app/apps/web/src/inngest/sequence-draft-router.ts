/**
 * Sequence draft router — Monaco-Parity P0-1 task 1.4.
 *
 * Listens to `sequence/step-due` (the same event that drives the
 * existing `sendSequenceStep`). When the tenant is on `manual`
 * approval mode (default), generates a draft row in `sequence_drafts`
 * and parks the enrollment so the cron stops re-firing the same step.
 * The founder reviews via `/sequences/review` and approves/rejects.
 *
 * When the tenant is on `auto`, this function returns early and the
 * existing `sendSequenceStep` handles the direct send. Both functions
 * subscribe to the same event ; the `decideRouteMode` guard at the
 * top ensures only one of them does the write.
 *
 * Idempotency : a row in `sequence_drafts` for the same enrollment +
 * step is the dedup key — re-deliveries hit `onConflictDoNothing`
 * and short-circuit. Optimistic-lock via `version` is enforced at
 * the API mutation layer (approve / reject / edit), not here — this
 * is a creator, not a mutator.
 */

import { inngest } from "./client";
import { releaseEnrollmentById } from "@/lib/anti-collision/enroll-guard";
import { db } from "@/db";
import {
  contacts,
  sequenceSteps,
  sequenceEnrollments,
  sequenceDrafts,
  tenants,
  emailOptouts,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decideRouteMode, buildDraftRow } from "@/lib/sequence-drafts/router";
import { buildProspectContext } from "@/lib/context/prospect-context";
import { deriveSourcesFromContext, type DraftSource } from "@/lib/sequence-drafts/claims-from-context";
import { personalizeStepEmail } from "@/lib/agents/sequence-generator";
import { STEP_STRATEGIES, getMethodology } from "@/lib/scoring/outbound-methodologies";
import { gradeGeneratedStep } from "@/lib/evals/sequence-quality";
import { generateShadowCopy } from "@/lib/copy/personalization/db-shadow";
import { logger } from "@/lib/observability/logger";

export const routeSequenceStepToDraft = inngest.createFunction(
  {
    id: "route-sequence-step-to-draft",
    name: "Route Sequence Step → Draft Queue",
    retries: 2,
    onFailure: async ({ error, event }) => {
      logger.error("route-sequence-step-to-draft.dead_letter", {
        enrollmentId: (event as { data?: { enrollmentId?: string } }).data
          ?.enrollmentId,
        error: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ event: "sequence/step-due" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { enrollmentId: string; signalHint?: string } };
    step: {
      run<T>(id: string, fn: () => Promise<T> | T): Promise<T>;
    };
  }) => {
    const { enrollmentId, signalHint } = event.data;

    // 1) Load enrollment + tenant config in parallel — the route mode
    // decides whether we run at all.
    const enrollment = await step.run("fetch-enrollment", async () => {
      const [e] = await db
        .select()
        .from(sequenceEnrollments)
        .where(eq(sequenceEnrollments.id, enrollmentId))
        .limit(1);
      return e || null;
    });

    if (!enrollment) {
      return { enrollmentId, skipped: "enrollment not found" };
    }

    if (enrollment.status !== "active") {
      return { enrollmentId, skipped: `enrollment status=${enrollment.status}` };
    }

    // Find the tenant via the contact's tenantId — `sequence_enrollments`
    // doesn't carry tenantId directly, but contacts do.
    const contact = await step.run("fetch-contact", async () => {
      const [c] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, enrollment.contactId))
        .limit(1);
      return c || null;
    });

    if (!contact || !contact.email) {
      return {
        enrollmentId,
        skipped: "contact missing or no email",
      };
    }

    const tenantId = contact.tenantId;

    const tenant = await step.run("fetch-tenant", async () => {
      const [t] = await db
        .select({ id: tenants.id, settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      return t || null;
    });

    const mode = decideRouteMode(
      tenant?.settings as Record<string, unknown> | null,
    );

    if (mode === "auto") {
      // Existing sendSequenceStep takes over — return early without
      // touching the draft queue. We leave the enrollment in `active`
      // and `nextStepAt` unchanged so the existing fn picks it up
      // from the same event.
      return { enrollmentId, skipped: "tenant in auto mode" };
    }

    // 2) Load the step template — same fetch as the direct sender.
    const stepTemplate = await step.run("fetch-step", async () => {
      const [s] = await db
        .select()
        .from(sequenceSteps)
        .where(
          and(
            eq(sequenceSteps.sequenceId, enrollment.sequenceId),
            eq(sequenceSteps.stepNumber, enrollment.currentStep ?? 1),
          ),
        )
        .limit(1);
      return s || null;
    });

    if (!stepTemplate) {
      // No more steps → mark enrollment completed, mirror the
      // direct-send terminator.
      await step.run("mark-completed", async () => {
        await db
          .update(sequenceEnrollments)
          .set({ status: "completed" })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      });
      await releaseEnrollmentById(enrollmentId); // Spec 14 — free the anti-collision lock on terminal.
      return { enrollmentId, skipped: "no more steps", terminal: true };
    }

    // 3) Idempotency probe — do we already have a draft for this
    // enrollment + step ? If yes, parking already happened ; return.
    const existingDraft = await step.run("check-existing-draft", async () => {
      const [row] = await db
        .select({ id: sequenceDrafts.id, status: sequenceDrafts.status })
        .from(sequenceDrafts)
        .where(
          and(
            eq(sequenceDrafts.enrollmentId, enrollmentId),
            eq(sequenceDrafts.stepId, stepTemplate.id),
          ),
        )
        .limit(1);
      return row || null;
    });

    if (existingDraft) {
      return {
        enrollmentId,
        skipped: "draft already exists",
        draftId: existingDraft.id,
        status: existingDraft.status,
      };
    }

    // 4) Opt-out check — never queue a draft for an opted-out
    // recipient. The cleaner failure mode is "draft never created"
    // rather than "draft created, founder approves, then we discover
    // optout at send time".
    const optedOut = await step.run("check-optout", async () => {
      const [o] = await db
        .select({ id: emailOptouts.id })
        .from(emailOptouts)
        .where(
          and(
            eq(emailOptouts.tenantId, tenantId),
            eq(emailOptouts.emailAddress, contact.email!.toLowerCase()),
          ),
        )
        .limit(1);
      return !!o;
    });

    if (optedOut) {
      // Pause enrollment so we don't keep retrying.
      await step.run("pause-on-optout", async () => {
        await db
          .update(sequenceEnrollments)
          .set({ status: "unsubscribed" })
          .where(eq(sequenceEnrollments.id, enrollmentId));
      });
      await releaseEnrollmentById(enrollmentId); // Spec 14 — free the anti-collision lock on terminal.
      return { enrollmentId, skipped: "recipient opted out" };
    }

    // 5) Personalise the step. Same pipeline as direct send so the
    // approver sees the same content the auto-mode would produce.
    const personalised = await step.run("personalise", async () => {
      try {
        const ctx = await buildProspectContext(contact.id, "default");
        if (!ctx) {
          return {
            ok: false as const,
            reason: "missing_prospect_context" as const,
            subject: stepTemplate.subjectTemplate,
            body: stepTemplate.bodyTemplate,
            sources: [] as DraftSource[],
            score: null as number | null,
          };
        }
        const strategy =
          STEP_STRATEGIES.find(
            (s) => s.stepNumber === (enrollment.currentStep ?? 1),
          ) ?? STEP_STRATEGIES[0];
        const out = await personalizeStepEmail(
          ctx,
          {
            subject: stepTemplate.subjectTemplate,
            body: stepTemplate.bodyTemplate,
          },
          strategy,
        );
        // P1-15 — grade the draft (deterministic, pure) so the cockpit queue can
        // prioritise by quality. Fail-open: a draft without a score still ships.
        let score: number | null = null;
        try {
          score = gradeGeneratedStep(
            { subject: out.subject, body: out.body, stepNumber: enrollment.currentStep ?? 1 },
            ctx,
            getMethodology(ctx.contact.seniority),
          ).score;
        } catch {
          /* fail-open */
        }
        return { ok: true as const, subject: out.subject, body: out.body, sources: deriveSourcesFromContext(ctx), score };
      } catch (err) {
        logger.warn("route-sequence-step-to-draft.personalise_failed", {
          tenantId,
          enrollmentId,
          stepNumber: enrollment.currentStep,
          err: err instanceof Error ? err.message : String(err),
        });
        return {
          ok: false as const,
          reason: "llm_threw" as const,
          subject: stepTemplate.subjectTemplate,
          body: stepTemplate.bodyTemplate,
          sources: [] as DraftSource[],
          score: null as number | null,
        };
      }
    });

    // 6) Build + insert the draft. Body is stored both as plain text
    // (for inline editing in the UI) and as HTML (so the eventual
    // sender doesn't have to re-render). For now we put the same
    // content in both — the personaliser returns text and the sender
    // wraps it ; an HTML-aware personaliser is a follow-up.
    const draftRow = buildDraftRow({
      tenantId,
      sequenceId: enrollment.sequenceId,
      stepId: stepTemplate.id,
      enrollmentId,
      contactId: contact.id,
      subject: personalised.subject,
      bodyHtml: personalised.body, // see comment above
      bodyText: personalised.body,
      stepNumber: enrollment.currentStep ?? 1,
      signalHint: signalHint ?? null,
      personalizationSources: (personalised.sources ?? []) as unknown as Record<string, unknown>[],
      qualityScore: personalised.score,
    });

    const inserted = await step.run("insert-draft", async () => {
      const [row] = await db
        .insert(sequenceDrafts)
        .values(draftRow)
        .returning({ id: sequenceDrafts.id });
      return row;
    });

    // 6b) Spec 19/20 shadow — generate the grounded copy engine's version of this
    // draft for side-by-side comparison in the review queue. Gated by
    // COPY_ENGINE_SHADOW (a cheap no-op when off — no context build, no LLM) and
    // fully best-effort: it stores a copy_shadow_sample, never touches this draft.
    await step.run("copy-shadow", () =>
      generateShadowCopy(contact.id, tenantId, { lang: "en" }).catch(() => null),
    );

    // 7) Park the enrollment — clear nextStepAt so the cron predicate
    // `lte(nextStepAt, NOW())` stops matching it. The approve route
    // restores nextStepAt + advances currentStep ; reject pauses.
    await step.run("park-enrollment", async () => {
      await db
        .update(sequenceEnrollments)
        .set({ nextStepAt: null })
        .where(eq(sequenceEnrollments.id, enrollmentId));
    });

    return {
      enrollmentId,
      draftId: inserted?.id,
      stepNumber: enrollment.currentStep,
      personalised: personalised.ok,
      personalisationFallbackReason: personalised.ok ? null : personalised.reason,
    };
  },
);
