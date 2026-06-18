# INBOX-C09 — Follow-up generator (sequence-aware)
> Theme: T4 · Autonomy rung: proactive · Priority: P0
> Pillar: P3 writing / P5 GTM moat (cross)

## User story
As a founder running outbound, I want a follow-up draft generated for a prospect who went quiet —
one that knows what I already sent, where the deal stands and the sequence state — so I nudge with
a fresh angle instead of "just bumping this up".

## Why (audit anchor)
A **follow-up generator** is in the master writing taxonomy (`audit.md` §2 Writing), and Superhuman
folds follow-ups into "Remind me / if-no-reply" (`findings.md` §B: the reminder fires only if there's
no reply). OUR edge is decisive here: we **own the outbound/sequence graph** (`outbound_emails`,
`sequence_enrollments`, `lib/sequences/*`), so a follow-up can reference exactly what was sent and at
what step, advance the deal, and respect signal freshness — competitors can only BCC a CRM
(`ai-feature-deep-dive.md` §"OUR MOAT"). The follow-up is staged as a draft via the existing contract.

## Requirements (EARS)
- WHEN a sent thread has had no reply for the configured window (or a sequence step is due), the system
  SHALL be able to generate a follow-up draft for that contact.
- The follow-up SHALL be grounded in the prior messages (what was already said) and the deal context
  (stage, signals, last interaction), with citations, and SHALL bring a NEW angle — never restate the
  prior email or send a contentless "bump".
- WHEN the contact is enrolled in a sequence, the follow-up SHALL be sequence-aware: it SHALL align to
  the next step and SHALL NOT duplicate a queued sequence send (read enrollment from `detail/route.ts:40-68`).
- The system SHALL stage the follow-up as a non-sending `outbound_emails` draft (status='draft'),
  consumable via `/api/inbox/drafts/[id]/consume`, and SHALL NOT auto-send (approval required).
- The follow-up SHALL respect signal freshness (`lib/signals/freshness.ts`): a stale signal SHALL NOT
  be used as the hook.
- The system SHALL show WHY a follow-up is suggested ("5 days no reply since your pricing email") so it
  is auditable, and SHALL be governed by the autonomy dial (INBOX-T11/O06: off / suggest / auto-stage).
- The system SHALL be tenant/user-scoped, rate-limited, and honour zero-retention (INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a sent email with no reply for the window WHEN a follow-up is generated THEN the draft
  references the prior email's topic, adds a new angle, and ends with a concrete next step — staged, unsent.
- GIVEN the contact is enrolled in a sequence with a step due WHEN generating THEN the follow-up aligns
  to that step and does not create a duplicate of the queued send.
- GIVEN the only available hook is a signal older than its TTL WHEN generating THEN that signal is not
  used; the follow-up falls back to a value/recap angle.
- GIVEN the prospect replied after the last send WHEN evaluating THEN NO follow-up is generated
  (no-reply condition false) — mirrors Superhuman's "if no reply" gate.
- GIVEN the user opens the thread THEN the staged follow-up pre-fills the composer (existing
  `preparedDraft` path) and on send is consumed.
- GIVEN auto-stage is off for the lane/persona WHEN the window elapses THEN no draft is staged (suggest-only).

## Edge cases & failure handling
- Multiple prior sends → reference the most recent relevant one; don't recap the whole history.
- Collision: a teammate already followed up (INBOX-G06) → suppress, show the collision notice.
- Bounced/unsubscribed/OOO prior thread → no follow-up (respect handled lanes; honour suppression).
- Deal closed-won/lost → no sales follow-up; offer a relationship note instead (or nothing).
- Sequence completed/stopped → a follow-up is allowed but must not re-enroll silently.
- Zero-retention → flag-only ("follow-up suggested"), generate on open, persist nothing.
- Multi-tenant: enrollment/outbound strictly within the viewer's tenant/user scope.

## Best-in-class bar
- The follow-up references **exactly what was sent and the sequence step** because we own the send graph —
  Superhuman/Shortwave can only nudge generically off "no reply".
- It is **freshness-aware** (no stale signal as a hook) and **deal-stage-aware** (the next step matches
  the pipeline), reusing engines already in the codebase — a contextually correct nudge, cited.

## Design sketch
- **Data:** `outbound_emails` (prior sends + the staged follow-up, `status='draft'`),
  `sequence_enrollments`/`sequences` (step state), `activities` (last interaction), signals (TTL-gated
  via `lib/signals/freshness.ts`). No new tables.
- **API/jobs:** a `lib/inbox/followup.ts` generator (compose prior-send recap + deal context + voice) →
  used by (a) an on-demand "Generate follow-up" action and (b) the auto-draft trigger
  `follow_up_due` (INBOX-C03). Enrollment alignment via `lib/sequences/*` (`enrollment.ts`,
  `triggers.ts`). Staging + consume reuse the existing draft contract.
- **UI:** a "Generate follow-up" action in `_conversation-pane.tsx` (on sent/quiet threads) +, when
  staged, the "Draft ready · Follow-up: N days no reply" pill (shared with C03). `Send`/`Clock`/`RefreshCw`
  lucide icon. Autonomy control in INBOX-O06. Light+dark via tokens, no emoji, no provider name, cited.
- **AI:** reuse C01 grounded compose (voice + cited context) via `tracedGenerateObject` /
  `claude-sonnet-4-6`; `_trace.agentId="followup"`; structured citations so the hook is traceable.
- **Security/perf:** rate-limited; staged rows tenant-scoped + non-sending; freshness + collision gates
  before generation; zero-retention → flag-only.

## Tasks (ordered, each with verify + test)
1. No-reply / step-due detection: pure `lib/inbox/followup-due.ts` (replied-after-send ⇒ not due;
   sequence step due ⇒ aligned). (verify: unit over fixtures incl. replied-after-send) (test: `followup-due.test.ts`).
2. `lib/inbox/followup.ts` generator: new-angle follow-up grounded in prior send + deal context (cited),
   freshness-gated hook. (verify: draft adds an angle, no recap, no stale signal) (test: generator unit
   incl. fresh-vs-stale hook).
3. On-demand action + staging via `outbound_emails status='draft'`; surface + consume reuse. (verify:
   browser — generate → staged pill → pre-fill → send → consumed) (test: action + consume test).
4. Sequence alignment + no-duplicate-send + collision/handled suppression. (verify: enrolled contact gets
   aligned non-dup follow-up; teammate-followed-up suppresses) (test: sequence/collision test).
5. Autonomy dial + zero-retention. (verify: off → suggest-only; P03 → flag-only) (test: dial/retention).

## Current-state notes (VERIFY before building — code moves)
- Send graph EXISTS: `outbound_emails` (`db/schema/outbound.ts:274`), `sequence_enrollments`/`sequences`;
  the staged-draft contract (`status='draft'` + `/consume`) is live and surfaced by `detail/route.ts:73-100`.
- Sequence libs EXIST: `lib/sequences/enrollment.ts`, `triggers.ts`, `enrollment-eligibility.ts`,
  `nurture-recycle.ts`; the thread's enrollment is already loaded (`detail/route.ts:40-68`). REUSE.
- Signal freshness SSOT EXISTS: `lib/signals/freshness.ts`; collision helpers `lib/collision/`. No
  dedicated inbox follow-up generator exists yet — this spec adds `lib/inbox/followup.ts` over those.
