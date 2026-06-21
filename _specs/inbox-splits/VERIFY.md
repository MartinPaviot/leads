# B3 — inbox-splits — Verification (self-verify loop, 2026-06-19)

Branch `feat/inbox-ai-draft` (integration branch: B1 + C1-floor + B2 + A1 + A2 +
B3-core, all unmerged). Worktree agent-a64e5014ce08a19ab.

## Commits (4 slices so far)
1. `a539c85` pure resolver `lib/inbox/splits.ts` (resolveSplit + resolveCustomSplit + splitCounts) + 12 tests
2. `d2be863` G-eval gate: splitPR in inbox-metrics.ts + inbox-splits.golden.jsonl (32) + inbox-splits-gate.test.ts (needs_reply P/R=1.000, parity locked), wired into eval:run
3. `d601a24` surface generalIntent/awaitingOurReply/awaitingTheirReply/split on the conversation shape (conversations.ts)
4. `147807f` ?split= filter + splits[] counts + per-row split in /api/inbox/conversations + _types BuiltInSplit

## Requirements diff (→ implementation)
| Req group | Status | Evidence |
|---|---|---|
| R1 resolveSplit (pure, first-match, composes existing signals) | DONE | splits.ts, 12 tests |
| R1.11 needs_reply ⊆ replyWorthy parity | DONE + LOCKED | gate test parity assertion |
| R1.13 needs_reply only in attention lane | DONE | branch-1 lane gate + golden cases sp-031/032 |
| R2 surface generalIntent/awaiting*/split | DONE | conversations.ts |
| R3 ?split= filter + counts + per-row split | DONE | conversations/route.ts |
| R3.4/R6 UI tabs | DONE | `_split-tabs.tsx` (chip strip mirroring the lane-tab token style — F1 LaneChip isn't implemented, so reused the page's existing inline tab pattern) + page activeSplit/splitCounts wiring |
| R4 custom per-sender splits | DONE | split-store.ts + /api/inbox/splits CRUD + route filter/counts via resolveCustomSplit + custom tabs render in the strip + "+ Split" creator |
| R5 active/hover states | DONE | chip active = accent-soft; hover on the creator; built-in EmptyState/skeleton inherited from the existing list |
| R7 G-eval gate | DONE GREEN | needs_reply precision/recall=1.000, fn=0, wired into eval:run |

## Tests
- splits 12 unit + inbox-splits-gate 7 (needs_reply P/R=1.000, parity) green.
- `pnpm tsc` clean after every slice.
- Full suite + `next build` (8GB): see run results below (verifies the load-bearing
  conversations.ts + list-route changes don't regress detail route / compose-reply /
  list consumers).

## B3 COMPLETE (R1–R7) — 8 slices
resolver + G-eval gate + conversations surfacing + list-API filter/counts/row +
built-in split tabs + custom-split store/CRUD/route-wiring + custom tabs + creator.
Only the live-UI interaction (clicking tabs in a logged-in inbox) needs the same
human session smoke as the rest of the auth-gated inbox; tsc + full-suite + build
verify compilation + no regression autonomously.
