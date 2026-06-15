# RAW: Sam Blond doctrine + Monaco team/funding/product depth
*Stream 3, 2026-06-14. Primary: podcasts/talks/threads + TechCrunch/GlobeNewswire + JDs + reviews.*

## Context
Monaco ("Monaco GTM"), Sam Blond's AI revenue platform. Stealth→launch **Feb 2026**; **~$85M total** (Founders Fund Series A → **$50M Series B May 2026, Benchmark / Jack Altman**); 7-figure ARR added **monthly** Feb–Apr; hundreds of public-beta customers. Flat-fee pricing, undisclosed (est. ~$500–2,000+/mo per TechCrunch). **ACV band $25K–$100K** (their FDAE JDs). ~40–50 staff.

## (a) Sam Blond doctrine — the coaching brain (encode as rules)
**Pipeline/demand (his #1 belief):**
- "4 of 5 times, a company missing revenue has a **pipeline problem, not conversion/closing**." Diagnose demand first. Double top-of-funnel (all else equal) = double sales.
- "Focus on demand until you have too much." **#1 rep metric: new opportunities created this week** (not activity, not closed-won).
- **Don't hire reps into thin demand** — spreads demand across less-tenured reps, lowers conversion. Add headcount only when demand > capacity.
- **Concentric circles** for outbound: (1) founder/personal network → (2) investors + their portfolios → (3) employees' networks → (4) customers as referral engine.

**Outbound:**
- "Startups misdiagnose the bottleneck as conversion when it's demand gen / opportunity creation."
- **AEs source own pipeline "day one and year ten"** — at Brex AEs out-sourced SDRs (better quality intuition).
- **Creative > volume** (commoditized): Brex "champagne campaign" (bottle to founders post-raise), handwritten notes, offline activations. Test: "2–3 most creative things you did this quarter?"
- **ACV gates the motion**: "intense SDR/AE with $10K ACVs rarely scales."

**Hiring (he calls it the whole game):**
- "**Recruiting is the only thing that matters.** Don't outsource it — best candidates don't use external recruiters." Referrals win (Brex: expected, no bonus).
- **Hire first two reps simultaneously** (separate PMF signal from rep signal). In founder-led sales you know in **~14 days**.
- Bias to raw talent > domain experience; first AEs need early-stage startup experience.
- **SDRs only after ~6 AEs prove outbound** (Brex: 6 AEs before 1 SDR; first SDR = experienced leader; 80% Brex revenue from outbound). Two prereqs before any SDR: working outbound process + dedicated management.

**Comp:** Pay top of market. **Aim 70%+ over quota or "your OTE is meaningless."** Non-recoverable draws for juniors during ramp. Evolve SDR comp quantity→revenue when demo quality drops.

**Targets/forecasting:** "Two variables: where you set it + how you perform." **Set conservatively** (confident in $10K → target $8K). Missed targets demoralize and *reduce* performance; achievable targets build winning culture. Month→quarter→year as data accrues.

**Closing/process:**
- **Presumptive Close**: end every demo walking them through *using* the product as if bought — "**2–3x conversion**" (esp. <30-day cycles).
- "**If you don't know how to buy your product, your customer certainly doesn't**" — be prescriptive about how to buy.
- **In-person → 3x close** (Brex data); most competitors won't travel.
- **Obsess over implementation** (separate from CSM; milestone-based; miss 30-day milestone → hard to resell in 12 months).
- Distribution = as important as the announcement (network spreadsheet, launch-day amplification). Happy customers = "army of salespeople" (reciprocate: jerseys/notes).

**Founder-led (the wedge):** "No one is better than you at selling the vision." Founders write the playbook + close first customers before hiring. Don't use PLG to mask a stalled motion. Hire first rep only after a handful of paying customers + repeatable process.

## (b) Team pedigree → architecture
- **Sam Blond** CEO (CRO Brex, VP Sales Zenefits $1M→$70M/2yr, EchoSign, Partner Founders Fund) → **methodology/coaching layer**.
- **Malay Desai** CTO (Chief Architect/SVP Eng **Clari**; ML Clearwell→Symantec) → **forecasting/RevIntel engine** (signal-based stages, risk, momentum, auto-fields = Clari DNA).
- **Shek Viswanathan** CPO (CPO **Apollo** 9x ARR, 200M+ graph + sequencing; CPO **Qualtrics** VoC) → **data graph + enrichment + sequencing + feedback science**; doctrine "every team had precisely 3–4 issues driving most impact" → ruthless prioritization = "prioritized actions."
- **Brian Blond** co-founder (MD Sutter Hill, Partner Human Capital, multi-startup CRO) → GTM network + FDAE service model.
- **Implication:** Monaco = **Clari + Apollo + Brex playbook + Qualtrics** welded by those who built each. Lead over single-point AI-SDRs (11x/Artisan) and CRMs (Attio/Salesforce).

## (c) Capability leaks
**Product page (6-module spine):** 1 Build TAM (pre-built from billions of points, ICP+customers+email history, ML scoring + "why this account"); 2 Overlay Signals (NL semantic search; custom signals incl. common investors/job postings/tech stack; inbound web-visitor/demo signals); 3 Execute Sequences (templates + **Autopilot**: autonomous enrollment/timing/follow-up; context+intent-adapted copy); 4 Capture Activity (auto capture/summarize/attach; auto-enrichment; trusted history); 5 Track Pipeline (**signal-based stages**; risk detection ghosting/stalls/weak-engagement; auto-filled fields call-count/stakeholders/"why now"); 6 Ask Monaco (prioritized actions; chat Q&A/trends; proactive BI = CRO Copilot).
**AI Engineer JD:** "agents as first-class"; LLM features (prompts/structured outputs/tools); RAG (chunking/embeddings/retrieval); multi-step agent orchestration (memory/tools/retries/fallbacks); evals quality/latency/cost; OpenAI/Anthropic/OSS; Python. → real agentic+RAG over own graph.
**Platform Engineer JD:** event-driven streaming ingestion/transform/serve; ML feature/embedding/training-data pipelines; Go/Python; queues/warehouses/orchestration. → Clari-grade time-series substrate.
**Forward-Deployed AE JDs (human moat):** New-business FDAE closes **$25–100K** full-cycle; Post-sales FDAE = **"revenue and strategy role, not relationship management"** (mgmt/strategy-consulting bg): advise founders on outbound GTM, sequence copy/strategy, build TAMs as ICP expands, drive NRR/upsell. "Each customer paired with a forward-deployed sales executive." Sam: "Monaco does not have an agent pretending to be a sales rep."
**Reviews (real customers + gaps):** "Amy Yan/Nowadays — TAM built day 2, sequences same day." Customers **rave about the human FDAE more than the AI**. **Gaps to exploit:** no website-visitor de-anon as a lead source; **no phone/dialer**; no LinkedIn/SMS/multi-channel; **no daily prioritized SDR task list**; no disclosed deliverability infra; opaque pricing; zero G2/Capterra/PH validation; human-heavy service → scaling-cost question.

## (d) What the CRO Copilot really is
A single opinionated system replacing the whole GTM stack — **CRM + ZoomInfo-class data graph + Outreach/Apollo-class sequencer + Gong-class notetaker + Clari-class forecasting/risk engine** — over an agentic RAG core, wrapped in a **forward-deployed human CRO service**. Defensible core = pedigree (Clari+Apollo+Brex+Qualtrics) + the human FDAE. **Exploitable edges for us:** phone/voice, multi-channel (LinkedIn/SMS), deliverability infra, website-visitor ID, a true daily prioritized call/task list, transparent self-serve pricing.

## Sources
pulse2 · globenewswire (Series B, launch) · todaysstartupnews · marketbetter · salesforge · lightfield (Monaco vs Attio) · monaco.com (/company,/product,/) · Ashby JDs (AI Engineer, FDAE new-biz) · BuiltIn (FDAE post-sales) · SaaStr (9 sales concepts; targets pod 541; first SDR team) · GTMnow (creative demand gen) · antoinebuteau (lessons) · getrecall (E1139 outbound) · Sam Blond LinkedIn (founder-led) · Comparably (Malay Desai) · Enterpret (Shek Viswanathan VoC) · Crunchbase (Viswanathan) · theaiinsider
