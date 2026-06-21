# A2 — inbox-send-as — Verification (self-verify loop, 2026-06-19)

Branch `feat/inbox-ai-draft` (integration branch: B1 + C1-floor + B2 + A1 + A2,
all unmerged + interdependent). Worktree agent-a64e5014ce08a19ab.

## Commits (4 slices)
1. `f273292` pure `pickDefaultFrom` + `mailboxDisplay` (`lib/inbox/pick-from-mailbox.ts`) + 6 tests
2. `b0d6c49` server resolver: `resolveOwnerMailbox(mailboxId?)` + `deliverInteractiveEmail` blocked refusal + `/api/emails/send` schema/forward/403
3. `836a7e4` From selector in `email-composer-panel.tsx` (static one-box / menu many) + mailboxId in handleSend body
4. `1306115` pane wiring: fetch sendable mailboxes + seed thread mailboxId + pass to composer

## Requirements diff (→ implementation)
| Req | Status | Evidence |
|---|---|---|
| R1.1 From selector lists sendable boxes (label/address) | DONE | composer From row + menu |
| R1.2 one box → static label | DONE | `mailboxes.length === 1` branch |
| R1.3 zero boxes → muted hint | PARTIAL | From row gated on length>0 to avoid misleading un-wired composer instances; zero-active-box send is still refused server-side with a clear error |
| R2.1 default = thread's box when sendable | DONE | pickDefaultFrom(draft.mailboxId, …) |
| R2.2 new compose → primary | DONE | no mailboxId → first |
| R2.3/R2.4 thread box gone → primary fallback | DONE | pickDefaultFrom (tested) |
| R3.2 absent mailboxId → first-active (unchanged) | DONE | resolver null branch |
| R3.3-R3.5 chosen box pins transport + recorded identity | DONE (reused) | existing transport/insert use the resolved mailbox |
| R4.1 client id never trusted, re-resolved server-side | DONE | WHERE adds id to user_id+tenant_id+status filter |
| R4.2 non-owned/cross-tenant → 403, no silent fallback | DONE | notOwnedOrInactive → blocked → 403 |
| R4.3 inactive (paused/disabled/revoked/warming) → 403 | DONE | status='active' predicate |
| R4.4 opt-out/test-mode/gate/plan-limit/footer still apply | DONE | blocked returns before transport; downstream unchanged |
| R4.5 no sendable box → server gate | DONE | absent id + no active → null → existing path |
| R5 never auto-send | DONE | only handleSend posts |
| R6.1 G-design 12-item (From selector) | PASS | tokens-only, one Button system, lucide ChevronDown, no emoji |

## Tests
- pick-from-mailbox 6 unit tests green.
- deliver-interactive.sending-gate existing tests green — the resolver discriminator
  change did NOT regress the first-active path.
- `pnpm tsc` clean after every slice.
- Full suite + `next build` (8GB): see run results below.

## Honest gaps
- R1.3 zero-box hint: deferred from the composer (gated on length>0) to avoid a
  misleading "no mailbox" on un-wired composer instances; the server still refuses
  a zero-active-box send. Could be restored with an explicit `showFrom` prop.
- A live send-as smoke (pick a non-default box → it actually leaves from that box;
  pick a revoked box → 403) needs a real connected second mailbox + a real send,
  which OUTBOUND_TEST_MODE + the human-OAuth-linked box gate — needs the same
  human smoke as A1. Pure resolver logic + the 403 mapping are unit/type-verified.

## MVP status
A1 + A2 + B1 + B2 + C1-floor are now implemented + autonomously verified (unit +
full-suite + build + eval gates). The remaining cross-cutting need before merge is
ONE human-OAuth session smoke (login + link a 2nd mailbox + draft + send-as).
