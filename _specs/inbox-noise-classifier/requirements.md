# B4 — inbox-noise-classifier · Requirements (EARS)

> Noise auto-demotion: push cold/automated/newsletter mail OUT of the attention
> lane into a low-priority **Noise** lane WITHOUT deleting it, with a one-click
> **"not noise"** override that learns + un-demotes, and OPTIONAL Gmail-filter
> persistence so the demotion survives at the provider.
>
> **Reuse-first, no migration.** Composes signals buildConversations already
> computes (inboundIsAutomated, isBulk, replyWorthy, importance,
> resolveGeneralIntent); the not-noise override persists in the existing
> user_preferences JSONB store (resource "inbox"), exactly like lanes/filters.
>
> Cardinal sin: demoting a reply-worthy human thread. The classifier is
> recall-biased AWAY from demoting real human mail — it mirrors reply-worthy.ts.

Tags: [DONE] shipped · [NEW] real gap · [CFG] tenant config ·
[LOCKED] stack decision · [HORS SCOPE] tracked elsewhere.

---

## Ground-truth inventory (verified 2026-06-19, worktree agent-a64e5014ce08a19ab)

| Signal / mechanism | State | Evidence |
|---|---|---|
| inboundIsAutomated (isMachineSent) per conversation | [DONE] | src/lib/inbox/conversations.ts:300-302 |
| isBulk per conversation (= inboundIsAutomated, surfaced) | [DONE] | conversations.ts:454,479 |
| replyWorthy per conversation (recall-biased) | [DONE] | conversations.ts:447-455, src/lib/inbox/reply-worthy.ts |
| importance.{score,tier,factors} (automated -> tier 4, score 0) | [DONE] | src/lib/inbox/importance.ts:52-54, conversations.ts:430-442 |
| resolveGeneralIntent (promotion_newsletter / notification / automated_no_reply / receipt_confirmation) | [DONE] | src/lib/inbox/general-intent.ts:13-46 |
| Machine senders already routed to handled lane | [DONE] | conversations.ts:306-312 |
| Bulk-but-not-machine human mail STILL lands in attention | gap ([NEW] target) | conversations.ts:317-318 — no demotion path for it |
| user_preferences JSONB store, resource "inbox", no migration | [DONE] | src/db/schema/auth.ts:141-164, src/lib/inbox/lane-store.ts, filter-store.ts |
| Newsletter/promo bundling (collapse, not demote) | [DONE] | src/lib/inbox/bundle.ts, conversations/route.ts:146-163 |
| classifyNoise resolver | absent [NEW] | grep: only bundle.ts + reply-worthy.ts |
| Eval gate pattern (replyWorthyPR, inbox-reply-worthy-gate.test.ts, eval:run) | [DONE] | src/lib/evals/inbox-metrics.ts, src/__tests__/inbox-reply-worthy-gate.test.ts, package.json eval:run |
| C1 thresholds: false_demote_rate <= 0.02, noise.precision >= 0.90 | [LOCKED] | _specs/inbox-quality-evals/design.md:57-58,116 |
| Gmail OAuth scope granted = gmail.readonly only | [DONE] (constraint) | src/auth.ts:247 |
| Gmail filter creation scope (gmail.settings.basic / gmail.modify) | NOT granted [HORS SCOPE] | src/auth.ts:246-247 — readonly only |
| Splits routes/tabs UI (B3) | [HORS SCOPE] | _specs/inbox-splits/ (dep) |

**Net new code = ONE pure resolver + ONE override store + a read-model wire-in +
ONE eval surface + ONE optional best-effort Gmail-filter shim.** No migration.

---

## R1 — classifyNoise pure resolver ([NEW])

- **R1.1** THE SYSTEM SHALL expose a pure function
  classifyNoise(input): { noise: boolean; reasons: string[] } that composes ONLY
  already-computed signals (isMachineSent, isBulk, generalIntent, replyWorthy,
  importanceTier, hasPriorHumanReply) — no DB, no network, no LLM, no ambient
  clock — deterministic, mirroring reply-worthy.ts purity.
- **R1.2** GIVEN the conversation is replyWorthy === true AND isMachineSent ===
  false, THEN THE SYSTEM SHALL return noise: false (the cardinal-sin guard wins
  over every demotion signal).
- **R1.3** GIVEN hasPriorHumanReply === true (the user has already replied to this
  thread, or a prior 1:1 human relationship exists), THEN THE SYSTEM SHALL return
  noise: false regardless of other signals.
- **R1.4** WHERE isMachineSent === true, THE SYSTEM SHALL return noise: true with
  reason "machine-sent sender".
- **R1.5** WHERE generalIntent is one of promotion_newsletter, notification,
  automated_no_reply, receipt_confirmation (the no-reply family) AND R1.2/R1.3
  did not fire, THE SYSTEM SHALL return noise: true with the intent named in
  reasons.
- **R1.6** WHERE isBulk === true AND replyWorthy === false AND R1.2/R1.3 did not
  fire, THE SYSTEM SHALL return noise: true with reason "bulk/marketing mail".
- **R1.7** WHERE importanceTier === 4 (the importance floor) AND replyWorthy ===
  false AND the thread is cold (hasPriorHumanReply === false) AND R1.2/R1.3 did
  not fire, THE SYSTEM SHALL return noise: true with reason "low importance + cold".
- **R1.8** GIVEN none of R1.4-R1.7 fired, THE SYSTEM SHALL return noise: false
  with reason "default human mail (recall bias)" (default-keep, mirroring
  reply-worthy.ts:121-126).
- **R1.9** THE SYSTEM SHALL populate reasons with product-language strings for
  every contributing signal so the demotion is explainable in the UI tooltip and
  the audit trail (no opaque verdict).
- **R1.10** THE SYSTEM SHALL NOT introduce any new sender-classification, intent
  enum, or importance scale — it consumes the existing taxonomies verbatim
  (general-intent.ts GENERAL_INTENTS, importance.ts tiers).

**Edge cases (R1):**
- bulk-flagged BUT replyWorthy (a human reply on a list address) -> kept (R1.2 > R1.6).
- importanceTier === 4 but replyWorthy (no classified intent, recall default) -> kept (R1.2).
- generalIntent null/unknown, not bulk, not machine, not tier-4-cold -> kept (R1.8).
- security_account / invoice_billing OTP (time-sensitive) -> NOT in R1.5 no-reply
  set for noise (kept): a time-sensitive code must never be demoted. Noise no-reply
  set is the FOUR named families only, narrower than reply-worthy six, by design.

---

## R2 — Noise auto-demotion in the read model ([NEW])

- **R2.1** WHEN buildConversations assembles a conversation that classifyNoise
  marks noise: true, THE SYSTEM SHALL set a noise: boolean field on the
  Conversation and floor its importanceTier to 4 / importanceScore to 0 so the
  attention lane sorts it to the bottom.
- **R2.2** THE SYSTEM SHALL remove a noisy conversation from the attention lane
  and surface it in a dedicated Noise lane WITHOUT deleting any row, changing
  triage state, or mutating the provider (read-time only).
- **R2.3** WHERE the conversation already routes to handled (machine-sent) by the
  existing rule (conversations.ts:306-312), THE SYSTEM SHALL keep that routing and
  additionally tag noise: true (handled is a superset; noise adds the bulk-human
  cohort handled does not catch).
- **R2.4** THE SYSTEM SHALL expose a noise count alongside the existing lane
  counts so a "Noise (N)" chip can render (composes with B3 count chips).
- **R2.5** THE SYSTEM SHALL keep noisy conversations fully retrievable via search
  (?q=) across all lanes — demotion never hides mail from search
  (conversations/route.ts:108-129).
- **R2.6** THE SYSTEM SHALL NOT mark a conversation done or snoozed as a side
  effect of noise demotion — those triage verbs stay user-driven
  (api/inbox/triage/route.ts).

**Edge cases (R2):**
- a noisy thread that later gets a genuine human reply (new inbound flips
  replyWorthy/hasPriorHumanReply) -> R1.2/R1.3 re-promote it on the next read
  (the model is recomputed every read, like reopen-on-new-inbound).
- a conversation matching a user custom Split (B3) AND noisy -> it appears in its
  Split (B3 owns that) and is excluded from attention; the two compose without
  conflict.

---

## R3 — "Not noise" feedback override ([NEW], owner-scoped, no migration)

- **R3.1** WHEN the user clicks "Not noise" on a conversation, THE SYSTEM SHALL
  persist an owner-scoped override keyed by sender (and optionally thread key) in
  user_preferences (resource "inbox", key "noiseOverrides"), mirroring
  lane-store.ts / filter-store.ts — NO migration.
- **R3.2** GIVEN a stored not-noise override matches a conversation sender or
  thread key, THE SYSTEM SHALL force classifyNoise to noise: false for that
  conversation on every future read (the override WINS over all demotion signals).
- **R3.3** WHEN a not-noise override is applied, THE SYSTEM SHALL restore the
  conversation to the attention lane and recompute its real importance (no longer
  floored).
- **R3.4** THE SYSTEM SHALL scope every override read/write to the signed-in
  userId (the inbox is personal), never the tenant.
- **R3.5** THE SYSTEM SHALL be idempotent: re-marking an already-overridden sender
  SHALL NOT duplicate entries (dedupe by sender, latest wins — mirror
  filter-match.ts foldExamples).
- **R3.6** THE SYSTEM SHALL expose an undo — removing the override re-subjects the
  sender to classifyNoise.
- **R3.7** THE SYSTEM SHALL bound the override list (cap, e.g. 1000 senders) so a
  pathological store can never exceed the JSONB row practical size.

**Edge cases (R3):**
- override on a sender whose mail is genuinely machine-sent (noreply@) -> the
  override still wins (R3.2 is absolute); the user explicitly asked to see it.
- a not-noise sender whose later mail is replyWorthy anyway -> still kept (no
  double-demotion); override + R1.2 agree.
- corrupt/non-array stored value -> degrade to empty (no override), like
  lane-store.ts:34 / filter-store.ts:26.

---

## R4 — OPTIONAL Gmail-filter persistence ([NEW], best-effort, scope-gated)

- **R4.1** WHERE the conversation mailbox is a Gmail OAuth box
  (connected_mailboxes.provider === "gmail") AND the granted OAuth scope includes
  a filter-write capability, THE SYSTEM SHALL OFFER to persist the demotion as a
  provider-side Gmail filter (skip-inbox / apply-label) so the demotion holds
  server-side.
- **R4.2** IF the required Gmail scope (gmail.settings.basic or gmail.modify) is
  NOT granted, THEN THE SYSTEM SHALL no-op gracefully — return a typed
  { persisted: false, reason: "scope_not_granted" } and surface a one-line
  "connect with manage-filters permission to make this stick in Gmail" affordance,
  NEVER throwing and NEVER blocking the in-app demotion (R2 still applies).
- **R4.3** WHERE the mailbox is not Gmail (outlook / smtp_custom), THE SYSTEM SHALL
  no-op with { persisted: false, reason: "provider_unsupported" }.
- **R4.4** WHEN a Gmail filter IS created, THE SYSTEM SHALL record its provider
  filter id in the override entry so it can be removed when the user clicks "not
  noise" (un-demote also deletes the provider filter, best-effort).
- **R4.5** THE SYSTEM SHALL treat provider-filter persistence as a pure
  enhancement: in-app noise demotion (R2) and the not-noise override (R3) are the
  source of truth and function with zero provider involvement.

**Constraint (verified):** src/auth.ts:247 requests only
https://www.googleapis.com/auth/gmail.readonly. Creating filters via
gmail.users.settings.filters.create requires gmail.settings.basic. **Today R4
ALWAYS resolves to R4.2 (scope_not_granted)** until an incremental-auth
re-consent adds the scope — that scope upgrade is [HORS SCOPE] for B4 (tracked
under mailbox-connect / A-track). B4 ships the shim + the graceful no-op + the
gated affordance, so the capability lights up the moment the scope is granted.

---

## R5 — Determinism + the C1 / G-eval gate ([NEW])

- **R5.1** THE SYSTEM SHALL ship a hand-labeled golden suite
  inbox-noise.golden.jsonl (>= 40 cases, balanced, unique ids, taxonomy-valid),
  loaded + integrity-checked like inbox-reply-worthy.golden.jsonl.
- **R5.2** THE SYSTEM SHALL compute false_demote_rate = (reply-worthy/human items
  wrongly marked noise) / (all genuinely keep-worthy items) via a pure
  falseDemoteRate helper added to src/lib/evals/inbox-metrics.ts.
- **R5.3** THE SYSTEM SHALL gate false_demote_rate <= 0.02 (the cardinal-sin bar)
  and noise.precision >= 0.90 in a Vitest gate test
  src/__tests__/inbox-noise-gate.test.ts, mirroring inbox-reply-worthy-gate.test.ts.
- **R5.4** THE SYSTEM SHALL wire that gate test into pnpm eval:run (package.json
  eval:run script) so CI fails non-zero on any breach, with NO ANTHROPIC_API_KEY
  required (deterministic offline floor).
- **R5.5** THE SYSTEM SHALL print a report card (support, precision,
  false_demote_rate, the named misses) so a regression is debuggable from the log.
- **R5.6** THE SYSTEM SHALL hard-fail the suite (named, not just an aggregate)
  when ANY reply-worthy/human case is demoted (false_demote is the cardinal sin),
  mirroring inbox-reply-worthy-gate.test.ts:107-110.

---

## R6 — UI affordances ([NEW], gated by G-design)

- **R6.1** THE SYSTEM SHALL render a Noise lane/chip with its count, reusing the
  LaneChip + CountBadge components (F1 _lane-chip.tsx), not a hand-rolled tab.
- **R6.2** THE SYSTEM SHALL render a one-click "Not noise" action on a demoted row
  using the shared Button / quick-action affordance (no hand-rolled button).
- **R6.3** WHERE a row is demoted, THE SYSTEM SHALL show a "why" tooltip from
  classifyNoise reasons (honest-badge pattern, like reasonTooltip in
  _types.ts:98-113).
- **R6.4** THE SYSTEM SHALL pass the F1 12-item G-design checklist
  (_specs/inbox-design-system/design.md section 8) for every noise surface,
  recorded as a one-line PASS/FAIL per item in tasks.md.

---

## Non-goals (THE SYSTEM SHALL NOT)

- **NG-1** THE SYSTEM SHALL NOT build the Splits routes/tabs UI — B3
  (inbox-splits) owns the /inbox/<split> routes + count chips. B4 only supplies
  the noise flag + count they consume.
- **NG-2** THE SYSTEM SHALL NOT touch the draft engine (B1) or writing style (B2).
- **NG-3** THE SYSTEM SHALL NOT delete, archive at the provider, or otherwise
  destroy mail — demotion is reversible and in-app by default.
- **NG-4** THE SYSTEM SHALL NOT implement full provider two-way sync (A4) — the
  Gmail filter is a one-way best-effort persistence, not a sync engine.
- **NG-5** THE SYSTEM SHALL NOT add a Drizzle migration — the override reuses
  user_preferences JSONB, the signals are already computed.
- **NG-6** THE SYSTEM SHALL NOT add a new LLM call — classifyNoise is pure and
  composes existing labels (the LLM already ran upstream to produce intent).
- **NG-7** THE SYSTEM SHALL NOT introduce a new sender list, vendor allowlist, or
  hardcoded domain map (honours feedback_no-hardcoded-matching).
