# SENDING-002 — Office Hours: Instantly Send Routing Completion

## Problem statement (one sentence)
The Instantly client (`apps/web/src/lib/providers/instantly-client.ts:7-17`) is scaffolded with credential validation and account-listing logic, but the comment explicitly states "actual send routing... lands when the user has verified the connection works in production" — meaning a tenant who connects Instantly cannot actually use it for outbound, leaving them stuck with the Resend test domain or a manual Elevay-managed-domain ticket.

## Premise challenge

**Premise 1: Instantly is the right partner.**
Counter-argument: Smartlead, Lemlist, and Mailforge are equally capable. What's special about Instantly?

Answer: Instantly has the largest installed base of B2B outbound users (700K+ businesses) and the most aggressive pricing on multi-domain sending at scale. For Elevay's ICP (founders running their first push), the user has often already heard of Instantly — recognition reduces onboarding friction. Smartlead is technically equivalent but has lower brand recognition in our ICP. **Decision: keep Instantly as primary, design the abstraction so a second provider (Smartlead or in-house SMTP rotation) can plug in later without a rewrite.**

**Premise 2: We must build a custom Instantly integration.**
Counter-argument: Instantly has a public API. We could just be a thin proxy.

Answer: A thin proxy is exactly what we want. The integration is *not* a feature — it's plumbing. Every line of business logic we add to "improve" Instantly behavior is debt. The integration's job is: take an outbound email decided by Elevay's logic, hand it to Instantly with the right campaign/sequence/mailbox parameters, and report back the result. **Resist the urge to build an Instantly UI inside Elevay.** Users configure Instantly campaigns at Instantly. Elevay routes sends.

**Premise 3: Send routing belongs in the email-send-worker.**
Counter-argument: We could create a separate Inngest function `instantly-dispatch` that competes with the existing send worker.

Answer: Two send paths is two debt paths. The send worker (`apps/web/src/inngest/email-send-worker.ts`) already implements: tracking pixel injection, click rewriting, CAN-SPAM footer, unsubscribe links, throttling, bounce-aware retry. All of these need to apply *whether the SMTP transport is Resend, Instantly, or something else*. Provider routing belongs at the **transport layer** inside the existing worker, not as a parallel pipeline. **Refactor the worker to take a transport strategy.**

**Premise 4: Cold sends should always go through Instantly.**
Counter-argument: warm replies, transactional notifications, internal warmup, and ad-hoc one-offs do not need Instantly's deliverability machinery.

Answer: Right. The send worker should choose the transport based on the email's `intent`:
- `intent = warmup` → direct provider SMTP via OAuth (mailbox itself)
- `intent = reply` → mailbox SMTP (must come from the conversation's original mailbox)
- `intent = transactional` → Resend (current behavior, fine)
- `intent = cold` → Instantly (or future fallback to managed-pool)
- `intent = follow_up` → Instantly if same mailbox available, else direct

This is polytropos applied to the transport layer.

## Alternatives explored

| Option | Time | Quality | Lock-in | Verdict |
|---|---|---|---|---|
| **A: Finish Instantly routing as the only cold-send path** | 1 week | High | High (vendor coupling) | Rejected for vendor lock-in alone |
| **B: Build provider-agnostic transport interface, plug Instantly first** | 1.5 weeks | High | Low | **Selected** |
| **C: Skip Instantly entirely, build in-house SMTP rotation across managed domains** | 4-6 weeks | Highest control | None | Rejected — too much for current sprint, revisit at Series A scale |
| **D: Hybrid: Instantly for users with their own Instantly account, managed pool for everyone else** | 2 weeks | High | Medium | **Selected** for full picture (managed pool is SENDING-003) |

## Layer check
Layer 1 (tried-and-true): SMTP routing through a third-party deliverability provider is industry standard.
Layer 2: provider-agnostic transport abstractions are well-understood (Nodemailer transports, Symfony Mailer transports). Use the pattern.
Layer 3: not warranted here. No first-principles innovation needed in the routing layer.

## Completeness target
**9/10.** Boil the routing decision tree completely (intent → transport selection). Implement Instantly transport fully. Stub Smartlead transport (to prove the abstraction works without committing to Smartlead). Defer the in-house SMTP rotation entirely (out of scope for first $1M ARR — revisit when self-managed pool of warmed domains becomes more economical than Instantly's per-send pricing, probably above $50K MRR).

## Principles applied
- **Polytropos** — Same email-send-worker, multiple transport faces. The worker doesn't know whether the bytes go via Instantly's API or a direct SMTP. Each tenant's transport mix can differ without code paths multiplying.
- **Metis** — We're not building a competitor to Instantly. We're standing on Instantly's shoulders for what they do well and keeping our intelligence layer (signal detection, sequence orchestration, coaching) unique. The metis is the abstraction: by treating Instantly as a transport, we keep the option to swap them out later without users noticing.
- **Nostos** — Don't drift into being a deliverability vendor. The mission is autonomous outbound for founders. Routing is plumbing.
