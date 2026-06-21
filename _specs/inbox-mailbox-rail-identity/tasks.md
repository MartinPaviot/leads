# A3 — inbox-mailbox-rail-identity · Tasks

**Total estimate: ~3.0 dev-days (6.0 half-days), 11 tasks.**
Branch: `feat/inbox-mailbox-rail-identity`. Per task: code -> test -> verify -> commit.
Reuse-first: no migration; all storage in user_preferences; pure libs unit-tested.

Tags: [NEW] code · [CFG] config · [DONE] already shipped (verify only) · [LOCKED] stack.

---

### B1.1 — [NEW] Pure mailbox color helper  (0.5 hd)
Action: add `src/lib/inbox/mailbox-color.ts` with `MAILBOX_PALETTE` (8 var(--color-*)
token strings) + `colorForMailbox(id)` (stable FNV hash mod len; empty/nullish -> fallback).
Verify: `colorForMailbox("a")` equals itself across calls; returns a token string.
Test: `mailbox-color.test.ts` — determinism, totality (empty/unicode), stability on
removal, tokens-only assertion.
Refs: R2.1, R2.2, R2.3, R2.4, R2.5.

### B1.2 — [NEW] Mailbox identity lib (clamp + store + signature + voice)  (1.0 hd)
Action: add `src/lib/inbox/mailbox-identity.ts` — `MailboxIdentity`,
`clampMailboxIdentity` (caps 120/2000/2000, null on empty), `applySignature`/`stripSignature`
(marker "\n\n-- \n", strip-then-append idempotent), `buildMailboxVoiceBlock` (empty when
absent; scrub via writing-style `scrubAutoSend`), `getMailboxIdentities`/`saveMailboxIdentity`
(user_preferences upsert, merge-at-key, drop-on-empty).
Verify: save then get round-trips; second `applySignature` swaps not stacks; save to id A
leaves id B untouched.
Test: `mailbox-identity.test.ts` — clamp, merge isolation, signature append/swap/strip,
voice empty + auto-send scrub.
Refs: R3.1, R3.2, R3.3, R3.4, R3.5, R5.1-R5.5, R7.4, R7.5.

### B1.3 — [NEW] Identity API route (GET all + PATCH one, scope-gated)  (0.5 hd)
Action: add `src/app/api/inbox/mailbox-identity/route.ts` — GET returns
`getMailboxIdentities` filtered to `getInboxScope` ids; PATCH `{ mailboxId, displayName?,
signature?, voice? }` rejects an out-of-scope id (mirror route.ts:60-62), else
`saveMailboxIdentity`.
Verify: PATCH with a foreign id -> 403/ignored; GET omits non-scoped ids.
Test: `mailbox-identity.scope.test.ts` — scope gate on PATCH, scope filter on GET.
Refs: R3.6, E6, R4.2.

### B2.1 — [NEW] Identity settings editor page  (1.0 hd)
Action: add `src/app/(dashboard)/settings/mailbox-identity/page.tsx` — one section per
in-scope mailbox (color dot + address), fields display-name / signature / voice, Save per
section, prefilled from GET; mirror the writing-style page idiom (Button, Label, tokens).
Add the nav entry in `settings/settings-sidebar.tsx`.
Verify: edit + Save shows saved state; reload shows persisted values; blank field persists
as absent.
Test: component test — renders one section per mailbox, Save POSTs the patch, blank ->
absent (no empty-string override).
Refs: R4.1, R4.2, R4.3, R4.4, G-design item 12.

### B3.1 — [NEW] Rail color dot + display-name override (server overlay)  (0.5 hd)
Action: in `conversations/route.ts:83-88`, load `getMailboxIdentities` once and overlay
`label = identity[m.id]?.displayName?.trim() || m.label` on each `mailboxes[]` entry and on
the per-conversation `mailboxLabel` (route.ts:244). In `_mailbox-rail.tsx:46-56` render a
`colorForMailbox(m.id)` dot beside each per-box row.
Verify: a box with an identity name shows that name in the rail; the dot color is stable
across reloads; clearing the name reverts to the default label.
Test: extend the conversations route test — overlay applied for an id with an identity,
default kept otherwise; rail component test — renders a dot per row.
Refs: R1.3, R6.1, R6.3, R6.4, R2.* (consumes B1.1).

### B3.2 — [NEW] Composer signature injection + From-override label  (0.5 hd)
Action: in `email-composer-panel.tsx`, on mount + on From-mailbox change, fetch the
identities once and call `applySignature(body, identity[fromMailboxId]?.signature)` so the
sig is appended once and swapped on From change (strip-then-append). Use the override name
in the From option label. In `_conversation-pane.tsx:189-201` overlay the override name onto
each sendable `label`.
Verify: opening a reply from a box with a signature appends it once; switching From swaps it;
a box with no sig leaves the body unchanged; Send does not duplicate the sig.
Test: composer test — append-once, swap-on-change, no-sig-no-change; pane test — selector
label uses the override.
Refs: R5.1, R5.2, R5.3, R5.4, R5.5, R6.2.

### B3.3 — [NEW] Per-mailbox voice override in the reply draft  (0.5 hd)
Action: in `compose/reply/route.ts:88-94`, resolve the thread's mailbox identity
(`conversation.mailboxId` -> `getMailboxIdentities`) and append
`buildMailboxVoiceBlock(identity)` to the `instructions` string after the per-user blocks.
Verify: a thread whose box has a voice override produces a draft reflecting it; a thread
whose box has none is byte-identical to today; auto-send phrasing in a voice override is dropped.
Test: route test — instructions include the voice block when set, omit it when absent; an
auto-send line is scrubbed.
Refs: R7.1, R7.2, R7.3, R7.4, R7.5.

### B4.1 — [DONE] Verify rail filter + All-clears behavior (regression)  (0.25 hd)
Action: no code — confirm the existing rail still drives `&mailbox=` (page.tsx:143) and
"All inboxes" clears it (page.tsx:744, route.ts:60-62) after B3.1's overlay.
Verify: selecting a box filters the list; All shows every box; counts unchanged.
Test: reuse/extend the existing conversations route + page tests; assert no regression.
Refs: R1.2, R1.4, R1.5, R1.6, R1.7, R1.8 (all [DONE]).

### B4.2 — [NEW] G-eval voice fixture (B2 judge)  (0.5 hd)
Action: add an eval fixture under the inbox-draft voice suite where the thread's box carries
a voice override; assert the judge scores adherence and flags zero auto-send leakage.
Wire into `pnpm eval:run`.
Verify: `pnpm eval:run` green on the new fixture.
Test: the fixture IS the test (judge bar). No standalone LLM bar elsewhere (G-eval N/A for the
rest of A3).
Refs: R7.*, G-eval.

### B4.3 — [NEW] G-design 12-item review + drift check  (0.25 hd)
Action: run the F1 12-item checklist against the rail dot + identity editor; record a one-line
PASS/FAIL per item; fix any token/contrast miss.
Verify: 12/12 PASS recorded here; tokens-only (no raw hex) on the new surfaces.
Test: extend the inbox tokens contract test (if present) to cover the new files; else a grep
assertion that the new .tsx files carry no raw hex color.
Refs: G-design, R2.5.

---

## DoD (software) — distinct from the OKR

- [ ] `colorForMailbox` deterministic + total + tokens-only (B1.1 tests green).
- [ ] Identity clamp/store/signature/voice unit tests green (B1.2).
- [ ] PATCH scope-gated; GET scope-filtered (B1.3).
- [ ] Editor saves + reloads; blank -> absent (B2.1).
- [ ] Rail shows override name + stable dot; From label + signature injected; voice layered (B3.*).
- [ ] Existing rail filter + All-clears unregressed (B4.1).
- [ ] B2 voice judge green on the override fixture (B4.2); 12/12 G-design (B4.3).
- [ ] No migration; no new dependency; no column on connected_mailboxes.

## Sequencing
B1.1 -> B1.2 -> B1.3 (pure + storage first) -> B2.1 (editor) -> B3.1/B3.2/B3.3 (wire the
three surfaces) -> B4.1/B4.2/B4.3 (regression + gates). B3.* are independent of each other
once B1.* land and can be parallelized.
