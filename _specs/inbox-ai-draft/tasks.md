# B1 -- inbox-ai-draft -- Tasks

Total estimate: ~5.5 dev-days (11 half-days). 12 tasks.
Branch: feat/inbox-ai-draft. Per task: code -> test -> verify -> commit (CLAUDE.md workflow).
Half-day = 0.5 dev-day unit.

Legend: tag in [ ]; each task lists Action / Verify / Test / Req refs / Est.

## Phase 1 -- Selectivity primitive (the gate everything else reads)

### B1.1 [NEW] -- isReplyWorthy pure resolver  (1 half-day)
- Action: add lib/inbox/reply-worthy.ts exporting isReplyWorthy({ isMachineSent, generalIntent, isBulk }) => { replyWorthy: boolean; reasons: string[] }, per design section 5 (STEP 1-4). Pure, no DB/LLM/network, never throws.
- Verify: import in a node REPL/test; machine-sent => false, newsletter intent => false, question => true, ambiguous human => true (recall bias).
- Test: src/__tests__/inbox-reply-worthy.test.ts -- table of cases covering each STEP, incl. the four Upstream cases (Superhuman welcome=false, Resend welcome=false, HubSpot OTP=false, Benjamin-Mace human=true).
- Req: R3.1, R3.2, R3.3, R3.6.

### B1.2 [NEW] -- Surface replyWorthy on the conversation/detail payload  (1 half-day)
- Action: in lib/inbox/conversations.ts compute replyWorthy from the already-derived inboundIsAutomated/intent/isBulk and add it to the conversation + detail shape; thread it through the detail route so the pane reads detail.replyWorthy.
- Verify: GET /api/inbox/conversations/detail?key=... returns replyWorthy; spot-check a machine-sent thread is false and a human question thread is true.
- Test: extend the conversations unit test -- a machine-sent fixture yields replyWorthy=false, a human-question fixture yields true; assert no extra DB query added.
- Req: R3.4, R3.5.

## Phase 2 -- Generate draft wiring (voice draft, prominent, gated)

### B1.3 [NEW] -- generateDraft() in the pane wired to the voice-matched route  (1 half-day)
- Action: in _conversation-pane.tsx add generateDraft() that POSTs /api/inbox/compose/reply { key } and lands { subject, text } in the editable composer body (setComposer). Make this the PRIMARY draft path (the suggest-reply tone variants remain a secondary tone-switcher).
- Verify: open a human thread, click Generate draft; the editable body fills with a voice-matched draft in the inbound language; nothing is sent.
- Test: component test (happy-dom) -- mock /api/inbox/compose/reply => { subject, text }; assert the composer body equals text and no /api/emails/send call fires.
- Req: R1.2, R1.3, R1.4, R1.7.

### B1.4 [NEW] -- Generate-draft affordance gated on replyWorthy  (1 half-day)
- Action: render the Generate-draft Button only WHERE detail.replyWorthy; hide it on non-worthy threads. Use the shared Button (no emoji, lucide Sparkles/Mail icon).
- Verify: a newsletter/no-reply thread shows NO Generate-draft button; a human question thread shows it.
- Test: component test -- replyWorthy=false renders no Generate-draft control; replyWorthy=true renders it.
- Req: R1.1, R3.4, R7.2 (item 3, item 10).

### B1.5 [NEW] -- Cmd/Ctrl+J binding (generate when no draft)  (1 half-day)
- Action: bind Cmd/Ctrl+J in the pane: no draft yet AND replyWorthy => generateDraft(); ignore when not worthy. Do not collide with the existing r shortcut.
- Verify: press Cmd/Ctrl+J on a worthy thread with no draft => draft generates; on a non-worthy thread => no-op.
- Test: component test -- dispatch keydown {key:"j", metaKey:true}; assert generateDraft invoked once when worthy, zero when not.
- Req: R1.2.

### B1.6 [NEW] -- Loading + fail-closed states for generate  (1 half-day)
- Action: in-flight loading state on the affordance (non-blocking, body still editable); empty/error => open composer unchanged + "Couldn't draft" toast.
- Verify: throttle/mock a slow then an error response; loading shows then clears; on error the body is untouched and a toast appears.
- Test: component test -- mock route returns {subject:"",text:""} => body unchanged + warning toast; mock reject => same.
- Req: R1.5, R1.6.

## Phase 3 -- Edit-with-AI (refine) in the canonical position

### B1.7 [NEW] -- AI-instructions input + Cmd/Ctrl+J-to-refine in the composer  (1 half-day)
- Action: in email-composer-panel.tsx add an always-visible AI-instructions input above the body, placeholder "Hit Cmd/Ctrl+J to edit with AI"; submit calls the EXISTING handleRewrite. Bind Cmd/Ctrl+J inside the composer to focus the field when empty / submit when filled. Keep the Rewrite presets popover + Undo.
- Verify: with a draft present, type "make it shorter and warmer" and submit (or Cmd/Ctrl+J) => body refined in place; Undo restores the prior body.
- Test: component test -- mock /api/inbox/compose/rewrite => refined text; assert editBody updates and rewriteUndo holds the previous body; keydown {key:"j",metaKey:true} focuses/submits.
- Req: R2.1, R2.2, R2.5.

### B1.8 [NEW] -- Refine fact/signature/language preservation + fail-closed  (1 half-day)
- Action: confirm the refine prompt (rewrite.ts) preserves facts/signature/language across a multi-part semantic instruction; on empty/error keep the prior body + non-blocking notice. (Prompt already enforces; add the multi-part case to the test corpus.)
- Verify: run the §1b verbatim case (shorter+warmer+semantic-transform) against the local model; output stays French, keeps the signature, applies all three parts.
- Test: extend src/__tests__/inbox-rewrite.test.ts -- a deterministic generator stub for the multi-part instruction returns the transformed text; assert in-place replace; empty stub => body unchanged.
- Req: R2.3, R2.4, R2.6.

## Phase 4 -- Auto-draft-on-open (opt-in)

### B1.9 [NEW] -- auto-draft pref store + endpoint  (1 half-day)
- Action: add lib/inbox/auto-draft-prefs.ts (getAutoDraft/saveAutoDraft over user_preferences, resource inbox, key auto_draft, default off) and app/api/inbox/auto-draft/route.ts (GET/PUT owner-scoped). Mirror voice-prefs.ts.
- Verify: PUT {on:true} then GET returns true; a second user is unaffected (owner scope).
- Test: src/__tests__/inbox-auto-draft-prefs.test.ts -- default off; save true then read true; normalize garbage to off.
- Req: R4.1, R4.5.

### B1.10 [NEW] -- Auto-draft on thread open (gated by selectivity)  (1 half-day)
- Action: in the pane, on thread open, WHERE auto-draft ON AND detail.replyWorthy => call generateDraft() automatically; never on non-worthy threads; add the toggle to the existing inbox AI settings panel (shared Button/toggle, no emoji).
- Verify: toggle on => opening a human thread auto-fills the editable body; opening a newsletter thread does NOT; toggle off => no auto-draft.
- Test: component test -- autoDraft=true + replyWorthy=true => generateDraft called on mount; autoDraft=true + replyWorthy=false => not called; autoDraft=false => not called.
- Req: R4.2, R4.3, R4.4, R7.2 (item 10).

## Phase 5 -- Acceptance gates (the DoD)

### B1.11 [NEW] -- C1 G-eval GREEN (the eval DoD)  (1 half-day)
- Action: run pnpm eval:run (C1 inbox-eval-gate.test.ts). Tune the compose-reply / rewrite prompts and the reply-worthy thresholds ONLY as needed until every gated metric for B1 passes. Do NOT author the fixtures (C1 owns them); if a fixture is missing, block on C1 and record it.
- Verify (must ALL be green): inbox-draft send_without_edit_rate >= 0.70; inbox-draft edit_distance (mean) <= 0.45; inbox-draft voice/context dimension_judge >= 0.75 @ k>=3; inbox-reply-worthy replyWorthy.precision >= 0.90 AND replyWorthy.recall >= 0.90; inbox-refine instruction_adherence >= 0.85 AND fact_preservation >= 0.95. Exit 0.
- Test: this IS the test -- src/__tests__/inbox-eval-gate.test.ts passing on the B1 surfaces; paste the report card into the PR.
- Req: R7.1.

### B1.12 [NEW] -- F1 G-design PASS (the design DoD)  (1 half-day)
- Action: audit the composer + Generate-draft block + AI-instructions input + auto-draft toggle against the F1 12-item checklist (_specs/inbox-design-system/design.md section 8); fix any miss; run the tokens.contract.test.ts machine check.
- Verify: record one line PASS/FAIL per the 12 items; all 12 PASS. Critical: item 3 (one Button system, at most one gradient CTA=Send), item 10 (no emoji, lucide-react only), item 5 (density/row tokens), item 11 (focus-visible + 100-150ms motion).
- Test: src/app/(dashboard)/inbox/__tests__/tokens.contract.test.ts passes for the touched files (no raw hex/rgb, tokens only).
- Req: R7.2.

## Acceptance summary (feature DONE when all true)
- B1.1-B1.10 merged with their tests green on feat/inbox-ai-draft.
- B1.11: C1 inbox-draft + inbox-reply-worthy + inbox-refine GREEN at thresholds; pnpm eval:run exit 0.
- B1.12: F1 G-design 12/12 PASS recorded; tokens.contract.test.ts green.
- Manual eval (hostile QA): on a real human FR inbound, Generate draft (button + Cmd/Ctrl+J) lands a French, signed, context-faithful draft in the EDITABLE body; the affordance is ABSENT on a newsletter/no-reply thread; edit-with-AI applies a multi-part semantic instruction in place with Undo; nothing is ever auto-sent.
