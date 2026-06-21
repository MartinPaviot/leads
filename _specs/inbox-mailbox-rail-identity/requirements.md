# A3 — inbox-mailbox-rail-identity · Requirements (EARS)

Feature id: `inbox-mailbox-rail-identity` · Track A (multi-mailbox) · Prio **P1**
Deps: **A1** `inbox-mailbox-connect` (DONE — `connected_mailboxes`, `getInboxScope`)
· **F1** `inbox-design-system` (NOT built — G-design reuses the inbox page's existing
inline tab/token pattern, see §Gates).

Source analysis: `_research/upstream/` (per-account rail + per-mailbox identity).

## 0. Ground truth (verified against live code 2026-06-19)

| Already shipped (do NOT re-spec) | Evidence |
|----|----|
| MailboxSummary { id, address, label, attention } rail data type | `src/app/(dashboard)/inbox/_types.ts:7-13` |
| mailboxes payload with per-box attention counts (rail data source) | `src/app/api/inbox/conversations/route.ts:77-88` |
| MailboxRail component (All + per-box + count, renders at 2+) | `src/app/(dashboard)/inbox/_mailbox-rail.tsx:13-58` |
| selectedMailbox state + &mailbox= query in loadLane | `src/app/(dashboard)/inbox/page.tsx:92,143` |
| per-mailbox attribution per conversation (mailboxId/Address/Label) | `_types.ts:46-48`, `route.ts:242-244` |
| From selector + pickDefaultFrom (A2) — composer knows the box | `src/components/email-composer-panel.tsx:200,505-560`; `src/lib/inbox/pick-from-mailbox.ts` |
| per-USER writing-style layered into the reply draft (B2) | `src/lib/inbox/writing-style.ts:198-226`; `src/app/api/inbox/compose/reply/route.ts:88-94` |
| user_preferences (userId, resource, key, value JSONB) owner-scoped store | `src/db/schema/auth.ts:141-164` |
| getInboxScope returns the user's own + shared mailboxes only | `src/lib/inbox/user-scope.ts:95-112` |

| Genuine gaps (this spec) | Evidence it does NOT exist |
|----|----|
| Per-box deterministic color | grep colorForMailbox -> 0 hits |
| Per-mailbox identity storage (displayName/signature/voice) | no signature/voice column on connected_mailboxes (`src/db/schema/outbound.ts:224-284`); grep mailboxIdentity -> 0 hits |
| Signature injection into the draft for the chosen From box | composer never appends a signature (`email-composer-panel.tsx`) |
| Per-mailbox voice override layered at draft time | reply route layers per-user voice only; never reads the thread's box (`compose/reply/route.ts:88-94`) |
| Rail showing the identity display-name override + a per-box color | `_mailbox-rail.tsx:46-56` uses m.label/m.address, no color |

**Signature column on connected_mailboxes: NO.** Storage is user_preferences
resource `"inbox"`, key `"mailboxIdentity"` -> a map mailboxId -> { displayName?, signature?, voice? }.
NO migration (R-LOCK-1).

## 1. Mailbox rail (R1)

- **R1.1** [NEW] THE SYSTEM SHALL render a left-hand mailbox rail listing an "All inboxes"
  entry followed by one entry per mailbox in the user's inbox scope (getInboxScope),
  in connected_mailboxes.created_at order. (extends _mailbox-rail.tsx)
- **R1.2** [DONE] WHERE the user has 2+ mailboxes in scope, THE SYSTEM SHALL render the
  rail; WHERE the user has 0 or 1, THE SYSTEM SHALL NOT render it — preserves the
  page.tsx:915 gate.
- **R1.3** [NEW] Each per-mailbox entry SHALL show its display-name (the identity override
  when set, else the box default label), its address, and a stable per-box color dot.
- **R1.4** [DONE] Each per-mailbox entry SHALL show its own attention/unread count from the
  mailboxes[].attention payload; a zero count SHALL render no badge.
- **R1.5** [DONE] The "All inboxes" entry SHALL show the sum of every box's attention count
  and an "N connected" sub-label.
- **R1.6** [DONE] WHEN the user selects a per-mailbox entry, THE SYSTEM SHALL set
  selectedMailbox to that id, driving the existing &mailbox=<id> filter in loadLane.
- **R1.7** [DONE] WHEN the user selects "All inboxes", THE SYSTEM SHALL clear selectedMailbox
  (null), removing the &mailbox= filter.
- **R1.8** [DONE] WHILE a per-mailbox entry is selected, THE SYSTEM SHALL mark exactly that
  entry active (accent background + inset accent rail) and no other.

## 2. Deterministic per-box color (R2)

- **R2.1** [NEW] THE SYSTEM SHALL expose a pure colorForMailbox(id: string) mapping a
  mailbox id to one entry of a fixed palette derived from F1 design-system tokens.
- **R2.2** [NEW] colorForMailbox SHALL be deterministic: the same id always yields the
  same color, independent of process, ordering, or call count.
- **R2.3** [NEW] colorForMailbox SHALL be total: every non-empty string returns a palette
  entry; an empty/nullish id returns a defined fallback (never throws, never undefined).
- **R2.4** [NEW] THE SYSTEM SHALL spread ids across the palette by a stable hash of the id
  (not array index) so adding/removing a box never recolors the others.
- **R2.5** [NEW] The palette SHALL use only var(--color-*) / design-system token values
  (no raw hex) so the dots resolve in dark mode (G-design items 1, 9).

## 3. Per-mailbox identity storage (R3)

- **R3.1** [NEW] THE SYSTEM SHALL store per-mailbox identity owner-scoped in user_preferences
  resource "inbox", key "mailboxIdentity", as a map mailboxId -> MailboxIdentity where
  MailboxIdentity = { displayName?: string; signature?: string; voice?: string }.
- **R3.2** [NEW] THE SYSTEM SHALL provide pure clampMailboxIdentity(input) enforcing caps
  (displayName <= 120, signature <= 2000, voice <= 2000), trimming, and dropping a fully
  empty record — mirroring clampWritingStyle (writing-style.ts:128-142).
- **R3.3** [NEW] THE SYSTEM SHALL provide getMailboxIdentities(userId) and
  saveMailboxIdentity(userId, mailboxId, patch) using the same upsert pattern as
  saveWritingStyle (writing-style.ts:245-255), with NO migration.
- **R3.4** [NEW] IF a mailboxId has no stored identity, THEN getMailboxIdentities SHALL
  return no entry for it (callers fall back to box defaults — R5.2, R6.4, R7.3).
- **R3.5** [NEW] WHEN saving an identity patch, THE SYSTEM SHALL merge it over the existing
  record for that mailboxId and clamp the result, leaving other mailboxes untouched.
- **R3.6** [NEW] THE SYSTEM SHALL only accept saves keyed by a mailboxId in the caller's
  getInboxScope (never widen — a forged/stale id is rejected, mirroring route.ts:60-62).

## 4. Identity settings surface (R4)

- **R4.1** [NEW] THE SYSTEM SHALL expose a per-mailbox identity editor (one section per
  mailbox in scope) with fields: display-name, signature (multiline), and an optional
  writing-voice override (multiline), prefilled from the stored identity.
- **R4.2** [NEW] WHEN the user saves an identity section, THE SYSTEM SHALL POST the patch,
  clamp + persist it (R3.2/R3.3), and confirm with a saved indicator.
- **R4.3** [NEW] WHERE a field is left blank, THE SYSTEM SHALL persist it as absent (the box
  falls back to its default), never as an empty-string override.
- **R4.4** [NEW] The editor SHALL show, per mailbox, its colorForMailbox dot + address so
  the user maps a section to a rail entry unambiguously.

## 5. Signature injection on compose/reply (R5)

- **R5.1** [NEW] WHEN the composer opens (reply or compose) with a mailboxId, THE SYSTEM
  SHALL append that mailbox's stored signature (if any) to the draft body once.
- **R5.2** [NEW] IF the chosen From mailbox has no signature, THEN THE SYSTEM SHALL leave
  the body unchanged (no separator, no blank block).
- **R5.3** [NEW] WHEN the user changes the From mailbox in the composer, THE SYSTEM SHALL
  swap the previously-injected signature for the new box's signature, never stacking two.
- **R5.4** [NEW] The injected signature SHALL be fully editable in the composer body and
  SHALL NOT be re-appended on send (no duplication on the wire).
- **R5.5** [NEW] THE SYSTEM SHALL delimit the signature with a single stable marker (a
  standard "-- " sig line) so swap/strip (R5.3) is exact and idempotent.

## 6. Display-name override (R6)

- **R6.1** [NEW] WHERE a mailbox has an identity display-name, THE SYSTEM SHALL show it in
  the rail entry in place of the box default label (R1.3).
- **R6.2** [NEW] WHERE a mailbox has an identity display-name, THE SYSTEM SHALL show it as
  the From-selector option label for that box (feeds A2's selector; A3 does not own it).
- **R6.3** [NEW] The override SHALL affect presentation only — never the stored
  connected_mailboxes.display_name, the send from_address, or attribution.
- **R6.4** [NEW] IF a mailbox has no identity display-name, THEN every surface SHALL fall
  back to connected_mailboxes.display_name then the address (current behavior).

## 7. Per-mailbox voice override (R7)

- **R7.1** [NEW] WHEN composing/replying from a mailbox that has a voice override, THE
  SYSTEM SHALL layer that voice onto the B2 per-user writing-style at draft time.
- **R7.2** [NEW] WHERE a mailbox voice override is set, THE SYSTEM SHALL let it win for
  that box (it composes after / overrides the per-user base prompt for the same directive).
- **R7.3** [NEW] IF the thread's/From mailbox has no voice override, THEN THE SYSTEM SHALL
  use the per-user writing-style unchanged (byte-identical to today — compose/reply/route.ts).
- **R7.4** [NEW] THE SYSTEM SHALL resolve the voice override from the From/thread mailbox
  (conversation.mailboxId), clamped + scrubbed for auto-send phrasing via the existing
  scrubAutoSend/isAutoSendInstruction path (never re-open the never-auto-send contract).
- **R7.5** [NEW] THE SYSTEM SHALL expose a pure buildMailboxVoiceBlock(identity) returning
  the additive voice instruction string (empty when no override) for the reply route to
  append to the per-user prompt.

## 8. Edge cases

- **E1** A mailbox with no identity set falls back to box defaults on every surface (rail
  name, From label, signature, voice) — R3.4, R5.2, R6.4, R7.3.
- **E2** A revoked/removed mailbox drops from getInboxScope, so it leaves the rail, the
  From selector, and the identity editor automatically; its stale identity entry in
  user_preferences is inert (never resolved without a scope hit) — R3.6.
- **E3** "All inboxes" aggregates counts across every in-scope box and clears the filter
  (R1.5/R1.7); selecting it injects no per-box signature into compose-from-scratch drafts.
- **E4** Two mailboxes hashing to the same palette slot is acceptable (color is a hint, not
  an identifier) — R2.4 guarantees determinism + stability, not uniqueness.
- **E5** A signature edited by the user then a From-mailbox switch: the marker-delimited
  block (R5.5) is swapped; user text above the marker is preserved.
- **E6** An identity record for a mailboxId not in scope is never returned to the UI and
  never injected (E2/R3.6) — defends against tenant/user id reuse.

## 9. Non-goals (THE SYSTEM SHALL NOT)

- **N1** SHALL NOT add connect/OAuth/IMAP flows — that is A1 (inbox-mailbox-connect).
- **N2** SHALL NOT build or own the From selector — that is A2; A3 only feeds it the
  display-name + signature (R5, R6.2).
- **N3** SHALL NOT do per-mailbox sync fan-out, refresh/reauth/health, or cross-box thread
  dedup — that is A4 (inbox-multimailbox-sync).
- **N4** SHALL NOT implement the team-inbox sharing model — shared mailboxes already
  surface via getInboxScope; A3 treats them as read-scope members, no new sharing.
- **N5** SHALL NOT add a column to connected_mailboxes or any migration (R-LOCK-1).
- **N6** SHALL NOT change attribution, from_address, or which box a thread belongs to.

## Gates

- **G-design** — the rail + identity editor pass the F1 12-item checklist
  (_specs/inbox-design-system/design.md section 8). F1 is NOT implemented, so A3 reuses the
  inbox page's existing inline tab/token pattern (page.tsx:795-855, _mailbox-rail.tsx):
  tokens-only color, lucide icons, type-scale snap, 4px rhythm, dark-mode via tokens.
  Recorded as a 12-item PASS/FAIL line in tasks.md.
- **G-eval** — A3 is UI + storage; the only machine-measurable units are colorForMailbox
  determinism + the identity clamp (pure unit tests). **No standalone LLM bar (G-eval N/A)**
  EXCEPT the per-mailbox voice override (R7), which re-runs the **B2 inbox-draft voice judge**
  in `pnpm eval:run` — A3 adds a fixture where a box voice override changes the draft and the
  judge confirms adherence without auto-send leakage.

## Stack locks

- **R-LOCK-1** [LOCKED] Identity persists in user_preferences JSONB (resource "inbox"),
  the same store as writing-style / voice-prefs / ai-memory. No new table, no migration.
- **R-LOCK-2** [LOCKED] Color + clamp + voice-block are pure, DB-free, unit-tested modules
  under src/lib/inbox/ (mirrors pick-from-mailbox.ts, writing-style.ts).
