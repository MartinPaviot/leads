# Monaco "CRO Copilot" — Full Audit + Elevay Build Plan

**Date:** 2026-06-14
**Author:** autonomous session
**Scope:** Everything Monaco markets as its "CRO Copilot" (product step 6 "Ask Monaco"), decomposed into capabilities, each compared against Elevay's **code-verified** current state (not stale docs), with a phased build plan to reach top-class parity.
**Primary sources:** Monaco product page captured verbatim (`teardown-monaco-v3/raw/02-product-text.txt`), re-fetched live 2026-06-14 (unchanged); homepage snapshot (`teardown-monaco-v3/raw/01-homepage-snapshot.yml`); hero/feature video frame analysis (`_research/teardown-monaco/feature-video-frame-analysis.md`); UI teardown (`_research/ui-teardown/monaco-components.md`, `monaco-ui.md`); April parity matrix (`_research/monaco-deep-dive-2026-04-20/MONACO-STRONG-POINTS-MATRIX.md`, now partly stale — superseded by direct code reads below).
**Method note:** Every Elevay verdict below is anchored to a real `file:line` read this session, per the "verify current code state, never cite stale research" rule.

---

## 1. What Monaco calls "CRO Copilot" (definitive, verbatim)

Monaco's product is a 6-step pipeline: **Build TAM → Overlay signals → Execute sequences → Capture activity → Track pipeline → Ask Monaco.** The first five build and maintain the data. **Step 6 "Ask Monaco" is the CRO Copilot** — the intelligence layer that sits on top of all the captured data and tells the founder what to do.

**Headline (product page, step 6):** "Ask Monaco • Increase Conversion" → **"Your CRO Copilot"**
**Promise:** *"Using Monaco is like having the world's best CRO leading sales at your startup."*
**Homepage tile:** *"CRO Copilot — Monaco proactively coaches you on what you should be doing to close more revenue."*

### The three official pillars (verbatim)
1. **Prioritized actions** — *"Monaco tells you the most important actions you can take to close more revenue."*
2. **Ask Monaco** — *"Chat with Monaco to receive sales feedback and uncover trends across the business."*
3. **Proactive insights** — *"Monaco gives you information about your business proactively."*

### Customer testimonial that defines the bar (verbatim)
*"The AI actually knows which opportunities to prioritize and automates my follow-up. It's like having a world class CRO as a copilot."* — Ben Dopfner, Vesto.

### The killer mechanic (the actual demo, not a separate pillar)
The screen Monaco leads with is **blunt, meeting-aware behavioral coaching.** Query: *"How could I have done a better job on the Judgment Labs demo?"* → response titled **"You Lost Control — This Demo Was About You, Not Their Pain"** with three specific critiques that quote the real meeting: *"Alex mentioned frustration with his existing set of tools and you never asked why"*; *"Ended without a time-confirmed calendar invite… time kills all deals."* (`monaco-components.md:302-310`, `teardown.md:167-178`.)

This is the moat: not generic advice, but **specific feedback tied to specific moments in a recorded call**, delivered in a tough-CRO voice. Quality is a direct function of the capture layer feeding it.

### The surface (UI)
- **Floating "Ask AI" overlay panel** (sparkle icon) over the current view — never a separate page; the data stays visible behind it. (`monaco-components.md:285-300`.)
- **Hybrid menu + chat**: preset quick-actions (**Overview / Outbound Sequences / Summary / Opportunities**) *plus* a freeform input ("…best strategy for my TAM?"). (`feature-video-frame-analysis.md:101-111`.)
- **Tough-coach tone**, deliberately not a polite assistant. (`monaco-ui.md:168-169`.)

### Decomposition used for this audit
| ID | Capability | Source pillar |
|----|-----------|---------------|
| **C1** | Conversational assistant — data Q&A across the whole business | Ask Monaco |
| **C2** | Behavioral sales coaching — blunt, meeting-grounded, evidence-quoting | Ask Monaco (the demo) |
| **C3** | Prioritized actions — ranked "what to do to close more revenue" | Prioritized actions |
| **C4** | Proactive insights — pushed trends/intel before you ask | Proactive insights |
| **C5** | Voice / persona — "world's best CRO", confrontational coach | cross-cutting |
| **C6** | Surface / UX — floating overlay, hybrid menu+chat, available anywhere | cross-cutting |
| **X** | Grounding — citations + quality of captured data feeding all of the above | cross-cutting |

---

## 2. Elevay today — capability-by-capability (code-verified)

### C1 — Conversational assistant ("Ask Monaco") → **AHEAD of Monaco**
- **Floating dock available from any page**, toggled **Cmd/Ctrl+J**, mounted in `(dashboard)/layout.tsx`, persists across navigation, hidden only on `/chat` itself. `components/chat/chat-dock.tsx:71-230`. This is the exact overlay pattern Monaco uses — present.
- **158 function-calling tools** across query/create/update/intelligence/skills/action/navigation/memory, registered in `lib/chat/tools/index.ts` and routed by `lib/chat/tool-router.ts`. Monaco's panel exposes a handful. Elevay's chat can answer/act on far more.
- **Page-scoped context**: `lib/chat/surface-from-path.ts:97-149` derives `{contextType, contextId}` from the URL; the dock re-sends it on every request (`chat-dock.tsx:87-100`); the API hydrates full entity context (account+contacts+deals+last 20 activities) at `app/api/chat/route.ts:292-379`.
- **Hybrid menu + chat**: empty-state starter prompts personalized by challenge + role (`app/api/chat/suggestions/route.ts:16-53`), page-aware dock suggestions (`chat-dock.tsx:34-49`), and **post-response follow-up pills** (`components/chat/follow-up-pills.tsx:44-72`). Equals or beats Monaco's 4 static presets.
- **Citations**: system prompt mandates clickable entity links `[Name](/contacts/{id})` etc. and interaction sources (`lib/prompts/chat-system-prompt.ts:226-239`); rendered as badges with slide-over preview (`components/entity-link.tsx`).
- **Gap (minor):** transcript **seek-to-recording chips** are designed end-to-end — `searchTranscripts` returns `formattedForCitation` with load-bearing `[mm:ss]` markers (`lib/chat/tools/coaching.ts:135-198`) and the prompt instructs verbatim quoting with those markers (`chat-system-prompt.ts:249-266`, "MONACO-PARITY-05") — but the **chat-markdown renderer does not yet linkify `[mm:ss]` into clickable chips**. The data flows; the last UI hop is missing.

**Verdict: PARITY+ (we exceed Monaco). One small render gap.**

### C2 — Behavioral sales coaching (the killer feature) → **BEST ASSET IS ORPHANED**
There are **three coaching paths at three quality tiers** in the codebase:

1. **`getDealCoaching` chat tool** — retrieves comprehensive deal context (deal + contact + company + 30 activities + days-since-last-activity) and lets the chat LLM coach inline in the CRO voice. `lib/chat/tools/intelligence.ts:13-70+`. **Works, reachable via chat.** Output is freeform chat prose, not a structured artifact.
2. **`getCoachingInsights` chat tool** — reads **pre-stored** insights from the `coachingInsights` table (`pre_send` / `post_interaction` / `deal_risk` / `process_gap`). `lib/chat/tools/coaching.ts:18-76`. So some coaching *is* generated and stored proactively (see below).
3. **`sales-coaching` SKILL** — the real Monaco analog: structured `diagnosisHeading` + `evidenceQuotes[]` (verbatim quote + context + sourceType) + strengths/weaknesses/nextSteps/objections, grounded in deep conversation context + deal velocity, in an explicit "tough CRO like Sam Blond at Brex, name dates and people, never generic" prompt. `skills/intelligence/sales-coaching/handler.ts:19-148`. **This produces exactly the "You Lost Control + 3 specific evidence-quoted critiques" output Monaco demos.**

   **It is ORPHANED.** Registered (`skills/register-all.ts:32,59`) and reachable only via the generic `/api/skills/[slug]` runner. **No UI button, not wired to any chat tool, no trigger fires it after a meeting.** A Ferrari with no exposed steering wheel.

- **Proactive coaching that DOES exist is narrow:** `inngest/coaching-engine.ts:253-327` (`analyzeDealEvent`) coaches only on **skipped stages**; `inngest/calls-post-process.ts:301` fires `coaching/post-interaction` after calls and indexes the transcript for RAG (`:36`). Neither runs the premium `sales-coaching` skill.
- **What the deal page shows today:** an "Autofilled intelligence" card (budget / team_size / current_crm / competitors / timeline, source-attributed) at `opportunities/[id]/page.tsx:~572-606`, and a lighter deal-coaching card showing `riskLevel` + `daysSinceActivity` at `~614-678`. The structured diagnosis+evidence output never appears here.
- **Risk WITH why exists but is hidden:** `churn-risk-detector/handler.ts` emits `riskReasons[]` + `suggestedAction` (`:127,154`) — not surfaced on the opportunity page (badge only).

**Verdict: PARTIAL. The capability is built to a high standard but unsurfaced — this is the single biggest, cheapest win.**

### C3 — Prioritized actions → **GOOD BASE, SMARTEST SIGNALS UNUSED**
- **"Needs you" queue** on `/home` (`UpNextView`, refetch 30s, `home/page.tsx`), built by `lib/home/up-next.ts:352-442` (`buildNeedsYou`). Categories: **reply / deal_risk / meeting / task**, scored ranking (`:345-366`, lowest-score-first `:441`), with **one-click inline draft reply** (`components/up-next/up-next-view.tsx:222-232`). API `app/api/home/up-next/route.ts:1-445`.
- **Gap 1 — ranking ignores momentum.** `lib/deals/deal-velocity.ts` (activity/sentiment trend, risk, est. close) and `lib/deals/opportunity-health.ts:28-79` are **built but not consumed** by `buildNeedsYou`. Priorities rank on days-silent + deal value only.
- **Gap 2 — a better engine is orphaned.** `app/api/actions/route.ts:7-263` has richer categories (**follow_up / rescue / research**) and signals (positive-sentiment-no-reply, question-asked-in-7d, budget-mentioned-in-14d, warm TAM matches) — **no UI consumer.**
- **Gap 3 — only "reply" is one-click.** No inline "nudge / setup / send" flows like Monaco's 4 action types.

**Verdict: PARTIAL. Base is solid; the intelligence to make it Monaco-grade already exists, just unwired.**

### C4 — Proactive insights → **PULL-ONLY; SOPHISTICATED ENGINES NOT SURFACED**
- `/insights` page + `app/api/insights/route.ts:15-217` exist but are **rule-based thresholds** (stalling >14d, win-rate count, bottleneck >60% in one stage, TAM gaps, unenriched) and **on-demand only**.
- **Sophisticated engines exist but aren't on the insights surface or pushed:** `lib/insights/cohort-engine.ts` (Fisher exact + Benjamini-Hochberg, zero-insight-on-noise) behind `/api/analytics/cohorts`, and `lib/analytics/rev-equation.ts` (range forecast, bottleneck attribution) behind `/api/analytics/forecast`. (Cross-ref memory: cohort-insights-engine, rev-equation-engine — both note "UI surface RESTENT".)
- **Push is almost absent:** `inngest/autonomous-pipeline.ts` writes a weekday-09:00 notification (`:65,314-342`) but only for autonomous-mode tenants and DB-only; notifications are **poll-only** (`api/notifications/route.ts:1-79`), no daily digest to home or email, no homepage intelligence surfacing, no LLM narration of trends.

**Verdict: PARTIAL→WEAK. This is the largest true gap vs Monaco's "proactively gives you information."**

### C5 — Voice / persona → **PARITY**
- Chat system prompt: explicit CRO-coach framing — *"Be direct and confrontational like a top coach"*, forbidden filler phrases, numbers-as-evidence, "I don't have that in your CRM" instead of hedging, no emoji. `lib/prompts/chat-system-prompt.ts:38-55, 268-278`.
- Coaching skill: *"tough, senior CRO… like Sam Blond at Brex… name dates, name people, never generic."* `sales-coaching/handler.ts:68-123`. The blunt voice is already there.

**Verdict: PARITY. No work needed.**

### C6 — Surface / UX → **PARITY**
- Floating dock overlay (C1) matches Monaco's "Ask AI" overlay; hybrid menu+chat present (C1). Different nav chrome (sidebar vs Monaco's bottom toolbar) — not worse.

**Verdict: PARITY.**

### X — Grounding & captured data → **STRONG, capped by no meeting recorder**
- Grounding is rich: entity context + RAG record links (`api/chat/route.ts:144-165`), 158 tools, semantic search over emails/notes/call recordings, transcript chunk retrieval with speaker-bias (`coaching.ts:135-198`).
- **Hard ceiling:** there is **no native meeting recorder** — transcripts are ingested/uploaded, not captured by a bot that joins the call (SP-22, still open). Monaco's coaching specificity comes from *its own* recorder. Capture pipeline itself was recently repaired (memory: last-interaction-finding). Deal fields auto-extract via `lib/deals/deal-autofill.ts` (budget/timeline/team_size/current_crm/competitors).

**Verdict: STRONG but the recorder gap caps C2's ceiling.**

---

## 3. Master gap table

| Cap | Monaco | Elevay (code-verified) | Verdict | Priority |
|-----|--------|------------------------|---------|----------|
| C1 Conversational | "Ask AI" overlay, ~4 presets + chat | Floating dock Cmd/Ctrl+J, 158 tools, page-scoped, citations, presets + follow-up pills | **PARITY+** | — (finish [mm:ss] chips) |
| C2 Behavioral coaching | "You Lost Control" + evidence quotes from the call | Premium structured skill EXISTS but **orphaned**; 2 lighter paths live | **PARTIAL** | **P0** |
| C3 Prioritized actions | ranked nudge/respond/setup/send + reason + $ | "Needs you" (reply/deal_risk/meeting/task), 1-click reply; momentum + richer engine unwired | **PARTIAL** | **P1** |
| C4 Proactive insights | pushed daily trends/intel | pull-only rule-based; cohort/forecast engines not surfaced; no digest push | **WEAK** | **P1** |
| C5 Voice | tough CRO | tough-CRO prompt in chat + skill | **PARITY** | — |
| C6 Surface | floating overlay + hybrid | floating dock + hybrid | **PARITY** | — |
| X Grounding | own meeting recorder | rich grounding, **no recorder** (upload only) | **STRONG, capped** | **P2** |

---

## 4. Headline finding

**Elevay is not missing the CRO Copilot — it is failing to surface the one it already built.** The conversational layer already exceeds Monaco (floating dock, 158 tools). The premium coaching engine that reproduces Monaco's signature "You Lost Control" output exists and is high-quality — but has no button, no chat tool, no trigger. The momentum/velocity engines that would make prioritized actions Monaco-grade are built and unconsumed. The statistical insight engines (cohort, forecast) are built and unsurfaced. **The gap to "top class" is mostly wiring and pushing, not net-new AI.** That is a multi-day integration effort, not a quarter of R&D — with one larger bet (meeting recorder) that raises the ceiling.

---

## 5. Build plan to top-class (phased, completeness-scored)

Completeness target X/10 per CLAUDE.md (10 = all edge cases). Each item notes current → target.

### Phase 0 — Surface the orphaned coaching (P0, days, highest ROI)
1. **`getSalesCoaching` chat tool** wrapping `skills/intelligence/sales-coaching` so the chat returns the structured diagnosis+evidence card, not just freeform prose. *(2→9)*
2. **"Coach me on this deal" button** on `opportunities/[id]` rendering `diagnosisHeading` + `evidenceQuotes` (each quote a clickable source) + strengths/weaknesses/nextSteps/objections. *(0→9)*
3. **Post-meeting auto-coach trigger**: on `meeting/processed` (and high-risk `deal_risk`), run the skill, store to `coachingInsights`, surface as a "coaching ready" item in Needs-you. *(2→8)*
4. **Surface churn-risk "why"**: render `riskReasons` + `suggestedAction` as a tooltip/expander on the risk badge. *(3→9)*
5. **Finish transcript seek chips**: linkify `[mm:ss]` in the chat-markdown renderer to seek the recording (data already flows). *(6→10)*

### Phase 1 — Make actions + insights truly proactive (P1)
6. **Feed momentum into ranking**: have `buildNeedsYou` consume `deal-velocity` + `opportunity-health`; fold the orphaned `/api/actions` categories (follow_up/rescue/research, budget-mention, question-asked, warm-match) into one ranked queue. *(4→9)*
7. **Revenue-at-risk aggregate** on home: "$X across N stalled deals" portfolio view, not just per-deal rows. *(0→8)*
8. **Daily intelligence digest cron** (all tenants): LLM-narrated top 1-3 insights, surfaced on `/home` (interrupt card) + optional email; draws from cohort-engine + rev-equation + signals — and only fires when an insight clears the noise floor (cohort-engine already guarantees zero-on-noise). *(2→9)*
9. **Surface cohort + forecast** on `/insights` (wire `/api/analytics/cohorts` + `/api/analytics/forecast` to the page). *(3→9)*
10. **One-click action types** beyond reply: nudge / setup / send inline in Needs-you. *(3→8)*

### Phase 2 — Raise the ceiling (P2, the one "ocean" — flag to Martin)
11. **Native meeting recorder** (Recall.ai bot-joins-call → transcript → `process-transcript` → deal-autofill + auto-coach). This is the largest piece and the biggest lever on coaching specificity — Monaco's whole moat rests on owning the recording. Everything in Phase 0 works on uploaded transcripts today; this deepens it. **Flagged as the one item that is an integration project, not a wiring task.** *(0→8)*

**Sequencing rationale:** Phase 0 converts already-built quality into visible product in days. Phase 1 closes the genuine proactive-intelligence gap using engines that already exist. Phase 2 is the only true build and should be a conscious decision, not assumed.

---

## 6. What Elevay already beats Monaco on (keep, don't regress)
- Self-serve (Monaco demo-gated). Fully autonomous (no forward-deployed AE). Transparent pricing. Floating dock + 158 tools (Monaco's panel is thinner). Multi-language generated content. Statistical insight engines (cohort/forecast) Monaco hasn't shown. Approval-mode action cards.

## 7. Open dependencies / risks
- **C2 ceiling = capture quality.** Without the recorder, coaching specificity depends on uploaded transcripts; coaching on a deal with no transcript degrades to activity-trend advice — make that failure honest ("no recording on file; coaching from email/activity only").
- **Insight credibility.** Keep the cohort-engine noise floor; a daily digest that surfaces trivial counts ("you have 10 contacts") destroys the "world's best CRO" promise faster than silence. Push only when it clears the bar.
- **Voice consistency.** The blunt CRO tone already lives in two prompts (chat + skill); keep them in sync so coaching reads the same whether invoked from chat or the deal button.

---

## 8. One-line summary
Monaco's CRO Copilot = blunt, meeting-grounded coaching + ranked revenue actions + pushed insights, in a floating overlay. Elevay already has a stronger conversational core and an equal-or-better coaching *engine* — it just hasn't surfaced or pushed any of it. Top-class is ~2 phases of wiring + one optional recorder bet away.
