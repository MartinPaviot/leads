# B1 -- inbox-ai-draft -- Design

Anchored on the REAL Elevay files. The voice-matched generator (compose-reply.ts),
its route, and the refine generator/route already exist and are unit-tested. B1 is
mostly WIRING + one new pure classifier + one new pref, not new AI. We deliberately
replace the pane reply path (suggest-reply tone-variants) with the voice-matched draft
for the primary Generate-draft action, and surface the existing refine as the
Cmd/Ctrl+J edit-with-AI beat in the canonical Upstream position.

## 1. Architecture diff vs existing

Already there (REUSE, do NOT rebuild):
- composeReply(messages, {instructions, context}, gen) -- lib/inbox/compose-reply.ts:71. Voice-matched, grounded, fail-closed, injectable generator.
- POST /api/inbox/compose/reply { key } -- api/inbox/compose/reply/route.ts:20. Owner/tenant-scoped, folds voice (buildVoicePrompt) + memory (buildMemoryPrompt), gated on aiEnabled (ai-profile). Returns { subject, text }, never sends.
- rewrite(body, instruction, gen) + POST /api/inbox/compose/rewrite -- lib/inbox/rewrite.ts:55. Fact-preserving NL refine, fail-closed.
- EmailComposerPanel -- components/email-composer-panel.tsx. Editable editBody (:200,665), approval-gated handleSend (:352), existing rewrite popover handleRewrite (:271), one-tap Undo (rewriteUndo :212,651), Cc/Bcc, save-draft.
- Reply-worthiness primitives: classifyInboundSender (lib/inbound/lead-classification.ts:40, isMachineSent/isBulk), resolveGeneralIntent + GENERAL_INTENTS taxonomy (lib/inbox/general-intent.ts), inboundIsAutomated/isBulk already computed per-conversation (lib/inbox/conversations.ts:295,460).
- Per-user prefs in user_preferences JSONB, resource inbox: voice-prefs.ts, ai-profile.ts. The exact pattern auto-draft copies.

Added (NEW):
- lib/inbox/reply-worthy.ts -- pure isReplyWorthy(input): {replyWorthy, reasons}. Composes isMachineSent + GeneralIntent + isBulk. No LLM, no DB, no hardcoded vendor list (defers semantic judgment to the already-resolved intent). The C1 inbox-reply-worthy.golden surface targets THIS function.
- lib/inbox/auto-draft-prefs.ts -- getAutoDraft(userId)/saveAutoDraft(userId, on) over user_preferences (resource inbox, key auto_draft), default off. Mirror of voice-prefs.ts in shape.
- app/api/inbox/auto-draft/route.ts -- GET/PUT the auto-draft pref, owner-scoped (getAuthContext).

Changed (existing files):
- lib/inbox/conversations.ts -- compute replyWorthy per conversation from the signals it ALREADY derives (inboundIsAutomated, intent) and add it to the conversation/detail shape (R3.5). One field; no new query.
- app/(dashboard)/inbox/_conversation-pane.tsx -- the core wiring:
  - Add a Generate-draft primary affordance, rendered only WHERE detail.replyWorthy (R1.1/R3.4).
  - generateDraft(): call /api/inbox/compose/reply (voice-matched), land { subject, text } in the editable composer body (replaces the suggest-reply path for the primary action). The tone-variant suggest-reply stays available as a secondary affordance (tone chips) but is no longer the primary draft.
  - Bind Cmd/Ctrl+J: no draft yet => generateDraft(); draft exists => focus the composer AI-instructions field (R2.1). Page-level r still opens the composer.
  - On thread open, WHERE auto-draft pref ON AND replyWorthy => call generateDraft() automatically (R4.2).
- components/email-composer-panel.tsx -- promote the refine affordance to the Upstream canonical position:
  - Add an always-visible AI-instructions input above the body with placeholder "Hit Cmd/Ctrl+J to edit with AI" (R2.1); submitting it calls the EXISTING handleRewrite (no new endpoint).
  - Bind Cmd/Ctrl+J inside the composer to focus/submit that field (R2.1). Keep the existing Rewrite presets popover and Undo.
- app/(dashboard)/inbox/page.tsx -- if the J shortcut is registered at page level (CLE-14 page-actions), register draft / edit-with-AI so B6 command-palette can reuse it; otherwise the pane owns the key handler.
- Existing inbox AI settings panel (hosts voice/ai-profile) -- add the auto-draft toggle (R4.5). No new page.

NOT touched: send pipeline (/api/emails/send), the AI provider wiring, the C1 harness (consumed only).

## 2. Data model diff

NONE. No Drizzle CREATE/ALTER, no migration (the journal is frozen at idx 12 -- CLAUDE.md). The one new persisted value (auto_draft) is a JSONB key in the EXISTING user_preferences table (resource inbox, key auto_draft), exactly like voice-prefs.ts and ai-profile.ts. Verified: user_preferences is defined in db/schema/auth.ts; no schema file changes.

## 3. Orchestration (Inngest)

NONE. B1 ships no background job. Drafting is synchronous, on-demand, request-scoped (the existing /api/inbox/compose/reply pattern). Auto-draft-on-open fires client-side on thread open, not via a queue. (Pre-draft-on-sync as an Inngest fan-out is explicitly out of scope -- it would risk spending credit on threads never opened; deferred, not needed for parity.)

## 4. Integrations -- vs the locked stack

- Draft + refine models: Anthropic Haiku (compose-reply.ts:56) / Sonnet (suggest-reply) via AI SDK v6 + traced-ai. [LOCKED] -- no new provider.
- Auth/tenancy: next-auth getAuthContext + getInboxScope. [LOCKED].
- Rate limit: existing checkRateLimit(llm, userId) on both endpoints. [LOCKED].
- Tests: Vitest. [LOCKED].
- No new dependency. The reply-worthy resolver is a ~30-line pure function composing existing classifiers (Layer-3 first principles, keeps it offline-testable for the C1 floor).

## 5. How selectivity is implemented (the core decision)

isReplyWorthy is a pure COMPOSITION of signals Elevay already computes -- it invents no new judgment and adds no LLM call. Inputs (all already on the conversation): isMachineSent, generalIntent, isBulk.

- STEP 1 (hard gate): isMachineSent true => replyWorthy false, reason "machine-sent sender".
- STEP 2 (no-reply intent gate): generalIntent in { automated_no_reply, promotion_newsletter, notification, receipt_confirmation } => replyWorthy false, reason "no-reply intent". isBulk true with no human-response intent => replyWorthy false, reason "bulk/marketing mail".
- STEP 3 (human-response intents): generalIntent in { question, meeting_request, request_action, sales_reply, support_request, personal, scheduling } => replyWorthy true.
- STEP 4 (default, ambiguous HUMAN mail): not machine, not bulk => replyWorthy true (recall bias -- offer the draft).

Design rationale (matches QUALITY-BENCH):
- Mirrors Upstream selectivity: the affordance is ABSENT on Superhuman/Resend welcome, HubSpot OTP, newsletters (all machine-sent or no-reply/bulk intent); PRESENT on a real human (Benjamin Mace). (QUALITY-BENCH section 1.)
- Trust bias = never hide a real reply opportunity: STEP 4 defaults ambiguous HUMAN mail to worthy (recall over precision on the OFFER), so a borderline human email still gets the button (R3.6, QUALITY-BENCH section 2). The cardinal sin is a false NOT-worthy on real mail.
- Reuses the SAME machine/intent signals triage uses, so the draft affordance and the lane placement cannot disagree.
- Deterministic + pure, so the C1 inbox-reply-worthy.golden suite measures precision/recall >= 0.90 against this exact function with NO LLM key (offline floor), and the labeled fixtures double as regression once green.

The pane consumes detail.replyWorthy (computed server-side in conversations.ts, R3.5) to decide whether to render Generate-draft and whether auto-draft may fire -- one boolean, no extra round-trip.

## 6. Draft + refine data flow (wiring map)

Generate draft (no draft yet):
1. pane Generate-draft click or Cmd-Ctrl+J, only WHERE detail.replyWorthy (else affordance not rendered).
2. POST /api/inbox/compose/reply { key } [route EXISTS] -- getInboxScope + scopeConversationRows (tenancy, R6.1); aiEnabled(getAiProfile) gate (R5.3); composeReply(messages, { instructions: voice+memory }) [compose-reply.ts EXISTS].
3. Returned { subject, text } sets the editable composer body=text and subject (R1.3).
4. Empty/error => composer opens unchanged + "Couldn't draft" toast (R1.6).

Edit with AI (draft exists):
1. composer AI-instructions submit or Cmd-Ctrl+J-in-composer.
2. handleRewrite(instruction) [email-composer-panel.tsx:271 EXISTS] -- POST /api/inbox/compose/rewrite { body, instruction } [EXISTS] -- rewrite(body, instruction) preserves facts + signature + language [rewrite.ts EXISTS].
3. setRewriteUndo(prev) then setEditBody(refined): in-place, one-tap Undo (R2.2/R2.5).

Send stays manual: handleSend on explicit click only (R5.1). Nothing in either flow sends.

## 7. Guardrails (one line each)

- Never auto-send: the only send path is handleSend on an explicit click; generate/refine only mutate the editable body (R5.1).
- Selectivity is pure + reuses triage signals, so draft-offer and lane placement never disagree (R3.1).
- Recall bias on the offer: ambiguous human mail still gets the button; a false NOT-worthy on real mail is the cardinal sin (R3.6).
- Fail-closed everywhere: empty/errored generate or refine leaves the body untouched, never a fabricated draft (R1.6, R2.6).
- AI-profile + tenancy gate on every generation; off means no generation (R5.3, R6.1).
- No migration: auto_draft is a user_preferences JSONB key, default off (R4.1).
- No new dependency / no new provider; voice draft is Haiku, refine reuses the rewrite model (LOCKED).
- No emoji in any new label; lucide-react icons only (G-design item 10, CLAUDE.md).
- One Button system, at most one gradient CTA (Send) per composer view (G-design item 3).
- Auto-draft cannot override selectivity (non-reply-worthy never auto-drafts) (R4.4).
- C1 gate is the DoD: feature is not done until inbox-draft + reply-worthy + inbox-refine suites are green (R7.1).
