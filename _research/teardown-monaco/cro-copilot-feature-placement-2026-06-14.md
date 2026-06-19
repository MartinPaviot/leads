# CRO Copilot — Feature Placement Blueprint (the right feature, at the right moment, simply)

**Date:** 2026-06-14 · Follows the DEEP audit. Answers Martin's directive: *each feature must land at the correct moment of the motion — a cold call ≠ a discovery ≠ a demo ≠ a proposal ≠ a multi-channel outbound campaign — simply, at the best possible quality.*

**Verified this session (file:line):** the moments are already distinguished in three disconnected places, but executed identically. That is the whole problem, and it makes the fix small.

---

## The finding that shapes everything

Elevay already *knows* the moments are different — in three places that don't talk to each other:

1. **The Method** (`lib/docs/steps/*.ts`) — 5 phases / 19 steps, with the moments as **separate, fully-written doctrine**: Step 10 Cold calling · **Step 13 Discovery** · **Step 14 Demo** · **Step 15 Proposal** · **Step 16 Closing** (`close.ts`), Steps 8–12 outbound cadence/cold-email/LinkedIn/brand. Each step even ships its **own objection table** (`close.ts:101-112, 171-182, 236-247, 333-344`). Today this is **read-only docs, prod-hidden** (memory: docs-methodology).
2. **`sales-call-prep`** carries `callType: ["discovery","demo","follow_up","negotiation","close"]` (`schema.ts:6`) — but the prompt is `"You are preparing a rep for a ${input.callType} call"` followed by **one identical generic 10-point template** (`handler.ts:59-80`). The distinction is captured in the schema and discarded in the prompt. **Smoking gun.**
3. **`meetingType: ["intro","qualification","deep_dive","follow_up"]`** exists but is used **only for capacity tracking** (`api/meetings/book/route.ts:26-29`), wired to nothing else. And the **deal pipeline stage** (`lead → qualification → demo → trial → proposal → negotiation → won → lost`, `db/schema/enums.ts:69-78`) encodes the same motion a fourth time.

**Consequence:** `sales-call-prep`, `meeting-brief`, `sales-coaching`, `handle-objection`, and post-call extraction are all **generic** — a rep prepping a discovery gets the same brief as one prepping a cold call. Only the **cold call** (`call-scripts.ts` FOUNDER PLAYBOOK) and the **proposal** (`draft-proposal` / `proposal-fill` / `scope-poc`) are genuinely specialized today.

---

## The design: two foundations make all seven moments simple

Rather than build N new features, we add **two small pieces of plumbing** and let every existing feature specialize off them. This is the "simple + best quality" path (memory: customizable-but-simple, reuse primitives).

### Foundation 1 — ONE derived "moment", never configured
The copilot infers the moment; the user never tags a call. Derive it the same way we already derive account lifecycle at read (memory: account-stage-derived) — a small `lib/motion/moment.ts` SSOT that unifies the four scattered signals into one:

| Derived moment | Derived from (no user input) | Home surface |
|---|---|---|
| **Outbound campaign** (multi-channel) | no deal yet / `lead` + not-yet-contacted | Sequences / Campaign / Call Sprint |
| **Cold call** | `lead` + live first dial | **Call Mode** cockpit |
| **Discovery** | `qualification` stage / first booked meeting | meeting + deal page |
| **Demo** | `demo` stage / demo meeting | meeting + deal page |
| **Proposal** | `proposal` stage | deal page |
| **Close / negotiation** | `negotiation` stage | deal page |
| **Expansion / retention** | account lifecycle = `customer` | account page |

One mechanism → seven behaviors. The user opens the deal/meeting/call and the copilot is already in the right mode.

### Foundation 2 — the Method becomes the RUNTIME doctrine (not just docs)
`lib/docs/steps/` already holds tested, founder-grade doctrine per moment. Promote it from "docs page" to **the rubric source every feature reads**, keyed by moment → Step. Discovery prep/coaching/objections ← Step 13; Demo ← Step 14; Proposal ← Step 15; Close ← Step 16; Cold call ← Step 10; Outbound ← Steps 8–9, 11–12. (Plus the existing per-tenant `knowledge_stages` SSOT — `lib/knowledge/stages.ts` — for *this customer's* facts.) **Quality guarantee:** the live features speak the exact methodology we wrote and version-control, and stay in sync with the docs automatically. The objection tables in `close.ts` become the live objection banks — for free.

> Net rule: **derive the moment → load that moment's doctrine (Method step) + that tenant's knowledge stage → specialize the existing skill's prompt.** No new skill sprawl; branch + inject.

---

## The placement map (per moment, deep)

For each moment: **PREP** (before) · **LIVE** (during, if a call) · **POST/COACH** (after, moment-specific rubric) · **DEAL-INTEL** (what gets written/surfaced) · **doctrine source** · **reuse vs build**.

### 1. Outbound campaign — multi-channel
- **Home:** Sequences / Campaign engine / Call Sprint.
- **Feature:** design + run the cadence; choose the **channel mix** (email + LinkedIn + call) by signal and warm-path; autopilot enrollment with approval. Open the founder's **concentric circles** (network → investors' portfolios → employees → customers) — this is the dormant **connection-graph** (memory: PR #213) = Sam Blond's doctrine made product.
- **Doctrine:** Steps 8 (cadence), 9 (cold email), 11 (LinkedIn), 12 (brand/gifts).
- **Today:** sequences + campaign-engine exist but **email-centric**; channel chosen per step, no cascade; signal→channel not wired. **Build:** channel-as-first-class (email/LinkedIn/call cascade), activate connection-graph for warm-path sender selection.
- **Specialization rule:** a *cold* sequence ≠ a *warm-intro* sequence ≠ a *re-engage* sequence — branch copy + cadence by entry reason (signal/warm-path/stall).

### 2. Cold call — live, permission-first
- **Home:** Call Mode cockpit (already strong).
- **PREP:** prospect brief (career + company from real homepage — memory: callmode-prospect-brief). **LIVE:** FOUNDER PLAYBOOK script (permission opener → one real reason in 20s → qualifier → booking ask), live objection bank from `knowledge_stages.cold_call`. **POST:** outcome + booked-next-step; coaching rubric = *"reason landed in 20s? got to the ask? booked?"* — **not** talk-ratio (irrelevant on a 2-min cold call).
- **Doctrine:** Step 10. **Today:** the one genuinely specialized moment — keep. **Build:** make post-cold-call coaching use the cold rubric (not the generic deal rubric).

### 3. Discovery call — diagnose, don't pitch
- **Home:** the booked meeting + deal page (stage `qualification`).
- **PREP (specialize `sales-call-prep` callType=discovery):** inject Step 13 → the **5-layer current-state map** (environment/problem/**impact-in-numbers**/root-cause/emotion), **11–14 targeted questions** (not "5–7 generic"), route-by-what-the-buyer-knows, the **24-hour prep email**, and the **qualification decision** frame (advance/nurture/disqualify). **LIVE (optional):** the question checklist + "quantify the gap" nudge. **POST/COACH:** the discovery rubric — *did you quantify the gap in their numbers? identify the economic buyer + critical event? book the next meeting in-calendar with the missing stakeholder?* Telemetry that matters here: **talk-ratio 43/57, question-rate, impact-quantified, next-step-set**. **DEAL-INTEL:** auto-extract MEDDPICC + the quantified gap + critical event + stakeholders into the deal (extend `deal-autofill`).
- **Objections:** load `close.ts:104-111` (discovery table: "we're fine today", "just send a price", "no budget", "need my cofounder").
- **Today:** generic only. **Build:** branch the prompt + inject Step 13 (small).

### 4. Demo call — prove the gap closes
- **Home:** the demo meeting + deal page (stage `demo`).
- **PREP (specialize `sales-call-prep` callType=demo):** inject Step 14 → **tie to the pains discovered** (pull the discovery's extracted pains), **3 capabilities max, each mapped to a named pain in 4 beats**, "open on their agenda", **hold the last 10 minutes for the next step**, **presumptive-close options** (pilot / technical session / commercial). **POST/COACH:** the demo rubric — *anchored to discovered pain (not a feature tour)? interactivity/back-and-forth? specific next step agreed before they left?* Telemetry: **interactivity score, demo-time-on-next-steps**. **ARTIFACT:** 2-hour recap draft (on the build path per `close.ts:186`).
- **Objections:** load `close.ts:174-181` (demo table: "a lot for us", "missing feature", "free trial?", "want to think about it").
- **Today:** generic / no demo-specific surface. **Build:** branch + inject Step 14; pass discovery pains in.

### 5. Proposal — present live, anchor, attach the plan
- **Home:** deal page (stage `proposal`).
- **PREP/ARTIFACT (already specialized — keep & deepen):** `draft-proposal` / `proposal-fill` / `proposal-template-detect` fill the one-pager from captured facts: **problem in their words + their cost**, future state, scope v1, **anchored price (good-better-best, precise numbers, ROI + payback)**, **Mutual Action Plan**, proof. Pricing discipline from Step 15 (**never discount → trade; never free → paid pilot; annual locks churn**).
- **POST/COACH:** *presented live or emailed cold? MAP attached with a decision date + named deciders? price anchored to the quantified cost?*
- **Objections:** load `close.ts:239-246` (proposal table: "too expensive", "[competitor] cheaper", "do something on price", "next quarter", "legal/procurement").
- **Build:** track the **MAP dates as deal steps** so a slipped date becomes visible (`close.ts:251`, build path).

### 6. Close / negotiation — kill indecision on a clock
- **Home:** deal page (stage `negotiation`).
- **PREP/COACH (specialize `sales-coaching` + `handle-objection` for close):** inject Step 16 → the **no-decision playbook** (judge hesitation, one recommendation not a menu, limit info, take risk off the table), **arm-the-champion kit** (per-stakeholder one-pager, ROI sheet with their numbers, objection-FAQ by role, rehearsal), **multi-thread** (4+ contacts ≈ 2× win; champion-departure successor in 48h), **negotiate** (label / calibrated questions / accusation audit), and the **verbal-yes → signature day-by-day cadence** (Day 0/2-3/5-7/10-14/21). **DEAL-INTEL:** the **decay clock per stage** (a quiet week in negotiation = emergency) + stall surfacing.
- **Objections:** load `close.ts:336-343` (closing table: "went with competitor", "CFO hasn't approved", "start smaller/free", "I'll sign this week", "need feature X").
- **Today:** generic; `handle-objection` doesn't branch by moment. **Build:** moment-keyed objection bank + the post-yes cadence as scheduled nudges.

### 7. Expansion / retention — the second engine
- **Home:** account page (lifecycle `customer`).
- **Feature:** churn-risk (usage decline, **sponsor departure**, single-thread, engagement drop), expansion plays (seat saturation, new use cases), QBR brief, renewal forecast. **Today:** `churn-risk-detector` + `expansion-signal-spotter` exist but shallow; `re-engage-stalled` doesn't distinguish "stalled in negotiation" from "stalled post-close." **Build:** an expansion-discovery prep + renewal forecast. **Priority:** lower for our founder-led ICP (note, not deprioritize forever).

---

## Cross-cutting layer A — conversation intelligence, but moment-keyed
The Gong-class telemetry from the DEEP audit (talk-ratio, longest-monologue, patience, interactivity, question-rate, sentiment, the 29 trackers) is computed once on every transcript we already ingest — **but the rubric that judges it is the moment's**, not global:
- **Cold:** reason-in-20s, booked. (talk-ratio irrelevant)
- **Discovery:** talk-ratio 43/57, ≥11–14 questions, **impact quantified**, next-step set, MEDDPICC uncovered.
- **Demo:** interactivity high, anchored to named pains, time-on-next-steps, presumptive close.
- **Close:** champion armed, multi-threaded, blocker named, decay clock.
One telemetry engine → the moment selects which metrics + thresholds matter. (This is also how the orphaned `sales-coaching` skill gets surfaced — moment-keyed, post-call, per DEEP audit Phase 0.)

## Cross-cutting layer B — the orthogonal CRO/portfolio plane
The per-deal motion above is *plane 1*. The forecasting/pipeline machinery from the DEEP audit (forecast categories, projection vs human-call, coverage, **what-changed-since-last-week**, sandbag detection, prioritized actions) is *plane 2* — **across all deals**, not per-moment. It lives on `/home` (Needs-you + revenue-at-risk) and `/insights` (+ a forecast surface), and each prioritized action **routes to its moment's home surface**. Keep the two planes distinct so neither bloats the other; this request is about plane 1 placement, plane 2 is the DEEP-audit "Clari spine" track.

---

## The elegant fix (small, high-leverage, in order)

1. **`lib/motion/moment.ts`** — derive the moment from deal stage + meeting/call context (SSOT, read-time, mirrors `lifecycle-stage.ts`). *Unifies the 4 scattered type fields.* **Lake, ~1 file.**
2. **Doctrine-as-runtime** — expose `lib/docs/steps/` content to skills as a `getStepDoctrine(moment)` accessor (the docs already exist; just read them at runtime). **Lake.**
3. **Specialize the generic skills by branching + injecting doctrine** (no new skills):
   - `sales-call-prep`: branch the prompt on `callType`, inject Step 13/14/16 doctrine + discovery pains into demo. (The schema already has `callType`.)
   - `sales-coaching`: take the moment, apply the moment's rubric + surface it post-call (also closes the DEEP-audit "orphaned coaching" gap).
   - `handle-objection` + live bank: load the moment's objection table from `close.ts`.
   - post-call extraction: tag the call's moment so performance segments by call type.
4. **Then** the moment-specific builds with real surface gaps: demo recap draft, MAP-dates-as-deal-steps, multi-channel cascade + connection-graph activation, conversation telemetry (moment-keyed).

**Why this is best-quality:** every moment speaks our own tested doctrine verbatim, stays in sync with the docs, reuses the skills/surfaces that exist, and the user configures nothing — the copilot derives the moment and shows exactly the right thing. Cold-call prep and discovery prep stop being the same brief because they now read Step 10 vs Step 13.

---

## One-line summary
The moments are already written (the Method) and already typed (callType/stage) — they're just executed identically. Add one derived "moment" SSOT + make the Method the runtime doctrine, then branch each existing skill by moment. That places every feature at the right point, reusing what exists, with the founder doctrine as the quality floor.
