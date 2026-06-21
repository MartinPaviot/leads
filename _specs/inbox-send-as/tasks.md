# A2 — inbox-send-as · Tasks

**Total estimate: ~3.5 dev-days (7 half-days).** 8 tasks. No migration. Branch `feat/inbox-send-as`.

Legend: `[NEW]` new code · `[DONE]` already shipped (do not redo) · `[LOCKED]` stack decision.

Order matters: server resolver first (B1-B3) so the client (B4-B5) sends into a working backend;
pure helper (B4) before the UI that consumes it; G-design gate (B6) and e2e (B7) last.

---

### B1 `[NEW]` — Make `resolveOwnerMailbox` accept a specific mailbox  · 1 half-day
- **Action**: add an optional `mailboxId` arg to `resolveOwnerMailbox`
  (`src/lib/emails/deliver-interactive.ts:85`); when present, AND the WHERE with
  `eq(connectedMailboxes.id, mailboxId)` (keeping `tenantId` + `userId` + `status='active'`);
  return a 3-way result: the row, a `notOwnedOrInactive` marker, or `null` (no-id + none active).
- **Verify**: with a seeded owned+active box id -> resolves that exact row; a foreign id (other
  user/tenant) or a non-active owned id -> `notOwnedOrInactive`; no id -> first-active as today.
- **Test**: `src/__tests__/resolve-owner-mailbox.test.ts` — mock `db.select().from().where().limit()`
  (mirror `deliver-interactive.sending-gate.test.ts:26-47`); assert the three branches.
- **Refs**: R4.1, R4.2, R4.3, R3.2.

### B2 `[NEW]` — Thread the chosen mailbox through `deliverInteractiveEmail`  · 1 half-day
- **Action**: add `mailboxId?: string | null` to `DeliverInteractiveInput`
  (`src/lib/emails/deliver-interactive.ts:44-64`); pass it to `resolveOwnerMailbox` (`:148`);
  when a `mailboxId` was supplied and resolution is `notOwnedOrInactive`, return
  `{ ok:false, code:"blocked", error:"That mailbox is not available to send from..." }` before
  transport. Leave the transport (`:178-230`) and outbound insert (`:242-255`) untouched — they
  already use the resolved box.
- **Verify**: supplying a valid owned+active id sends from THAT box (from_address + mailbox_id on
  the inserted row match it); supplying a bad id returns `{ ok:false, code:"blocked" }` and never
  calls transport; omitting it is byte-identical to today.
- **Test**: extend `src/__tests__/deliver-interactive.sending-gate.test.ts` (or a sibling
  `deliver-interactive.send-as.test.ts`) — assert blocked-before-transport for a bad id, and that
  a good id reaches `resend.emails.send`/`sendViaSmtp` with the chosen From.
- **Refs**: R3.3, R3.4, R3.5, R4.2, R4.3, R4.4.

### B3 `[NEW]` — Accept + forward `mailboxId` in `/api/emails/send`  · 0.5 half-day
- **Action**: add `mailboxId: z.string().optional()` to `sendEmailSchema`
  (`src/app/api/emails/send/route.ts:18-26`); forward `mailboxId: parsed.mailboxId` into the
  `deliverInteractiveEmail({...})` call (`:67-78`); add `blocked: 403` to `STATUS_BY_CODE`
  (`:28-34`) so a blocked result returns 403 not 500.
- **Verify**: `curl`/Playwright POST with a foreign `mailboxId` -> 403 + clear error; with a valid
  owned id -> 200 and the mail leaves from that box; with no `mailboxId` -> unchanged 200.
- **Test**: `src/app/api/emails/send/__tests__/route.send-as.test.ts` — mock
  `deliverInteractiveEmail`; assert the schema accepts/omits `mailboxId`, it is forwarded, and a
  `{ ok:false, code:"blocked" }` maps to HTTP 403.
- **Refs**: R3.1, R3.2, R4.2, R4.3.

### B4 `[NEW]` — Pure default-From picker helper  · 0.5 half-day
- **Action**: create `src/lib/inbox/pick-from-mailbox.ts` exporting
  `pickDefaultFrom(preferredId, sendable)` and the `SendableMailbox` type, per design 4d
  (preferred-if-sendable, else first sendable, else undefined).
- **Verify**: `pickDefaultFrom("B", [A,B,C]) === "B"`; `pickDefaultFrom("Z", [A,B]) === "A"`;
  `pickDefaultFrom(undefined, [A]) === "A"`; `pickDefaultFrom("X", []) === undefined`.
- **Test**: `src/lib/inbox/__tests__/pick-from-mailbox.test.ts` — the four cases above (R2.1-R2.4,
  R1.3). DB-free, same style as `mailbox-switch.ts`.
- **Refs**: R2.1, R2.2, R2.3, R2.4.

### B5 `[NEW]` — From selector in the composer + send body  · 1.5 half-days
- **Action**: in `src/components/email-composer-panel.tsx`: add `mailboxId?: string` to
  `EmailComposerDraft` (`:17-25`); add a `mailboxes: SendableMailbox[]` prop; add
  `fromMailboxId` state seeded by `pickDefaultFrom(draft.mailboxId, mailboxes)`; render the From
  row above To (`:494`) with the three modes (menu / static one-box / empty), reusing the existing
  menu+`Button`+token pattern (`:561-600`); include `mailboxId: fromMailboxId` in the `handleSend`
  POST body (`:394-402`). In `src/app/(dashboard)/inbox/_conversation-pane.tsx`: fetch
  `GET /api/settings/mailboxes`, filter `status==="active"`, memoize, pass to
  `<EmailComposerPanel mailboxes=...>` (`:982`), and seed each reply `setComposer({...})` with
  `mailboxId: detail.conversation.mailboxId ?? undefined` (`:251,:261,:280,:288,:314,:323,:327`).
- **Verify**: open a reply on a thread received by box B (B active) -> From shows B; switch to box
  C -> Send sends from C (assert recipient sees C, or the inserted row mailbox_id=C); a single-box
  user sees a static label, no dropdown; a zero-box user sees the hint. Cmd-J / Rewrite / Save
  draft unaffected.
- **Test**: `src/components/__tests__/email-composer-panel.from-selector.test.tsx` (happy-dom +
  Testing Library) — (a) default selection = seeded thread box; (b) picking a box updates the POST
  body `mailboxId` (mock `fetch`, assert payload); (c) one-box -> static label, no listbox role;
  (d) zero-box -> hint, no crash.
- **Refs**: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R2.1, R3.1, R5.1, R5.2.

### B6 `[NEW]` — G-design gate on the From row  · 0.5 half-day
- **Action**: run the F1 12-item checklist (`_specs/inbox-design-system/design.md` section 8)
  against the From row; fix any token/contrast/state miss; record one PASS/FAIL line per item.
- **Verify**: `pnpm --filter @leadsens/web test tokens.contract` stays green (no raw hex in the new
  JSX); manual dark-mode + `:focus-visible` check on the From control; one-box + zero-box states
  visually confirmed.
- **Test**: the existing `tokens.contract.test.ts` covers item 1 machine-side; add an assertion in
  the B5 test that the empty/one-box states render (item 12).
- **Refs**: R6.1.

### B7 `[NEW]` — e2e: send-as honored end to end  · 0.5 half-day
- **Action**: Playwright spec — user with >=2 active boxes opens a reply, switches From to the
  non-default box, sends; assert the outbound row mailbox_id + from_address are the chosen box
  (via the inbox detail re-attribution or a DB check).
- **Verify**: run `pnpm e2e` for the new spec; the sent message is attributed to the chosen box in
  the unified inbox after refresh.
- **Test**: `e2e/inbox-send-as.spec.ts` — happy path (switch + send) and the revoked-box edge
  (revoke the chosen box mid-flow -> Send shows the clear 403 error, no wrong-From send).
- **Refs**: R3.3, R3.4, R4.3, R4.2.

### B8 `[DONE]` — outbound mailbox attribution + schema  · 0 (no work)
- `outbound_emails.mailbox_id` (`src/db/schema/outbound.ts:294`) exists and is written
  (`deliver-interactive.ts:246`); the unified inbox already attributes by it
  (`src/lib/inbox/user-scope.ts:139-143`). **Do not re-spec or migrate.** Listed only to mark the
  boundary. (NG-5.)

---

## Definition of Done (software, separate from any OKR)

- `pnpm tsc` + `pnpm lint` clean; `pnpm test` green incl. the 5 new/extended unit tests
  (B1,B2,B3,B4,B5) and `pnpm e2e` green for B7.
- Sending from a non-default owned+active box leaves from THAT box (verified: inserted
  `outbound_emails` row has the chosen `mailbox_id` + `from_address`).
- A forged/cross-tenant `mailboxId` -> 403, never a silent fallback (B3 test + B7 edge).
- A revoked/paused chosen box -> clear 403, never a wrong-From send (B7 edge).
- Omitting `mailboxId` is byte-identical to pre-A2 behaviour (B2/B3 tests).
- G-design: 12/12 recorded in B6.
- No migration applied; no Inngest function added.
