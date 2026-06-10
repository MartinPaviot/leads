/**
 * Inngest worker — runs after a cold call ends.
 *
 * Source event: `calls/post-process` (fired by /api/calls/recording-status)
 *
 * Pipeline:
 *   1. Load the call row
 *   2. If the streaming transcript is empty (Media Streams dropped), run
 *      Deepgram batch on the recording
 *   3. Concatenate diarised segments into a single transcript string
 *   4. LLM extract (Sonnet 4.6 primary, gpt-4o-mini fallback) using the
 *      callNotesSchema — outcome, summary, signals, actions, sentiment
 *   5. Persist back onto `calls`
 *   6. Insert an `activities` row of type `call_completed`
 *   7. Index transcript chunks for coaching RAG
 *   8. Detect DNC keywords → auto-add to do_not_call_list
 *   9. Stamp `processingState = done`
 *
 * Errors set `processingState = failed` and surface in /calls/[id].
 */

import { inngest } from "./client";
import { db } from "@/db";
import { calls, activities, tenants, contacts, companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { llmCall } from "@/lib/ai/llm-call";
import { callNotesSchema, type CallNotes } from "@/lib/voice/extraction-schema";
import { detectDncRequest, addToDnc } from "@/lib/voice/dnc";
import { recordCapturedActivity, getCaptureApprovalMode } from "@/lib/capture/approval";
import { recordCallOutcomeForCampaigns } from "@/lib/voice/campaign";
import { applyCallToCrm } from "@/lib/voice/post-call-crm";
import { indexTranscript } from "@/lib/coaching/index-transcript";
import { scoreTranscriptLevers } from "@/lib/voice/lever-scoring";
import { ingestEpisode } from "@/lib/ai/context-graph";
import { logger } from "@/lib/observability/logger";

interface TranscriptChunk {
  speaker?: "agent" | "prospect" | string;
  text: string;
  tsMs?: number;
}

export const postProcessCall = inngest.createFunction(
  {
    id: "calls-post-process",
    name: "Post-process cold call (transcript → LLM → CRM)",
    retries: 2,
    triggers: [{ event: "calls/post-process" }],
    onFailure: async ({ event, error }) => {
      const callId = (event.data as { callId?: string })?.callId;
      logger.warn?.("calls-post-process dead letter", {
        callId,
        error: error.message,
      });
      if (callId) {
        await db
          .update(calls)
          .set({
            processingState: "failed",
            processingError: error.message.slice(0, 500),
          })
          .where(eq(calls.id, callId));
      }
    },
  },
  async ({ event, step }) => {
    const { callId } = event.data as { callId: string };
    if (!callId) {
      return { skipped: "no callId" };
    }

    const callRow = await step.run("load-call", async () => {
      const [row] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
      return row ?? null;
    });
    if (!callRow) {
      return { skipped: "call row not found" };
    }
    if (callRow.processingState === "done") {
      return { skipped: "already processed" };
    }

    await step.run("mark-processing", async () => {
      await db
        .update(calls)
        .set({ processingState: "processing" })
        .where(eq(calls.id, callId));
    });

    const transcriptText = await step.run("assemble-transcript", async () => {
      const chunks = (callRow.transcript as TranscriptChunk[] | null) ?? [];
      if (chunks.length === 0) {
        // Phase 1 fallback: if Media Streams dropped, the recording is
        // still there — Deepgram batch transcription is wired in Phase 2.
        // For now we surface the empty case as outcome=no_answer.
        return "";
      }
      return chunks
        .map((c) => `${c.speaker ?? "?"}: ${c.text}`)
        .join("\n");
    });

    // Deterministic methodology execution scores — same patterns as the
    // script guard, persisted so outcomes can be segmented by execution.
    await step.run("score-levers", async () => {
      const chunks = (callRow.transcript as TranscriptChunk[] | null) ?? [];
      const scores = scoreTranscriptLevers(chunks);
      if (!scores) return { skipped: "thin transcript" };
      await db
        .update(calls)
        .set({ leverScores: scores, updatedAt: new Date() })
        .where(eq(calls.id, callId));
      return { drill: scores.drill, talkRatioPct: scores.talkRatioPct };
    });

    if (!transcriptText || transcriptText.length < 30) {
      // Short or empty transcripts are best treated as no-answer.
      await db
        .update(calls)
        .set({
          outcome: "no_answer",
          processingState: "done",
        })
        .where(eq(calls.id, callId));

      await db.insert(activities).values({
        tenantId: callRow.tenantId,
        actorType: "user",
        actorId: callRow.userId,
        entityType: "contact",
        entityId: callRow.contactId,
        activityType: "call_completed",
        channel: "call",
        direction: "outbound",
        sentiment: null,
        summary: "No conversation captured (likely no answer or voicemail).",
        metadata: {
          callId: callRow.id,
          dealId: callRow.dealId,
          durationSec: callRow.durationSec,
        },
      });

      // Feed the no-answer into any active call campaign so the prospect is
      // re-queued for another attempt (up to maxAttempts over windowDays).
      await step.run("campaign-cadence-noanswer", async () => {
        try {
          const r = await recordCallOutcomeForCampaigns({
            tenantId: callRow.tenantId,
            contactId: callRow.contactId,
            outcome: "no_answer",
            occurredAt: callRow.endedAt ? new Date(callRow.endedAt) : new Date(),
            ownerId: callRow.userId, // per-user Call Mode
          });
          return { updated: !!r, status: r?.status ?? null };
        } catch (err) {
          logger.warn?.("calls-post-process: campaign cadence (no-answer) failed", {
            callId,
            err: err instanceof Error ? err.message : String(err),
          });
          return { updated: false };
        }
      });

      return { outcome: "no_answer" };
    }

    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-sonnet-4-6")
      : process.env.OPENAI_API_KEY
        ? openai("gpt-4o-mini")
        : null;
    if (!model) {
      throw new Error("No LLM key configured for call post-process");
    }

    const notes: CallNotes = await step.run("llm-extract", async () => {
      const isPrimaryAnthropic = !!process.env.ANTHROPIC_API_KEY;
      const { object } = (await llmCall({
        fn: tracedGenerateObject,
        args: [
          {
            model,
            schema: callNotesSchema,
            prompt: `Analyze this cold-call transcript and extract structured notes.

CALL ID: ${callRow.id}
FROM: ${callRow.fromNumber}
TO: ${callRow.toNumber}
DURATION: ${callRow.durationSec ?? "?"}s

TRANSCRIPT:
${transcriptText.slice(0, 15000)}

RULES:
- Extract ONLY information explicitly stated in the transcript. Never infer or invent. Leave a field null / empty when the call did not cover it — an empty field is the agenda for the next call, not something to fill.
- Classify the outcome based on what actually happened (connected with the target person, voicemail, gatekeeper, etc.)
- If the prospect asked to be removed from any contact list, set outcome to "do_not_call"
- Be specific with action items — include who and what.
- buyingSignals: only what is explicitly mentioned. currentStack = the tools/vendors they use today (the replaceable stack). initiatives = concrete projects/triggers driving change (a migration, a mandate, a reorg, a renewal).
- meddic: fill the deal's qualification spine ONLY from what was said — metrics (quantified pain/ROI in their words), economicBuyer (who controls budget or signs), decisionCriteria, decisionProcess (how they buy: steps/approvals/timeline), identifiedPain (the core pain driving change), champion (who could sell this internally for us). Null any cell the transcript did not reveal.
- contactProfile: the person actually on the call — their role/function, whether they decide, and their disposition toward us (champion/supporter/neutral/detractor), based strictly on what they said.
- evidence: for each notable claim you record (a pain, a budget, a competitor, a role, an initiative), pair it with the verbatim transcript line that grounds it. A fact with no supporting quote should not be asserted.
- debrief: a short, honest post-call review of how the REP ran the call (their side, not the prospect's data). wentWell = what they did well; toImprove = concrete, actionable next-time fixes — each tied to a real moment in the transcript, in the rep's own language, never generic. This is the one place a judgement is allowed; keep it specific and kind. Null it for a non-conversation (voicemail, no-answer, gatekeeper, wrong number).`,
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
            _trace: {
              agentId: "calls-post-process",
              tenantId: callRow.tenantId,
            },
          },
        ] as never,
        fallbackModel: isPrimaryAnthropic ? openai("gpt-4o-mini") : undefined,
        retries: 1,
        timeoutMs: 60_000,
        trace: {
          tenantId: callRow.tenantId,
          surfaceId: "calls-post-process",
          promptId: "call-notes-extraction.v2",
          metadata: { callId: callRow.id },
        },
      })) as { object: z.infer<typeof callNotesSchema> };
      return object as CallNotes;
    });

    await step.run("persist-call", async () => {
      await db
        .update(calls)
        .set({
          summary: notes.summary,
          outcome: notes.outcome,
          sentiment: notes.sentiment,
          buyingSignals: notes.buyingSignals,
          actionItems: notes.actionItems,
          processingState: "done",
          processingError: null,
        })
        .where(eq(calls.id, callId));
    });

    const callCapture = await step.run("create-activity", async () => {
      // Route through the capture-approval seam (gap E): 'auto' inserts
      // now (default); 'review' parks it for human approval, deduped by
      // the call id.
      const [t] = await db
        .select({ settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, callRow.tenantId))
        .limit(1);
      const mode = getCaptureApprovalMode(t?.settings as Record<string, unknown> | null);
      const res = await recordCapturedActivity({
        tenantId: callRow.tenantId,
        mode,
        kind: "call",
        sourceRef: callRow.id,
        activity: {
          tenantId: callRow.tenantId,
          actorType: "user",
          actorId: callRow.userId,
          entityType: "contact",
          entityId: callRow.contactId,
          activityType: "call_completed",
          channel: "call",
          direction: "outbound",
          sentiment: notes.sentiment,
          summary: notes.summary,
          // Ground the post-call playbook/coaching extraction in the
          // prospect's actual words, not just the LLM summary.
          rawContent: transcriptText.slice(0, 10000),
          metadata: {
            callId: callRow.id,
            dealId: callRow.dealId,
            outcome: notes.outcome,
            buyingSignals: notes.buyingSignals,
            actionItems: notes.actionItems,
            durationSec: callRow.durationSec,
            recordingUrl: callRow.recordingUrl,
            // Post-call debrief (ce qui a marché / à améliorer), surfaced in
            // the Call Mode ended view once processing is done.
            debrief: notes.debrief,
          },
        },
      });
      return { applied: res.applied, activityId: res.activityId ?? null };
    });

    // POST-CALL ONLY. This whole function runs AFTER the call has ended
    // (processingState → done); there is deliberately no in-call path here, so
    // the call itself stays a human exchange. Feed the transcript into the
    // playbook extractor + post-interaction coaching (both fan in from
    // coaching/post-interaction). Only when the activity was actually inserted
    // (auto mode); review mode emits on approval instead.
    if (callCapture.applied && callCapture.activityId) {
      await step.run("emit-post-interaction", async () => {
        await inngest.send({
          name: "coaching/post-interaction",
          data: {
            tenantId: callRow.tenantId,
            activityId: callCapture.activityId as string,
            userId: callRow.userId ?? undefined,
          },
        });
      });
    }

    await step.run("campaign-cadence", async () => {
      // Feed the disposition back into any active call campaign: connected/
      // meeting ends the cadence; a no-answer/busy/voicemail reschedules the
      // next attempt (up to maxAttempts over windowDays). Non-fatal.
      try {
        const r = await recordCallOutcomeForCampaigns({
          tenantId: callRow.tenantId,
          contactId: callRow.contactId,
          outcome: notes.outcome,
          occurredAt: callRow.endedAt ? new Date(callRow.endedAt) : new Date(),
          ownerId: callRow.userId, // per-user Call Mode
        });
        return { updated: !!r, status: r?.status ?? null };
      } catch (err) {
        logger.warn?.("calls-post-process: campaign cadence failed", {
          callId,
          err: err instanceof Error ? err.message : String(err),
        });
        return { updated: false };
      }
    });

    await step.run("crm-apply", async () => {
      // The CRM auto-loop: open/advance a deal, create tasks, route by outcome,
      // and stamp the contact — so the rep doesn't hand-update the CRM. Non-fatal.
      try {
        return await applyCallToCrm({
          tenantId: callRow.tenantId,
          callId: callRow.id,
          contactId: callRow.contactId,
          companyId: null,
          ownerId: callRow.userId,
          notes,
          occurredAt: callRow.endedAt ? new Date(callRow.endedAt) : new Date(),
        });
      } catch (err) {
        logger.warn?.("calls-post-process: crm-apply failed", {
          callId,
          err: err instanceof Error ? err.message : String(err),
        });
        return { skipped: true };
      }
    });

    await step.run("context-graph-ingest", async () => {
      // Feed the call into the bi-temporal context graph (customer memory) so
      // chat + intelligence can reason over call history. Entity resolution is
      // by name, so the episode names the contact + company. Non-fatal.
      try {
        const [c] = await db
          .select({ firstName: contacts.firstName, lastName: contacts.lastName, companyId: contacts.companyId })
          .from(contacts)
          .where(eq(contacts.id, callRow.contactId))
          .limit(1);
        const who = [c?.firstName, c?.lastName].filter(Boolean).join(" ") || "the prospect";
        let companyName = "";
        if (c?.companyId) {
          const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, c.companyId)).limit(1);
          companyName = co?.name ?? "";
        }
        const s = notes.buyingSignals;
        const when = (callRow.endedAt ? new Date(callRow.endedAt) : new Date()).toISOString().slice(0, 10);
        const episode = [
          `Cold call with ${who}${companyName ? ` at ${companyName}` : ""} on ${when}. Outcome: ${notes.outcome}; sentiment: ${notes.sentiment}.`,
          notes.summary ? `Summary: ${notes.summary}` : "",
          notes.keyPoints?.length ? `Key points: ${notes.keyPoints.join("; ")}` : "",
          s?.painPoints?.length ? `Pain points: ${s.painPoints.join("; ")}` : "",
          s?.objections?.length ? `Objections: ${s.objections.join("; ")}` : "",
          s?.competitors?.length ? `Competitors mentioned: ${s.competitors.join(", ")}` : "",
          s?.currentStack?.length ? `Current stack: ${s.currentStack.join(", ")}` : "",
          [s?.budget ? `Budget: ${s.budget}` : "", s?.timeline ? `Timeline: ${s.timeline}` : "", s?.teamSize ? `Team size: ${s.teamSize}` : ""].filter(Boolean).join(". "),
          s?.nextSteps?.length ? `Next steps: ${s.nextSteps.join("; ")}` : "",
          notes.actionItems?.length ? `Action items: ${notes.actionItems.map((a) => `${a.owner}: ${a.task}${a.deadline ? ` (by ${a.deadline})` : ""}`).join("; ")}` : "",
        ].filter(Boolean).join("\n");
        return await ingestEpisode(callRow.tenantId, episode, "cold_call", callRow.id);
      } catch (err) {
        logger.warn?.("calls-post-process: context-graph ingest failed", {
          callId,
          err: err instanceof Error ? err.message : String(err),
        });
        return { skipped: true };
      }
    });

    await step.run("index-transcript", async () => {
      // Reuses the coaching RAG store. callId is opaque to the chunker;
      // retrieval filters by tenant + meeting_id so collisions are not
      // possible (UUIDs from two different tables).
      try {
        await indexTranscript({
          tenantId: callRow.tenantId,
          meetingId: callRow.id,
          rawText: transcriptText,
          totalDurationSec: callRow.durationSec ?? undefined,
          source: "cold_call",
        });
      } catch (err) {
        // Indexing failure does not block the rest of the pipeline.
        logger.warn?.("calls-post-process: index-transcript failed", {
          callId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await step.run("dnc-detect", async () => {
      if (notes.outcome === "do_not_call" || detectDncRequest(transcriptText)) {
        await addToDnc(
          callRow.tenantId,
          callRow.toNumber,
          "Requested during call",
          "transcript_extract",
        );
      }
    });

    return { outcome: notes.outcome, sentiment: notes.sentiment };
  },
);
