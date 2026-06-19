# Moment-Aware CRO Copilot — Spec Proposals (how it works · cost · expected effect · risk if imperfect)

**Date:** 2026-06-14 · Follows the placement blueprint. Five specs that make cold ≠ discovery ≠ demo ≠ proposal ≠ close, on data we already have.
**Runtime model:** the skills run `claude-sonnet-4-6` ($3 in / $15 out per MTok). Cache reads ~0.1× input ($0.30/MTok), writes 1.25× ($3.75/MTok). Opus 4.8 ($5/$25) is an option for the coaching diagnosis only.
**Context for cost:** plan price is $999/mo/tenant; the entire feature's LLM cost lands around **$5–10 per active founder-tenant per month** — under 1% of revenue. The real cost is build effort and the risk of bad output, not tokens. Numbers below show the math.

On approval these become `_specs/MOMENT-AWARE-COPILOT/` (Kiro requirements/design/tasks).

---

## Cost summary (all five)

| Spec | Build effort | Runtime LLM / tenant·mo | Per-call latency | Net new tokens? |
|---|---|---|---|---|
| A — `moment.ts` (derive the moment) | ~0.5 day, 1 file +tests | **$0** (pure function) | <1ms | none |
| B — doctrine-as-runtime | ~0.5 day, 1 file +tests | **$0** (pure function) | <1ms | adds ~0.7k cached input/call to C+D+E |
| C — specialize `sales-call-prep` | ~1.5 day, edit handler + ~15 evals | **~$2.6/mo** (≈52 preps × $0.05) | 3–8s (async) | +doctrine (cacheable) |
| D — coaching surface + branch + push | ~2 days, skill+chat tool+button+cron | **~$2.5/mo** (≈50 coachings × $0.05) | 3–8s (async) | +doctrine (cacheable) |
| E — moment objection bank | ~1.5 day, lib + wire + live cards | **~$0.6/mo** (canned=free; ~30 novel × $0.02) | canned <1ms · novel 2–3s | minimal |
| **Total** | **~6 days** (flagship A+B+C ≈ 2.5d) | **~$5.7/mo** (Sonnet) | — | negligible |

Per-call math (Sonnet, no cache): prep/coaching ≈ 6k in × $3/1M + 2k out × $15/1M = **$0.048**. Novel objection ≈ 3k in + 0.5k out = **$0.017**. Caching the static doctrine block trims ~10–15%. Swapping the coaching diagnosis to Opus 4.8 ≈ 1.7× → still ~$4/mo for D.

---

## AI-native invariants (govern all five specs — non-negotiable)

The feature must be **fully AI-native and add zero complexity for the user.** Every spec below obeys these; they are part of each acceptance bar.

1. **No new controls.** No moment picker, no override dropdown, no "Coach me" button, no toggle, no settings, no new page. The intelligence rides only on surfaces the user already uses: the **chat copilot**, **Call Mode**, the **home / Needs-you feed**, and the **deal page (read-only)**.
2. **No new vocabulary.** The user never sees or learns "moment" or the 7 types. They see the right prep / coaching / objection — never a label they must choose. The taxonomy is the copilot's internal situational awareness, not the user's.
3. **Inference over asking.** The moment is computed from real signals (stage, meeting, activity, calendar/transcript the AI already reads). The copilot never asks "what kind of call is this?"
4. **Correction by conversation, never configuration.** If the copilot's read is wrong, the user just says so in chat ("this is the renewal, not a new deal"); the copilot adjusts and remembers. No widget.
5. **Proactive over on-demand.** The right thing surfaces when it's time — the prep before the meeting, the coaching after the call — pulled into the existing feed. The user **acts**; they never fetch or configure. (Machine reveals, human acts.)
6. **Adaptive verbosity.** Lead with the outcome and the two or three things that matter for this moment; depth only on request. Never a form or a wall of fields. The structured schema is for the renderer/AI, not the user's eyes.

---

## Spec A — `lib/motion/moment.ts` (the copilot's situational awareness, computed not configured)

### How it works
A pure SSOT, read-time, mirroring `lib/accounts/lifecycle-stage.ts` (memory: account-stage-derived). Signature:
```
type Moment = "outbound" | "cold_call" | "discovery" | "demo" | "proposal" | "close" | "expansion";
deriveMoment(input: { dealStage?, lastMeetingType?, hasDemoActivity?, lifecycleStage?, liveCallMode?: boolean }): { moment: Moment; confidence: "high"|"low"; source: string }
```
Derivation, in priority order (first match wins), each branch citing its signal:
- `liveCallMode && no deal` → `cold_call`
- `lifecycleStage === "customer"` → `expansion`
- `dealStage === "negotiation"` → `close`; `=== "proposal"` → `proposal`; `=== "demo"` or a demo meeting exists → `demo`; `=== "qualification"` → `discovery`; `=== "lead"` → `outbound`
- **Ambiguity rule:** if signals conflict (e.g. stage=qualification but a demo already happened), return the **later** moment + `confidence:"low"`. On no signal, return `discovery` (the safest "we have a meeting" default) + `low`.
Consumed by C/D/E. **Not a control.** It surfaces only as a legible, non-interactive heading on whatever the copilot already shows ("Discovery prep" atop the brief) so the inference is *visible and trustworthy* — but there is no picker. If the read is wrong, the user **says so in chat** ("this is a demo"); the chat skill accepts a natural-language `momentHint`, re-runs, and persists the correction (`properties.momentOverride`, read back at top priority). The override is written from the conversation, never from a widget.

### Cost
Build ~0.5 day (≈80 LOC + 6–8 unit tests). Runtime **$0** — no LLM, no tokens, <1ms. No migration (reads existing columns + one optional jsonb override).

### Expected effect
Every downstream feature gets the right mode automatically; the user never tags a call. One mechanism → seven behaviors. Unifies the four scattered type fields (meetingType/callType/dealStage/lifecycle) into one truth.

### Risk if not perfectly executed
**This is the highest-blast-radius spec** — everything keys off it, so a wrong moment cascades into wrong prep, wrong coaching, wrong objections.
- *Wrong-specific is worse than generic:* mis-deriving a demo deal as "discovery" gives the founder discovery questions before a demo. Mitigated by the **ambiguity → later-moment + low-confidence** rule, the **legible heading** (the inference is visible, so a wrong read is noticeable), and falling back to generic prep (not a confidently-wrong one) when `confidence:"low"`.
- *Silent mis-route:* if it's wrong and invisible, the founder trusts bad prep. Mitigated by **always showing the inferred moment as a heading** and accepting a natural-language correction in chat (no control to find).
- **Acceptance bar ("perfect"):** unit tests cover all 7 moments + the 3 conflict cases; the moment shows as a non-interactive heading (no picker anywhere); a chat correction ("this is a demo") re-runs and persists; no caller reads `dealStage`/`meetingType` directly for mode anymore (grep gate).

---

## Spec B — doctrine-as-runtime (`getStepDoctrine(moment)`)

### How it works
Promote `lib/docs/steps/` (today read-only, prod-hidden docs) to a runtime rubric source. New `lib/motion/doctrine.ts`:
```
getStepDoctrine(moment): { slug: string; rubric: string }  // rubric = condensed, LLM-shaped text
```
Maps moment → **slug** (not step number — slugs are stable; numbers drift, per memory docs-methodology): discovery→`the-discovery-call`, demo→`the-demo`, proposal→`the-proposal`, close→`closing`, cold_call→`cold-calling`, outbound→`design-the-cadence`. Then **condenses** the `DocStep.blocks`: keep `h2` headings + `ul`/`ol`/`table` rows (the actionable rules), **drop** long `p` prose and `example` blocks. Output ~600–900 tokens — the rules, not the essay. Cached per-moment (static) so prompts that inject it pay cache-read, not full input.

### Cost
Build ~0.5 day (≈60 LOC reusing `collectBlockStrings`, + 5 tests incl. "every moment resolves to an existing slug"). Runtime **$0** itself; it adds ~0.7k **cacheable** input tokens to each C/D/E call (≈$0.0002 cached).

### Expected effect
Features speak our own tested methodology **verbatim** and stay in sync with the docs automatically — the quality floor is the founder doctrine, not an ad-hoc prompt. The objection tables in `close.ts` become live objection banks (Spec E) for free.

### Risk if not perfectly executed
- *Dumping raw prose:* injecting the full 2k-token human-readable step bloats tokens, raises latency, and makes the LLM **parrot the doctrine instead of applying it** to this prospect. Mitigated by the **condense-to-rules** step (headings/lists/tables only) and an explicit prompt frame: "apply these rules to THIS prospect; do not restate them."
- *Slug drift:* a renumbered/renamed step silently breaks the map. Mitigated by mapping on **slug** + a test asserting each moment's slug exists in `docSteps`.
- **Acceptance bar:** rubric per moment is ≤900 tokens, contains the step's tables/lists, excludes example blocks; slug-existence test green; prompt-cache hit confirmed (`cache_read_input_tokens > 0`) on the second call of a moment.

---

## Spec C — specialize `sales-call-prep` by moment (the flagship)

### How it works
Today `handler.ts:59` is one generic prompt for all `callType`s. Change: branch on the derived moment, inject `getStepDoctrine(moment).rubric`, and make the output schema moment-shaped where it matters.
- **Discovery:** inject Step 13 rubric → require the **5-layer current-state map** (environment/problem/**impact-in-numbers**/root-cause/emotion), **11–14 questions that quantify the gap** (replace the generic "5–7 questions"), the route-by-buyer-knowledge table, and the advance/nurture/disqualify frame. Add the 24-hour prep-email draft to the output.
- **Demo:** inject Step 14 → **read the deal's extracted discovery facts** (pains/metrics from `deal.properties` autofill) and build **3 capabilities each mapped to a named pain**, "open on their agenda," reserve last-10-min, **presumptive-close options**. If no discovery facts on file → return a single instruction "No discovery captured — run discovery first" (the doctrine's own *no discovery, no demo* rule) instead of generic value props.
- **Close/negotiation:** inject Step 16 → champion-arming kit, the no-decision options, the verbal-yes→signature checklist.
- **Cold:** stays on the existing Call-Mode FOUNDER PLAYBOOK (already specialized) — `sales-call-prep` defers to it.
Keep the existing "based on ACTUAL data, no generic advice" guard and **add a hard no-fabrication rule**: never invent prospect facts; if a field is unknown, say "unknown."

**AI-native delivery (no new surface, no request needed):** the prep rides the surfaces that exist — it appears **proactively** as the meeting's brief / a Needs-you item before a calendar meeting, answers naturally in **chat** when the user asks anything about the prospect ("what should I know before Acme?"), and feeds **Call Mode** for cold. The user never chooses "discovery prep vs demo prep" — the right one arrives because the copilot knows the moment. Presentation follows invariant 6: the headline + the few things that matter now, the full structure expandable on ask — not a 10-field wall.

### Cost
Build ~1.5 day: edit the handler (branch + inject + demo-reads-discovery), minor schema additions, and **~15 eval cases** (5 each for discovery/demo/close comparing output specificity vs the doctrine). Runtime ~$0.05/prep × ~52 preps/tenant·mo = **~$2.6/mo**. Latency 3–8s, async (before a call) so invisible to the prospect.

### Expected effect
"Préparer un cold call" and "préparer un discovery" stop being the same brief. A discovery prep returns quantifying questions + the gap map; a demo prep returns three capabilities tied to the pains discovery actually captured; a close prep returns the champion kit and the signature cadence. This is the core of what Martin asked for.

### Risk if not perfectly executed
- *Shallow branch (relabel only):* output stays generic — we ship the **illusion** of specialization (today's bug, just hidden). Mitigated by the eval gate: each moment's output must contain its doctrine's load-bearing elements (discovery → ≥11 questions + a numeric impact prompt; demo → 3 pain-mapped capabilities; close → champion one-pager) or the eval fails.
- *Demo prep with no discovery → fabrication:* the worst case is inventing pains the founder then repeats in a live demo. Mitigated by the **read-discovery-or-refuse** rule (honest "run discovery first" beats a confident fiction).
- *Hallucinated prospect facts:* a tactical brief acted on live is dangerous. Mitigated by the no-fabrication rule + "unknown" sentinel, tested with a deliberately sparse-context eval (assert it says "unknown," not a guess).
- *Wrong moment from Spec A:* wrong prep. Contained by Spec A's low-confidence→generic fallback + visible override.
- **Acceptance bar:** the 15 evals pass; a sparse-context prospect yields "unknown"s not invented facts; demo-without-discovery returns the refuse-and-redirect; cold path untouched.

---

## Spec D — coaching surface + moment rubric + measured push

### How it works
Three wirings of the already-excellent (orphaned) `sales-coaching` skill:
1. **Branch the rubric by moment** — inject `getStepDoctrine(moment)` so the coaching judges the right things: discovery → *did you quantify the gap, get the EB + critical event, book the next step in-calendar?*; demo → *anchored to discovered pain? interactivity? specific next step before they left?*; close → *champion armed? multi-threaded? decay clock?* Keep the structured `diagnosisHeading` + `evidenceQuotes` output.
2. **Surface it where the user already is — no button.** Wire the skill into the **chat copilot** via a `getSalesCoaching` tool, so asking "how did the Acme call go?" / "what should I fix on this deal?" returns the diagnosis inline (each evidence quote a clickable source). On the deal page the diagnosis appears **read-only when it already exists** (from the push below) — it is shown, never fetched by a click. The churn-risk `riskReasons` surface inline on the existing risk indicator (no new control).
3. **Measured push (the primary path — proactive, not on-demand).** On `meeting/processed` (and on a `deal_risk` transition), run the skill, store to `coachingInsights`, and surface one "coaching ready" item in the existing Needs-you feed — **gated**: push only when `diagnosisHeading` is non-empty (a real miss) and respecting a cap (≤2 proactive coachings/day, per the proactive-insight doctrine in memory). The coaching comes to the user; they act on it.

### Cost
Build ~1.5–2 days (skill branch + chat tool + read-only deal-page render + one Inngest push trigger + tests — no button/page to build). Runtime ~$0.05 × ~50 coachings/tenant·mo = **~$2.5/mo** on Sonnet; ~$4/mo if the diagnosis runs on Opus 4.8 (worth testing — the diagnosis is the one place model quality shows). Latency async.

### Expected effect
The "You Lost Control"-grade, evidence-quoted diagnosis Monaco demos becomes a first-class Elevay artifact — on demand on the deal, and pushed (sparingly) after the calls where it matters — and it grades each call by the right rubric.

### Risk if not perfectly executed
- *Confidently wrong coaching destroys trust faster than silence.* "You never asked about budget" when the founder did → they distrust the whole product. Mitigated by the existing **never-invent-quotes** rule (every critique must cite a real transcript moment) and a **fallback**: with no transcript, downgrade to activity-trend advice and **state the limited basis** ("no recording on file — coaching from email/activity only").
- *Push fatigue:* coaching after every call → noise → ignored. Mitigated by the **non-empty-diagnosis gate + daily cap**; healthy deals already return an empty heading (no push).
- *Tone on a fine deal:* blunt critique of a deal that's actually on track reads as wrong. Mitigated by the health check (empty heading when `dealHealthScore` high).
- **Acceptance bar:** coaching reachable by asking in chat and appears proactively in Needs-you (no button anywhere); a transcript-less deal produces basis-stated gentle advice (no fabricated quotes); push fires only on non-empty diagnosis and never exceeds the daily cap (test the cap); voice is identical whether surfaced from chat or the push (shared prompt).

---

## Spec E — moment-keyed objection bank

### How it works
The objection tables already exist in `close.ts` (discovery `:104-111`, demo `:171-181`, proposal `:236-247`, closing `:333-344`). New `lib/motion/objection-bank.ts` parses them into `{ moment, objection, response }[]`. Two-tier serving:
- **Canned (free, instant):** in Call Mode / the composer pre-send, show the current moment's objection cards from the table — zero LLM, <1ms. (Cold call keeps its existing live bank from `knowledge_stages.cold_call`.)
- **Novel (LLM):** when the live objection doesn't match a canned one, call `handle-objection` with the moment's table injected as few-shot, producing one tight rebuilt rebuttal.

### Cost
Build ~1.5 day (parser + wire into `handle-objection` lookup-first + live cards by moment + tests). Runtime: canned = **$0**; novel ≈ $0.017 × ~30/tenant·mo = **~$0.6/mo**. Latency: canned <1ms (fine for live); novel 2–3s (acceptable mid-call only because output is tiny).

### Expected effect
The right rebuttal for the moment: "we're fine today" (discovery) ≠ "the CFO hasn't approved" (closing). Mostly free, because the most common objections per stage are already written and just get looked up.

### Risk if not perfectly executed
- *Wrong-moment card:* a closing rebuttal shown during discovery → the founder says something tonally off live. Mitigated by keying to Spec A's moment + the low-confidence→show-both-or-generic fallback.
- *Canned voice mismatch:* the table responses are Elevay/Pilae-flavored; shown verbatim they may not fit a tenant's product. Mitigated by treating them as **prompts the founder adapts**, not scripts — and, if we ever want per-tenant rewriting, that re-adds live LLM latency (a deliberate tradeoff, default OFF for live).
- *Latency in a live call:* an LLM rebuttal that takes 5s is useless mid-call. Mitigated by **canned-first** (instant) and capping the novel path's output so it returns in 2–3s.
- **Acceptance bar:** each moment shows its own table; canned path makes zero LLM calls; novel path returns ≤1 rebuttal in <3s; no closing-objection card ever appears in a discovery context (test).

---

## Global execution risk (the one that ties them together)

The cascade is the real danger: **Spec A wrong → C, D, E all wrong.** The design contains it three ways, and all three are acceptance-gated:
1. **Safe default:** ambiguity/no-signal → generic-ish moment + `confidence:"low"`, and low-confidence routes to **generic** prep/coaching (never a confidently-wrong specialized one).
2. **Legible + correctable by conversation:** the inferred moment is always shown as a heading (so a wrong read is noticeable) and corrected in plain language in chat — no control to find, no widget to manage; the conversational correction wins.
3. **No fabrication anywhere:** prep and coaching state "unknown"/limited-basis rather than invent — so even a wrong moment degrades to honest-but-generic, not confidently-false.

"Perfectly executed" = the per-spec acceptance bars above are green, which is what makes the difference between *real* moment-specialization and a relabeled generic feature.

---

## Recommended order
1. **A + B** (the foundations, ~1 day, $0 runtime) — nothing else is correct without them.
2. **C** (the flagship, ~1.5 day) — this is the visible "cold ≠ discovery ≠ demo" win.
3. **E** (~1.5 day) — cheap, high live-value, reuses the doctrine tables.
4. **D** (~2 days) — highest build, also closes the orphaned-coaching gap from the deep audit.

Start with **A + B + C** (≈2.5 days) for the demonstrable result; D and E follow.
