# B1 — inbox-ai-draft — Requirements (EARS)

P0 core-value spec of the inbox overhaul (_specs/inbox-overhaul/ROADMAP.md Track B).
Target: drafting quality-parity with Upstream (_research/upstream/QUALITY-BENCH.md sections 1, 1b;
teardown/07-reading-pane-and-ai-draft.md). Delivers: on-demand Generate draft
(button + Cmd/Ctrl+J) then voice-matched draft lands in the EDITABLE reply body, never
auto-sent; after a draft exists the same shortcut becomes edit-with-AI (NL refine of
the current body); SELECTIVITY (offer/auto-draft only on reply-worthy human mail); an
opt-in auto-draft-on-open toggle.

## Ground-truth inventory (verified against live code 2026-06-19)

| Capability | State | Evidence |
|---|---|---|
| Voice-matched full-reply generator | [DONE] | lib/inbox/compose-reply.ts:71 composeReply(messages, {instructions}, gen); voice/memory folded in api/inbox/compose/reply/route.ts:49-53 |
| /api/inbox/compose/reply route (voice draft) | [DONE] but UNWIRED | route exists (api/inbox/compose/reply/route.ts:20) yet _conversation-pane.tsx never calls it -- it calls /api/emails/suggest-reply instead |
| NL refine generator + route | [DONE] | lib/inbox/rewrite.ts:55 rewrite(body, instruction, gen); route api/inbox/compose/rewrite/route.ts; UI email-composer-panel.tsx:271 handleRewrite (popover Rewrite) |
| Reply-worthiness primitive | [DONE] (partial) | classifyInboundSender(...).isMachineSent (lib/inbound/lead-classification.ts:40), inboundIsAutomated/isBulk (lib/inbox/conversations.ts:295,460), resolveGeneralIntent (lib/inbox/general-intent.ts:34), scoreImportance (lib/inbox/importance.ts:52) |
| Composer lands draft in editable body | [DONE] | EmailComposerPanel editable editBody textarea (email-composer-panel.tsx:200,665); approval-gated handleSend (:352) |
| Voice/tone + AI-profile prefs (user_preferences JSONB, no migration) | [DONE] | lib/inbox/voice-prefs.ts, lib/inbox/ai-profile.ts (resource inbox) |
| Prominent Generate draft affordance + Cmd/Ctrl+J | [NEW] | pane Reply button calls suggest-reply, not the voice draft; no J shortcut |
| Selectivity GATE on the draft affordance (reply-worthy classifier) | [NEW] | no isReplyWorthy(...) exists; signals are scattered, never composed into one decision the UI gates on |
| Cmd/Ctrl+J repurposed to refine after a draft exists | [NEW] | refine lives in a popover, not bound to J, not the AI instructions field |
| Auto-draft-on-open toggle (per-user pref) | [NEW] | no auto_draft key in user_preferences |
| Stack: AI SDK v6 + Anthropic Haiku/Sonnet, Vitest, next-auth | [LOCKED] | CLAUDE.md; compose-reply.ts:56, suggest-reply/route.ts:27 |

Non-goal boundaries (tracked elsewhere): writing-style settings panel = B2 [HORS SCOPE];
Dictate / Send-later / full rich-text toolbar / reactions = F3 / B8 [HORS SCOPE];
the eval datasets + gate harness = C1 [HORS SCOPE] -- this spec CONSUMES it.

---

## R1 -- Generate draft (on-demand) [NEW] (extends [DONE] composeReply)

- R1.1 WHERE a thread is open AND its latest inbound is reply-worthy (R3), THE SYSTEM SHALL render a primary "Generate draft" affordance in the reading pane composer area.
- R1.2 WHEN the user activates Generate draft (click) OR presses Cmd/Ctrl+J while no draft has yet been generated for the thread, THE SYSTEM SHALL call the voice-matched draft generator (composeReply via /api/inbox/compose/reply) for the open thread.
- R1.3 WHEN the draft generator returns a non-empty result, THE SYSTEM SHALL place the draft text into the editable reply body of the composer (EmailComposerDraft.body) and the returned subject into the subject field, with the composer open and focused.
- R1.4 THE SYSTEM SHALL ground the draft in the thread, the user voice (buildVoicePrompt) and standing instructions (buildMemoryPrompt), matching the language of the latest inbound message.
- R1.5 WHILE the draft generation request is in flight, THE SYSTEM SHALL show a non-blocking loading state on the affordance and SHALL NOT block the user from editing the composer.
- R1.6 IF the draft generator returns an empty result OR errors, THEN THE SYSTEM SHALL open the composer with the existing body unchanged (fail-closed) and surface a non-blocking "Couldn't draft" notice -- never a fabricated draft.
- R1.7 THE SYSTEM SHALL NOT send, queue, or schedule any email as a side effect of generating a draft.

## R2 -- Edit-with-AI (NL refine of the current draft) [NEW] (binds [DONE] rewrite)

- R2.1 WHERE a draft already exists in the composer body, THE SYSTEM SHALL expose an "AI instructions" input whose placeholder reads "Hit Cmd/Ctrl+J to edit with AI" and SHALL repurpose Cmd/Ctrl+J to focus/submit that input (no emoji in any label -- CLAUDE.md).
- R2.2 WHEN the user submits an NL instruction against an existing draft, THE SYSTEM SHALL apply it via the refine generator (rewrite via /api/inbox/compose/rewrite) and replace the composer body in place with the refined text.
- R2.3 THE SYSTEM SHALL apply multi-part instructions including semantic transforms (e.g. make it shorter and warmer; instead of telling them to stop contacting us, offer to forward to the right person) in a single pass, per the verified Upstream section 1b behavior.
- R2.4 THE SYSTEM SHALL preserve every concrete fact, the signature/identity, and the draft language across a refine (invent no new claims, offers, or commitments).
- R2.5 WHEN a refine completes, THE SYSTEM SHALL keep the pre-refine body recoverable via one-tap Undo.
- R2.6 IF a refine returns empty OR errors, THEN THE SYSTEM SHALL keep the prior body unchanged and surface a non-blocking notice.

## R3 -- Selectivity (reply-worthiness gate) [NEW] (composes [DONE] primitives)

- R3.1 THE SYSTEM SHALL expose a pure resolver isReplyWorthy(input) that returns a boolean decision plus cited reasons, composing existing signals only: classifyInboundSender(...).isMachineSent, the resolved general intent (resolveGeneralIntent / general-intent.ts taxonomy), and isBulk -- NO new LLM call, NO hardcoded vendor list.
- R3.2 IF the latest inbound is machine-sent (isMachineSent) OR its general intent is one of automated_no_reply, promotion_newsletter, notification, receipt_confirmation, THEN isReplyWorthy SHALL return false.
- R3.3 WHERE the latest inbound is from a human AND its intent invites a response (e.g. question, meeting_request, request_action, sales_reply, support_request, personal), THE SYSTEM SHALL return reply-worthy true.
- R3.4 WHERE isReplyWorthy is false, THE SYSTEM SHALL NOT render the Generate-draft affordance and SHALL NOT auto-draft, matching the Upstream "absent on bulk/automated mail" behavior (QUALITY-BENCH.md section 1).
- R3.5 WHEN the reply-worthiness decision is computed for a thread, THE SYSTEM SHALL expose it on the conversation detail payload so the pane gates the UI without a second round-trip.
- R3.6 THE SYSTEM SHALL bias toward offering a draft on ambiguous human mail (favor recall over precision on the OFFER side) so a genuine reply-worthy thread is never silently denied the affordance -- the cardinal sin is hiding a real reply opportunity (QUALITY-BENCH.md section 2 trust bias).

## R4 -- Auto-draft-on-open (opt-in) [NEW] (per-user pref, no migration)

- R4.1 THE SYSTEM SHALL store a per-user auto-draft preference owner-scoped in user_preferences JSONB (resource inbox, key auto_draft), defaulting to OFF, with NO database migration (mirrors voice-prefs.ts / ai-profile.ts).
- R4.2 WHERE auto-draft is ON AND a thread is opened whose latest inbound is reply-worthy (R3), THE SYSTEM SHALL generate a draft automatically and land it in the editable composer body on open.
- R4.3 WHILE auto-draft is OFF (default), THE SYSTEM SHALL generate a draft only on explicit Generate-draft / Cmd-Ctrl+J activation (R1.2).
- R4.4 WHERE auto-draft would fire on a non-reply-worthy thread, THE SYSTEM SHALL NOT generate (selectivity overrides auto-draft).
- R4.5 THE SYSTEM SHALL provide a toggle control to set the auto-draft preference and SHALL persist it via an owner-scoped endpoint.

## R5 -- Never-auto-send and human-in-the-loop [NEW] (invariant)

- R5.1 THE SYSTEM SHALL place every generated or refined draft into the editable composer and SHALL require an explicit user Send action (handleSend) to dispatch it.
- R5.2 THE SYSTEM SHALL NOT imply, in draft text or UI copy, that the email has already been sent.
- R5.3 THE SYSTEM SHALL gate all draft/refine generation on the AI processing profile (aiEnabled); WHERE the profile is off, THE SYSTEM SHALL NOT generate and the affordance returns its empty/non-answer result.

## R6 -- AI processing and tenancy gating [DONE] (reuse, assert)

- R6.1 THE SYSTEM SHALL scope every draft/refine request owner+tenant (getInboxScope, scopeConversationRows) -- re-loading the thread server-side by key, never trusting client-supplied bodies for grounding.
- R6.2 THE SYSTEM SHALL apply the existing LLM rate limit on the draft and refine endpoints.

## R7 -- Quality and design acceptance gates (embedded) [NEW]

- R7.1 (G-eval / C1) THE FEATURE SHALL be considered DONE only WHERE the C1 pnpm eval:run suites are GREEN at the published thresholds (_specs/inbox-quality-evals/design.md metric table): inbox-draft send-without-edit >= 0.70, draft mean edit-distance <= 0.45, draft voice/context dimension_judge >= 0.75 (k>=3); inbox-draft selectivity replyWorthy.precision >= 0.90 AND replyWorthy.recall >= 0.90; inbox-refine instruction_adherence >= 0.85 AND fact_preservation >= 0.95.
- R7.2 (G-design / F1) THE composer + draft block SHALL pass the F1 12-item G-design checklist (_specs/inbox-design-system/design.md section 8), recorded as a one-line PASS/FAIL per item -- including item 10 (no emoji, lucide-react only) and item 3 (one Button system, at most one gradient CTA per view).

## Non-goals (explicit)

- N1 THE SYSTEM SHALL NOT auto-send any AI draft under any setting (R5).
- N2 THE SYSTEM SHALL NOT render the Generate-draft affordance on machine-sent / bulk / no-reply mail (R3.4).
- N3 THE SYSTEM SHALL NOT introduce a writing-style settings panel, scheduling-link, or per-audience variants -- those are B2.
- N4 THE SYSTEM SHALL NOT add Dictate, Send-later, rich-text toolbar, reactions, or comments -- those are F3 / B8.
- N5 THE SYSTEM SHALL NOT add a new AI provider, ORM, or dependency ([LOCKED] stack).
- N6 THE SYSTEM SHALL NOT author the C1 eval datasets/harness here -- it consumes them (C1 owns them).
