# RAW: Clari → Monaco forecasting/revenue-intelligence iceberg
*Stream 1, 2026-06-14. ~18 searches, primary-source-weighted. Malay Desai (Monaco CTO) = ex-Chief Architect/SVP Eng at Clari, so Clari's full stack ≈ Monaco's hidden forecasting spec.*

## 1. RevDB — time-series revenue data engine (foundation)
- Snapshots Salesforce **every 15 min**; **history for every CRM field** ("data exhaust") to train ML — saleshive
- Time-series model records change **through time** (vs CRM current-state-only); ingests + snapshots in real time on connect — clari time-series blog
- Auto-captures + **normalizes** activity across CRM/email/calendar/calls/sequencers — saleshive
- $4T+ revenue under management trains models — siliconcanals; Clari Ingest pulls usage/spend from Snowflake/Postgres/Databricks — destinationCRM
- → Monaco: "auto-filled fields … Monaco does the updating" [inferred]

## 2. Forecasting — categories, submission, roll-ups, accuracy
- **Categories**: Pipeline / Best Case / Commit / Closed / Omitted; Commit ≈90% gated on decision-maker authority, timeline, MAP, buyer-process, urgency — clari forecast-categories
- Categories = WHEN revenue lands; stages = the PATH (orthogonal) — clari
- **Submission** by rep/mgr/exec with overrides+notes; configurable cadence/compliance — softwarefinder
- Weekly forecast call tracked per week in quarter — clari community
- **Roll-ups**: Team Commit=Σ rep Commit; Best Case=Σ rep BC+Team Commit; Pipeline=Σ rep Pipe+Team BC; multi-level calibration — rework; one-click top-line→deal — clari
- **Accuracy over time per rep** (chronic under/over-forecasters → coach); claims **98% accuracy by week 2** — clari
- Predicts deal-based ARR, existing ARR, usage-based ARR; **Forecast for Consumption** (account+workload level, CRM+usage) — clari/destinationCRM
- **Clari Studio → Forecast Config** (build/test/deploy custom models), Consolidated Views; forecast sharing; mobile drill-down — destinationCRM/clari

## 3. AI projection — "machine call" vs "human call"
- AI quarter-end projection; explicit **machine-call vs human-call comparison**; three-way: your forecast vs Clari projection vs team call (Pulse) — clari/tellius
- Projection explanations (drill to underlying data); built on **historic conversion by stage/category** + full past-deal data — clari

## 4. Pipeline analytics — snapshot/delta inspection
- **Waterfall**: pipeline change between any two points + drivers (new/slip/pull-in/push-out) — clari
- **Flow**: deals gaining vs losing ground; millions of changes in real time; Won/Pushed/Lost/Up/Down/Commit-outcomes; **"why did forecast drop $7M?"**; **sandbagging detection** (reps hiding deals in Pipeline) — clari flow blog
- **Funnel** (stage conversion/drop-off), **Trend** (quarter trajectory), **Pulse** (real-time projection + pacing lines) — clari/tellius
- **Coverage ratio** = pipe÷quota; top bar shows WoW + gap-to-goal; 3x default but AI-tuned; next-quarter coverage inspection — clari

## 5. Deal/opportunity inspection + scoring
- **Opportunity Score** (ML close-likelihood), trained on **2yr CRM history + conversation + meeting data**; inputs: time-in-stage, deal-size up/down, **rep movement between forecast categories**, close-date changes — clari
- Positioned as data-driven **second opinion** — clari
- **4-Point Deal Inspection**: (1) what changed (color-coded field deltas), (2) close likelihood (opp score), (3) activity volume incl. outside-CRM, (4) following sales process (MEDDIC/BANT/SPIN/Challenger/Sandler) — clari
- Risk + momentum; **"gone dark"** detection; color-coded engagement per channel; prescriptive prioritization; bulk field write-back — clari/saleshive
- → Monaco "Risk detection … ghosting/stalls/weak engagement with clear reasons" + "signal-based stages" ≈ Clari signal-attached opp scoring [inferred near-1:1]

## 6. Conversation intelligence (Wingman → Clari Copilot)
- Records/transcribes/tags every call; searchable by keyword/tag/competitor; real-time cue cards+battlecards; long-monologue + word-rate alerts; post-call talk ratios/interactivity — gzconsulting
- **Deal Central** flags: no decision-maker present, pricing not discussed — softwareadvice
- Buyer signals (intent/objections/contacts/next-steps) flow into forecasting; Smart Topics/Feed/Chapters/Summaries/Battlecards/Ask-Clari-for-Deals — clari

## 7. Forecasting science (baked-in concepts)
- Historic conversion baselines by stage/category; **Sales Linearity**; **Deal Slippage** (slip/push vs lost); **Pull-in** detection; Quota/Attainment/Coverage; MVP framework (Mix/Volume/Pipeline) for the forecast call; snapshots+deltas as first-class — clari

## 8. RevAI agents + RevOps automation
- **AI Deal Inspection Agent** (reviews opps vs criteria, flags risk, recommends exact next moves); **AI Trend Analysis Agent**; AI Projections; AI Advanced Opp Scores; Smart CRM Suggestions; Smart Follow-Up/Prospecting — clari
- Clari+Salesloft = "Autonomous Revenue System" but 2026 still **"suggestive autonomy"** (Monaco *claims* fully agentic — the genuine new claim vs Clari) — aragon/oliv

## TOP 15 hidden forecasting/RevIntel capabilities Monaco likely has
1. Field-level time-series snapshotting (~15min) 2. AI quarter-end projection reconciled vs rep/team call 3. Forecast categories + roll-ups 4. What-changed-since-last-week deal movement (Waterfall/Flow) 5. ML opp score on won/lost history 6. Coverage ratio + gap-to-goal WoW (AI-tuned) 7. Gone-dark/ghosting/stall risk from engagement 8. Historic conversion baselines by stage 9. Deal-signal extraction from calls (no DM, no pricing) 10. Slip/pull-in + sandbagging flags 11. Prescriptive next-best-action per deal 12. Per-rep forecast-accuracy/bias calibration 13. Linearity/quarter pacing 14. Funnel conversion analysis 15. Scenario/what-if + next-quarter coverage (+ consumption forecast wedge)

**Net:** Monaco's 3 bullets map onto Clari's full stack — "Prioritized actions"=Deal Inspection Agent+opp score; "Ask Monaco"=Flow/Waterfall/Trend in NL; "Proactive insights"=snapshot deltas + risk/gone-dark. New vs Clari: full agentic execution + consumer-grade zero-config.

## Sources
monaco.com/product · tamradar Series B · marketbetter review · tellius RevIntel 2026 · saleshive/clari · clari.com/products (forecast, inspect, copilot, revdb, revenue-ai-agents) · clari.com/blog (time-series, forecast-categories, flow, analytics, crm-scoring, 4-point-deal-inspection, at-risk-deals, forecasting-metrics, forecast-call guide, pipeline-coverage, how-cros-ensure-accuracy, inspect-next-quarter, consumption) · destinationCRM · gzconsulting (Wingman) · softwareadvice · clari community · rework · aragonresearch · oliv.ai · siliconcanals
