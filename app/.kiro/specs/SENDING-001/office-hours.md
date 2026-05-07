# SENDING-001 — Office Hours: Warmup Engine

## Problem statement (one sentence)
The `warmupEmails` table and per-mailbox `warmupStartedAt`/`warmupDailyTarget` columns exist in the schema, but no Inngest function actually drives warmup sends — meaning a newly connected mailbox has no path to ramp from 0 to safe daily volume before its owner starts cold outreach, which torpedoes deliverability on first impression.

## Premise challenge

**Premise 1: We need our own warmup engine at all.**
Counter-argument: third-party warmup services (Mailwarm, Lemwarm, Instantly Warmup, Warmy) exist and are battle-tested. We could integrate one and stop building.

Counter-counter: every third-party warmup pool is itself flagged at scale. Gmail's 2024 enforcement of bulk-sender rules (RFC-8058 + DMARC) makes "warmup pool" detection trivial — they read deterministic patterns. The viable path in 2026 is *cohort-realistic* warmup where outbound looks indistinguishable from organic sending. That requires control over the loop: who replies, when, with what content, and how the conversation evolves. A vendor pool gives you none of that. **Build wins on quality + control, even if it costs more dev time.**

**Premise 2: Warmup must run on the user's outbound mailbox.**
Counter-argument: if the user sends cold from a *dedicated* outbound mailbox/domain (which is the recommended path — never burn the primary), we could have *Elevay* warm dedicated mailboxes server-side using a pool of Elevay-controlled inboxes. The user never touches warmup at all.

This is genuinely better. It's polytropos: same product, different expression. Power users with their own infrastructure get one path. Standard users get Elevay-managed warmup invisible to them. The data model already supports this (`connectedMailboxes` carries the credentials; the warmup engine can drive any mailbox the tenant has connected). **Scope of SENDING-001: the engine itself. The "managed pool" is downstream.**

**Premise 3: Warmup is just a chronos ramp (5/15/30/limit/day).**
Counter-argument: a mechanical ramp is exactly what spam filters detect. Real mailboxes don't send 5 emails on day 1, then 15 on day 2, with deterministic timing. The warmup must look like *human inbox activity*: irregular volumes, replies to threads, archiving, opening, marking-as-important. This is why the engine needs to be more than a cron — it needs a behavior model.

This shifts the spec: warmup engine is a *behavior simulator*, not a sender.

## Alternatives explored

| Option | Cost | Quality | Time-to-first-cold | Verdict |
|---|---|---|---|---|
| **A: Outsource to Instantly Warmup / Mailwarm** | Low ($$$) | Vendor-controlled patterns, detectable | 2-3 weeks | Rejected — gives away the moat |
| **B: Mechanical ramp (5/15/30 cron)** | Low | Detectable by 2026 filters | 1 week | Rejected — defeats the purpose |
| **C: Behavior-simulating warmup with reply loop, threading, archive patterns** | Medium | Highest quality, defensible | 2-3 weeks | **Selected** |
| **D: No warmup, rely on managed-pool sending only** | Low | High quality but locks all users into Elevay pool | 1 week (different scope) | Defer — managed pool is SENDING-003 territory |

## Layer check
Layer 1 (tried-and-true): warmup is a 10-year-old practice; the protocols are well-understood. Don't reinvent the rules.
Layer 2 (new and popular): vendor warmup pools are the popular answer. Scrutinized — rejected (premise 1).
Layer 3 (first principles): in 2026, deliverability is a behavioral-pattern problem, not a volume problem. The warmup must produce realistic inbox behavior, not merely realistic send volume. **This is layer 3.**

## Completeness target
**8/10.** Boil the warmup behavior loop completely (volume curve + reply rate + threading + archive/star/important markers + time-of-day distribution). Defer (1) Microsoft-specific warmup patterns separate from Gmail (probably ~80% identical), (2) automatic sender-reputation monitoring as a feedback loop into warmup pace, (3) cross-tenant warmup pool (premise 2's polytropos extension). Document what's deferred in the design.

## Principles applied
- **Phronesis vs Episteme** — Warmup is pure episteme (the machine follows behavioral rules). The decision "is this domain ready for cold outreach?" is phronesis — surface the readiness signals, let the human decide.
- **Polytropos** — Engine works whether the user brings their own mailbox (BYO path) or uses an Elevay-provisioned dedicated outbound mailbox (managed path). Same engine, two faces.
- **Nostos** — Don't drift into building a generic email automation platform. Warmup exists in service of the outbound mission. Every feature considered must answer: "does this make the first cold send safer?"
