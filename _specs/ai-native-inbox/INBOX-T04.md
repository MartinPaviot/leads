# INBOX-T04 — AI importance / priority score
> Theme: T2 · Autonomy rung: helper · Priority: P1
> Pillar: P4 triage / P2 reading

## User story
As a user, I want each conversation ranked by how much it actually needs me — buying signal,
deal stage, urgency, sender importance — so the attention lane is sorted by what moves revenue,
not just by arrival time.

## Why (audit anchor)
"Importance/priority score" is a core reading capability across the field
(`ai-native-mailbox-audit.md` §2). We already have a **deterministic 1–4 priority bucket**
derived from persisted labels (`PRIORITY_BY_LABEL`, `conversations.ts:93`, sort at `:372`) and a
priority dot in the list (`_conversation-list.tsx:34`). T04 **extends** that bucket into a richer,
explainable importance score grounded in our GTM graph — the moat angle: importance = *revenue
relevance*, not generic VIP guessing.

## Requirements (EARS)
- The system SHALL compute an importance score per conversation from explainable inputs: reply
  intent/label (existing `PRIORITY_BY_LABEL`), open-deal stage, signal freshness, sender
  role/seniority, urgency/sentiment (existing `intelligence.urgencyLevel`/`sentimentTrend`), and
  recency.
- The system SHALL keep the existing 1–4 bucket as the coarse tier and add a finer ordering
  within a tier (stable, deterministic).
- The system SHALL attach a "why this is high/low" rationale listing the top contributing factors
  with their source, for the tooltip and audit.
- The system SHALL NOT inflate importance from a stale signal — signals past their TTL
  (`lib/signals/freshness.ts`) SHALL NOT contribute.
- The system SHALL down-rank automated/bulk senders to the bottom (consistent with
  `inboundIsAutomated → handled`), never surfacing them as high importance.
- The system SHALL compute the score from already-persisted labels/intel (no per-render LLM call);
  any LLM contribution SHALL be cached at enrich time.
- The system SHALL sort the attention lane by importance (tier then finer score then recency),
  preserving the current tie-break on freshest inbound (`sortConversations`).
- The system SHALL respect per-user/tenant scope.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a reply "can we book a demo?" from a contact with an open deal at proposal stage WHEN
  ranked THEN it sits at the top of attention with a rationale citing intent + deal stage.
- GIVEN a generic "thanks" reply with no deal WHEN ranked THEN it sits below the demo request.
- GIVEN a conversation whose only boost was a signal now past its TTL WHEN ranked THEN that signal
  no longer raises its score (and the rationale omits it).
- GIVEN an automated newsletter WHEN ranked THEN it is not high importance (stays handled/bottom).
- GIVEN two conversations in the same 1–4 bucket WHEN listed THEN the finer score orders them
  deterministically, then recency breaks remaining ties.
- GIVEN any conversation WHEN the importance rationale is requested THEN it lists the top factors
  with sources, never an opaque number alone.
- GIVEN two tenants WHEN scores compute THEN no cross-tenant data contributes.

## Edge cases & failure handling
- No labels/intel yet (fresh inbound, pre-enrich) → fall back to the neutral bucket + recency,
  never block the list.
- Deal lookup slow/missing → score from available factors; rationale notes "no open deal".
- Conflicting signals (positive intent + declining sentiment) → both shown in rationale; tier
  reflects the dominant.
- Score thrash (recompute changes order while reading) → recompute on enrich, not per keystroke;
  list order stable within a load.
- Multi-tenant: factor inputs are all tenant-scoped reads.
- Backfill: existing rows keep the 1–4 bucket; finer score fills in lazily.

## Best-in-class bar
- Importance = **revenue relevance** (deal stage + fresh signal + buyer seniority), each **cited**
  and **freshness-gated** — Superhuman/Shortwave rank on generic VIP/recency because they have no
  pipeline. Ours explains *why* and is right because it reads our own deal + signal graph.
- It **reuses** the existing deterministic bucket + signal-freshness SSOT, so it's auditable and
  cheap, not a black-box ML score.

## Design sketch
- **Data:** inputs from `activities.intent`/`sentiment`, `metadata.threadIntelligence`
  (`urgencyLevel`, `sentimentTrend`), open deals, signals (+ `lib/signals/freshness.ts`),
  seniority via `lib/ui/title-style.ts` tiers / role-status SSOT. Cache the computed score +
  rationale on the conversation (e.g. `metadata.importance {score, tier, factors[]}`), written in
  the enrich pass.
- **API:** `lib/inbox/importance.ts` pure scorer `score(inputs) → {score, tier, factors[]}`,
  consumed by `buildConversations` (`conversations.ts`) to replace/augment `priority` and feed
  `sortConversations`. No new endpoint; the existing `/api/inbox/conversations` returns it.
- **UI:** the existing priority dot (`_conversation-list.tsx:34` `priorityDot`) keeps the coarse
  color; add a small importance affordance + a "why" tooltip on hover (token text
  `--color-text-tertiary`, lucide `Flame`/`ArrowUp` only as a sober glyph, no medals per
  no-status-jewelry). Reading-pane header (`_conversation-pane.tsx:279`) shows the rationale next
  to the existing urgency badge. Light+dark via tokens, no emoji, no provider name, cited.
- **AI:** optional LLM nuance (e.g. "is this a buying question?") only if not already in `intent`,
  cached at enrich; default is the deterministic blend. Zero-retention option (T11).
- **Security/perf:** all inputs tenant-scoped; score cached; deterministic + stable sort.

## Tasks (ordered)
1. `lib/inbox/importance.ts` pure scorer with explainable `factors[]`. (verify: unit) (test:
   `importance.test.ts` — deal+intent ranks high, stale signal excluded, automated bottom)
2. Feed importance into `buildConversations` + `sortConversations` (keep current tie-break).
   (verify: ordering test) (test: conversations.test.ts ordering)
3. Cache score + rationale at enrich (`inngest/sync-functions.ts`). (verify: cached on row)
   (test: enrich test)
4. List "why" tooltip + reading-pane rationale. (verify: browser — top item explains itself)
   (test: render)
5. Confirm freshness gating + automated down-rank. (verify: stale-signal item drops) (test:
   freshness integration)

## Current-state notes (VERIFY before building)
- Deterministic priority already exists: `conversations.ts:93` `PRIORITY_BY_LABEL`, `:282`
  `priority`, `:372` `sortConversations`; list dot `_conversation-list.tsx:34` `priorityDot`.
- Thread intelligence (`urgencyLevel`, `sentimentTrend`) already persisted + rendered
  (`_conversation-pane.tsx:279-286`, `_types.ts:47` `ThreadIntelligenceView`).
- Signal freshness SSOT: `lib/signals/freshness.ts` (use `isSignalFresh`/`filterFreshSignals`).
- Seniority tiers: `lib/ui/title-style.ts`; role freshness via role-status SSOT.
- No standalone importance scorer exists yet.
