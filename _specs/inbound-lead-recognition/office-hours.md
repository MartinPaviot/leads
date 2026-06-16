# Office hours — Inbound lead recognition

## Problem statement (one sentence)

The dashboard surfaces transactional/marketing/automated emails (receipts,
SaaS notifications, newsletters from services the founder *subscribes to*)
as "Hot inbounds" and "Warm leads waiting for a reply", because the product
equates "an email arrived" with "a person wants to buy from us".

## Premise challenge

- *Premise:* "an inbound email = a warm lead". **False.** A lead is a person
  who could become **our customer**. The emails polluting the feed come from
  vendors the founder is himself a customer of — the commercial relationship
  runs the *opposite* direction.
- *Premise:* "we can blocklist the noisy domains". **Rejected** — that is the
  hardcoded-matching anti-pattern (and it never generalises: today it's Stripe,
  tomorrow Notion). The brain must reason about relationship direction, not
  memorise senders.
- *Premise:* "stop capturing these emails". **Rejected** — Lightfield-parity
  requires capturing every interaction into the timeline. We must separate
  **capture** (record everything) from **lead promotion** (only genuine
  person-to-person, buying-relevant inbound becomes a lead/contact/widget).

## Alternatives explored

1. **Domain blocklist of known vendors.** 2/10 completeness. Hardcoded,
   never generalises, violates `feedback_no-hardcoded-matching`. Rejected.
2. **Pure-LLM classifier on every inbound.** 7/10. Correct brain but pays a
   model call on 100% of mail (most of which is obvious machine mail with an
   `List-Unsubscribe` header). Wasteful. Kept as *one stage*, not the whole.
3. **Layered funnel: cheap deterministic gates → LLM only on the human
   remainder → ICP floor → human-in-the-loop learning.** 9/10. Chosen. The
   two deterministic stages kill ~90% of noise for free; only ambiguous human
   mail reaches Haiku; corrections teach the tenant's own definition of a lead
   without a settings form.

## Layer check

- Layer 1 (tried & true): RFC machine-mail signals (`List-Unsubscribe`,
  `Precedence: bulk`, `Auto-Submitted`, role local-parts) — industry-standard,
  used by every MTA/ESP. These are **protocol facts**, not business word-lists,
  so they are legitimate deterministic signals (distinct from the
  no-hardcoded-matching rule, which targets semantic/business classification).
- Layer 3 (first principles): the decisive discriminator is **relationship
  direction** — do they buy from us, or do we buy from them? Resolved by LLM
  over the tenant's own ICP (matchIndustries pattern), never a keyword list.

## Completeness target

Funnel overall: 9/10. This spec ships **tranche 1** (deterministic gates +
warm-leads semantics) at 7/10 on its own; tranche 2 (LLM relationship
classifier + hard ICP floor) and tranche 3 (correction loop + UI + stock
backfill) lift it to 9.
