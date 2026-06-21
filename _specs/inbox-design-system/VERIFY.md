# F1 — inbox-design-system — Verification (self-verify loop, 2026-06-20)

Branch `feat/inbox-ai-draft` (integration branch). Worktree agent-a64e5014ce08a19ab.
F1 was the planned foundation ("foundations first: F1 + C1") that the build deviated
from by deferring — the founder's "années lumières from Upstream" reaction on :3007 is
the consequence (intelligence bolted on the OLD inline chrome). This corrects it.

## Commits (the high-value core)
1. `4d00ab8` B1 — INBOX DENSITY tokens in globals.css (--inbox-row-height 56px etc.) + globals.tokens.test
2. `14eff26` B3 — extract InboxRow with the F1 type scale (sender 14/700, subject 14/600, snippet 13/secondary, 56px) + 4 happy-dom tests
3. `39c1f60` B4 — extract LaneChip + CountBadge, apply to the lane bar (count pills, not "(n)") + 4 tests
4. `5bc526d` B2 — tokens.contract.test (machine half of the G-design gate; inbox tree is token-clean)

## Requirements diff
| Task | Status | Evidence |
|---|---|---|
| B1 inbox density tokens | DONE | globals.css + globals.tokens.test |
| B2 tokens contract (machine gate) | DONE | tokens.contract.test (no raw color literal in the inbox tree) |
| B3 InboxRow extraction + type scale | DONE | _inbox-row.tsx, 4 tests; _conversation-list.tsx now maps it |
| B4 LaneChip + CountBadge | DONE | _lane-chip.tsx, 4 tests; the 3 inline tab blocks replaced |
| B5 pane-card family unification | DEFERRED | the pane cards already use rounded-lg + var(--color-border-default); a token-class consolidation is low-risk polish |
| B6 button single-style audit | DEFERRED | a visual sweep needing eyes; the contract gate already forbids raw literals |
| B7 reconcile stale design docs | DEFERRED | _harness/design-language.md + design-review.md still describe the old dark-indigo; a docs rewrite (governance, not user-visible) |
| B8 design-review Playwright pass | BLOCKED | requires an authenticated browser on :3007 + a human 12-item scoring — not autonomously runnable |
| B9 ROADMAP gate note | DEFERRED | one-line note pointing UI specs at design §8 |

## Tests
- globals.tokens 2 + inbox-row 4 + lane-chip 4 + tokens.contract 2 = 12 F1 tests green.
- `pnpm tsc` clean. The inbox renders the new denser rows + count-pill chips on the live :3007 dev server (Turbopack hot-reload).

## Honest scope note
F1 as specced is INCREMENTAL polish (extract components + apply density/type tokens),
not the full Upstream transformation. Two larger deltas remain for the Upstream "feel":
(1) the IA — Upstream uses a LEFT SIDEBAR of Split-folders as routes /inbox/<slug>
(Primary/Promotions/Noise); Elevay has lane tabs + a mailbox rail. (2) Craft iteration
on density/spacing/motion that needs the founder's eyes on :3007. F1 raises the floor;
the Upstream-identical feel is a craft loop the specs enable but don't guarantee
(per ROADMAP's own honest note). See [[feedback_inbox-feel-gap]].
