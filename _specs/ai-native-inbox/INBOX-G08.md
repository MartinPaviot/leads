# INBOX-G08 — Drafts grounded in the prospect's real context (composes with C01)
> Theme: T7 · Autonomy rung: helper · Priority: P0
> Pillar: P5 GTM moat / P3 writing (cross)

## User story
As a founder drafting a reply, I want the draft grounded in the prospect's REAL GTM context — their
deal stage, last interaction, fresh signals, role status, sequence reply classification — every
asserted fact carrying a citation, so the email is right because it's tied to our CRM, not guessed.

## Why (audit anchor)
This is the GTM half of the agentic compose. Superhuman's Ask AI joins **contacts + voice +
calendar** and drafts grounded in that (`findings.md` §I; `ai-feature-deep-dive.md` §"AI-assisted
REPLY"). We join the **whole GTM graph** — deal/signal/last-interaction/role — with a citation per
fact (`findings.md` §I "Superhuman joins contacts+voice+calendar; we join the whole GTM graph").
INBOX-C01 owns the agentic compose flow (voice match + tone match + Insert/Send + explanation); G08
is its **grounding context provider**: the cited GTM bundle the draft is built on. The two are one
feature — C01 the flow, G08 the moat-grade context — not two drafts.

## Requirements (EARS)
- The system SHALL provide a single grounding bundle `lib/inbox/draft-context.ts` that, given a
  `conversationKey` + scope, assembles the prospect's cited GTM context: contact + role status,
  company one-liner, most-relevant open deal + stage, last interaction + recent timeline, fresh
  signals — reusing the Call Mode brief, `last-interaction`, freshness, role-status and collision SSOTs.
- Every fact in the bundle SHALL carry a citation (source + timestamp / "via Elevay"); a fact that
  cannot be cited SHALL be omitted, never fabricated.
- The system SHALL freshness-gate signals (`isSignalFresh`) and role claims (role-status SSOT) before
  they enter the draft context — a stale signal or an unconfirmed role SHALL NOT be asserted as fact.
- WHEN the conversation is a classified sequence reply (INBOX-G07), the bundle SHALL include the
  classification + the deal so the draft answers the actual ask in stage-appropriate terms.
- The system SHALL feed this bundle to the C01 draft generator and SHALL ensure the returned draft
  exposes the citations + the "what I grounded on / what I omitted" explanation.
- The system SHALL NOT assert a price, a commitment, or any number not present in the CRM; such a gap
  SHALL render a `[à compléter]` placeholder and be named in the explanation.
- The system SHALL be fail-closed and fail-soft: a failed grounding step degrades to a thread-only
  draft (still useful), never to an invented fact, and never blocks the composer.
- The system SHALL hard-scope every lookup to the viewer's tenant + mailbox and honour the
  zero-retention AI option (INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a thread from a known prospect with a deal at `negotiation` and a fresh funding signal WHEN
  the draft is generated THEN the body references the deal stage + the funding (each cited) and
  answers their last message.
- GIVEN the prospect's role was sourced 6 months ago WHEN drafting THEN the draft does NOT assert
  their title as current (role-status SSOT); it stays neutral or uses "à confirmer".
- GIVEN a hiring signal older than its TTL WHEN drafting THEN it is excluded from the draft context.
- GIVEN a classified objection_price reply WHEN drafting THEN the bundle includes the classification
  and the draft addresses pricing in stage terms (composes with G05/G07).
- GIVEN a fact the model wants but the CRM lacks (e.g. a quote amount) WHEN drafting THEN a
  `[à compléter]` placeholder appears, never an invented figure, and the explanation lists it.
- GIVEN grounding fails (CRM lookup error) WHEN drafting THEN a thread-only draft is produced with an
  explanation that context was unavailable; the composer still opens.
- GIVEN two tenants WHEN drafts are grounded THEN no other-tenant deal/signal/contact enters the bundle.

## Edge cases & failure handling
- Unknown sender (no contact) → bundle is empty-but-flagged; draft answers the thread only and the
  explanation offers "Add to CRM" (INBOX-G02).
- Several open deals → ground in the most-relevant; explanation lists the rest (mirror G05).
- Citation target deleted after assembly → mark stale, never dangle (G01 rule).
- Long thread → summarize first (INBOX-S08) so the ask is captured before grounding.
- Bookings ≠ ARR: the draft must not imply ARR from a `proposal`-stage deal; copy stays neutral and
  any amount routes through `lib/deals/amount.ts` for display only.
- Zero-retention mode → bundle assembled in-request, nothing persisted; explanation notes it.

## Best-in-class bar
- **GTM-grounded with a citation per fact**: the draft is built on the deal/signal/last-interaction/
  role graph, not just contacts+calendar — the moat over Superhuman's compose. Each fact is
  auditable, so the founder trusts what they send (Lightfield cited-recall bar).
- **Freshness + role truth baked in**: the same SSOTs that keep scoring and calls honest keep the
  draft honest — no stale signal, no unconfirmed title ever enters the email.
- **One feature, two halves**: G08 (context) + C01 (flow) ship as a single grounded agentic compose,
  reusing the Call Mode brief rather than a parallel pipeline.

## Design sketch
- **Data:** contacts/companies/deals; `lib/accounts/last-interaction.ts` (timeline);
  `lib/signals/freshness.ts` (fresh signals); role-status SSOT (`lib/contacts/role-status.ts`);
  collision (`lib/collision/`); voice via `lib/writing-profile.ts` (owned by C01). Bundle cached in
  jsonb where the Call Mode brief already caches (`contacts.properties.brief`,
  `companies.properties.webBrief`).
- **API:** `lib/inbox/draft-context.ts#buildDraftContext(conversationKey, scope)` → cited bundle,
  composing the Call Mode brief assembler (`lib/call-mode/prospect-brief.ts#getProspectBrief`) +
  last-interaction + freshness-gated signals + role status + classification (G07). Consumed by the
  C01 route `POST /api/inbox/draft-reply`. (Same endpoint C01 defines — G08 supplies its context arg.)
- **UI:** no separate surface — the draft + citations + explanation render in the C01 inline compose
  card (`_conversation-pane.tsx`). G08's only visible footprint is richer, cited grounding inside that
  card (citation popovers reuse G01's). Light+dark via tokens, no emoji, no provider name, every
  asserted fact cited.
- **AI:** the generator is C01's (`anthropic("claude-sonnet-4-6")` via `tracedGenerateObject`); G08
  shapes the grounding context + enforces the citation/placeholder contract; `_trace.agentId="draft-reply"`.
- **Security/perf:** tenant+mailbox scope on every lookup; fail-closed grounding (omit uncitable);
  reuse cached brief to avoid re-spend; zero-retention honoured.

## Tasks (ordered)
1. `lib/inbox/draft-context.ts#buildDraftContext` composing Call Mode brief + last-interaction +
   freshness-gated signals + role status + G07 classification into a cited bundle. (verify: returns
   cited fields for a known contact; empty-but-flagged for unknown; stale signal/role excluded)
   (test: `draft-context.test.ts` — known/unknown/stale-signal/obsolete-role cases)
2. Wire the bundle into the C01 `POST /api/inbox/draft-reply` route as its grounding input. (verify:
   draft references cited deal+signal on a known thread) (test: route test asserts citations present)
3. Enforce the no-fabrication contract: uncitable fact → `[à compléter]` placeholder + explanation
   entry. (verify: missing price → placeholder, never a number) (test: prompt-contract unit)
4. Fail-soft + scope + zero-retention. (verify: grounding error → thread-only draft; cross-tenant key
   blocked; P03 on → nothing persisted) (test: degrade + scope + retention cases)

## Current-state notes (VERIFY before building — code moves)
- INBOX-C01 (`INBOX-C01.md`) owns the agentic compose flow and already proposes
  `lib/inbox/draft-context.ts` + `POST /api/inbox/draft-reply`; G08 is the GTM-grounding spec for that
  same context module — **build them together, not as two endpoints.**
- Call Mode brief is the reusable cited assembler: `lib/call-mode/prospect-brief.ts#getProspectBrief`
  (`:177`, in-flight dedupe `:175`, jsonb cache, fail-closed `validateBriefTexts`). **Reuse.**
- Freshness SSOT `lib/signals/freshness.ts` (`isSignalFresh` :80, `filterFreshSignals` :100);
  last-interaction SSOT `lib/accounts/last-interaction.ts` (`:36`); role-status SSOT
  `lib/contacts/role-status.ts` (per role-freshness guardrail, MEMORY); collision `lib/collision/`.
- Deal amount display only via `lib/deals/amount.ts#getDealAmountDisplay` (deal-split rule,
  `db/schema/core.ts:208`).
- G07 supplies the reply classification + enrollment/deal link; G05 supplies the stage→action framing.
- No `lib/inbox/draft-context.ts` exists yet (grep: none) — net-new, shared by C01 + G08.
