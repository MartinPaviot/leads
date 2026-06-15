# Monaco "CRO Copilot" — DEEP Audit (the iceberg beneath the 3 bullets)

**Date:** 2026-06-14 · **Supersedes the depth of** `cro-copilot-audit-2026-06-14.md` (v1, which took the marketing page as the boundary — a mistake).
**Directive that drove this:** assume Monaco's public materials show <0.1% of what they do, assume they are genuinely ahead of us everywhere, and dig far deeper per category.
**Method:** 4 parallel deep-research streams (Clari/forecasting · Gong/conversation-intelligence · Sam Blond methodology + team + funding · first-principles full CRO job) + local engineering job specs + Monaco product page re-fetched 2026-06-14. Raw sourced dumps saved in `_research/teardown-monaco/cro-copilot-research-raw/`.
**Honesty rule:** each capability is tagged **[confirmed]** (Monaco's own page / reviews) or **[inferred]** (reasoned from team pedigree + category norms). Elevay state is anchored to code I read this session, or flagged **[verify]** when sourced from memory/prior audit.

---

## 0. The reframe — what "CRO Copilot" actually is

Monaco's product page reduces the CRO Copilot to three lines: *Prioritized actions / Ask Monaco / Proactive insights.* That is the **interface**, not the product. The product underneath is an entire revenue-intelligence operating system, and we now know why it has the depth it has — **the founders each built a category leader**:

| Founder | Pedigree | The layer it becomes in Monaco |
|---|---|---|
| **Sam Blond** (CEO) | CRO Brex ($1M→hundreds-of-M, 80% outbound), VP Sales Zenefits ($1M→$70M/2yr), EchoSign; Partner Founders Fund | **The coaching brain** — his sales doctrine encoded (§6 + the doctrine appendix) |
| **Malay Desai** (CTO) | Chief Architect / SVP Eng **Clari** (the forecasting/revenue-intelligence category-definer); ML at Clearwell | **Forecasting + pipeline + deal-inspection engine** (§1–§4) |
| **Shek Viswanathan** (CPO) | CPO **Apollo** (200M+ contact graph, sequencing; 9x ARR) + CPO **Qualtrics** (feedback science) | **Data graph + enrichment + sequencing + VoC** (§9) |
| **Brian Blond** (co-founder) | MD Sutter Hill, Partner Human Capital, multi-startup CRO | GTM network + the forward-deployed-AE service model |

**Scale/context that explains the lead:** launched from stealth Feb 2026; **$50M Series B (May 2026, Benchmark / Jack Altman), ~$85M total**; 7-figure ARR added *monthly* Feb–Apr; hundreds of beta customers; **ACV band $25K–$100K** (from their forward-deployed-AE job specs); pricing is an undisclosed flat fee. ([globenewswire Series B], [salesforge review], [Ashby/BuiltIn JDs].)

**The architecture leak (their own JDs):** an *event-driven, streaming data platform* (Go/Python, queues/warehouses/orchestration) feeding *ML feature/embedding pipelines*, with an *agentic core* (tools, memory, retries, fallbacks, RAG, OpenAI+Anthropic+OSS) and an *evals* discipline on quality/latency/cost. This is exactly the substrate a Clari-grade time-series engine needs.

**The human moat (their real differentiator per reviewers):** every customer is paired with a **forward-deployed AE** — two roles: a *new-business* FDAE that closes $25–100K deals, and a *post-sales* FDAE that is explicitly *"a revenue and strategy role, not relationship management"* (advises founders on outbound GTM, writes sequence copy, builds TAMs, drives NRR). Sam: *"Monaco does not have an agent pretending to be a sales rep."* Reviewers say customers *"rave about the human FDAE more than the AI."*

**The iceberg principle used throughout:** in this category, owning the recording + unified capture makes talk-metrics, tracker detection, MEDDPICC extraction, stakeholder mapping and deal-risk scoring the *standard near-free downstream layer* (Gong ships all of it). Monaco markets coaching as the hero — which reliably signals they built the full submerged stack and show one line of it.

**The 11 real categories** (the actual CRO job, from first-principles stream). Everything below is organized by these, deep, with Elevay's honest position. Scoring per domain uses loop-closure **0** = absent · **1** = shows (dashboard/report) · **2** = recommends · **3** = closes loop (detect→recommend→draft/execute→track).

---

## §1. Data foundation — time-series capture (the substrate everything stands on)

**The full capability (Clari "RevDB"):**
- Snapshots the CRM **every ~15 minutes**; keeps **history for *every field*** ("data exhaust") — the time-series model records state *through time*, not just current state. [confirmed of Clari]
- Auto-captures + **normalizes** activity across CRM, email, calendar, calls, sequencers; identity-resolves to account/contact/opportunity. [confirmed of Clari]
- Ingests product-usage/spend from external DBs (Snowflake/Postgres/Databricks). $4T+ revenue under management trains the models. [confirmed of Clari]

**Monaco:** "Auto-filled fields … pulled from real interactions; **Monaco does the updating**." [confirmed] The time-series snapshot substrate is [inferred] but near-certain (it is the precondition for every "what changed" view and forecast-accuracy metric below, and Malay Desai built Clari's).

**Elevay today:** we have an `activities` table + a **bi-temporal context graph** (`lib/context-graph.ts`, `tValid/tInvalid`) — the closest primitive to time-travel, and a genuine asset. Capture pipeline was recently repaired (memory: last-interaction-finding). **But** we do not snapshot *every field change* on a fixed cadence to produce deal-by-deal "what changed since last week" diffs. [verify — likely partial]

**Gap & score:** Elevay **1–2**, Monaco **3**. This is the **most important hidden gap**: without field-level time-series snapshots, §2 (forecast accuracy), §3 (waterfall/flow), and §4 (what-changed deal inspection) cannot be built to depth. **Foundational.**

---

## §2. Forecasting & revenue predictability (the Clari core — my v1 blind spot)

**The full capability:**
- **Forecast categories** — Pipeline / Best Case / Commit / Closed / Omitted (categories answer *when* revenue lands; stages answer the *path* — orthogonal axes). Commit ≈ 90% expectation gated on EB authority + timeline + MAP + buyer-process + urgency. [confirmed]
- **Submission + overrides + notes** per rep→manager→exec, with cadence/compliance windows; **roll-ups** (Team Commit = Σ rep Commit, etc.) calibrated up the hierarchy by rep/team/region/product. [confirmed]
- **AI projection ("machine call")** of quarter-end, **reconciled three ways: your forecast vs Clari's projection vs the team's call**; built on **historic conversion rates by stage/category**; with drill-in explanations. Claims 98% accuracy by week 2. [confirmed]
- **Forecast accuracy over time per rep** → detect chronic **sandbaggers vs optimists** and auto-adjust their number → coaching input. [confirmed]
- **Coverage ratio** (true coverage = quota ÷ win-rate, not blind 3x), gap-to-goal WoW, AI-tuned. **Linearity** (predictable pace vs hockey-stick), **slippage** vs **pull-in**, **next-quarter coverage**, **scenario/what-if**, even **consumption/usage-based forecast**. [confirmed]

**Monaco:** [inferred, near-certain] — this is exactly what an ex-Clari SVP Eng builds; surfaced via "Ask Monaco" + "Proactive insights" rather than a forecasting tab.

**Elevay today:** `lib/analytics/rev-equation.ts` (a **range** forecast with demand/conversion/capacity bottleneck attribution) behind `/api/analytics/forecast`, plus `lib/insights/cohort-engine.ts` (Fisher exact + BH). Real, but a **thin slice**: no forecast categories, no submission/roll-up, no per-rep bias calibration, no machine-vs-human-call reconciliation, no snapshot-based accuracy tracking, no coverage=quota÷win-rate, no linearity/slippage. [verify — engines exist, depth shallow]

**Gap & score:** Elevay **1**, Monaco **3**. The single biggest *capability* gap. (Caveat: forecast categories/roll-ups assume a multi-rep org; our ICP is solo/founder-led, so the *per-rep* machinery matters less than the *projection + accuracy + coverage + what-changed* machinery — prioritize those.)

---

## §3. Pipeline intelligence & inspection

**The full capability (Clari analytics suite):**
- **Waterfall** — how pipeline changed between **any two points in time**, decomposed: new / slipped / pulled-in / pushed-out / won / lost. [confirmed]
- **Flow** — which deals are gaining vs losing ground (analyzes millions of changes between two points); **answers "why did the forecast drop $7M?"**; **detects sandbagging** (reps hiding strong deals in Pipeline). [confirmed]
- **Funnel** (stage conversion / drop-off), **Trend** (quarter trajectory), **Pulse** (real-time pacing lines vs projection). [confirmed]
- Coverage + **hygiene auditor** (past-due dates, stuck stages, zombie deals, missing fields), **velocity/aging vs that segment's baseline**. [confirmed, category-standard]

**Monaco:** [confirmed-direction] "Signal-based stages … pipeline reflects what's happening, not what got logged" + "Proactive insights … uncover trends." The Waterfall/Flow "what-changed" engine is [inferred] the mechanism behind "proactive insights."

**Elevay today:** `analyzePipeline` chat tool + `/api/dashboard/pipeline` (stage funnel, velocity), `deal-velocity.ts`, `opportunity-health.ts`. We can show stage breakdown and per-deal velocity. **But** no snapshot-delta "what changed since last week" report, no Flow-style gaining/losing or **sandbagging detection**, no pipeline waterfall. [verify]

**Gap & score:** Elevay **1–2**, Monaco **3**. Depends on §1 (snapshots). High value: "what changed in your pipeline since last week, and why" is the weekly artifact a CRO lives on.

---

## §4. Deal intelligence & inspection

**The full capability (Clari 4-point + Gong deal AI):**
- **ML opportunity score** — Gong's Deal Predictor uses **300+ signals** (engagement, cadence, competitor mentions, stakeholder breadth, sentiment), trained on **your** historical won/lost, expressed as a **percentile** (explicitly *not* naive win-probability). Clari's score: time-in-stage, deal-size deltas, **category hops**, close-date changes, 2-yr history. [confirmed]
- **4-point deal inspection**: (1) what changed (color-coded field deltas), (2) close likelihood, (3) activity volume (incl. activity *outside* CRM), (4) **methodology adherence**. [confirmed]
- **Deal warnings grounded in what was NOT said/done** — Gong's 8 monitor types: *No activity, Ghosted, Overdue, Not enough contacts, No power (no EB/decision-maker engaged), Pricing not mentioned, Red flag, Stalled in stage.* [confirmed]
- **MEDDPICC auto-extraction** from conversations → structured fields (Metrics, Economic Buyer, Decision Criteria/Process, Paper Process, Pain, Champion, Competition), recalculated on every new call. [confirmed]
- **Stakeholder / buying-committee map** auto-built from call attendees + email participants + titles; **single-thread risk**; **champion-gone-quiet** decay (buying groups avg 6–10; multithreading +130% win rate >$50K). [confirmed]
- **Mutual Action Plan** auto-draft + slippage tracking (~28% of deals die in paper process). **Next-best-action per deal** ("exact next moves to close the gap" — Clari AI Deal Inspection Agent). **Competitor battlecard** auto-surfaced on mention. [confirmed]

**Monaco:** [confirmed] risk detection (ghosting/stalls/weak engagement "with clear reasons"), auto-filled deal fields (call counts, stakeholders, "why now"), signal-based stages, "knows which opportunities to prioritize." The MEDDPICC extraction, 300-signal score, and stakeholder map are [inferred] but standard given their capture.

**Elevay today (real foundations):** `lib/scoring/buyer-intent.ts`, `lib/analysis/stall-predictor.ts`, `churn-risk-detector` (emits `riskReasons` + `suggestedAction`), `lib/deals/deal-autofill.ts` (budget/timeline/team_size/current_crm/competitors → `deal.properties`, shown on `opportunities/[id]` "Autofilled intelligence" card), `deal-velocity.ts`, the (orphaned) `sales-coaching` skill, and collision/ownership awareness. **Gaps:** opp score is heuristic, **not a model trained on our own closed-won/lost** at 300-signal depth; **MEDDPICC not auto-extracted**; deal warnings narrower than Gong's 8 and not "what wasn't said"; **stakeholder/buying-committee map + single-thread risk is weak/absent**; **no MAP**; next-best-action exists only implicitly. [verify]

**Gap & score:** Elevay **2** on risk/autofill, **0–1** on trained-score / MEDDPICC / stakeholder-map / MAP. Monaco **3**. Rich, well-specified build surface.

---

## §5. Conversation intelligence (the Gong core)

**The full capability:**
- Recorder + transcription + **speaker separation**; **AI Activity Mapper** auto-links every call/email to account+contact+opp (zero entry). [confirmed]
- **The coaching telemetry** (this is the precise, missing spec): **talk-to-listen ratio** (~43/57), **longest monologue** (≤2:30), **patience** (0.6–1.0s after prospect stops), **interactivity** (speaker switches, target ≥8/5min), **question rate** (≥18/hr), **per-call sentiment**. [confirmed of Gong, with benchmarks]
- **Semantic trackers** — **29 out-of-the-box "By Gong" trackers** = the entire MEDDPICC + Command-of-the-Message frame auto-detected (Budget, Champion, Compelling event, Decision criteria/process, Economic buyer, Metrics, Next steps, Paper process, Pricing + reactions, Timeline, Competition, …) + custom NL trackers + keyword trackers (competitor/product names). [confirmed — the strongest single evidence of hidden depth]
- **Call briefs / highlights / next steps** on homepage + deal boards; **Ask-anything across all calls**; **Theme Spotter** (voice-of-customer themes across many conversations). [confirmed]

**Monaco:** [confirmed] bundles a recorder/notetaker (captures, summarizes, action items, CRM updates — "covers basic Gong/Fathom use cases"). The talk-metrics + tracker catalog + theme spotter are [inferred] but the demo's "You Lost Control at \<moment\>" coaching *requires* this telemetry underneath.

**Elevay today:** transcript ingest + `searchTranscripts` (semantic, speaker-bias, `[mm:ss]` markers), `meeting-brief`, deal-autofill from transcripts, `calls-post-process` indexing. **But:** **no native recorder** (upload only — the hard ceiling on coaching specificity), and **none** of the talk-metrics (ratio/monologue/patience/interactivity/question-rate), **no tracker catalog**, **no theme spotter**. [verify]

**Gap & score:** Elevay **1**, Monaco **3**. The clearest, most concretely-specified gap — the Gong telemetry + 29-tracker list is essentially a ready-made backlog. The **native recorder** is the enabling dependency (an "ocean").

---

## §6. Coaching — deal + rep + call (grounded in Sam Blond's doctrine)

**The full capability:**
- **Deal coaching** — blunt, transcript-grounded, cites the moment (the Monaco hero). [confirmed]
- **Rep scorecards** — weighted rubric (discovery/qualification/objection-handling/talk-ratio/next-step), 1–5 scales, role-specific templates, **AI auto-scores** then manager coaches; **benchmarked vs top performers** ("do more of what winners do"). [confirmed of Gong]
- **1:1 pre-reads, ramp tracking vs cohort, PIP dossiers, call-coaching (coachable moments), AI role-play partner, win/loss pattern learning, methodology enforcement** via auto-filled fields. [confirmed]

**Monaco:** [confirmed-direction] "proactively coaches you on what you should be doing." Depth [inferred]. **And the doctrine is Sam Blond's** — see appendix; this is the *content* of the coaching, and it is public and encodable.

**Elevay today (stronger than v1 implied):** the `sales-coaching` skill (excellent voice, structured `diagnosisHeading`+`evidenceQuotes`, **orphaned** — no surface/trigger), `coachingInsights` table, **`aePerformanceSnapshots` (weekly)**, `getMyPerformance`, `performance-aggregator.detectTrends`, `coaching-engine` (coaches skipped stages), `calls-post-process` (post-interaction coaching). We have a **real rep-performance spine**. **Gaps:** no talk-metric scorecards, no benchmark-vs-top-performer, no role-play, methodology not auto-extracted, deal-coaching not surfaced/pushed (v1), and the **Sam Blond doctrine isn't encoded as the coaching rubric** (we have a cold-call KB + docs methodology, adjacent).

**Gap & score:** Elevay **2** (spine exists, partly orphaned), Monaco **3**. Highest-ROI near-term: surface the coaching (v1 Phase 0) **and encode the doctrine** as the rubric.

---

## §7. Prioritized actions & autonomous execution

**The full capability:** per-deal/per-rep **next-best-action** ("exact next moves"), the **daily ranked task list**, and **agentic execution**. Note: Clari/Gong are still **"suggestive autonomy"** in 2026; Monaco *claims fully agentic* execution — and a reviewer flagged Monaco has **no per-SDR morning prioritized task list** (an exploitable edge). [confirmed mix]

**Elevay today:** "Needs you" (`buildNeedsYou`) + the richer **orphaned** `/api/actions` (follow_up/rescue/research) + `autonomous-pipeline` cron. We already do **agentic execution** (sequences autopilot, autonomous pipeline) — a genuine point of parity/lead vs Clari's suggestive model. Gap: ranking ignores momentum/velocity (v1); actions list is thinner than the full next-best-action set.

**Gap & score:** Elevay **2–3** (we execute), Monaco **3** (+ human FDAE executes the hard parts). This is one of our **least-bad** domains. The reviewer-noted Monaco weakness (no daily task list) is an edge to press.

---

## §8. Proactive insights & the NL interface ("Ask Monaco")

**The full capability:** **Ask-anything** in NL over a governed revenue warehouse with **cited** answers, **cross-deal** queries ("which open deals are single-threaded / haven't discussed pricing / mentioned competitor X"), and **proactive push** (deal slipping, rep below benchmark, committee gap) *without a query*. Correctly understood, this is the **interface on top of §1–§11**, not the product. [confirmed of Gong "Ask Anything" +26% win rate; Monaco markets it as the whole copilot]

**Elevay today — our genuine strength:** floating dock (Cmd/Ctrl+J), **158 tools**, page-scoped, entity citations, presets + follow-up pills (v1). We likely **match or exceed** the conversational interface. Gap: insights are **pull-only**, not pushed; cohort/forecast engines not surfaced (v1). The cross-deal NL queries are possible via our tools but unproven at Gong's depth.

**Gap & score:** Elevay **2–3** on the chat interface (lead), **1** on proactive push. Monaco **3**. Closing the *push* gap (daily digest) is the v1 Phase-1 item.

---

## §9. Demand & pipeline-generation intelligence

**The full capability:** signal engine (job changes, funding, hiring, tech-stack change, intent surges, **website-visitor de-anonymization**, product usage), **"why now" ranked target list**, **sourcing-mix** analytics, semantic TAM search, **autopilot sequences**, and — straight from Sam Blond's doctrine — **concentric-circles warm-path sourcing** (founder network → investor portfolios → employee networks → customer referrals). [confirmed of Monaco's first 3 steps; doctrine confirmed]

**Elevay today — strong & doctrine-aligned:** signal detectors (funding/hiring/tech/leadership/**investor-overlap**), TAM builder, smart semantic search, sequence autopilot — and a **connection-graph infra** (memory: PR #213, dormant) that maps *directly* onto Sam Blond's concentric circles (LinkedIn relations × ICP = warm-path founder-sender). Gaps vs Monaco: no website-visitor pixel (Monaco lacks it too — mutual gap, our chance), sourcing-mix analytics thin, single upstream (Apollo) vs Monaco's proprietary graph.

**Gap & score:** Elevay **2**, Monaco **3** (proprietary graph + FDAE-written sequences). One of our most competitive domains; the dormant connection-graph is the highest-leverage activation here.

---

## §10. Retention & expansion intelligence (NRR)

**The full capability:** NRR decomposition/bridge, churn-risk (usage decline, **sponsor departure**, single-thread, engagement drop), expansion plays (seat saturation, feature adoption, new use cases in tickets), **QBR auto-deck**, **renewal forecast**, GRR tracked separately. [confirmed category-standard]

**Elevay today:** `churn-risk-detector` + `expansion-signal-spotter` + `champion-tracker` exist [verify, memory] but shallow; no NRR bridge, no QBR deck, no renewal forecast. **Honest scoping:** our ICP (early-stage founders, founder-led) makes NRR *less central than for Monaco's $25–100K-ACV customers* — but Monaco almost certainly has it for their base.

**Gap & score:** Elevay **1**, Monaco **2–3**. Real gap, lower near-term priority for our ICP.

---

## §11. Strategy & org intelligence (assist-only / mostly future)

**The full capability:** ICP definition, segmentation, **territory design, quota setting, capacity planning, comp-plan design**, win/loss program, **board-deck + investor-narrative generation**, scenario modeling. [confirmed of the CRO job]

**Elevay today:** ICP definition is strong (memory: icp-settings); win/loss partial; territory/quota/comp/board absent. Per the **AE-stays-human / "machine reveals, human acts"** principle, much of this is rightly **assist-only**. Monaco likely has the forecasting/board pieces (Clari heritage).

**Gap & score:** Elevay **0–1**, Monaco **2** (forecasting/board) / human-FDAE covers the rest. Mostly future.

---

## Cross-cutting: the human Forward-Deployed AE moat

Monaco's true near-term advantage isn't only software — it's a **human revenue strategist per account** who writes the sequences, builds the TAM, and takes in-person meetings (Sam Blond's own doctrine: in-person → 3x close). Reviewers consistently say the human is the loved part. **Our counter-bet is full autonomy** (no human bottleneck, 1/10th cost, scales) — but intellectual honesty: *this is also why Monaco is ahead on outcomes today.* We are betting that autonomy + the founder's own network (concentric circles) closes the gap without the headcount. That bet only wins if our §1–§9 depth gets real.

---

## The honest scoreboard

| # | Domain | Monaco | Elevay today | Loop-closure (E / M) | Priority |
|---|--------|--------|--------------|------|----------|
| 1 | Time-series data foundation | near-certain (RevDB-class) | context-graph bitemporal; no field-snapshot deltas | 1–2 / 3 | **P0 foundational** |
| 2 | Forecasting & predictability | near-certain (Clari-class) | range forecast + cohort only | 1 / 3 | **P0** |
| 3 | Pipeline inspection (waterfall/flow/sandbag) | confirmed-dir + inferred | stage/velocity only; no what-changed | 1–2 / 3 | **P1** |
| 4 | Deal inspection (300-sig score, MEDDPICC, stakeholder map, MAP) | confirmed + inferred | risk/autofill yes; trained-score/MEDDPICC/map/MAP no | 2 / 3 | **P1** |
| 5 | Conversation intelligence (telemetry + 29 trackers + recorder) | confirmed-dir + inferred | transcript search only; no metrics/trackers/recorder | 1 / 3 | **P1 (recorder = ocean)** |
| 6 | Coaching (deal+rep+call, doctrine) | confirmed-dir | strong spine, orphaned; doctrine not encoded | 2 / 3 | **P0 (surface + encode)** |
| 7 | Prioritized actions + agentic execution | confirmed (claims full) | we execute; ranking thin | 2–3 / 3 | P1 |
| 8 | Proactive insights + NL interface | confirmed | chat AHEAD; push missing | 2–3 / 3 | P1 |
| 9 | Demand / pipeline-gen + warm-path | confirmed | strong; connection-graph dormant | 2 / 3 | P1 (activate graph) |
| 10 | Retention / expansion (NRR) | confirmed | shallow | 1 / 2–3 | P2 (ICP-dependent) |
| 11 | Strategy/org (territory/quota/comp/board) | partial + human | mostly absent | 0–1 / 2 | P3 / assist-only |

**Where we are genuinely competitive (be honest, but don't overclaim):** the **conversational interface** (§8), **agentic execution** (§7), **demand/warm-path** (§9, esp. the dormant connection-graph = Sam Blond's concentric circles), plus structural edges Monaco lacks (self-serve, transparent pricing, no human bottleneck). **Where we are clearly behind:** the entire **Clari spine** (§1–§4 forecasting/pipeline/deal-inspection depth) and the **Gong telemetry** (§5). Those are the real frontier.

---

## Build implications (re-prioritized given the true depth)

v1's Phase 0 (surface the orphaned coaching) still stands as the cheapest win. But the deep audit reveals **bigger rocks** v1 missed:

**Lakes (boilable, do now):**
- **Conversation telemetry** — compute talk-ratio, longest-monologue, patience, interactivity, question-rate, per-call sentiment on every transcript we already ingest. Ship the **29-tracker catalog** (NL trackers over transcripts: pricing/competitor/EB/champion/next-step/timeline…). This is pure compute over existing data.
- **MEDDPICC auto-extraction** into deal fields (extend `deal-autofill`), + **deal-warning set** ("no EB engaged", "pricing never discussed", "single-threaded", "no next step set").
- **Stakeholder / buying-committee map** from call attendees + email participants (+ single-thread risk). We have the activity data.
- **"What changed since last week"** deal/pipeline digest — needs §1 snapshots first.
- **Encode the Sam Blond doctrine** as the coaching rubric (appendix below) and wire the orphaned coaching skill to a surface + post-meeting trigger.
- **Activate the connection-graph** (concentric-circles warm-path) — already built, dormant.
- **Push** a daily LLM-narrated digest to home (close the proactive-insights gap).

**Oceans (flag to Martin — these are projects, not wiring):**
1. **Native meeting recorder** (Recall.ai bot-joins-call) — the enabling dependency for §5/§6 specificity. Without owning the recording, our coaching ceiling stays below Monaco's.
2. **Time-series snapshot/delta data layer** (§1) — field-level history on a cadence; unlocks §2 accuracy, §3 waterfall/flow, §4 what-changed. Our context-graph is the seed; this is real infra.
3. **Trained opportunity-score model** on our own closed-won/lost (the 300-signal Gong-class predictor) — replaces heuristic scoring; needs labeled outcome history.
4. **Forecast engine** with categories + projection + accuracy-calibration + coverage (=quota÷win-rate) — the Clari core; `rev-equation.ts` is the seed.

**Sequencing logic:** the lakes ship in days–weeks on data we already have and close visible gaps. The four oceans are the actual multi-week bets that decide whether we reach Monaco's *depth* — recorder first (unblocks the most), then time-series layer (unblocks the forecasting/pipeline frontier).

---

## Appendix A — Sam Blond's doctrine (the coaching brain, encode verbatim as rules)

These are public, quotable, and become Elevay's deal/rep-coaching rubric and the founder-sales methodology:

- **Pipeline-first diagnosis:** *"4 of 5 times a company missing revenue has a pipeline problem, not a conversion/closing problem."* Diagnose demand before tactics.
- **The one rep metric:** *opportunities created this week* (not activity, not closed-won).
- **Don't hire reps into thin demand;** add headcount only when demand exceeds capacity.
- **Concentric circles for sourcing:** founder/personal network → investors + their portfolios → employees' networks → customers as a referral engine. (→ our connection-graph.)
- **AEs source their own pipeline "day one and year ten"** — at Brex, AEs out-sourced SDRs.
- **Creative > volume outbound:** the "champagne campaign", handwritten notes, offline plays. Test: *"the 2–3 most creative things you did this quarter?"*
- **Presumptive close:** end every demo by walking them through *using* the product as if bought — *"increased conversion 2–3x."*
- **Be prescriptive about how to buy:** *"if you don't know how to buy your product, your customer certainly doesn't."*
- **In-person → 3x close.** Meet when it matters.
- **Set targets conservatively** (confident in $10K → target $8K); missed targets demoralize and *lower* performance.
- **Recruiting is the only thing that matters; don't outsource it;** referrals win; hire first two reps together to separate PMF signal from rep signal; you know in ~14 days.
- **Comp:** pay top of market; aim 70%+ over quota or "your OTE is meaningless"; non-recoverable draws during ramp.
- **Founder-led:** *"no one is better than you at selling the vision."* Don't use PLG to mask a stalled motion. Obsess over implementation (30-day milestone or hard to resell in 12 months).

---

## Appendix B — Concrete capability backlog mined from the iceberg (ready to spec)

Conversation telemetry: `talkRatio, longestMonologueSec, patienceSec, interactivityScore, questionsPerHour, perCallSentiment, topicTrackers[29], competitorMentions, pricingDiscussed:boolean, nextStepSet:boolean`.
Deal warnings: `noEconomicBuyerEngaged, pricingNeverDiscussed, singleThreaded(<N contacts), ghosted(Nd), stalledInStage(>baseline), noNextStep, championWentQuiet, overdueCloseDate`.
Deal inspection fields (MEDDPICC auto-extract): `metrics, economicBuyer, decisionCriteria, decisionProcess, paperProcess, identifiedPain, champion, competition`.
Forecasting: `forecastCategory(commit/best/pipeline/omit), aiProjection(range), forecastAccuracyByPeriod, coverageRatio(=quota/winRate), linearity, slippedDeals, pulledInDeals, gapToGoal`.
Pipeline: `pipelineWaterfall(period→period), dealsFlow(gaining/losing), sandbagSuspects, stageConversion, velocityVsBaseline, hygieneIssues[]`.
Stakeholder map: `buyingCommittee[{person,role,seniority,engagementDecay}], multiThreadCoverage, missingRoles[]`.

---

## Sources (full lists in the raw research dumps)
Monaco product/company pages (re-fetched 2026-06-14); globenewswire Series B + launch; salesforge & marketbetter hands-on reviews; lightfield Monaco-vs-Attio; Ashby/BuiltIn JDs (AI Engineer, Platform Engineer, FDAE ×2 — local copies in `teardown-monaco-v3/jobs/`). Clari: time-series/forecast-categories/flow/crm-scoring/4-point-inspection/coverage/forecasting-metrics/revenue-ai-agents/copilot blogs + product pages. Gong: help-center (trackers, deal-monitor, deal-predictor, data-extractor, scorecards, ai-for-scoring, coaching-workflows), ask-anything, call-spotlight, deal-execution, talk-ratio. Methodology: SaaStr/GTMnow/Recall/LinkedIn (Sam Blond); MEDDICC; Forecastio; team bios (Comparably/Crunchbase/Enterpret). First-principles CRO: DealHub/Salesmotion/Steerlab/Aviso/Weflow/Xactly/Drivetrain/Avoma.
