# INBOX-G11 — Autonomous triage rules tied to ICP / persona
> Theme: T7 · Autonomy rung: agent · Priority: P1
> Pillar: P5 GTM moat / P4 triage (cross)

## User story
As a founder, I want inbox triage rules that understand my ICP and personas — surface a reply from
a decision-maker at an in-ICP account, lane a vendor/recruiter aside, route by persona — each rule
on an autonomy dial with a visible "why", so the inbox prioritizes the mail that moves revenue
instead of treating every sender the same.

## Why (audit anchor)
Superhuman's Auto Labels classify by content/sender with no notion of *your* market — its "Pitch"
label is generic (`ai-feature-deep-dive.md` §"Auto Labels"; `findings.md` §H.2). We own the ICP +
persona definitions: `getIcpPersonTargeting` (`lib/icp/person-targeting.ts`) is the SSOT for who
fits, contacts already carry a persona + ICP-fit `score` (`db/schema/core.ts:174`), and the inbound
lead-classification verdict travels on each captured activity
(`metadata.leadClassification`, `lib/capture/email-capture.ts:374`). So our triage can say "réponse
d'un décideur dans votre ICP" *correctly* — the relevance Superhuman can't compute. Every rule rides
the INBOX-T11 autonomy dial (Suggest → Auto, audited, never auto-send).

## Requirements (EARS)
- The system SHALL let the user define triage rules keyed on GTM facts: ICP-fit (in/out), persona/
  seniority (decision-maker vs other), sender relationship (prospect vs vendor/recruiter from
  `leadClassification`), and account stage — resolving these from the existing SSOTs, never a
  hand-typed synonym list.
- WHEN inbound is captured, the system SHALL evaluate matching rules and, per the autonomy dial,
  either Suggest the action (lane/label/route, staged for one-click approval) or Auto-apply it
  (logged), and SHALL show the "why" (which GTM fact matched + confidence).
- The system SHALL ship a default rule set: surface in-ICP decision-maker replies to the top lane;
  lane recruiter/vendor mail aside; keep general/automated mail out of the priority lane.
- The system SHALL NEVER auto-send an email as part of a triage rule (send stays separate, per T11),
  and AI-prompt rules SHALL default to Suggest.
- The system SHALL resolve ICP/persona via `getIcpPersonTargeting` + the stored persona/score and
  the captured `leadClassification` — and SHALL degrade to general triage when those are absent
  (never guess ICP from the title with a regex).
- The system SHALL keep an auditable history per rule (matched fact, action, accept/undo) and let the
  user promote Suggest→Auto once a rule has a track record (reusing the T11 audit + promotion).
- The system SHALL be per-user/tenant scoped; rules and their audit SHALL never cross tenants, and
  ICP definitions read SHALL be the viewer-tenant's active ICP only.
- WHEN ICP/persona definitions change, the system SHALL re-evaluate forward-looking mail under the
  new definitions (not retro-rewrite history).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an in-ICP account's decision-maker replies WHEN captured THEN a rule surfaces it to the top
  lane with "why: décideur · compte dans l'ICP" (Suggest stages it; Auto applies + logs).
- GIVEN a recruiter email (`leadClassification` vendor/recruiter) WHEN captured THEN the rule lanes it
  aside, out of the priority lane.
- GIVEN an out-of-ICP cold pitch WHEN captured THEN it is NOT surfaced to the priority lane.
- GIVEN a new AI-prompt ICP rule WHEN created THEN it defaults to Suggest, never Auto.
- GIVEN any rule firing WHEN it acts THEN it never auto-sends an email.
- GIVEN a rule with a track record of accepted suggestions WHEN viewed THEN "Promote to Auto" is offered.
- GIVEN a contact with no persona/score and no classification WHEN captured THEN general triage
  applies, no fabricated ICP verdict.
- GIVEN two tenants WHEN rules run THEN ICP definitions, rules and audit are scoped per-tenant.

## Edge cases & failure handling
- ICP not configured (new tenant) → rules that need ICP are inert (no false in/out verdict); general
  lanes still work.
- Persona ambiguous / score null → treat as "unknown persona", do not assert decision-maker.
- `leadClassification` says prospect but ICP says out-of-fit → surface with the conflict noted, let
  the user decide (advisory).
- Conflicting rules (one surfaces, one lanes aside) → T11 conflict handling (record both; deterministic
  precedence; conflict surfaced).
- Role obsolete (role-status SSOT says "a quitté ce poste") → do not treat as a current decision-maker.
- High inbound volume → rule evaluation is bounded + indexed; Auto actions audited + paginated.
- Pilae anti-creep: rules must not silently widen the ICP — changing ICP is an explicit settings act.

## Best-in-class bar
- **ICP/persona-correct triage**: "réponse d'un décideur dans votre ICP" is *right* because it reads
  our own ICP SSOT + stored persona + the captured relationship verdict — Superhuman's labels can't
  know your market. The relevance is grounded, not guessed.
- **Trust-laddered**: every GTM rule rides the same audited Suggest→Auto dial as the rest of triage
  (T11), with a visible "why" and promotion by track record — autonomy earned with evidence.

## Design sketch
- **Data:** ICP via `lib/icp/person-targeting.ts#getIcpPersonTargeting` + active ICP profiles
  (`db/schema/icp.ts`); persona + ICP-fit `score` on `contacts` (`db/schema/core.ts:174`); relationship
  verdict on `activities.metadata.leadClassification` (`lib/capture/email-capture.ts:374`); rule config
  + audit reuse the T11 `inbox_filters.autonomy` + `inbox_rule_actions` tables (INBOX-T11 design).
- **API:** the rule engine calls the shared T11 seam `lib/inbox/autonomy.ts#applyOrSuggest`; a GTM
  predicate resolver `lib/inbox/icp-triage.ts#matchGtmRule(conversation, scope)` returns
  `{ matched, why, confidence }` from the SSOTs. Evaluated in the capture/enrich path (after
  `captureInboundEmail`) and on inbox read for already-captured mail.
- **UI:** GTM rule editor inside the INBOX-T02 filter UI with GTM predicate pickers (ICP-fit, persona/
  seniority, relationship, stage) — reuse `components/ui/*` pickers, no free-text synonym entry; the
  Suggest/Auto segmented control (`--color-accent` active) from T11; inline suggestion cards with the
  GTM "why" (lucide `Target` for ICP, `Briefcase` for persona — sober, no status-jewelry); a per-rule
  history. Light+dark via tokens, no emoji, no provider name, every action cited (the GTM fact) + undoable.
- **AI:** AI-prompt rules use the inbox classifier; the ICP/persona/relationship facts are resolved
  deterministically from the SSOTs (no new model for the GTM predicates). Respects zero-retention (P03)
  and never auto-sends.
- **Security/perf:** per-user/tenant scope; viewer-tenant ICP only; bounded evaluation; full audit.

## Tasks (ordered)
1. `lib/inbox/icp-triage.ts#matchGtmRule` resolving ICP-fit / persona / relationship / stage from
   `getIcpPersonTargeting` + stored persona/score + `leadClassification` (degrade to general when
   absent). (verify: in-ICP decision-maker matches; recruiter lanes aside; unknown → general) (test:
   `icp-triage.test.ts` — match matrix incl. ICP-unset + null-persona + role-obsolete)
2. Wire the resolver into the T11 `applyOrSuggest` seam in the capture/enrich path + inbox read.
   (verify: Suggest stages, Auto applies + audits the GTM fact) (test: autonomy-integration test)
3. Default GTM rule set (surface in-ICP decision-maker; lane vendor/recruiter; keep general out of
   priority). (verify: defaults present on a fresh tenant, inert when ICP unset) (test: defaults test)
4. GTM rule editor (predicate pickers, no synonym typing) + Suggest/Auto control + "why" cards +
   history/promotion (reuse T11). (verify: browser — in-ICP reply surfaces with "why"; new AI rule
   defaults Suggest; never auto-sends) (test: render + never-auto-send guard)

## Current-state notes (VERIFY before building — code moves)
- ICP SSOT: `lib/icp/person-targeting.ts#getIcpPersonTargeting` (`:35` returns `{ titles, seniorities,
  source }` from active ICP profiles' person criteria) — sourcing & scoring agree by construction.
  **Resolve ICP/persona through this; never a per-route regex** (`feedback_no-hardcoded-matching`).
- Persona + ICP-fit live on `contacts` (`score`/`scoreReasons` + persona via `lib/scoring/title-persona`),
  `db/schema/core.ts:174`. Relationship verdict on `activities.metadata.leadClassification`
  (deterministic-v1, `lib/capture/email-capture.ts:374`).
- Role obsolescence: role-status SSOT (`lib/contacts/role-status.ts`, role-freshness guardrail, MEMORY)
  — an obsolete role is not a current decision-maker.
- Autonomy dial + audit + promotion are INBOX-T11 (`lib/inbox/autonomy.ts`, `inbox_rule_actions`,
  `autonomy-promote.ts`). G11 is one of T11's named consumers; **reuse its seam, don't fork it.**
- Lanes engine exists: `lib/inbox/conversations.ts` (`attention/handled/snoozed/done`) — GTM rules
  feed lane placement, not a parallel lane system. INBOX-T01 (split inbox) + T02 (AI filters) host the
  rule UI.
- No ICP-aware triage resolver exists yet (grep: none for `icp-triage` under `lib/inbox`). Pilae
  anti-creep: rules must not widen the ICP implicitly (MEMORY).
