# INBOX-T07 — One-click unsubscribe + block
> Theme: T2 · Autonomy rung: helper · Priority: P2
> Pillar: P4 triage

## User story
As a user, I want one action that unsubscribes me from a mailing list and blocks the sender, so
recurring noise stops for good instead of being dismissed one message at a time.

## Why (audit anchor)
"Block / one-click unsubscribe" is a core triage capability (`ai-native-mailbox-audit.md` §2);
Superhuman exposes **Blocked Senders** (`feature-inventory.md` Workflow). We already parse the
RFC unsubscribe affordance during classification (`List-Unsubscribe` / `List-Unsubscribe-Post`
detected in `lib/inbound/lead-classification.ts:189`) and we own a durable **suppression ledger**
(`lib/accounts/suppression.ts`) plus sequence opt-out (`enrollmentStatusEnum` includes
`unsubscribed`, `outbound.ts:32`). T07 wires these into one inbox action.

## Requirements (EARS)
- WHEN a conversation's headers carry a `List-Unsubscribe` (and `List-Unsubscribe-Post` for
  one-click, RFC 8058), the system SHALL offer "Unsubscribe".
- WHEN the user clicks Unsubscribe, the system SHALL perform the one-click POST when available,
  else open the mailto/HTTP unsubscribe target, and record the outcome.
- The system SHALL offer "Block sender" that suppresses the sender domain/address so its future
  mail is auto-archived/bundled and never enters the attention lane.
- The system SHALL combine both into a single "Unsubscribe + block" action on bulk bundles
  (INBOX-T03) and on an individual conversation.
- WHEN a sender is blocked, the system SHALL record it in the durable suppression ledger
  (`accountSuppressions`) so it survives re-import and is restorable.
- The system SHALL show what happened ("Unsubscribed via the list's one-click endpoint" / "Block
  added") with no vendor name and an undo affordance.
- WHEN no machine unsubscribe target exists, the system SHALL fall back to block-only and say so.
- The system SHALL keep block/suppression per-tenant and the action per-user-initiated, auditable.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a newsletter with `List-Unsubscribe-Post: List-Unsubscribe=One-Click` WHEN the user clicks
  Unsubscribe THEN the system POSTs the one-click endpoint and confirms success.
- GIVEN a newsletter with only a `mailto:` unsubscribe WHEN clicked THEN the system composes/sends
  the unsubscribe mail (or opens it) and records the attempt.
- GIVEN any sender WHEN the user clicks Block THEN a suppression row is written and the sender's
  next mail does not reach attention.
- GIVEN a bundle source WHEN "Unsubscribe + block" is clicked THEN both run and the source
  disappears from bundles.
- GIVEN a blocked sender WHEN the user clicks Undo THEN the suppression is lifted and mail flows
  again.
- GIVEN a conversation with no unsubscribe header WHEN viewed THEN only "Block" is offered, with a
  note that there's no list unsubscribe.
- GIVEN two tenants WHEN a block is added THEN it only affects the acting tenant.

## Edge cases & failure handling
- One-click endpoint fails / times out → report failure, still offer block; never claim success.
- Unsubscribe target is a tracking/phishing-looking URL → route through the link-safety check
  (INBOX-P02) and warn before navigating.
- Sender spoofs `List-Unsubscribe` → block is still effective (it's our local suppression), and we
  don't auto-trust the endpoint for anything but the unsubscribe POST.
- Blocking a domain we also sell to (a real prospect domain) → warn ("this domain has an open
  deal") before blocking.
- Re-subscribe later → lift suppression (`liftSuppression`) restores flow.
- Multi-tenant: suppression scoped by `tenant_id`; the ledger already enforces this.
- A blocked sender already in a sequence → also set enrollment `unsubscribed` to stop outbound.

## Best-in-class bar
- Block is **durable + restorable** via our suppression ledger (`accountSuppressions`,
  `reason: "unsubscribe"`) and **cascades to sequence opt-out**, so a blocked sender also stops
  any outbound to them — a generic mailbox's block doesn't touch your outbound campaigns.
- Unsubscribe is **RFC 8058 one-click** when available (not just opening a web page), and the
  unsubscribe URL is **safety-checked** (INBOX-P02) before we touch it.

## Design sketch
- **Data:** `accountSuppressions` (`lib/accounts/suppression.ts`) with `kind:"excluded"` /
  `reason:"unsubscribe"` and the sender identity (domain/email). The `meeting_opt_outs` +
  enrollment `unsubscribed` status (`outbound.ts:32`, `:348`) for sequence cascade. Persist the
  parsed `List-Unsubscribe` target at capture (`activities.metadata`, set in
  `lib/capture/email-capture.ts`) so the action has the endpoint without re-fetching headers.
- **API:** `POST /api/inbox/unsubscribe` `{conversationKey, mode: "unsubscribe"|"block"|"both"}` —
  performs the one-click POST (server-side, safety-checked), writes suppression
  (`suppressContacts`/an address suppression), cascades enrollment opt-out, returns the outcome.
  `POST /api/inbox/unsubscribe/undo` lifts it (`liftSuppression`).
- **UI:** a row action in the reading-pane header `MoreMenu` (`_conversation-pane.tsx:291` action
  area) and on bundle sources (INBOX-T03). lucide `BellOff` (unsubscribe) / `Ban` (block); toast
  with the outcome + Undo. Token colors only, light+dark via tokens, no emoji, no provider name,
  outcome stated plainly.
- **AI:** none.
- **Security/perf:** unsubscribe URL passes INBOX-P02 link-safety; one-click POST server-side with
  a timeout; open-deal warning before blocking a prospect domain; idempotent suppression.

## Tasks (ordered)
1. Persist the parsed `List-Unsubscribe`/`-Post` target at capture into `activities.metadata`.
   (verify: header captured) (test: capture test)
2. `POST /api/inbox/unsubscribe` (one-click POST + suppression + enrollment cascade, safety-checked).
   (verify: suppression row + enrollment unsubscribed) (test: route — one-click, mailto fallback,
   block-only)
3. Undo endpoint (`liftSuppression`). (verify: mail flows again) (test: route)
4. Reading-pane + bundle action UI with outcome toast + Undo. (verify: browser — newsletter
   unsubscribes + disappears) (test: render)
5. Open-deal-domain warning before block. (verify: warning shown) (test: guard test)
6. Confirm blocked senders never reach attention (route into bundle/archive). (verify: live)
   (test: lane test)

## Current-state notes (VERIFY before building)
- Unsubscribe headers already detected: `lib/inbound/lead-classification.ts:189` (`list-unsubscribe`,
  `list-unsubscribe-post`).
- Durable suppression ledger exists: `lib/accounts/suppression.ts` (`suppressContacts`,
  `liftSuppression`, `filterAllowed`). `accountSuppressions` has `reason` (`outbound.ts:339`
  context: pending/sent/replied opt-out reasons incl. `unsubscribe`).
- Sequence opt-out: `enrollmentStatusEnum` `unsubscribed` (`outbound.ts:32`); `meeting_opt_outs`
  (`outbound.ts:348`).
- Link-safety dependency: INBOX-P02 (phishing/link warnings).
- No inbox unsubscribe/block endpoint or UI exists yet.
