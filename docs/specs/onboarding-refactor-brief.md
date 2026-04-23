# Elevay Onboarding Refactor — Kiro-Style Spec Brief

**Owner:** Martin  
**Date:** 2026-04-21  
**Target executor:** Claude Code  
**Methodology:** Kiro (spec → plan → execute, step by step, no rush)  
**Quality bar:** correctness over speed, measured before modified

---

## 1. Context

### 1.1 Product
Elevay is an AI-native autonomous GTM engine for early-stage B2B founders. The current onboarding is a fullscreen 7-step modal wizard collecting 15+ data points across identity, email provider, sync preferences, product, and ICP. It was audited in depth on 2026-04-21 (see companion doc `onboarding-audit-2026-04-21.md`).

### 1.2 Diagnosed problem
The current onboarding collects roughly 4× more data than AI-native benchmarks (Lightfield, Attio) for similar downstream value. It exhibits an identity conflict: the product promises an autonomous agent, but the onboarding UX is a legacy SaaS wizard with LLM pre-fill as garnish. Specific symptoms: modal with no exit, 113-item flat industry dropdown, `aiTone` silently overridden, `confidenceGaps` displayed read-only (UI theater), `salesMotion` and `primaryChallenge` collected but not meaningfully consumed, 30s progress bar that takes 40-120s in reality, no trust calibration moment, no cost cap surfaced, `agentApprovalMode` defaulting to `"auto"` without user consent.

### 1.3 Unknowns acknowledged
Two things are NOT known at brief time and must be resolved empirically before design decisions harden:
- **Drop-off points in the current funnel** (not instrumented today).
- **p95 latency of `analyze-website` + `enrich-icp`** (not measured today).

These gaps are why this refactor is sequenced as measure → decide → build, not big-bang rewrite.

---

## 2. Target state (North Star)

### 2.1 The three success criteria
Any final implementation must satisfy all three:

1. **Time-to-first-agent-action < 90 seconds** from OAuth completion. "First agent action" means a visible, useful act on the user's real data — e.g., a drafted follow-up on a warm lead from their inbox. Not a dashboard, not a progress bar reaching 100%.
2. **Explicit trust calibration before any autonomous action.** User must consciously set approval mode, budget cap, and sending identity before a single email is sent. No defaults that commit real-world side effects.
3. **Zero silent surprises.** Every inference the agent made is visible and editable. Every autonomous action is announced before execution and reversible after. No silent field mutations (kill the current `aiTone` override pattern across the codebase).

### 2.1.1 Formal definition of TTFAA (resolves tension T1 with WS-7 grace period)
Time-to-first-agent-action is defined as: **the wall-clock duration from successful OAuth completion to the first moment a user-visible agent action appears on screen.** Specifically:

- The timer starts on OAuth success callback (server-confirmed).
- The timer stops when any of the following renders to the user: a drafted email on a warm lead (WS-3), a TAM reveal notification with ≥1 company (WS-4), or a confirmation card with at least one inferred field populated (WS-2).
- The timer does **not** wait for SMTP delivery. WS-7's 60-second grace period on email sends is invisible to this metric — the user sees the draft and the "sent (undo 60s)" state in one continuous visible flow.
- A user who hard-refreshes or closes the tab before any of these renders is counted as a drop-off, not a TTFAA measurement.

This definition must be the single source of truth for WS-0 instrumentation and section 6 success criteria. Any debate about "does X count as first action" is resolved by this definition, not re-negotiated per workstream.

### 2.2 Target flow (4 moments, not 7 steps)
- **Handshake.** OAuth only. In parallel, fire website scrape, inbox metadata scan, and LLM inference background jobs.
- **Confirmation screen.** Single page with three zones: (a) inferred identity + product fields shown as an editable summary; (b) proposed targeting with live Apollo match count + 5 preview logos, tighter/looser adjuster; (c) three explicit guardrails (approval mode, budget cap, sending identity).
- **First act of value.** While TAM builds in background, present 3 warm leads from inbox scan with offer to draft a follow-up on the top one. User reviews, edits, sends. Real email goes out before TAM returns.
- **TAM reveal.** Async notification 60-120s later: match count + top-10 companies with match reasons + offer to draft a sequence for top 5. No "ready" screen. Onboarding ends by dissolving into the product.

### 2.3 The 15 fields, sorted (authoritative classification)

**Infer + display for confirmation (Category A)** — `fullName`, `companyName`, `domain`, `productDescription`, `aiTone`, `language`, `timezone`. One confirmation card. No forms. Every inference carries a visible "AI — inferred from [source]" badge.

**Infer + live preview + confirm (Category B)** — `targetIndustries`, `targetCompanySizes`, `targetSeniorities`, `targetDepartments`, `targetGeographies`. Replace the 113-item flat dropdown with vertical presets + tighter/looser adjuster. Live Apollo count must update as the user adjusts.

**Explicit frontal collection (Category C)** — `agentApprovalMode` (review each / batch / auto-high-confidence), `llmMonthlyCostCapUsd` (default by tier), sending mailbox identity (primary inbox vs dedicated secondary domain). Non-negotiable. Three questions, one screen.

**Just-in-time (Category D)** — `contactCreationMode` (default `selective`, asked inline when ambiguous), `backsyncRange` (default 3m silent, extendable in Settings), `doNotTrackDomains` beyond the 17 built-ins (inline button on records), `companyInvestors[]` (asked when investor-overlap signal opened), `pipelineStages` (default 5-stage standard), `knowledge[]` (accumulated via chat, surfaced in auditable panel).

**Delete (Category E)** — `role` (no real consumer branches on value), `salesMotion` (1 cosmetic consumer), `primaryChallenge` (1 cosmetic consumer — home subtitle), `defaultDataVisibility` in single-seat tenants (the `"team"` option is a placeholder), `targetRoles` persisted (recompute on read), `confidenceGaps` read-only panel (either make actionable or remove).

### 2.4 Fields to surface that are NOT currently collected
`companyInvestors[]` (unblocks the investor-overlap signal, currently dead), `language` + `timezone` (infer silently from browser), `agentApprovalMode` (currently defaulting silently to `"auto"` — unsafe), `llmMonthlyCostCapUsd` (currently unset — P&L risk), sending mailbox identity.

---

## 3. Execution sequence (Kiro methodology)

The refactor is partitioned into nine sequential workstreams. Each has a clear exit condition. Do NOT start a workstream until the previous one's exit condition is met and validated with Martin.

**Execution order (numerical ≠ temporal for WS-5):**
`WS-0 → WS-1 → WS-2 → WS-3 → WS-4 → WS-6 → WS-7 → WS-8 → WS-5`

WS-5 (flag ramp + legacy cleanup) is numbered 5 but executes last because it assumes every functional workstream has shipped and been validated. Treat WS-5 as a final consolidation step, not an early one.

### WS-0 — Instrumentation (prerequisite, ~2 days)
**Why first:** we cannot refactor what we have not measured. All "before" metrics must be captured on the current onboarding before any UX change ships, so we have a baseline to compare against.

**Deliverables:**
- PostHog (or existing analytics) events fired at every `setStep` transition with `{step, timestamp, userId, tenantId, sessionId}`.
- Funnel view: signup → step 1 completed → step 2 → … → completed, with drop-off rate and median + p95 duration per step.
- Latency events for `analyze-website`, `enrich-icp`, `tam-build`, `find-contacts`, `email-intelligence`: record p50, p95, p99 and error rate.
- "Time-to-first-agent-action" instrumentation per the formal definition in section 2.1.1: emit a `ttfaa_started` event on OAuth success (server-side, unambiguous) and a `ttfaa_completed` event when the first qualifying render occurs (confirmation card populated, warm lead draft visible, OR TAM reveal notification with ≥1 company). Store the duration. On v1 (current onboarding), capture the proxy: "time from OAuth complete to dashboard land with at least one enriched record". On v2, the formal definition applies.
- Cohort analysis: completion rate by email provider (Google vs Microsoft vs skipped), by company size inference bucket, by device (desktop vs mobile if applicable).

**Exit condition:** Martin has reviewed the dashboard, the 3-day rolling drop-off funnel is populated with ≥30 distinct sessions, and we have identified the 2 highest-friction steps in the current flow with numbers.

**Note to Claude Code:** resist the urge to fix anything during this workstream. Pure instrumentation only. Any "while I'm here" changes to onboarding code are out of scope and forbidden. If you spot a bug, file it, don't fix it.

---

### WS-1 — Guardrail collection infrastructure (~2-3 days)
**Why second:** the three explicit guardrails (approval mode, budget cap, sending identity) are the highest-leverage, lowest-risk addition. They protect the user and the P&L. They can ship before the full UX refactor and immediately reduce risk.

**Deliverables:**
- Schema additions to `TenantSettings`: `agentApprovalMode` enum (`review-each` | `batch-daily` | `auto-high-confidence`), `llmMonthlyCostCapUsd` number, `sendingMailboxMode` enum (`primary-with-caps` | `external-connected` | `elevay-managed-requested` | `elevay-managed-active`), `sendingDailyCapPrimary` number (default 20), `sendingAllowColdOnPrimary` boolean (default `false`).
- Default values for existing and new tenants: `review-each`, a tier-appropriate cap (e.g., $50 free, $200 paid — confirm with Martin), `primary-with-caps`, 20 sends/day, cold-on-primary forbidden.
- Enforcement path for `llmMonthlyCostCapUsd` in `enforceLlmBudget` — throw `BudgetExceededError` on overage with a user-facing "approve overage or wait until next cycle" prompt.
- Enforcement path for `agentApprovalMode` in all autonomous send paths. Audit every place where emails are currently sent autonomously and route them through the approval mode check.
- Enforcement path for sending infrastructure in all outbound send paths: if `sendingMailboxMode === 'primary-with-caps'`, block any send that (a) targets a contact with no prior conversation history OR (b) exceeds `sendingDailyCapPrimary` for the current day. Blocked sends surface the scaling-path prompt (see WS-6).
- `elevay-managed-requested` is the ticket state: when the user selects this option, the system creates a record in a `sending_infra_requests` table (fields: tenantId, requestedAt, status, assignee, notes) and sends an internal notification to Martin's team. There is NO automated provisioning — this is a manual ops handoff by design.
- `external-connected` stores the OAuth credentials or API keys for a connected third-party sender (Instantly, Smartlead, SendGrid, etc.) with an extensible provider registry. Ship with Instantly first since Martin already has the Hypergrowth plan; others can follow.
- A "Sending infrastructure" section in Settings surfacing the current mode, current caps, and upgrade paths with plain-language explanations of why the protections exist.
- **Cost preview API:** an internal endpoint `POST /api/estimate-cost` that takes an operation type and parameters (e.g., `{op: "tam-build", icp: {...}}`, `{op: "sequence-draft", contactCount: 50}`) and returns `{llmEstimateUsd, apolloCredits, estimatedDurationSeconds, confidenceLevel}`. Used by WS-4 and future heavy operations to show cost preview to the user **conditionally** (see next point) — NOT on every action. Mitigation for tension T3.
- **Cost preview display rules (T3 mitigation):** the preview UI surfaces in exactly two scenarios: (a) the **first time** a tenant runs a given operation type (`costPreviewSeenForOp[op]` unset) — educational one-shot, stored per tenant per op type; (b) when the operation's estimate would push the tenant's monthly usage within 20% of `llmMonthlyCostCapUsd` or past it — actionable budget moment. In steady state (neither first-time nor near-cap), no preview modal. The cost is aggregated and visible on demand via `Settings → Usage`. This prevents budget anxiety while preserving transparency.
- **Progressive autonomy engine (with T2 mitigation built in):** a schema addition `trustScore` per tenant (0.0 - 1.0) that increments on specific positive signals (email approved without edit: +0.02; email approved with minor edit: +0.01; email heavily edited: 0; contact manually confirmed: +0.01). Plus `autonomyNudgeState` tracking whether the user has been offered upgrades from `review-each → batch-daily` (offered at trustScore ≥ 0.5) and `batch-daily → auto-high-confidence` (offered at trustScore ≥ 0.8). Nudges are surfaced as non-intrusive banners in the dashboard and never auto-applied. The user always explicitly accepts or dismisses.
- **T2 mitigation — trustScore is NOT silent.** The score and its contributing events are exposed as first-class entries in the WS-8 Agent Memory panel, in a dedicated `learned-preference` category. Every increment creates an audit trail entry ("Trust score +0.02 on 2026-05-03: you approved Alice Chen's follow-up without editing"). The user can see the current score, what moves it, and what the next nudge threshold is. This closes the loop on tension T2 with criterion 3 (zero silent surprises).
- **T2 sequencing dependency (mandatory):** no progressive autonomy nudge may fire before the Agent Memory panel is discoverable by the user. Since WS-8 defers the header "Agent brain" button until after the first approved agent action (T4 mitigation), the nudge system must check `agentMemoryPanelDiscovered` flag before surfacing any nudge. If false, defer the nudge. This ordering prevents a "mysterious nudge" appearing before the user has the tools to understand it.

**Exit condition:** Existing users can access Settings → Guardrails and Settings → Sending infrastructure, modify all values, and see enforcement behavior change. Test cases: (1) set LLM cap to $0.01 → next LLM call prompts for approval; (2) set mode to `primary-with-caps` and attempt to send to a brand-new prospect → blocked with scaling-path prompt; (3) set mode to `elevay-managed-requested` → a record appears in `sending_infra_requests` and Martin receives a notification; (4) `POST /api/estimate-cost` returns a plausible estimate for a TAM build within 200ms; (5) a synthetic test tenant with 60 approved-without-edit emails triggers the `review-each → batch-daily` nudge exactly once.

**Note to Claude Code:** this workstream touches sensitive code paths (autonomous email sending, LLM budget enforcement). Do not change the onboarding wizard in this workstream. The goal is to make the guardrails *exist* and be *enforceable* before they're introduced in onboarding UX (WS-3).

---

### WS-2 — Confirmation screen (steps 1, 4, 5 fusion) behind feature flag (~4-5 days)
**Why third:** this is the biggest user-facing change. It collapses three wizard steps into one confirmation card with inferred data. Ship behind a feature flag, validate with a small cohort, then ramp.

**Deliverables:**
- New React component `<OnboardingConfirmationCard>` rendering three zones: identity+product (Category A fields editable inline), targeting (Category B with live Apollo count + 5 preview logos + tighter/looser adjuster), guardrails (Category C — surfaces approval mode, budget cap, plus a two-sentence informational block about sending infrastructure).
- `aiTone` override becomes explicit: surface the inferred tone in the identity zone with a visible label "I detected a direct tone — change to formal / casual?". Remove the silent override from `applyWebsiteAnalysis` entirely.
- Every inferred field carries a visible attribution badge: "AI — inferred from elevay.dev" or "AI — inferred from your inbox signature".
- Live Apollo count query: debounced, cached, with a clear loading state. On first render, show the count with the default inferred criteria; as user adjusts, re-query.
- Per-field confidence scores on Category A (from the existing LLM step 2 `icpInferenceSchema.confidence`). Fields with confidence < 0.7 get a subtle visual cue prompting the user to verify.
- **Sending infrastructure informational block** (critical to the waouh-preservation strategy): the guardrails zone includes a short paragraph in plain language, framed as protection: "By default, Elevay sends your first emails from your primary inbox with protective caps (20/day max, warm follow-ups to existing contacts only). We deliberately don't send cold outreach from your primary domain — it would damage your deliverability within weeks. When you're ready to scale to cold outreach, we'll walk you through setting up dedicated sending infrastructure." This is NOT a choice to make at this step. Zero configuration burden. User moves on.
- Feature flag: `onboarding.v2.confirmation-card`. Default off. Enable for internal + 10% of new signups initially.

**Exit condition:** Martin can toggle the flag and walk through the new confirmation card end-to-end on a fresh test tenant. All Category A fields are editable, all Category B adjustments update the live count within 500ms, all Category C controls persist to the WS-1 schema. The sending infrastructure informational block renders correctly without introducing a decision prompt. The silent `aiTone` override is gone from the codebase (grep should return zero matches).

**Note to Claude Code:** do NOT delete the old wizard steps in this workstream. The v1 flow must remain intact and default until WS-5 ramps the flag. Parallel implementation, not destructive.

---

### WS-3 — First act of value: inbox-based warm lead surfacing (~3-4 days)
**Why fourth:** this is the moment that makes time-to-first-agent-action possible. Without this, the user waits for TAM regardless of how fast the confirmation screen is.

**Deliverables:**
- Post-OAuth background job: scan sent + inbox mail for the last 90 days, identify contacts with unresponded-to conversations OR responded-to conversations with >10 days of silence.
- Ranking heuristic: score each candidate warm lead by (a) recency of last interaction, (b) number of exchanges (proxy for relationship depth), (c) inferred seniority of contact from signature, (d) match with inferred ICP from Category B fields. Top 3 surfaced.
- UI component `<WarmLeadPrompt>` shown on the dashboard immediately after the confirmation card is validated. Three cards: contact name, company, last interaction summary, CTA "Draft a follow-up".
- On CTA: agent drafts a follow-up email using the user's actual past exchange as context. Show the draft, allow edit inline, approval → send (goes through WS-1 approval mode check AND WS-1 sending infrastructure check).
- **Sending enforcement rule (critical):** the send path verifies the contact has prior conversation history with the user (i.e., qualifies as "warm"). If yes and `sendingMailboxMode === 'primary-with-caps'` and daily cap not exceeded, send proceeds via primary inbox. If the contact is a true cold prospect OR the daily cap is hit, the send is blocked and the WS-6 scaling-path prompt surfaces instead. This enforcement is what keeps the "send a real email in 90 seconds" promise without risking the user's primary domain.
- Timing target: warm leads surfaced within 15 seconds of OAuth complete in p95. TAM is still building in background at this point.

**Exit condition:** a fresh test tenant with a Gmail account containing >50 sent emails produces at least one surfaced warm lead within 15s of OAuth. The drafted follow-up reads naturally, references the actual past exchange, and respects the user's inferred tone. Test case: a warm follow-up to a contact with 3 prior exchanges sends cleanly; a synthetic "cold" attempt to a brand-new address is blocked and triggers the scaling-path prompt instead of sending.

**Note to Claude Code:** edge cases to handle: (1) brand-new Gmail accounts with no history — gracefully skip the warm lead step and proceed directly to TAM reveal; (2) inbox too noisy (marketing emails dominating) — apply the existing `DEFAULT_IGNORED_DOMAINS` list before ranking; (3) user declines to draft — don't badger, just note and continue; (4) `sendingMailboxMode` must be set to something (even the default `primary-with-caps`) before any send attempt — if somehow unset, block and route to WS-6 configuration.

---

### WS-4 — TAM reveal as async notification (~2-3 days)
**Why fifth:** this removes the blocking wait screen and converts the TAM build from a friction point into a second peak of value.

**Deliverables:**
- Remove the `building` step from the wizard flow entirely in v2.
- TAM build fires in background as soon as the confirmation card is validated (Category B fields are the input).
- Inngest job completion triggers a dashboard notification: "412 companies found matching your criteria. View top 10." Click opens a panel with logos + match reasons + a "Draft sequence for top 5" CTA.
- If TAM build fails: graceful fallback to "email-only mode" — the product works without TAM, user can operate on inbox-surfaced contacts. Show a "Retry TAM build" button in Settings with error context.
- Progress visibility: a small persistent indicator in the dashboard header (e.g., "Building your pipeline — 287 companies so far") that updates as the Apollo pages come in, instead of a modal blocker.
- **Streaming reasoning (critical — this is what transforms a 60-120s wait from frustrating to fascinating):** the TAM build Inngest job emits granular progress events to a per-tenant SSE or WebSocket channel. Events carry a `{stage, narrative, data}` payload. Example sequence for a real build: `{stage: 'strategy-gen', narrative: 'Generating 3 search strategies based on your ICP...'}` → `{stage: 'apollo-search', narrative: 'Searching Apollo: B2B SaaS, 50-200 employees, US + EU... found 1,247 candidates', data: {count: 1247}}` → `{stage: 'filter', narrative: 'Filtering on recent funding signals... 412 remaining'}` → `{stage: 'enrich', narrative: 'Enriching top 200 companies with tech stack + investors...'}` → `{stage: 'score', narrative: 'Scoring against your criteria...'}` → `{stage: 'complete', narrative: '412 companies ready.'}`. The UI renders these as a collapsible live log in the dashboard header or side panel — not a modal, not a blocker. The user sees the agent reasoning out loud.
- **Cost preview before TAM kickoff (conditional per T3 rules):** after the confirmation card validates, call `POST /api/estimate-cost` from WS-1. Surface the cost preview inline on the TAM reveal notification **only if the T3 display rules apply** (first time this tenant runs a TAM build, OR the estimate would push monthly usage near/past the cap). In the first-time case: "Building your pipeline (~$0.08 in AI credits, ~30 seconds). This is an educational heads-up — I'll only show future costs when it matters." In the near-cap case: "This build will use ~$X of your remaining monthly budget. Proceed?" In all other cases: no modal, just build silently and surface cost later in `Settings → Usage`.
- Apply the same streaming reasoning pattern to warm lead scanning (WS-3) and to the future sequence generation flow. Build the SSE/WebSocket infrastructure once, reuse it everywhere heavy async work happens.

**Exit condition:** a fresh test tenant validates the confirmation card, is immediately dropped into the dashboard with WS-3's warm leads visible, sees the TAM progress indicator AND the streaming reasoning log updating with at least 4 distinct stage events before completion, and receives the TAM reveal notification within 60-120s. The cost preview displays before the build starts. No modal blocks the user at any point.

**Note to Claude Code:** the streaming progress indicator must be driven by real Inngest job state, not `setTimeout` animations. Every narrative string must correspond to a real event. Honesty over theater — ties directly to success criterion 3 (zero silent surprises). If an Inngest stage has no meaningful user-facing narrative, don't emit a fake one; simply don't emit anything for that stage.

---

### WS-5 — Flag ramp + legacy cleanup (~2 days) — EXECUTES LAST
**Why last:** this workstream is numbered 5 but executes AFTER all functional workstreams (WS-2 through WS-8) have shipped and been validated. It is the final step that ramps v2 to 100% and deletes v1 code. Do NOT start this workstream until WS-0 metrics confirm v2 matches or exceeds v1 on the success criteria defined in section 6.

**Deliverables:**
- Ramp feature flag `onboarding.v2.confirmation-card` from 10% → 50% → 100% of new signups over a 1-week period, monitoring WS-0 metrics for regressions.
- Delete dead fields from `TenantSettings` schema and types: `onboardingRole`, `salesMotion`, `primaryChallenge`, `defaultDataVisibility` (in single-seat codepath), persisted `targetRoles`. Accompanied by a migration script that moves any existing non-default values to a `legacy_settings` archive table for 90 days before hard delete.
- Delete `confidenceGaps` read-only panel from the codebase.
- Delete the `building` step component and all related timer-driven stage animations.
- Remove the 113-item flat industry dropdown component. Replace call sites in Settings (where users can still edit ICP) with the new vertical-preset-plus-adjuster component from WS-2.

**Exit condition:** v1 flow code is removed from main branch. All new signups go through v2. WS-0 metrics show completion rate equal-or-better than v1 baseline, time-to-first-agent-action under 90s for ≥p50 of sessions, and zero regressions in downstream feature usage (sequences sent, deals created, etc.).

**Note to Claude Code:** before deletion, run a final grep across the codebase for each deleted field to ensure no silent consumer remains. Log each grep result in the PR description.

---

### WS-6 — Scaling path UX (sending infrastructure upgrade flow) (~2-3 days)
**Why last:** this is the flow that triggers when the user's primary-with-caps setup runs into its limits — either volume caps hit or a true cold-outreach attempt blocked. It's where the conversation about sending infrastructure actually happens, in context, at the moment the user genuinely needs it. This is what preserves the onboarding waouh while ensuring nobody ever accidentally burns their primary domain.

**Deliverables:**
- UI component `<ScalingPathPrompt>` that surfaces when a send is blocked by the WS-1 enforcement layer. The component does NOT feel like an error — it's framed as an informed recommendation. Copy example (English, to be adapted by Martin): *"I'm not sending this from your primary inbox. This is cold outreach to a contact we haven't spoken with — sending cold from your primary domain can damage your deliverability within weeks. Two ways to scale this properly:"*
- Two clearly presented options in the prompt:
  - **Option A — Elevay-managed setup.** CTA: "Let us handle it." Clicking sets `sendingMailboxMode = 'elevay-managed-requested'`, creates the `sending_infra_requests` record, confirms to the user: "Our team will reach out within 24 hours to set up your dedicated sending domain. Production-ready sends in 2-3 weeks after warmup." Explicitly communicates pricing (placeholder until Martin confirms).
  - **Option B — Connect your existing infrastructure.** CTA: "I already have Instantly / Smartlead / etc." Opens an OAuth or API-key connection flow for the supported providers. On successful connection, sets `sendingMailboxMode = 'external-connected'` and unblocks the previously blocked send.
- A tertiary link at the bottom: "Not ready yet — remind me later." Defers the decision without blocking the user's ability to continue using Elevay on warm follow-ups and TAM exploration.
- Server-side: when `elevay-managed-requested` state is set, a notification fires to Martin's team (Slack webhook, email, or whatever channel Martin prefers — confirm). The request row in `sending_infra_requests` drives a simple internal admin view to track active requests without building a full ticketing system.
- The ScalingPath prompt is also accessible proactively from Settings → Sending infrastructure → "Upgrade your sending setup" so users who want to plan ahead can trigger it without hitting a cap first.

**Exit condition:** a fresh test tenant attempts to send to a brand-new cold prospect → the ScalingPathPrompt appears with both options. Clicking Option A creates a `sending_infra_requests` record and fires the internal notification. Clicking Option B opens the Instantly OAuth flow (the only provider required at launch). Clicking "remind me later" dismisses the prompt and the user can continue using Elevay without blockers for warm activity.

**Note to Claude Code:** the emotional tone of this flow matters as much as the functional behavior. Every piece of copy should read as protective and premium, not restrictive or apologetic. If the copy sounds like a paywall or a friction point in review, rewrite it. Martin will own the final copy pass.

---

### WS-7 — Reversibility layer: undo for agent actions (~3-4 days)
**Why this matters:** a product where an autonomous agent acts on the user's behalf is only trustworthy if the user can undo what the agent did. Without first-class undo, every autonomous action carries residual anxiety that suppresses the user's willingness to relax approval mode (WS-1's progressive autonomy engine stalls). Reversibility is what makes autonomy safe to adopt. This is a first-class product capability, not a nice-to-have.

**Deliverables:**
- New table `agent_actions` with fields: `{id, tenantId, userId, actionType, payload, createdAt, scheduledExecutionAt, executedAt, reversedAt, reversedBy, reversibleUntil, status}`. Every autonomous action the agent takes (email send, contact create, company enrichment write, CRM field update, sequence enrollment, etc.) creates a row before any external side effect fires.
- **Grace period for email sends:** when the agent drafts and the user approves an email, the send is queued with a 60-second delay (`scheduledExecutionAt = now + 60s`) rather than immediate dispatch to SMTP. During this window, the send is reversible with zero external impact. Configurable per tenant (some users may want 30s, some 120s).
- **Indefinite reversibility for CRM writes:** contact creations, company enrichments, field updates are reversible as long as the user has not manually edited the record since the agent's write. If the user has edited, the undo becomes a "soft" undo that asks for confirmation before rolling back the user's own changes.
- UI component `<AgentActionToast>` that appears immediately after every agent action: "I sent a follow-up to Alice Chen → Undo (59s)". Countdown timer visible. Click → reverses the action and surfaces a confirmation: "Sent cancelled. You can redraft anytime." Toast is dismissable but the action remains reversible from the history panel until the grace period expires (for sends) or the record is touched (for writes).
- Settings panel `Settings → Agent action history` listing all actions taken in the last 30 days with status (executed / scheduled / reversed), payload summary, and per-row undo CTA where applicable. Supports filtering by action type and date.
- Integration with WS-1 progressive autonomy engine: undo events are negative signals that reduce `trustScore` (email sent then undone within grace period: -0.05). This keeps the engine honest — if the user is frequently undoing, the agent should not be nudged toward more autonomy.

**Exit condition:** a fresh test tenant approves an agent draft. Within 60 seconds, the user clicks undo. The email is NOT delivered to SMTP, the `agent_actions` row status becomes `reversed`, and the `trustScore` decrements. After 60 seconds elapse without undo, the same email sends successfully and the row becomes `executed`. For CRM writes: a test contact created by the agent can be undone from the history panel; if the user edited the contact's name, the undo prompts for confirmation.

**Note to Claude Code:** the 60-second queue adds latency to send. This is acceptable and is the right trade-off — deliverability is not meaningfully affected by a 60-second delay, but trust is meaningfully improved. Do not try to "optimize" by reducing the grace period to zero. If any existing send path bypasses the queue, audit and route it through.

---

### WS-8 — Agent memory panel: visible, editable, auditable (~3-4 days)
**Why this matters:** in 2026, the baseline user expectation for an AI agent is that they can see and control what the agent knows about them. This is both a trust-building product feature and a compliance requirement (GDPR, EU AI Act for EU users including Martin's Canopy cohort). Today Elevay has agent knowledge scattered across `TenantSettings`, inferred facts, email summaries, and `knowledge[]` entries with no unified surface. This workstream consolidates and exposes that surface.

**Deliverables:**
- Data model consolidation: define a unified `agent_memory` view (database view or derived table) that aggregates everything the agent "knows" about a tenant, with consistent fields: `{entryId, category, content, source, confidence, createdAt, updatedAt, editableByUser}`. Categories include: `inferred-from-website`, `inferred-from-inbox`, `explicit-setting`, `user-provided-knowledge`, `past-conversation-summary`, and `learned-preference` (T2 mitigation — holds trustScore, its change log, and next nudge threshold).
- UI component `<AgentMemoryPanel>` accessible from two entry points with **T4 progressive disclosure applied:**
  - `Settings → Agent memory` is available from day one (advanced users and users looking for it can always find it via Settings).
  - The persistent "Agent brain" button in the dashboard header is **hidden initially** and only appears after the user has approved their first agent action (the first `agent_actions` row with `status = executed` and `reversedAt IS NULL` tied to a user-initiated approval). When it appears, it animates in once with a subtle introduction: "Curious what I've learned about you? See everything in one place." After dismissal or first click, it stays permanently visible as a fixture.
- For each entry: view (always), edit (where applicable — e.g., inferred facts can be corrected, explicit settings can be changed, summaries are read-only, trustScore is read-only but auditable), delete (where applicable — trustScore log entries cannot be deleted but the cumulative score can be reset). Edits propagate immediately to agent behavior on next action.
- Audit trail per entry: hover or click → shows when the entry was created, by what source (user input vs LLM inference vs integration sync vs trustScore event), and a "why" note when available (e.g., "Inferred from the pricing page at elevay.dev/pricing: mentions enterprise tier" or "Trust score +0.02: you approved Alice Chen's follow-up without editing on 2026-05-03").
- For the `learned-preference` category specifically: the panel renders the current trustScore as a visible 0.0 - 1.0 value with a short explanation of what it controls ("Higher scores unlock suggestions to relax your approval mode"), the next nudge threshold ("Next offer at 0.50 — batch daily approval"), and a scrollable log of recent score changes with reasons. This makes tension T2 self-documenting.
- Bulk actions: "Export all agent memory" (JSON download — GDPR compliant), "Delete all agent memory" with confirmation requiring typing the company name (prevents accidents, models the nuclear option seriously).
- Integration with existing `knowledge[]` entries: these become one category within the unified panel. Entries added via chat ("remember that we only sell to US-based companies") land in `user-provided-knowledge` category and are visible/editable here.
- The panel renders empty states with care: a tenant on day 1 sees "I'm still learning about your business. As we work together, this panel will fill with what I remember." — not a blank screen.
- **Cross-reference for WS-1 nudge sequencing:** expose a boolean flag `agentMemoryPanelDiscovered` on tenant settings, set to `true` on first click of the header button OR first visit to `Settings → Agent memory`. WS-1 progressive autonomy nudges must not fire until this flag is `true`. This enforces the T2-T4 interaction order.

**Exit condition:** a fresh test tenant completes onboarding (WS-2 through WS-4) and then opens the Agent memory panel. The panel displays at least 10 entries distributed across the categories (inferred website facts, inferred ICP, explicit settings, inbox signature inference). Editing an inferred ICP entry and re-running a TAM build uses the corrected value. Deleting all entries returns the agent to a blank slate and triggers a re-onboarding nudge.

**Note to Claude Code:** this is not just a display surface — it is the canonical UI for the user's control over the agent. Treat it as a first-class product surface, not a settings subpage. The navigation visibility in the header matters; don't hide it.

---

## 4. Quality bar and testing

### 4.1 Per-workstream quality expectations
Every workstream produces:
- A written spec (1-2 pages) posted before code is written, reviewed by Martin.
- An implementation plan (tasks, file paths, risk points) posted after spec approval.
- Code review with Martin before merge to main.
- A demo or walkthrough on a fresh test tenant before the exit condition is signed off.

### 4.2 Explicit anti-patterns (do not do)
- Do NOT combine workstreams. Each one ships independently.
- Do NOT delete v1 code before v2 is validated.
- Do NOT change any field mutation to be silent; if inference is involved, it must be visible.
- Do NOT add `setTimeout`-driven "progress stages" anywhere; tie animations to real job state.
- Do NOT introduce new fields without first checking they are not inferable, not just-in-time collectable, and not cosmetic.
- Do NOT skip WS-0 "because we're in a hurry". Martin has explicitly prioritized quality over speed.

### 4.3 Testing requirements
- WS-0: manual verification of funnel correctness with 3+ synthetic sessions.
- WS-1: unit tests for budget enforcement + approval mode enforcement + cost preview accuracy + progressive autonomy nudge triggers. Integration test for the migration of existing tenants.
- WS-2: component-level tests for the confirmation card. Storybook entry covering empty, partial, full, error states. Manual walkthrough on 3 fresh test tenants (different industries, different domain maturities).
- WS-3: integration test with a seeded Gmail account. Snapshot test of warm lead ranking logic. Enforcement test that blocks a cold send and routes to WS-6.
- WS-4: end-to-end test spanning OAuth → confirmation → warm lead → TAM reveal. Resilience test for TAM build failure. Verification that streaming reasoning events emit in the correct order with real data (no fake narratives).
- WS-5: completion rate regression test on staging with a simulated cohort.
- WS-6: end-to-end test for each scaling path (Elevay-managed request, Instantly OAuth connect, remind-me-later dismissal). Manual review of all copy strings by Martin before ramp.
- WS-7: unit tests for grace period expiration, undo during and after the window, undo of CRM writes with and without user edits in between. Integration test confirming undone sends never reach SMTP.
- WS-8: integration test that a complete agent memory export contains all inferred facts, explicit settings, and knowledge entries. Manual walkthrough confirming editing an ICP entry changes downstream TAM behavior.

### 4.4 Failure modes handbook (transversal — applies to all workstreams)
Every workstream must handle these failure modes gracefully. "Graceful" means: no silent failures, no cryptic errors, no dead-end states. Users always know (a) what went wrong in human language, (b) whether it's their fault or ours, (c) what they can do next.

**Severity tiering for failure UX (T5 mitigation — avoids "fragile product" feel):** failure handling is NOT one-size-fits-all. Classify each failure by severity before picking the UX treatment. The goal is that a user running the happy path rarely sees failure UI, while a user in a broken state always has clear next steps.

- **Severity 1 — Transient / self-healing:** retry succeeds within 2 attempts, no user impact. UX: no surface at all. The retry is invisible. Log for observability.
- **Severity 2 — Short-lived / auto-resolving:** operation degrades briefly but recovers (e.g., Apollo rate limit resets in 30s). UX: a subtle inline indicator near the relevant surface ("pausing briefly... resuming"), auto-dismisses on recovery. No modal, no banner.
- **Severity 3 — Blocking for this operation:** the specific action failed and the user must choose what to do (retry, alternative path, abandon). UX: inline message on the relevant component with clear CTAs, not a global banner. Affects only the broken flow, not the rest of the product.
- **Severity 4 — System-wide:** core capability is unavailable (e.g., all LLM providers down, Apollo quota fully exhausted). UX: persistent but non-intrusive banner at the top of the dashboard with a status page link. Product keeps working where it can (e.g., CRM browse and edit still function even if agent drafting is offline).

The failure modes below specify which severity tier applies. Claude Code must not default to "show a red error banner" for everything — that's what makes a product feel fragile.

- **OAuth failure** (Google/Microsoft returns error or user denies consent) — **Severity 3**: redirect to a dedicated screen explaining what happened, preserving already-collected data (domain, name). Offer retry and "continue without email sync" fallback that leads to a degraded but functional v2 onboarding.
- **Website scraping failure** (domain unreachable, JS-heavy SPA, 403, timeout) — **Severity 2**: skip website-derived inferences, mark those Category A fields as "unknown — please fill in" inline, surface the rest of the confirmation card normally. Do not block the user, no banner.
- **LLM inference failure** (Anthropic down, rate limit, timeout) — **Severity 1 → 3**: retry with exponential backoff (3 attempts, invisible to user). If all fail, degrade to unfilled Category A fields with a discreet inline note "We couldn't auto-fill some fields — please complete them manually." Inline, not banner.
- **Apollo rate limit or quota exhausted during TAM build** — **Severity 2**: show partial results with an inline indicator near the TAM reveal ("We found N companies before hitting your Apollo quota for today. Build resumes at [time]."). Do not crash the build, do not lose partial state, no global banner.
- **Inngest job failure mid-TAM** — **Severity 3**: the streaming reasoning log shows the last successful stage and the error. "Resume from last stage" CTA inline on the TAM panel. Don't silently retry without telling the user, but don't escalate to a dashboard-wide banner.
- **Inbox scan produces zero warm leads** — **Severity 1 (expected case)**: skip WS-3's prompt silently, proceed directly to TAM reveal. No UI surface at all. This is a normal state for brand-new Gmail accounts, not a failure.
- **User's primary domain is too new or lacks SPF/DKIM/DMARC** — **Severity 3**: WS-3's send path detects this via a pre-flight check and blocks the send with an educational inline prompt rather than sending and risking immediate spam placement. Routes to WS-6.
- **Budget cap hit mid-operation** — **Severity 3**: mid-TAM build, the job pauses gracefully (completes the current Apollo page, does not start a new one), surfaces the WS-1 budget prompt inline on the relevant operation ("Approve $X overage or wait until next cycle"), and resumes or terminates based on user response.
- **All external integrations down simultaneously** (Apollo + Anthropic + OpenAI) — **Severity 4**: persistent dashboard-header banner "Core systems temporarily unavailable — we're on it" with a status page link. Product keeps working where it can (e.g., CRM browse and edit still function even if agent drafting is offline).
- **Tenant state corruption** (e.g., `sendingMailboxMode` unset somehow) — **Severity 1 (self-healing)**: default to `primary-with-caps` and log the anomaly. Never allow a send without a defined mode. No user surface — this is an internal safeguard.

Every failure mode must be tested with a forced-fault integration test. Claude Code cannot close a workstream without demonstrating graceful behavior under the failure modes relevant to that workstream.

---

## 5. Open decisions for Martin before execution starts

These are points where the brief deliberately does NOT lock a decision, because they depend on data or preference:

1. **Default budget cap by tier:** what's the right default? Proposed: $50 free, $200 pro, $500 team. Martin to confirm or override.
2. **Warm lead surfacing threshold:** if fewer than 3 warm leads are found, do we show 1-2 or skip the step? Proposed: show what we have if ≥1, skip if 0.
3. **Default primary-inbox daily cap:** proposed 20 sends/day with warm-only constraint. Martin to confirm this is conservative enough to keep founder domains safe while permissive enough to deliver value.
4. **Elevay-managed setup pricing:** what's the customer-facing price for the manual setup path? Needed before WS-6 copy is finalized. Proposed range to explore: $99 setup + $29/month per secondary domain, or a flat $149/month bundled. Martin to decide.
5. **Elevay-managed internal ops channel:** where should the notification fire when a user requests managed setup? Slack channel? Email alias? Linear/Notion? Martin to specify.
6. **External sender providers supported at WS-6 launch:** proposed Instantly only (Martin already runs Hypergrowth). Smartlead and SendGrid added in a follow-up. Martin to confirm.
7. **Feature flag technology:** does Elevay already have a flag system, or does WS-2 need to introduce one? If introducing, proposed: Unleash or a lightweight env-based toggle.
8. **Legacy tenants on v2:** do existing users get moved through a shortened "catch-up" version of the new confirmation card, or do we only apply v2 to new signups? Proposed: new signups only; legacy users get a Settings nudge to "review your agent guardrails" (WS-1).

---

## 6. Success definition (signed off by Martin before WS-0 closes)

The refactor is considered successful when, measured 4 weeks after WS-5 ramp to 100%:

- Onboarding completion rate ≥ v1 baseline (no regression).
- Time-to-first-agent-action p50 ≤ 90 seconds; p95 ≤ 180 seconds.
- ≥70% of new users have all three guardrails (approval mode, budget cap, sending identity) consciously acknowledged (default is acceptable if confirmed; silent default is not) within their first 7 days.
- Zero user-reported incidents of "the agent did something I didn't approve" in the first 4 weeks post-ramp.
- Zero incidents of a user's primary domain being flagged for spam complaints above Google Postmaster's 0.3% threshold directly attributable to Elevay-initiated sends.
- Downstream activation metrics (first sequence sent, first reply received, first deal created) equal-or-better than v1 baseline cohort.
- WS-6 conversion: of users who hit a cap or cold-send attempt, at least 40% engage with the ScalingPathPrompt (click Option A, Option B, or open the Settings upgrade flow within 48 hours).
- **WS-7 trust signal:** undo rate on agent-sent emails < 5% (healthy agent drafting quality); undo capability exercised by at least 30% of users in their first month (shows the feature is discoverable and trusted).
- **WS-8 engagement signal:** at least 50% of users open the Agent Memory panel at least once in their first month; at least 15% edit or delete at least one entry (indicates the panel is useful, not decorative).
- **Progressive autonomy uptake:** among users active for 4+ weeks, at least 25% have consciously relaxed their approval mode at least one notch (review-each → batch-daily or batch-daily → auto-high-confidence). This validates that the trust-building loop works.
- **Failure mode resilience:** zero user-facing "white screen" errors during onboarding or core product usage across the rollout period. Every failure path surfaces a human-readable explanation.

---

## 7. What this brief deliberately excludes

- Visual design details of the confirmation card, scaling path prompt, undo toast, agent memory panel (colors, spacing, Elevay brand gradient application) — this is for Martin + designer to own, not Claude Code.
- Copywriting of user-facing strings — to be drafted by Martin in each relevant workstream.
- The future of `salesMotion` and `primaryChallenge` IF they get re-introduced with real differentiation (e.g., motion-specific sequence templates). That's a separate product decision, not an onboarding decision.
- Mobile onboarding flow. Current Elevay is desktop-first; mobile is a separate workstream.
- Retroactive memory construction for legacy tenants (agent memory panel will show only newly-tracked entries for existing users). A retroactive backfill is a separate workstream.

---

## 8. Confidence assessment

This brief covers the ten criteria an expert AI-native product lead would apply to a 2026 onboarding, and it has been tension-tested against its own features:

1. **Time-to-first-agent-action < 90s** — covered by WS-3 (warm lead draft), measurable via WS-0 instrumentation using the formal definition in section 2.1.1.
2. **Explicit trust calibration** — covered by WS-1 (guardrails infra) + WS-2 (surfaced in confirmation card) + WS-6 (reinforced at scaling moment).
3. **Zero silent surprises** — covered by WS-2 (attribution badges, explicit tone surfacing) + WS-4 (real streaming reasoning, no setTimeout theater) + WS-8 learned-preference category (trustScore exposed, not silent).
4. **Reversibility (undo)** — covered by WS-7 (grace period for sends, indefinite undo for writes).
5. **Cost transparency** — covered by WS-1 cost preview API + WS-4 conditional cost display (first-time + near-cap only).
6. **Graceful failure handling** — covered by section 4.4 Failure modes handbook with severity tiering, enforced as testing requirement per workstream.
7. **Progressive autonomy** — covered by WS-1 trust score + autonomy nudge engine + WS-7 integration (undo as negative signal) + WS-8 dependency gate (nudges only after panel is discovered).
8. **Agent memory auditability** — covered by WS-8 (unified memory panel with progressive disclosure, edit + delete + export).
9. **Cold start handling** — covered by section 4.4 + specific edge cases in WS-3 and WS-4.
10. **Observability (streaming reasoning)** — covered by WS-4 streaming reasoning as first-class deliverable, reusable pattern for future heavy operations.

### 8.1 Tension analysis and mitigations applied
Five internal tensions were identified between features and criteria, each now resolved in-spec:

- **T1 (WS-7 grace period vs TTFAA criterion):** resolved by the formal TTFAA definition in section 2.1.1 — the timer stops at first visible render, not at SMTP delivery.
- **T2 (silent trustScore vs zero surprises):** resolved by exposing trustScore as a first-class entry in WS-8's `learned-preference` category with full audit trail.
- **T3 (cost preview everywhere vs user anxiety):** resolved by conditional display rules in WS-1 and WS-4 — preview appears only on first-time per op type, or near cap. Silent otherwise, aggregated in `Settings → Usage`.
- **T4 (Agent brain button on day 1 vs onboarding simplicity):** resolved by progressive disclosure in WS-8 — the header button appears only after first approved agent action. Settings path remains accessible from day one.
- **T5 (failure banners everywhere vs premium feel):** resolved by severity tiering in section 4.4 — 4 severity levels with matched UX treatments, most failures never reach the user visually.

A cross-workstream sequencing dependency (T2 × T4) is also documented: nudges from WS-1 cannot fire until WS-8's panel is discoverable. Enforced by the `agentMemoryPanelDiscovered` flag.

### 8.2 Limits of this analysis
This tension analysis is self-referential — the spec was checked against its own stated criteria. Categories of risk I could not model from inside the spec:

- **Engineering performance and ops cost:** the sending enforcement layer, streaming reasoning infrastructure, and cost preview API add real runtime overhead. A systems engineer review may surface latency regressions or infrastructure cost growth that this brief does not anticipate.
- **Code complexity creep:** nine workstreams add surface area. The actual maintenance burden on the Elevay codebase after landing all of this is hard to estimate from the spec alone — a post-WS-4 code review checkpoint is recommended before committing to WS-7 and WS-8.
- **Operational load of Elevay-managed sending setup:** WS-6's manual path depends on Martin's team capacity. If request volume exceeds manual throughput, the "premium feel" of the managed path degrades into a backlog.
- **User research gaps:** this spec was built from Martin's product audit, not from direct signup cohort interviews. Three to five qualitative interviews during WS-2 rollout would catch UX misalignments the spec cannot predict.

### 8.3 Empirical unknowns
Two variables only WS-0 can resolve:

- **Latencies** of `analyze-website`, `enrich-icp`, and inbox scan under real load. These determine whether the 90-second TTFAA target is reliably achievable. WS-0 measures this.
- **Drop-off points** in the current funnel. These determine which step of v1 contributes most friction and should inform where WS-2 puts the most care. WS-0 measures this.

I do not recommend starting WS-1 onward without WS-0 data in hand. The sequencing and prioritization decisions within each workstream depend on empirical signals the team does not currently have.

### 8.4 Effort estimate
Total estimated effort: ~22-28 days of focused engineering work across the nine workstreams (up from the pre-mitigation ~20-25 due to the new conditional logic in cost preview, progressive disclosure in memory panel, and severity tiering in failure handling). Assumes sequential execution with Martin review at each exit condition. Parallelization is possible in limited cases (WS-7 and WS-8 can run in parallel if two engineers are available) but not recommended until WS-0 through WS-4 have shipped and the team has calibration on the pattern.

---

## 9. Execution methodology for Claude Code (Kiro-style spec-plan-execute)

This brief is a product requirements document. It defines the **what** and the **why** in detail. It does NOT define the **how** at the code level — that work belongs to the implementation agent (Claude Code) using the codebase as source of truth.

For each workstream, Claude Code MUST follow the three-phase Kiro methodology in strict order. No coding begins before the Spec phase is approved by Martin. No Spec phase begins before the Plan phase of the previous workstream has fully closed.

### 9.1 Phase 1 — Spec (before writing any code)
Claude Code produces a written technical specification, posted in a file at `docs/specs/WS-{N}-spec.md`, that Martin reviews before any code is written. The spec MUST include the following sections:

- **Purpose and scope.** Restate the workstream's objective from this brief in Claude Code's own words. List what is in scope and what is explicitly out of scope. This proves comprehension.
- **File inventory.** Exhaustive list of files to be created, modified, or deleted, with their absolute paths in the Elevay codebase. For each file: what changes, why, and approximate size of the change (LOC estimate is fine).
- **Schema changes.** Exact Prisma schema diff for any DB changes. For every new column: type, default value, nullable or not, index if applicable, migration strategy for existing rows. Name the migration file.
- **Reference implementations in the existing codebase.** For every new pattern introduced, find a comparable pattern that already exists in Elevay and reference it by file path and line number. Example: "new `agentApprovalMode` enforcement follows the pattern of `shouldAutoCreateContact` in `app/apps/web/src/lib/tenant-settings.ts:280`." If no comparable pattern exists, flag this explicitly — it means Claude Code is introducing a new convention, which requires Martin's sign-off.
- **API surface.** For every new endpoint, function export, or React component: TypeScript signature, input/output types, error states, and which callers will use it.
- **Architecture decisions (ADR-light).** For every non-obvious choice, one paragraph: what was decided, what alternatives were considered, why this one won. Examples of non-obvious choices: SSE vs WebSocket for streaming reasoning, 60s grace period duration, where the `agentMemoryPanelDiscovered` flag lives. Do not skip these. Claude Code's decisions must be traceable, not invisible.
- **Testing strategy.** Test framework (match existing: Vitest, Playwright, etc.), list of specific test cases to write, mock surfaces, fixtures needed. Reference an existing test file as the pattern to follow.
- **Rollout and rollback.** Feature flag name if applicable, how the change deploys, what the rollback procedure is if something breaks in production, what data state looks like during partial rollout.
- **Open questions.** Things Claude Code cannot decide alone and needs Martin's input on. Listed explicitly, not buried.

**Spec phase exit condition:** Martin has read the spec, left review comments, and approved in writing (comment, issue, or direct reply). Claude Code does NOT proceed to Plan on its own judgment.

### 9.2 Phase 2 — Plan (after spec approval, before coding)
Claude Code produces an implementation plan at `docs/specs/WS-{N}-plan.md`. The plan breaks the spec into ordered, reviewable units of work. It MUST include:

- **Task list.** Numbered tasks, each with a clear deliverable, estimated effort (in hours), and dependencies on other tasks. Each task should be committable as a single PR or a small series of PRs — no monolithic "do the whole thing" tasks.
- **PR strategy.** How the work will be divided into pull requests. Each PR should be reviewable in under 30 minutes by a reasonable reviewer. If a PR would exceed ~400 LOC changed, it must be split.
- **Risk register.** For each task, what could go wrong, what the early warning signals are, what the contingency is.
- **Validation milestones.** Checkpoints within the workstream where Claude Code pauses for Martin review before continuing — typically after the schema migration, after the core logic lands, after the UI integration, and before any deletion of legacy code.

**Bug-fix carve-out (amendment, 2026-04-22):** Bug fixes discovered during validation of already-merged PRs may be committed directly to main when (a) they are ≤ 150 LOC, (b) the commit message documents the bug, the root cause, the fix, and links to the PR that introduced the bug if applicable, and (c) no schema changes are involved. All feature work, all schema changes, and anything over 150 LOC requires a PR.

**Plan phase exit condition:** Martin has reviewed the plan and approved the PR strategy. Any tasks Martin wants merged or split are resolved before code starts.

### 9.3 Phase 3 — Execute (after plan approval)
Claude Code implements the plan. During execution:

- Each PR's description references the spec and plan document paths, the specific tasks from the plan it addresses, and a summary of decisions made that differ from the plan (and why).
- Every PR runs the full test suite and must pass before requesting review.
- If Claude Code discovers a condition during execution that invalidates a spec assumption, it STOPS, updates the spec, and requests Martin's re-approval. It does NOT silently deviate.
- At the exit condition of the workstream, Claude Code produces a short retrospective at `docs/specs/WS-{N}-retro.md`: what went as planned, what didn't, what the next workstream can learn, what technical debt (if any) was introduced. This is required for closure.

### 9.4 Meta-rules across all three phases
- **No pattern invention without precedent.** If Elevay's codebase already has a pattern for something (error handling, state management, testing, API structure), the new code follows it. Pattern changes are architectural decisions that require their own spec.
- **Stop and ask over assume.** Any time Claude Code is about to guess at intent, requirements, or acceptable tradeoffs, it stops and asks Martin in the spec or in a PR comment.
- **No silent scope creep.** If a workstream starts exceeding its estimate, Claude Code surfaces the discrepancy in the retro and explains it — it does not just burn more time in silence.
- **Leave the codebase better, not different.** Refactoring adjacent code to support the new feature is expected. Refactoring unrelated code is out of scope and must be filed as a separate task.

### 9.5 First action for Claude Code reading this brief
Your first action after receiving this brief is to produce the Spec document for WS-0 (instrumentation). Do not touch any code until that spec is written and approved. Your second action is to produce the Plan for WS-0. Your third action is to execute WS-0 per the plan. Only after WS-0 closes do you begin the Spec for WS-1. And so on, through WS-8, with WS-5 executing last as noted in section 3.

End of brief.
