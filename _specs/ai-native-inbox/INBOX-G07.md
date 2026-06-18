# INBOX-G07 — Sequence-reply linking + reply classification
> Theme: T7 · Autonomy rung: proactive · Priority: P0
> Pillar: P5 GTM moat / P4 triage

## User story
As a founder, I want a reply that answers one of my outbound sequence emails to be recognised as
exactly that — linked to its enrollment, classified (meeting request / pricing question / objection
/ not now), and routed — so the inbox knows a real reply from generic mail and acts on the deal,
while non-sequence mail is never mislabeled with a sales taxonomy.

## Why (audit anchor)
Superhuman's Auto Labels guess a generic "Pitch" because it has no outbound graph (`findings.md`
§B/§H.2). We own `outbound_emails` + `sequence_enrollments`, so a threadId match is *ground truth*:
`detectSequenceReply` (`lib/capture/email-capture.ts:120`) flips `repliedAt` idempotently and emits
`email/reply-received`, and `handleReplyIntelligently` (`inngest/reply-handler.ts`) routes by a real
classification taxonomy (interested/meeting_request/objection_*/not_now/wrong_person/…). The job
here is to **surface** that linkage in the inbox and gate the sales taxonomy to genuine sequence
replies — the correctness Gmail/Superhuman structurally cannot reach, and the fix for the
mislabeling INBOX-T08 calls out.

## Requirements (EARS)
- WHEN an inbound email matches a tracked outbound by `threadId`, the system SHALL link it to the
  enrollment and flip `repliedAt` exactly once (idempotent — first caller wins), reusing
  `detectSequenceReply`.
- The system SHALL store the reply classification (meeting_request, pricing_inquiry, objection_price,
  not_now, wrong_person, unsubscribe, …) on the conversation so the inbox can render a friendly,
  grounded label.
- The system SHALL ONLY show a sales-reply label on a conversation that HAS a matched outbound;
  general inbound SHALL fall back to the honest AI one-liner (INBOX-T08/S02), never `REASON_BY_LABEL`
  and never the literal "Replied".
- The system SHALL map each classification to friendly text via the existing `REASON_BY_LABEL`
  table and SHALL carry a tooltip stating the source ("Réponse à votre séquence : question prix").
- WHEN a reply is classified, the system SHALL link the conversation to the enrollment + deal and
  expose the classification to INBOX-G05 (next action) and INBOX-G09 (advance deal).
- The system SHALL classify by the LAST inbound in a mixed thread (our outbound then later cold
  inbound is treated as general, not a reply).
- The system SHALL hard-scope reply detection to the viewer's tenant (and the outbound `status='sent'`
  guard) and SHALL never cross enrollments between tenants.
- The system SHALL be resilient: a failed classification leaves the conversation as general (empty
  honest badge), never a guessed sales label.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an inbound on the same `threadId` as a sent outbound WHEN captured THEN `repliedAt` is set
  once, `email/reply-received` is emitted, and the conversation is linked to the enrollment.
- GIVEN that reply says "what's your pricing?" WHEN listed THEN the badge reads "Asked about pricing"
  (`pricing_inquiry`) with a tooltip "Réponse à votre séquence".
- GIVEN an automated confirmation-code email (no outbound) WHEN listed THEN the badge is the honest
  one-liner (T08), never "Replied"/"Introduction".
- GIVEN the same reply arrives via webhook then cron WHEN processed THEN `repliedAt` is flipped only
  once (the null-guard) and the enrollment is not double-progressed.
- GIVEN a thread with our outbound then a later unrelated cold inbound WHEN classified THEN it is
  treated as general (classified on the last inbound).
- GIVEN a classified objection_price reply WHEN G05 runs THEN the suggested next action reflects the
  objection; GIVEN a meeting_request WHEN G09 runs THEN advancing the deal is offered.
- GIVEN two tenants WHEN replies are detected THEN no enrollment or outbound crosses tenants.

## Edge cases & failure handling
- Reply with no `threadId` (some providers) → fall back to contact+recency heuristic, but never
  fabricate a link; if uncertain, treat as general.
- Outbound exists but already `repliedAt` → `detectSequenceReply` returns false (no re-fire).
- Enrollment/contact not found at classification time → handler skips gracefully (`result:'skipped'`).
- Classification LLM unavailable → no sales label; conversation stays general (honest badge).
- Multiple outbounds in one thread → match the sent one; `replySnippet` stored (first 500 chars).
- Spoofed threadId / forged in-reply-to → tenant + `status='sent'` guards limit blast radius; advisory only.

## Best-in-class bar
- **Ground-truth linkage**: a sequence reply is recognised because we sent the original — not
  guessed. So "reply to your campaign" and "objection: pricing" are *correct*, and non-sales mail is
  never forced into a sales label. Superhuman/Shortwave can only guess.
- **Idempotent + deal-wired**: the reply flips state once and flows into next-action (G05) and deal
  advance (G09) — the inbox becomes the front of the pipeline, not a label.

## Design sketch
- **Data:** `outbound_emails` (`threadId`, `enrollmentId`, `repliedAt`, `replySnippet`),
  `sequence_enrollments` (`db/schema/outbound.ts:91`), `activities.metadata.leadClassification`
  + `activities.intent[]` (`db/schema/core.ts:253`). Conversation carries the classification + an
  `enrollmentId`/`dealId` link in `metadata`.
- **API:** `detectSequenceReply` (`lib/capture/email-capture.ts:120`) → emits `email/reply-received`
  → `processReply` (classifier) → `reply/classified` → `handleReplyIntelligently`
  (`inngest/reply-handler.ts`). Inbox read: `lib/inbox/conversations.ts` `reason` derivation gated to
  `g.outbound.length > 0` (per T08), mapping classification via `REASON_BY_LABEL` (`:116`).
- **UI:** the reply badge in `_conversation-list.tsx:113` + `_conversation-pane.tsx:277` (token
  `--color-badge-*` by priority, tooltip "Réponse à votre séquence : …", lucide `CornerUpLeft`). A
  "Lié à la séquence" chip linking to the enrollment/deal in the G01 sidebar. Light+dark via tokens,
  no emoji, no provider name, the label cited (matched outbound + classification).
- **AI:** the classifier is the existing `processReply` taxonomy; no new model. The honest fallback
  is INBOX-S02. Autonomy: any auto-reply stays gated by the approval-mode guardrail
  (`enforceAgentApprovalMode`), and never auto-sends without that grant.
- **Security/perf:** tenant + `status='sent'` guards; idempotent null-guard; bounded thread scan.

## Tasks (ordered)
1. Gate the sales taxonomy in `conversations.ts` to `outbound.length > 0`; drop the "Replied"
   fallback; map classification → `REASON_BY_LABEL` with a "source: sequence reply" tooltip. (verify:
   unit — reply → label, general → honest one-liner) (test: `inbox-conversations.test.ts` cases)
2. Surface the enrollment/deal link on the conversation `metadata` (reuse the `email/reply-received`
   payload). (verify: a linked reply exposes `enrollmentId`) (test: linkage test)
3. "Lié à la séquence" chip + reply badge + tooltip in list + pane. (verify: browser — pricing reply
   shows "Asked about pricing", confirmation-code shows honest line) (test: render)
4. Wire classification into G05 (next action) + G09 (advance). (verify: objection_price → objection
   action; meeting_request → advance offered) (test: handoff cases)

## Current-state notes (VERIFY before building — code moves)
- `detectSequenceReply` (`lib/capture/email-capture.ts:120`) is idempotent (repliedAt null-guard,
  `:147`), stores `replySnippet` (`:153`), emits `email/reply-received` (`:157`). **Reuse.**
- `handleReplyIntelligently` (`inngest/reply-handler.ts:50`) routes interested/meeting_request →
  positive reply (auto-send gated by `enforceAgentApprovalMode`, `:192`), `objection_*` → KB-grounded
  draft (`:223`), extended set (`not_now`, `wrong_person`, `info_request`, `competitor_mention`,
  `question`, `unsubscribe`, `negative`) delegated (`:301`).
- `REASON_BY_LABEL` / `PRIORITY_BY_LABEL` / `HANDLED_LABELS` live in `lib/inbox/conversations.ts`
  (`:116`/`:93`/`:143`) and are sales-reply-centric **by design** — the gating (this spec + T08) keeps
  them correct.
- The mislabeling bug is documented in INBOX-T08 (sales taxonomy applied to all mail; "Replied"
  fallback). G07 supplies the linkage half; T08 supplies the honest-fallback half.
- Confirm the exact reply classification strings emitted by `processReply` before mapping (they move):
  grep `classification ===` / `extendedClassifications` in `inngest/reply-handler.ts`.
