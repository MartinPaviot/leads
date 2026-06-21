# B4 — inbox-noise-classifier — Verification (self-verify loop, 2026-06-19)

Branch `feat/inbox-ai-draft` (integration branch: B1 + C1-floor + B2 + A1 + A2 +
B3 + B4, all unmerged). Worktree agent-a64e5014ce08a19ab.

## Commits (4 slices)
1. `60f13f7` pure `classifyNoise` (`lib/inbox/noise.ts`, KEEP guards first, OTP/invoice divergence) + 12 tests
2. `b4075cf` G-eval gate: noiseMetrics + inbox-noise.golden.jsonl (44) + inbox-noise-gate.test.ts (false_demote_rate=0.000, precision=1.000), wired into eval:run
3. `038ab64` demotion wire-in (conversations.ts soft-demote) + not-noise override store + route serialization/noiseCount
4. `a44e60c` /api/inbox/noise POST/DELETE + scope-gated Gmail-filter shim + override-matcher tests

## Requirements diff (→ implementation)
| Req | Status | Evidence |
|---|---|---|
| R1 classifyNoise (pure, KEEP guards first, recall-biased) | DONE | noise.ts, 12 tests |
| R1.4-1.7 demotion signals + 4-family no-reply set (excl. invoice/security) | DONE | divergence unit-tested |
| R2 read-model demotion | DONE (soft) | conversations.ts floors noisy attention to tier4/score0; `noise` field + noiseCount |
| R2.x re-promote on new inbound | DONE | read-time recompute (no persisted flag) |
| R3 not-noise override (owner-scoped, wins absolutely) | DONE | noise-override-store.ts (key noiseOverrides) + classifyNoise step 0 |
| R4 optional Gmail-filter persistence | DONE (scope-gated) | gmail-filters.ts honest scope_not_granted (verified gap: only gmail.readonly granted) |
| R5 G-eval: false_demote_rate <= 0.02 + noise.precision >= 0.90 | DONE GREEN | false_demote_rate=0.000, precision=1.000, fp=0, wired into eval:run |
| R6 undo | DONE | /api/inbox/noise DELETE + POST de-dupe |
| R-cardinal-sin: never demote reply-worthy human | DONE + LOCKED | KEEP guards first + zero-false-demote gate assertion |

## Tests
- noise 12 + noiseOverrideMatches 4 unit + inbox-noise-gate 7 (false_demote=0, precision=1.000) green.
- `pnpm tsc` clean after every slice.
- Full suite + `next build` (8GB): see run results below (the load-bearing
  conversations.ts noise wire-in + the importance floor must not regress the list/
  detail/compose consumers).

## Deliberate decisions (honest)
- SOFT demotion: a noisy attention thread is floored (tier 4 / score 0) so it sinks
  last, NOT hidden from the attention list. This avoids surprising the user by
  removing mail; the `noise` field + noiseCount enable a Noise filter/chip (a small
  follow-up beside B3's promotions/social splits — the design notes B4 doesn't own
  the chip route). A hard-exclude could be added behind a setting later.
- hasPriorHumanReply uses the conservative form (we have outbound to this human),
  strictly safer for the cardinal sin; the richer "they replied to our thread" form
  is a noted refinement, not a ship gate.
- Gmail-filter persistence is scope-gated off today (granted scope = gmail.readonly;
  needs gmail.settings.basic via an A-track re-consent) — the shim lights up when
  the scope lands. The in-app override is the source of truth and fully functional.

## Remaining UI (small, not owned by B4)
- A "Not noise" affordance in the pane (one-click POST /api/inbox/noise) + a Noise
  chip/split (B3-splits surface) to view demoted mail. The data + override + API are
  complete; this is presentation reuse.
