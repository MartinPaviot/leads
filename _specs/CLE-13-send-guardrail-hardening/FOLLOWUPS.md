# CLE-13 — tracked follow-ups (post-implementation)

CLE-13 shipped (tighten-only, adversarially reviewed, no Critical): the orphaned
`enforceSendingIdentity` is wired at all 5 send chokepoints via one shared
`evaluateSend` gate; `signalAutoEnroll` routes through `decideAction`
(sequence-enrollment is outbound+confirm:always → always defers); the opt-out gap
on the SMTP cron + meeting-follow-up is closed (`isSuppressed` queries
`email_optouts`, tenant-scoped, covers hard bounces); the send-window check is now
computed in the tenant timezone (was UTC). No migration. tsc 0; 54 tests.

The following are deliberate, tracked deferrals — not oversights.

## 1. Approving a deferred sequence-enrollment is a dead-end (follow-up) — ✅ RESOLVED 2026-06-18
When `signalAutoEnroll` defers, it records an `awaitingApproval` agent action with
`actionType:"sequence-enrollment"`. Previously the action-executor dispatcher
(`lib/agents/action-executors.ts`) had **no handler** for that actionType, so an
approved deferred row was marked `failed` and the contact never enrolled (inert
approve button — tighten-safe, but a UX dead-end).

**Resolved:** `executeAgentAction` now has a `case "sequence-enrollment"` that:
- validates the structured payload via the pure, unit-tested
  `enrollmentTargetsFromPayload` (requires a `sequenceId` + ≥1 non-blank
  `contactId`; fail-closed → no DB touch otherwise);
- verifies the sequence belongs to the acting tenant (tenant-scoped `sequences`
  select) before any write;
- idempotently inserts `sequenceEnrollments` (status `active`, step 1, `nextStepAt`
  now), skipping any contact already enrolled in that sequence;
- returns a human summary (`Enrolled N contact(s) in <name> (M skipped)`, where M
  folds in already-enrolled + tenant/deletedAt re-validation failures).

The dispatcher (`agent-action-dispatcher.ts:78`) already passes `row.actionType` +
`row.payload` through, so the approve path is live end-to-end. The first-step sends
this enrollment triggers still cross the CLE-10 gate + CLE-13 `evaluateSend` chokepoints
at send time — enrolling does not bypass any send guardrail. Tests: 4 helper cases +
an empty-payload fail-closed case in `agent-action-executors.test.ts`, plus the
DB-behavior suite in `agent-action-enroll-executor.test.ts`.

**Trust-boundary hardening (review-found H1).** The payload is a stored-then-replayed
snapshot and `sequenceEnrollments` has no `tenantId` column, so the contact FK is the
only tenant anchor. The executor now re-validates every `contactId` against
`contacts.tenantId == tenantId AND deletedAt IS NULL` (one `inArray` query) before
enrolling — matching the membership re-check `create_deal` / `send_followup` already
do at dispatch — so a soft-deleted or foreign contact is skipped, not enrolled. The
"N skipped" count folds in both already-enrolled and re-validation failures.

**Deliberate v1 scope (review-found H2 — intentional, not a gap to fix now).** The
inline auto-execute branch in `signalAutoEnroll` does enroll + `trackPipeline` +
create-deal + notify as one signal-handling bundle. The discrete `sequence-enrollment`
approval executor ONLY enrolls — it does what its actionType says. Rationale: the
founder approving from the UI is already "notified" (they clicked approve), and
bundling deal-creation into an *enrollment* approval would conflate action types. If
product wants the full bundle on approval, route the deferral as a small multi-step
plan (enroll + create_deal) rather than overloading this executor. `trackPipeline` is
pure analytics and non-load-bearing. Flagged for the M-checkpoint, not blocking.

## 2. Auto-enroll "always defers" rests on a code-trace guarantee, not a behavioral test — ✅ RESOLVED 2026-06-18
`signal-auto-enroll.approval.test.ts` mocks `enforceAgentApprovalMode` for the
auto-high-confidence / execute cases. The always-defers guarantee is real (verified
by trace: `GUARDED_ACTION_METADATA["sequence-enrollment"]` is `outbound:true,
confirm:"always"` → `decideAction` returns confirm/queue under every mode), but a
future change to that metadata wouldn't be caught by a behavioral test there.

**Resolved:** added a behavioral suite to `guardrails-approval-mode.test.ts` (which
uses the REAL `enforceAgentApprovalMode` + real metadata) asserting
`sequence-enrollment` is never `allowed` across all three modes — even at confidence
1 with a forged 0.0 learned bar — and always parks (`queueAs != null`). Flipping the
metadata to `outbound:false` / `confirm:"never"` now fails a test here, not in prod.
(Plus a sibling check for `email-send`/`email-reply`.)

## 3. Operator note: SMTP-custom tenants must set sendingMailboxMode explicitly
With DEFAULTS now applied (`primary-with-caps`, cold-blocked), an SMTP-custom tenant
who never set `sendingMailboxMode` will have cold SMTP sends blocked that previously
went out. This is the intended tightening, but operators must set
`external-connected` explicitly for those tenants or cold SMTP outreach silently
fails (lands as `failed` with an identity-block reason).

## 4. Minor: dead fail-open branch in sending-gate.ts — ✅ RESOLVED 2026-06-18
`evaluateSend` carried a `settings === null → fail open (send)` branch that was
unreachable in prod (`getTenantSettings` always merges DEFAULTS; verified no caller
passes `settings: null`).

**Resolved:** removed the fail-open return. A null settings object now evaluates
against the protective `DEFAULTS` (primary-with-caps, cold blocked) via optional
chaining, so the gate has **no send-through path at all** — an absent/unknown
settings object can only make it send LESS, never more (matches the module's
fail-closed doctrine). Test updated: `settings:null` + cold → blocked
(`cold-on-primary-blocked`); `settings:null` + warm-under-cap → still allowed.
