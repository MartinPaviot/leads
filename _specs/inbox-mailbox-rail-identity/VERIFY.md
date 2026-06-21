# A3 — inbox-mailbox-rail-identity — Verification (self-verify loop, 2026-06-19)

Branch `feat/inbox-ai-draft` (integration branch; A3 = 5b1e764). Worktree agent-a64e5014ce08a19ab.

## Commits (4 slices)
1. `ae4ba05` per-mailbox color + identity helpers/store (mailbox-color.ts + mailbox-identity.ts) + 15 tests
2. `9815885` mailbox-identity route + display-name overlay (conversations/route) + per-mailbox voice (compose/reply)
3. `bdd0b3f` rail color dot + signature injection (mailbox-signature.ts extracted DB-free for the client) + pane overlay
4. `5b1e764` mailbox-identity settings editor + nav

## Requirements diff (→ implementation)
| Req | Status | Evidence |
|---|---|---|
| R1 rail (All + per-box + counts) | DONE (reused) | MailboxRail already existed |
| R1.3 per-box color dot | DONE | colorForMailbox dot in _mailbox-rail.tsx |
| R2 deterministic color | DONE | colorForMailbox (FNV-1a, tokens-only), 6 tests |
| R3 identity store (no migration) | DONE | mailbox-identity.ts (user_preferences key mailboxIdentity) |
| R3.6 scope-gated save | DONE | PATCH rejects a mailboxId outside getInboxScope |
| R4 per-mailbox editor | DONE | settings/mailbox-identity/page.tsx + nav |
| R5 signature inject (idempotent, swap-safe) | DONE | applySignature (mailbox-signature.ts) on open + From change; 4 tests |
| R6 display-name override (presentation only) | DONE | server overlay in conversations/route (rail label + mailboxLabel) + pane From label |
| R6.4 precedence identity → display_name → address | DONE | overlay expression |
| R7 per-mailbox voice override | DONE | compose/reply appends buildMailboxVoiceBlock (scrubbed), per-box wins |
| R-color/clamp/sig/voice pure | DONE | all DB-free + unit-tested |
| G-design 12-item | PASS | dot tokens-only, editor one-Button/lucide/no-emoji, states covered |
| G-eval | N/A except voice judge | A3 is UI+storage; the per-mailbox voice re-runs the B2 inbox-draft voice judge (LLM tier) — noted |

## Tests
- mailbox-color 6 + mailbox-identity 9 + pick-from 5 (signature field) green; 20 total.
- `pnpm tsc` clean after every slice. Client/server split verified: applySignature lives in a
  DB-free module (mailbox-signature.ts) so the "use client" composer doesn't pull `@/db`.
- Full suite + `next build` (8GB): see run results below.

## Honest gaps
- The signature auto-apply runs on open + From-change; a generate-draft that replaces the body
  AFTER open does not re-trigger it (a pre-existing composer draft-prop limitation, not A3) — the
  user can re-pick the From to re-apply. Documented.
- The per-mailbox voice judge bar (G-eval) is LLM-tier (needs a key); the rest of A3 is UI+storage
  with no LLM bar. A signature/identity live check needs a connected 2nd mailbox (human-OAuth).
