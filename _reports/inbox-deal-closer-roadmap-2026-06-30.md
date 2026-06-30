# Inbox → founder's deal-closer — prioritized roadmap (2026-06-30)

Grounded in a 6-agent code audit (`inbox-deal-closer-audit`). Verified live: the AI
reply dodges specific prospect questions (Sarah Chen asked pricing-for-8-seats +
HubSpot-import; the draft punted both to "let's hop on a call").

## The one insight

The intelligence is already built — it's just **not wired into the reply**. The
reply prompt at `api/inbox/compose/reply/route.ts:110` folds only `[stylePrompt,
voice, memory, mailboxVoice]` (the founder's *voice*, zero *substance*). Three
separate systems already exist and converge on that one seam, unused:
- a **knowledge base** with embeddings (`knowledge_entries`, `getTenantKnowledgeForStage()`, `retrieveKnowledge()`, `copyAssetBlock`, tenant `productDescription`)
- **deal/account context** (`buildEnrichedContext()`, `buildDealBrief()`, fresh GTM signals) — the reply route never calls them; the detail route already does
- a **learning flywheel** (`applyLearnedContext()` few-shot injection) — reply traces are never scored, so it's starved

So this roadmap is mostly *connecting wires*, not new architecture.

---

## P0 — Reply that ANSWERS (the revenue moment) · ~3 dev-days

The founder's reply IS the moment money is made; today it's generic. Wire substance
into the one seam (`compose/reply/route.ts:110` + the unused `ComposeReplyOpts.context`):
- **(a) Product knowledge** — call `getTenantKnowledgeForStage('outreach')` + tenant `productDescription`; format via `formatKnowledgeBlock()`. (~2d)
- **(b) Deal/account context** — fetch the contact's open deal, call `buildEnrichedContext()` (objections / champions / budget / next-steps, fail-soft ~60ms), synthesize a one-paragraph brief, pass via the existing `context` param. (~1.5d, overlaps a)
- **(c) Stop the anti-grounding** — `compose-reply.ts:43` literally says "do not make up figures" (blocks knowledge use) → rewrite to "cite the knowledge block"; delete `suggest-reply/route.ts` hardcoded fictional $99/$299 pricing.
- Apply to all three paths: reply, nudge, suggest-reply (boil the lake).

**Impact:** Sarah's draft becomes *"8 seats = €X/mo; HubSpot import is native (~5 min); shall I hold Thu 2pm to lock the July pilot?"* — answers + books (the book-without-contact we shipped makes the slot inline).
**Needs from you:** pricing tiers, top 3–5 objections + rebuttals, key capabilities/differentiators, named-competitor positioning (~15–30 min seeded into the KB; the KB UI/infra already exists).
**Depends on:** nothing.

## P1 — Deal-ranked inbox + "why" (open on the right deal) · ~4 dev-days

The ranking inputs exist but aren't fed; the reasons are computed but never shown.
- Join contacts→deals when loading conversations; pass `hasOpenDeal` + `dealStageRank` + `senioritySenior` to `scoreImportance()` (`importance.ts:15-17` supports them, all three currently `undefined`).
- Factor fresh company signals (funding/hiring) into the score (today display-only).
- Render the already-returned `importanceFactors` (`route.ts:338`, never displayed) as a small "why" on the row: *"reply first — pricing intent + open deal (proposal) + recent."*

**Impact:** open the inbox and the hottest deal is on top, with its reason.
**Needs from you:** one weighting call (does an open deal in proposal outrank a cold pricing inquiry? does a <7d warm signal bump a tier?).
**Depends on:** nothing (can run parallel to P0).

## P2 — Proactive follow-up (don't let warm deals go cold) · ~4 dev-days

Today follow-ups are a manual button; overdue threads (Paul, Priya) need you to scan.
- Daily Inngest cron (9am tenant-tz): find `followup.overdue || daysUntilDue===0`, pre-draft grounded nudges, surface a "Follow-ups ready" card; persist `nudge_sent_at` (dedupe + cadence audit).
- Stage-aware escalation ladder instead of one gentle template.

**Impact:** no warm deal dies of silence; the founder approves a stack each morning.
**Needs from you:** escalation tone ladder (3d gentle → 8d firmer?) + who approves (you vs auto-send at trust level 3+).
**Depends on:** P0 (nudges must carry product/deal context, else they stay generic).

## P3 — Closed outcome→learn loop (the reply improves weekly) · ~4 dev-days

The flywheel exists (`flywheel.ts` few-shot curation + `applyLearnedContext()`) but
reply traces carry no `evalScore`, so it's starved.
- Add `traceId` to `outbound_emails`; score reply traces on the prospect-reply outcome (`outcome-detector.ts` already detects `repliedAt`/classification; `outcome/resolved` is emitted but **no handler listens**).
- Promote high-reply-rate drafts into `compose-reply`'s few-shot pool.

**Impact:** the inbox's replies get measurably better every week from real outcomes — the compounding moat (closes the "~70% open" learning loops in `self-improvement-loops-map`).
**Needs from you:** one decision (auto-score on reply outcome? promote into the inbox few-shot pool?).
**Depends on:** P0 (drafts must be traced/scored first).

## P4 — Send replies confidently at volume · ~3–5 dev-days

The gate stack is already strong (`evaluateSend`: suppression, identity caps,
deliverability guard, lawful-basis). Volume-hardening gaps before scaling reply send:
- per-tenant/per-mailbox rate limits on `/api/emails/send` (today only IP 200/min);
- complaint→suppression (FBL webhook) — only hard bounces auto-suppress today;
- domain-auth re-check at send time; warmup-gated ramp (cap is static 20/day).

**Impact:** safe to send replies at real volume without torching deliverability.
**Needs from you:** max replies/hour per mailbox post-warmup; per-mailbox vs per-tenant.
**Depends on:** nothing, but low urgency while volume is founder-approved + manual.

## P5 — Compact composer chrome (pin Send) · ~0.5 dev-day · parallel anytime

The polish I found live: at your half-screen viewport Send needs a short scroll.
Collapse To/Cc/Subject into one expandable line on a reply so Send pins.
**Needs from you:** nothing. **Depends on:** nothing.

---

## Sequence & why

`P0 → P1 → P2 → P3 → P4`, with `P5` droppable in parallel.

The compounding logic: **P0** makes each reply *substantive* → **P1** makes you hit
the *right* one first → **P2** makes sure none go *cold* → **P3** makes them get
*better* every week → **P4** lets you do it at *volume*. P0 is the keystone (P2 and
P3 depend on it) and the cheapest big win (~3d, mostly wiring), so it goes first.

Total ~18–20 dev-days for P0–P4 (P5 is +0.5d, parallel). The only items needing
your content/decisions before I can start: P0 (pricing + objections), P1 (one
weighting call), P2 (tone ladder + approval), P3/P4 (one decision each).
