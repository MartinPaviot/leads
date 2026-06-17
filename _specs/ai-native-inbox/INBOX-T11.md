# INBOX-T11 — Per-rule autonomy dial (suggest → auto)
> Theme: T2 · Autonomy rung: agent · Priority: P1
> Pillar: P4 triage / cross (trust)

## User story
As a user, I want every automated inbox rule to have an autonomy setting — suggest, or act
automatically — with a visible "why" and an audit trail, so I can let the inbox act on its own
where I trust it and keep a human gate where I don't, escalating as trust grows.

## Why (audit anchor)
The audit names this the **single most important axis**: every AI-email capability sits on a
ladder (passive filter → helper → proactive → autonomous agent), and the **design rule** is to
ship every AI feature with an **explicit autonomy dial + a visible "why"** so the user can audit
and escalate trust — the human-in-the-loop spine Lightfield is built on
(`ai-native-mailbox-audit.md` §1). T11 is that dial, applied uniformly across the triage rules
(INBOX-T02 filters, INBOX-T06 nudges, INBOX-T10 auto-archive) and the GTM rules (INBOX-G11).

## Requirements (EARS)
- The system SHALL give every automated rule (AI filter/label, auto-archive, no-reply nudge,
  ICP/persona triage) an autonomy setting with at least two rungs: **Suggest** (stage the action
  for one-click approval) and **Auto** (perform it, logged).
- WHEN a rule is on **Suggest**, the system SHALL surface the proposed action inline with a "why"
  and a one-click Approve / Dismiss, and SHALL NOT mutate state until approved.
- WHEN a rule is on **Auto**, the system SHALL perform the action and record an audit entry
  (rule, conversation, action, rationale, timestamp, actor = "rule").
- The system SHALL show, for any rule-driven change, the "why" (the matched clause or the AI
  rationale + confidence) and let the user **undo** it.
- The system SHALL default new AI-prompt rules to **Suggest** (earn trust before acting); purely
  deterministic rules MAY default to Auto.
- The system SHALL let the user promote a rule Suggest→Auto (and demote) at any time, and SHALL
  offer to promote a rule once it has a track record of accepted suggestions.
- The system SHALL keep an auditable history of automatic actions per rule (what it did, and the
  acceptance/undo rate), viewable by the user.
- The system SHALL NEVER auto-**send** an email as part of a triage rule (send stays human or an
  explicit, separately-gated capability), consistent with "autonomous send is rare/gated".
- The autonomy dial SHALL be per-user/tenant and per-rule (not one global switch).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an AI label rule on **Suggest** WHEN a match arrives THEN the label is proposed inline with
  a "why" + Approve/Dismiss, and nothing is applied until Approve.
- GIVEN the same rule on **Auto** WHEN a match arrives THEN the label is applied and an audit entry
  is recorded with the rationale.
- GIVEN any rule-applied change WHEN the user clicks Undo THEN the change is reverted and the undo
  is logged.
- GIVEN a new AI-prompt rule WHEN created THEN it defaults to Suggest.
- GIVEN a rule with 20 accepted suggestions and 0 dismissals WHEN viewed THEN the system offers
  "Promote to Auto".
- GIVEN any triage rule WHEN it runs THEN it never auto-sends an email.
- GIVEN a rule's history WHEN opened THEN it shows actions taken + acceptance/undo rate.
- GIVEN two tenants WHEN rules act THEN audit + actions are scoped to the owner.

## Edge cases & failure handling
- Low-confidence AI match on an Auto rule → still acts (user chose Auto) BUT the audit flags low
  confidence; optionally a per-rule confidence floor demotes borderline matches to Suggest.
- Conflicting rules (one Suggests a label, another Auto-archives) → record both; archive placement
  wins; conflicts surfaced.
- Undo after downstream effects (e.g. auto-archived then user replied) → undo restores placement;
  never loses the reply.
- Rule deleted with pending suggestions → pending suggestions are dropped (not auto-applied).
- Audit volume large → paginated; retained per the data-handling policy (INBOX-P03).
- Multi-tenant/per-user: dial + audit hard-scoped to the owner.

## Best-in-class bar
- A **uniform, per-rule** dial with a visible "why" and an **audit + acceptance-rate-driven
  promotion** — the inbox earns autonomy with evidence, the Lightfield human-in-the-loop spine made
  concrete. Superhuman's automations are mostly on/off with no audited trust ladder.
- A hard **"never auto-send"** guarantee at the triage layer keeps the agent trustworthy; sending
  is always a separate, explicit decision.

## Design sketch
- **Data:** an `autonomy` field on each rule (`inbox_filters.autonomy`, INBOX-T02; archive rules,
  INBOX-T10; nudge config, INBOX-T06) = `suggest|auto`. A shared `inbox_rule_actions` audit table
  (per-user): `id, tenant_id, user_id, rule_id, conversation_key, action, rationale, confidence,
  taken_at, outcome(applied|approved|dismissed|undone)`. Suggestions staged on the conversation
  (`metadata.suggestions[]`).
- **API:** a shared `lib/inbox/autonomy.ts` `applyOrSuggest({rule, action, why, confidence})` that
  every rule engine calls: Auto → perform + audit; Suggest → stage + audit(`applied:false`).
  `POST /api/inbox/suggestions/:id/{approve|dismiss}` + `POST /api/inbox/rule-actions/:id/undo`.
  A promotion check `lib/inbox/autonomy-promote.ts` (acceptance-rate threshold).
- **UI:** an autonomy toggle on every rule editor (Suggest/Auto segmented control, `--color-accent`
  active); inline suggestion cards in the reading pane + list ("Apply label 'Pricing'? · why ·
  Approve/Dismiss", token `--color-accent-soft`, lucide `Sparkles` + `Check`/`X`); a per-rule
  history view (acceptance rate, recent actions) in settings; a global "Autonomy" hub (INBOX-O06)
  listing all rules + their rung. Confidence via `components/ai-ui/confidence-state`. Light+dark via
  tokens, no emoji, no provider name, every action cited + undoable.
- **AI:** no new model — it governs the *autonomy* of the rules in T02/T06/T10/G11; respects the
  zero-retention option (INBOX-P03).
- **Security/perf:** never auto-send; per-rule + owner scope; full audit; promotion gated by track
  record.

## Tasks (ordered)
1. `lib/inbox/autonomy.ts` `applyOrSuggest` shared seam + `inbox_rule_actions` audit table (per-user).
   (verify: Auto performs+audits, Suggest stages) (test: `autonomy.test.ts`)
2. `autonomy` field on rule configs (T02 filters, T10 archive, T06 nudges) + Suggest default for AI
   rules. (verify: new AI rule defaults Suggest) (test: default test)
3. Suggestion approve/dismiss + undo endpoints. (verify: approve applies, undo reverts) (test: route)
4. Inline suggestion cards (list + pane) with "why" + confidence. (verify: browser — suggested label
   with Approve/Dismiss) (test: render)
5. Per-rule history + acceptance-rate promotion offer (`autonomy-promote.ts`). (verify: 20-accepted
   rule offers Promote) (test: promote threshold)
6. Enforce "never auto-send" at the triage layer + global Autonomy hub (INBOX-O06). (verify: no rule
   can send) (test: guard test)

## Current-state notes (VERIFY before building)
- The autonomy spectrum is the audit's central thesis: `ai-native-mailbox-audit.md` §1 ("ship every
  AI feature with an explicit autonomy dial + a visible 'why'").
- No rule/autonomy/audit infrastructure exists yet (grep: none for `inbox_rule|autonomy`).
- This is the spine referenced by INBOX-T02 (filters), INBOX-T06 (nudges), INBOX-T10 (auto-archive),
  INBOX-G11 (ICP/persona triage) and surfaced in INBOX-O06 (autonomy settings hub).
- Existing approval/human-in-the-loop precedent to mirror: capture-approval mode
  (`recordCapturedActivity` auto-insert vs queue-for-review, `_CODEBASE-NOTES.md`) — the same
  suggest/auto pattern already lives in the capture pipeline.
- Confidence UI primitive exists: `components/ai-ui/confidence-state` (Verified/Likely/Inferred).
