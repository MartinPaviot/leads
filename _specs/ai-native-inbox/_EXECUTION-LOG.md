# AI-Native Inbox — execution ledger (autonomous batch loop)

Durable state for the self-waking build loop. **Read this first every wake.**

## Loop protocol (do this each wake)
1. Read this log. Find the next `TODO` specs in the **Execution order** below (respect deps).
2. Build a batch (2–4 specs, fewer if large): for EACH spec — read its `_specs/ai-native-inbox/INBOX-<ID>.md`,
   verify current code state, implement in the worktree, write unit tests, `tsc --noEmit` clean,
   run the new tests, then commit (with both co-author trailers).
3. `git push` the branch.
4. Update this log: flip the spec to `DONE <commit>` (or `OCEAN`/`DEFER` with a one-line reason).
5. If any buildable `TODO` remain → `ScheduleWakeup` again (delay ~120s, same loop prompt).
   If only `OCEAN`/`DEFER` remain → STOP, write a final summary here, report to Martin.

## Environment
- Worktree: `C:/Users/marti/leads-wt-inbox`, branch `feat/ai-native-inbox-rendering` (→ PR #277).
- node_modules junctioned from main tree; `pnpm -C <worktree>/app/apps/web exec vitest run <file>` + `exec tsc --noEmit` work.
- Specs live in MAIN tree `C:/Users/marti/leads/_specs/ai-native-inbox/` (untracked; not in worktree) — read them from there.
- Test env: vitest default `node`; add `// @vitest-environment happy-dom` for DOM-based logic. No new npm deps (junction).
- Conventions: no emoji in UI, no provider names shown to users, per-user/tenant scope, UI in English. Cite via Elevay.

## Status (101 specs)

### T1 Rendering — 11/13 done (only R04 ocean + R11 defer remain)
- R01 DONE 193b37a9 · R02 DONE 5a69ea76 · R03 DONE 5a69ea76 · R05 DONE 10cc16d3
- R06 DONE 8374649a · R07 DONE 5a69ea76 · R08 DONE 6d8ca1b7 · R09 DONE 6dfd25fa · R13 DONE 193b37a9
- R04 OCEAN — attachment bytes storage decision (re-fetch vs blob vs metadata-only); gates cid: inline imgs
- R10 DONE 3dc5526d — unicode/RTL (dir=auto + looksRtl)
- R11 DEFER — long-thread virtualization (needs browser profiling; low value at founder volume)
- T08 DONE 92cf7f42 (honest badge)

### T2 Triage & rules — 11 cores / 11 COMPLETE
- T03 076372a4 (bundle.ts) · T05 67bea288 (parse-when.ts) · T07 0dfb37e6 (list-unsubscribe.ts)
- T06 fda9c6de (no-reply-nudge.ts) · T10 1e68e175 (archive-decision.ts) · T11 40f66590 (autonomy.ts)
- T01 7733bf8a (lane-match.ts) · T02 243ed1a0 (filter-match.ts) · T04 30b69f6d (importance.ts) · T09 035f26ab (selection.ts)
- (T08 already done under T1). ALL DONE-core; residual = endpoints/migrations/UI/LLM wiring (logged per commit).
NOTE: "DONE-core" = pure logic + tests + tsc shipped; runtime/migration/UI residual (no browser/DB/LLM verify this session). A later pass wires + verifies.

### T3 AI reading & summarization — 8 cores / 9 (S07 defer) COMPLETE
- S05 67f15906 (entities.ts) · S09 5a805698 (why-line.ts) · S04 09781151 (action-items.ts)
- S06 bf13754b (general-intent.ts — gates; LLM classify residual) · S03 b7868dde (catch-up.ts)
- S08 bd9428d7 (thread-summary-prep.ts: shouldSummarize/pickKeyMessages)
- S01 DONE-core(thin) bd9428d7 — reuses thread-summary-prep; LLM summary + citation assembly residual
- S02 DONE-core(thin) — per-message summary is pure-LLM; only the shared prep/cache is deterministic; LLM residual
- S07 DEFER — attachment summarization depends on R04 (attachment bytes ocean)

### T4 AI compose & reply — 3 testable cores / 12 (rest = LLM-residual)
- C11 DONE-core 8833f929 (send-later.ts) · C06 DONE-core 468e0afd (template-vars.ts) · C09 DONE-core 43da68a2 (follow-up-step.ts)
- C01 voice-draft · C02 one-tap replies · C03 auto-draft · C04 rewrite · C05 autocomplete · C07 draft-from-bullets · C08 translate · C12 grammar
  = **LLM-RESIDUAL** — pure-LLM generation, no deterministic core to extract honestly; full build = LLM wiring + composer UI (do interactively w/ runtime verify). Drafts must reuse writing-profile.ts (voice) + draft-context (CRM grounding) + the T11 autonomy dial + T08 honesty gate.
- C10 scheduling-email drafter = LLM-RESIDUAL + depends T9 CAL (availability).

### T5 Search & Ask-AI — 1 core / 8
- Q04 DONE-core 93691022 (search-query.ts — operator parser; backend + saved searches residual)
- Q01/Q02/Q05/Q07/Q08 = LLM-RESIDUAL (semantic/ask-AI — flagged, not fabricated)
- Q03/Q06 = DEFER (attachment/file search depends on R04 ocean)

### T6 Speed & keyboard — 2 cores / 7
- K01 DONE-core 19ae8538 (fuzzy.ts — palette ranking) · K07 DONE-core fa0ca4a2 (keybindings.ts — resolver/conflicts)
- K06 keyboard triage flow reuses selection.ts (T09); K02/K03/K04/K05 = UI-RESIDUAL (cheatsheet/optimistic/prefetch/quick-switch — UI, no testable core)

### T7 GTM/CRM moat — 3 new cores / 13
- G05 DONE-core d39750ee (next-action.ts) · G09 DONE-core 7b5caead (advance-deal.ts) · G11 DONE-core e3430929 (icp-triage.ts)
- REUSE-RESIDUAL (wire existing Elevay infra, no new core to build/test in this loop): G01 (Call Mode brief), G02 (capture pipeline), G03 (last-interaction.ts), G04 (signals/freshness), G06 (lib/collision), G07 (detectSequenceReply), G10 (sovereign-visio), G12 (cohort-engine), G13 (app/api/mcp)
- G08 = LLM-RESIDUAL (grounded drafts — reuse draft-context + writing-profile)

### T8 Collaboration — 0/6
- X01 TODO shared inbox/assignment · X02 TODO @mention comments · X03 TODO shared presence · X04 TODO shared labels
- X05 TODO shared snippets/prompts · X06 TODO handoff + internal notes

### T9 Calendar — 0/5
- CAL01 TODO availability insert · CAL02 TODO one-click book · CAL03 TODO AI scheduler
- CAL04 TODO RSVP/reschedule · CAL05 OCEAN-ish sovereign visio (reuses video-meeting.ts; verify)

### T10 Notifications — 0/5
- N01 TODO smart notifications · N02 TODO morning/EOD digest · N03 TODO DND/focus · N04 TODO SLA alerts · N05 TODO mobile parity

### T11 Privacy/security — 0/6
- P01 TODO tracking controls (extends R02/R07) · P02 TODO phishing (extends R03) · P03 TODO AI zero-retention
- P04 TODO data residency · P05 TODO tenant-isolation audit · P06 TODO citations/provenance

### T12 Onboarding/settings — 0/6
- O01 TODO connect mailbox · O02 TODO AI memory/standing instructions · O03 TODO voice calibration
- O04 TODO keyboard tutorial · O05 TODO layout/themes/density · O06 TODO per-feature autonomy hub

## Execution order (next-first)
R10 → T2(T05,T07,T03,T06,T10,T11,T01,T02,T04,T09) → T3(S05,S09,S04,S06,S02,S01,S08,S03,S07)  [reordered: testable cores first — S05 entity regex, S09 why-line, S04 action items; S01/S02/S03/S08 are LLM-thin]
→ T4(C11,C06,C09,C04,C12,C02,C01,C07,C08,C03,C05,C10) [testable first: C11 send-later/undo timing, C06 template-var interpolation, C09 sequence-step pick; rest LLM-thin] → T5(Q04,Q07,Q01,Q02,Q05,Q06,Q03,Q08)
→ T6(K02,K06,K03,K01,K04,K05,K07) → T7(G07,G03,G01,G04,G05,G09,G02,G08,G06,G10,G11,G12,G13)
→ T8(X01,X02,X06,X04,X05,X03) → T9(CAL01,CAL02,CAL04,CAL03,CAL05) → T10(N04,N01,N02,N03,N05)
→ T11(P06,P05,P02,P01,P03,P04) → T12(O05,O02,O06,O01,O03,O04)
Oceans/defers handled last with a flag, never guessed: R04, R11.

## Log
- 2026-06-16: bootstrapped loop. T1 core (10 specs) shipped on PR #277, CI green. Starting batch loop at R10.
- 2026-06-16: batch 1 → R10 DONE 3dc5526d (pushed). T1 done bar R04(ocean)/R11(defer).
- 2026-06-17: batch 2 → T05/T07/T03 cores (67bea288/0dfb37e6/076372a4, pushed). 18 tests, tsc0. Approach set: build pure cores+tests per spec, flag residual.
- 2026-06-17: batch 3 → T06/T10/T11 cores. batch 4 → T01/T02/T04 cores (7733bf8a/243ed1a0/30b69f6d). batch 5 → T09 (035f26ab). **T2 COMPLETE (11/11 cores).** Checkpointed Martin. NOTE: T3+ LLM/UI-centric → thinner cores.
- 2026-06-17: batch 6 → T3 cores S05/S09/S04 (67f15906/5a805698/09781151). 16 tests.
- 2026-06-17: batch 7 → T3 cores S06/S03/S08. **T3 COMPLETE.**
- 2026-06-17: batch 8 → T4 testable cores C11/C06/C09. T4 done; 9 C-specs LLM-RESIDUAL.
- 2026-06-17: batch 9 → T5/T6 cores Q04/K07/K01. T5=1 core, T6=2 cores.
- 2026-06-17: batch 10 → T7 NEW cores G05/G09/G11 (d39750ee/7b5caead/e3430929). T7 rest = REUSE-RESIDUAL.
- 2026-06-17: batch 11 (ENDGAME) → X02/CAL01/N04 (64348fb0/26142641/228812b6). Last testable cores. **LOOP TERMINATED** — only residual/reuse/defer remain.

## FINAL SUMMARY (loop complete — 2026-06-17)
Branch `feat/ai-native-inbox-rendering` → **PR #277** (CI green earlier; re-verify after these pushes). **38 commits, 36 new lib/inbox modules, 40 inbox test files, 298 inbox unit tests passing, tsc 0 errors.**

**Built & verified (tsc + unit tests):**
- **T1 (10 full features)** R01/R02/R03/R05/R06/R07/R08/R09/R10/R13 + T08 — the only theme with full UI wiring (render/privacy/safety/identity). Browser-UNVERIFIED (Playwright down).
- **T2 (11 cores)** T01-T07,T09,T10,T11 — triage decision logic.
- **T3 (8 cores)** S03/S04/S05/S06/S08/S09 + S01/S02 via thread-summary-prep.
- **T4 (3 cores)** C06/C09/C11. **T5 (1)** Q04. **T6 (2)** K01/K07. **T7 (3)** G05/G09/G11. **T8 (1)** X02. **T9 (1)** CAL01. **T10 (1)** N04.
≈ 41 specs advanced with shipped, tested deterministic cores.

**NOT built (honest):**
- **OCEAN (needs Martin's architecture decision):** R04 attachments (bytes storage) — also blocks S07, Q03, Q06.
- **DEFER:** R11 (perf/profiling), R04-deps above.
- **LLM-RESIDUAL (pure-LLM, no deterministic core; build interactively w/ model + runtime verify):** C01-C05,C07,C08,C10,C12 · Q01,Q02,Q05,Q07,Q08 · G08 · S01/S02 text.
- **REUSE-RESIDUAL (wire existing Elevay infra, no new core):** G01,G02,G03,G04,G06,G07,G10,G12,G13 · X01,X03,X04,X05,X06 · CAL02,CAL03,CAL04,CAL05 · N01,N02 · P01,P02,P03,P04,P05 · O01,O03,O06.
- **UI-RESIDUAL:** K02,K03,K04,K05,K06 · N03,N05 · P06 · O02,O04,O05.

**Verification gaps (whole branch):** browser-UNVERIFIED (Playwright down all session — render/UX confirmed by tests+probes, not screenshots). SSRF residual on the R02 image proxy (DNS-rebinding TOCTOU; disclosed in PR). The "cores" are pure logic — the endpoints/migrations/UI/LLM wiring that turn them into shippable features is the residual work above, best done with browser + DB + LLM runtime to verify.

**To resume the LLM/UI/reuse-residual work:** each is interactive (needs runtime verification), not loop-autonomous. R04 is the one blocking architecture decision.

## PHASE 2 — FULL FEATURE BUILD (Martin: "implémente tout avec tout ce dont tu as besoin", 2026-06-17)
Now building REAL features (endpoints + UI + LLM + wiring), not just cores. Decisions/constraints (env-checked):
- **LLM keys present** (ANTHROPIC + OPENAI in main-tree `app/apps/web/.env.local`) → AI features are REAL. Lazy-load the AI SDK in helpers (dynamic import) so unit tests stay isolated from the `@ai-sdk/provider` flake; make the LLM call INJECTABLE for deterministic tests.
- **DB = shared PROD Supabase** (`aws-1-eu-central-1.pooler.supabase.com`) → DO NOT run schema migrations. Store config/cache in EXISTING JSONB (`activities.metadata`, `user_preferences`). Note where a real column would be better later. If a feature truly needs a migration, FLAG it for Martin (don't apply).
- **R04 = re-fetch-on-demand** (no bytes storage table, no migration; re-fetch attachment from IMAP/Gmail on click, metadata in activities.metadata).
- **Playwright DOWN + dev server hits prod DB + tsx can't exercise traced LLM helpers** → per-feature runtime/visual verification is ENV-BLOCKED. Verification bar = unit tests + tsc + sound reuse of prod-proven patterns; HOLISTIC runtime/visual check = the Vercel PREVIEW on PR #277 (Martin). No live Inngest (no real sends).
- Verify writes via DB read, not HTTP 200 (machine net flaps). `pnpm dlx tsx` (not exec); .env.local is MAIN-tree only (worktree lacks it).

### Phase-2 build order (features on top of the cores)
1. Wire NO-migration cores into read-model features: S09 why-line badge, T04 importance ranking, N04 SLA alert, G05/G09/G11 GTM affordances (all compute at read time over existing data).
2. S02 summarize → wire into the enrich pass (cache metadata.aiSummaryLine; CAREFUL — sync-functions.ts clobber history PR #260, JSONB-merge not overwrite). DONE-core 1024c977 (helper built+tested); wiring next.
3. LLM features (real, JSONB-cache): S01 thread summary, S06 general classify, C01-C05/C07/C08/C12 drafting/rewrite (reuse writing-profile + draft-context), Q01/Q02 ask-AI.
4. Config features via JSONB-on-user_preferences (no migration): T01 lanes, T02 filters, T10 archive-lists, T05 snooze-if-no-reply, C06 snippets, T11 rule-actions audit.
5. Endpoints + UI for each (composer CC/BCC, snooze popover, bundles view, lanes tabs, command palette, etc.).
6. Reuse-residual wiring: G01/G03/G04/G06/G07 surface existing Elevay infra in the inbox; X-specs reuse ownerId/collision; CAL reuse sovereign-visio.
7. R04 re-fetch attachments.

- 2026-06-17: PHASE 2 started. S02 summarize.ts built+tested (1024c977; LLM lazy-load pattern for AI features). Env verified (keys present, DB=prod, Playwright down).
- 2026-06-17: PHASE 2 batch 1 → **N04 FULL FEATURE** (6287a3b4): checkSla → "Nh overdue" chip.
- 2026-06-17: PHASE 2 batch 2 → **T04 FULL FEATURE** (51ce1d36): scoreImportance wired into buildConversations + sortConversations (attention by tier→score→recency) + route/_types + list dot (importanceTier color + "why important" factors tooltip). 39 conv tests, tsc0; existing ordering tests PASS UNCHANGED (intent+recency reproduce prior bucket order). hasOpenDeal/seniority residual. **S09 DEFERRED**: composeWhyLine's full value ("Open deal (Proposal) · no reply 6d") needs deal-stage + no-reply-days plumbing → do it in the G-features phase (G01/G03/G05 surface deal/last-interaction); the compact T08 badge + N04 overdue + T04 importance already cover the visible "why" now. **S02 SHIPPED 1b1cf210**: wired summarizeMessages into the analyzeEmailBatch pass in sync-functions.ts (~line 486) for INBOUND mail → metadata.aiSummaryLine (badge live). tsc0 + sync-health 10/10. **Also FIXED a latent clobber** — the existing sentiment update was `set({metadata:{...act.metadata, intent}})` where act.metadata is PARTIAL ({gmailMessageId,threadId}), OVERWRITING the full metadata captureInboundEmail wrote (the "metadata.from empty" #264 sequela). Switched to SQL JSONB-MERGE `activities.metadata || {...}::jsonb` → preserves full metadata + adds intent + aiSummaryLine. Safe-by-construction; forward-only; fail-soft. CANNOT runtime-verify (no live Inngest) — verified via tsc + summarize unit tests + merge-not-overwrite by construction. **S06 SHIPPED dcff16a9** (classifyGeneralIntent cached on metadata.generalIntent via the same JSONB-merge; 5 tests, tsc0, sync-health10; read-side gating residual). **LLM-ENRICH SLICE DONE** (S02 summary live + S06 intent). Phase-2 shipped: N04, T04, S02, S06 + brains. **T05 SHIPPED 1ae1fe2d** (NL snooze popover via parse-when + parsed echo; the triage route ALREADY accepted/future-validated snoozeUntil so backend was free; conditional "if no reply" flag + AI-suggested time = residual; UI preview-verified). **T01 BACKEND SHIPPED ac3df53d** (lane-store.ts = user_preferences JSONB k-v "inbox"/"lanes", NO migration; CRUD /api/inbox/lanes owner-scoped + reject empty-clause; conversations route ?lane=<id> filters via laneMatches/filterByLane + returns customLanes+counts; filterByLane tested, 7 lane tests, tsc0). **T01 COMPLETE** (backend ac3df53d + tabs UI afbb4e91: custom lane tabs + counts + "+ New lane" creator + outbound/keyboard respect custom selection; tsc0; richer multi-clause editor = residual). **T02 SHIPPED 02bb2848** (deterministic filters: filter-store.ts user_prefs JSONB + CRUD /api/inbox/filters + applyLabelFilters at read time in conversations route → labels[] on each conversation → Badges in list; 7 filter tests, tsc0; LLM-prompt filters + live-preview UI + star/archive = residual). Next: bundles view (bundle.ts → lane=bundles in route + Bundles tab), command palette (fuzzy.ts → Cmd+K), composer CC/BCC (template-vars.ts); then G-features (G01 sidebar/G03 last-interaction/G05 next-action → unblock S09; G06 collision; G07 sequence-link); then R04. **Phase-2 shipped: N04, T04, S02, S06, T05, T01, T02 + brains.** CONFIG-FEATURES SLICE (lanes+filters) DONE.
- 2026-06-17: PHASE 2 batch 8 → **T03 SHIPPED 4de72639** (newsletter/promo Bundles view). bundleConversations was already pure+tested; wired into a feature: (1) exposed `isBulk` on Conversation = the automated/bulk classification already computed for the handled lane (no re-classify); (2) conversations route always computes `bundles` over the visible scoped set — bulk + never-replied + not done/snoozed so cleared sources don't reappear — and returns it; (3) Bundles tab (hidden when empty, rendered separately from TABS so counts[t] stays exhaustive) + _bundles-view.tsx = one row/sender (domain, count, latest subject, why-bundled, **Mark all done** reusing the per-key triage verb in parallel); empties → falls back to attention. 1 read-model test (real reply isBulk:false, no-reply@ isBulk:true); full inbox suite 297/297, tsc0. **Residual: dedicated bulk-triage endpoint + one-click List-Unsubscribe + richer collapsible per-item view.** Next: command palette (fuzzy.ts → Cmd+K), composer CC/BCC (template-vars parseRecipients); then G-features (G01 sidebar/G03 last-interaction/G05 next-action → unblock S09; G06 collision; G07 sequence-link); then R04 re-fetch attachments. **Phase-2 shipped: N04, T04, S02, S06, T05, T01, T02, T03 + brains.**
- 2026-06-17: PHASE 2 batch 9 → **K01 + C06 SHIPPED**. **K01 command palette 3d43ecff**: fuzzyRank (already pure+tested as inbox-fuzzy.test.ts) wired into a Cmd/Ctrl+K palette — _command-palette.tsx (modal, ↑/↓/enter/esc, click-out, "No matches", cap 50) + page.tsx (a SEPARATE Cmd+K keydown effect because the j/k handler early-returns on modifier keys so it never saw Cmd+K; paletteCommands = jump-to-lane built-in+custom+Bundles + mark-done/snooze on the selected attention/snoozed conv + open any loaded conv by fuzzy name—subject). tsc0. **C06 BCC 9f2b15c4**: the composer already had Cc end-to-end; added Bcc through ALL four layers it touches (mirror of Cc → safe-by-construction): smtp-send OutgoingMessage.bcc→nodemailer; deliver-interactive input.bcc→SMTP join + Resend array; /api/emails/send schema bcc:string[]→deliverInteractiveEmail; composer Bcc field+toggle beside Cc (opens pre-populated from draft.cc/bcc) + payload + saved-draft. ALSO replaced the composer's naive split(",") with parseRecipients (template-vars, already tested) → pasted "a@b.c, Name <d@e.f>" becomes 2 deduped pills; To/Cc/Bcc seeds parsed the same. tsc0, template-vars+smtp tests 10/10. **No new migration; READ-ONLY preserved; send paths already gated by recipient-guardrail/opt-out/plan-limit.** Residual: palette could also search ACROSS lanes (currently loaded-lane only) + offer global nav; composer rich-text. **Phase-2 shipped: N04, T04, S02, S06, T05, T01, T02, T03, K01, C06 + brains.** Next: G-features (G01 Call Mode brief in pane sidebar / G03 last-interaction / G05 next-action→unblocks S09 / G06 collision / G07 sequence-link), then R04.
- 2026-06-17: PHASE 2 batch 10 → **G05 + G03 SHIPPED 0c9c47a8** (revenue context in the conversation pane). **G05 next-action**: extended suggestNextAction to the LIVE deal_stage enum (qualification/demo/trial/won/lost; kept qualified/new aliases the tests pin) + added pure deriveSituation (objection > new[no outbound] > waiting-on-them no_reply/gone_quiet[≥7d] > replied). detail route loads the contact's latest open deal stage + derives situation from the thread → ONE cited prompt, gated so a fresh inbound with no deal & no cue stays silent (no hollow "review and decide"); rendered as a slim accent card atop the pane (suggests, never auto-acts). **G03 last-interaction**: detail route returns the contact's most recent real interaction of ANY channel reusing INTERACTION_ACTIVITY_TYPES SSOT → "Last interaction: 3d ago · call" in the header. 5 new tests (8 total in inbox-next-action), tsc0; both queries READ-ONLY + tenant/owner-scoped, no migration. **G05 also produces the deal-stage + situation that S09's why-line wanted → S09 now unblockable.** Residual: meeting_set situation needs a calendar signal (never inferred). **Phase-2 shipped: N04, T04, S02, S06, T05, T01, T02, T03, K01, C06, G05, G03 + brains.** Next wake: G01 (Call Mode prospect brief in a pane sidebar — layout change, reuse career-timeline+company-summary from project_callmode-prospect-brief), then G06 (collision notice in pane, reuse ContactCollisionNotice) + G07 (sequence-reply link), then R04.
- 2026-06-17: PHASE 2 batch 11 → **G01 + G06 SHIPPED a26f51eb** (prospect context in the pane). **G01 brief**: REUSED the Call Mode brief endpoint /api/call-mode/prospect-brief as-is (Apollo career + company homepage text + grounded fail-closed LLM, jsonb-cached — expensive work untouched). The existing ProspectBriefCard was French-chromed + pulled 6 Call-Mode-local deps → extracting it risked the preview-unverifiable Call Mode panel, so instead built a compact ENGLISH-chromed _prospect-brief.tsx hitting the same endpoint (imports only the PURE core: types + careerEntryLabel/profileUrl/recentActivityUrl). KEY DESIGN: **on-demand** (fetch only when the section is expanded) so opening a conversation NEVER spends an Apollo/LLM credit — the deliberate Call-Mode difference (there you're about to dial → auto-build). Fail-soft. **G06 collision**: rendered ContactCollisionNotice (same self-contained fail-closed component the composer uses, returns null when no teammate touch) at top of pane body. tsc0; brief + collision endpoints already tested; no migration, read-only contact-scoped. Residual flagged: full extract of the shared brief card (English-i18n the Call Mode chrome) = follow-up; the on-demand reuse is the right inbox default regardless. **Phase-2 shipped: N04, T04, S02, S06, T05, T01, T02, T03, K01, C06, G05, G03, G01, G06 + brains.** Next wake: G07 (sequence-reply step link — enrollment already loaded in detail route; outbound msgs carry stepNumber) + R04 (re-fetch attachments on demand). After R04, re-read residual list → if all residual/ocean/done, STOP + full Phase-2 summary.
- 2026-06-17: PHASE 2 batch 12 (FINAL) → **G07 SHIPPED 7069b428** + **R04 FLAGGED OCEAN** + **PHASE-2 BUILD-OUT COMPLETE → LOOP STOPPED**. **G07 sequence-reply link**: when enrollment exists (already loaded by detail route), the pane header shows "Reply to step N of <sequenceName>" → /sequences/<sequenceId> (route verified present); step = max stepNumber among the thread's outbound msgs (already on each message); falls back to "In sequence <name>"; fail-soft. tsc0, presentation-only over loaded data. **R04 = GENUINE OCEAN, NOT BUILT (flagged, no fake)**: INVESTIGATED the inbound capture path — lib/capture/email-capture.ts stores `metadata:{messageId,from,to,...}` with ZERO attachment data; the IMAP/Gmail fetch never parses bodyStructure/attachments; the only "attachment" refs in the codebase are OUTBOUND templates (ics.ts, email-shell). So there is NOTHING captured to surface read-only, and re-fetch-on-demand would require: (1) capture-path change to parse+persist attachment refs (filenames/content-ids) per inbound email [+ reprocess historical], (2) a provider download path (Gmail/IMAP/Outlook — read scopes + byte streaming), (3) storage/serving (Blob). That's a multi-layer feature = ocean → DEFER to an interactive build with runtime verify. **STOP DECISION**: re-read the residual list — everything remaining is (a) pure-LLM specs needing LIVE runtime to verify (C01-05/07/08/10/12, Q01/02/05/07/08, G08, S01/S09 text) = NOT loop-autonomous (loop bar = tsc+vitest+safe-by-construction), (b) cross-surface infra wiring better done interactively (G02/G04/G10/G12/G13, X01/03-06, CAL02-05, N01-03/05, P01-06, O01-06), or (c) ocean (R04). S09's why-line CORE VALUE (deal-stage+situation "why") is already delivered by G05's next-action card in the pane; its list-row increment is residual polish. No loop-buildable full-feature remains → STOPPED, no further wake scheduled. **PHASE 2 FINAL SHIP LIST (15 full features): N04, T04, S02, S06, T05, T01, T02, T03, K01, C06, G05, G03, G01, G06, G07 + the metadata-clobber fix.** Branch feat/ai-native-inbox-rendering NOT merged + NOT browser-verified (Playwright down) = the one manual step left for Martin.

- 2026-06-17: **FINISH-ALL RESUMED** (Martin: "continue et finis toutes les specs"). Broadened the bar — LLM features ARE in-scope via the injectable-generator pattern (S02/S06 precedent), runtime/browser verify deferred (Playwright down) + documented. Created _PHASE2-WORKLIST.md = full 101 disposition (A deterministic-wiring · B LLM · C prod-covered/document · D settings-infra · E ocean). Batch 13 → **S04 action items + S05 entities → pane (18798361)**: extractActionItems/extractEntities over inbound text in the detail route → "Action items" card + "Key details" chips (money/dates/phones; urls/emails dropped as noise), 10 core tests, tsc0, read-only. Loop now worklist-driven to 101/101 (shipped | prod-covered-documented | ocean-flagged).
- 2026-06-17: batch 14 → **T09 bulk multi-select SHIPPED 5b40a2fa**. Wired selection.ts reducer into the list: x toggle / Shift+x range / Esc clear keyboard, per-row checkbox (span role=checkbox, hover+selection-visible), sticky bulk bar (N selected · Done · Snooze-tomorrow · Select all · Clear), e=bulk-done when selection non-empty. Fan-out reuses per-key triage verb + summarizeBulk failure report; selection clears on lane switch. tsc0, selection test 7/7. Dedicated /triage/bulk endpoint residual. Worklist A: S04,S05,T09 done; remaining S03,T06(chain),T07,Q04,S09.
- 2026-06-17: batch 15 → **Q04 search SHIPPED e138dc51** + **T07 FLAGGED OCEAN**. Q04: search-match.ts matchesSearch(from/to/subject/before/after/is + free text, AND, bad-date-ignored, has:-ignored bc attachments uncaptured) + isActiveQuery, 6 tests; conversations route ?q= filters ACROSS lanes + returns searching; page debounced(300ms) search box in filter bar + clear. Saved-searches residual. tsc0. T07: parseListUnsubscribe core ready but raw List-Unsubscribe header NOT persisted (only transiently detected by classifyInboundSender) → read-time action has nothing to act on → needs forward-only capture-path change + RFC8058 POST endpoint + suppression ledger → FLAGGED (do w/ runtime verify). Worklist A: S04,S05,T09,Q04 done; T07 ocean; remaining S03,T06(chain),S09.
- 2026-06-17: batch 16 → **S03 catch-me-up SHIPPED d540cea7** + **S09/T06 FLAGGED → SECTION A COMPLETE**. S03: seen-store.ts (lastSeenAt user_preferences JSONB) + POST /api/inbox/seen + selectCatchUp over visible in route (first-visit guard returns 0, page inits marker once) + "N new since you were last here · Mark all seen" banner atop list (hidden while searching/selecting). LLM digest narrative residual. tsc0, catch-up test 4/4. S09 FLAGGED: composeWhyLine overlaps the already-shipped T08 reason; its no-reply-days signal barely applies in attention lane + richer form needs per-row deal-stage join → covered by T08+G05+N04+S05, wiring risks regressing T08 for marginal gain. T06 FLAGGED: shouldResurface gated on a conditional-snooze flag not captured (chain). **SECTION A DONE: S04,S05,T09,Q04,S03 shipped; T06,T07,S09 flagged.** Next: SECTION B (LLM, injectable pattern) — S01/S08 on-demand thread summarizer first.
- 2026-06-17: batch 17 (SECTION B start) → **S01+S08 thread summarizer SHIPPED a5ec2578**. First LLM feature on the S02 injectable template: summarize-thread.ts summarizeThread(messages, generate?) → {tldr, keyPoints[], citations[]}, reuses pickKeyMessages (long thread not sent whole), prompt indexes msgs so citations map to real positions, clamps citations to range, fail-closed; 3 tests (prompt shape / mapping+clamp+cap / fail-closed). POST /api/inbox/conversations/summarize re-loads by key (owner-scoped). _thread-summary.tsx "Summarize thread" button shown only for long threads (shouldSummarize), fetch-on-click → zero token on open. tsc0. NOT runtime-verified (no live LLM this session) — verified by stub-generator tests + analogy to S02 prod path. Next B: C04 rewrite in composer.
- 2026-06-17: batch 18 → **C04 rewrite SHIPPED a3541a37**. rewrite.ts rewrite(body, instruction, generate?) injectable: 5 GTM presets (shorter/warmer/formal/direct/counter-objection) + free-form, grounded prompt (preserve facts), fail-closed → caller keeps original; 4 tests. POST /api/inbox/compose/rewrite stateless+read-only. Composer: "Rewrite" menu above body (presets + "tell the AI how…" field) swaps body in with one-tap Undo (keeps prior). tsc0. NOT runtime-verified (no live LLM). Next B: C07 bullets-to-draft + C08 translate (same composer-menu shape).
