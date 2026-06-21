# Inbox overhaul — master spec roadmap (Upstream-parity + multi-mailbox)

Source analysis (read these before any spec): `_research/upstream/CORE-VALUE.md` (the thesis),
`_research/upstream/QUALITY-BENCH.md` (the measured bars), `_research/upstream/BUILD-PLAN.md`
(patterns→Elevay files), `_research/upstream/teardown/01-12` (screen specs + pixel tokens),
`_research/upstream/teardown/GAPS-PASS2.md` (what the teardown still misses).

16 Kiro specs, 3 tracks + 2 cross-cutting gates. Each spec = `requirements.md` (EARS
GIVEN/WHEN/THEN) + `design.md` + `tasks.md`, independently shippable + testable.

## Cross-cutting GATES (apply to every UI/intelligence spec — not separate features)
- **G-design**: every UI spec carries a design-review acceptance criterion vs the design-system
  tokens (spec F1). No UI ships without it — this is what buys the "feel".
- **G-eval**: every intelligence spec carries a measurable bar in `pnpm eval:run` (spec C1).
  No AI feature is "done" until its bar is green.

## Track A — Multi-mailbox centralization (4)
| ID | Spec dir | Scope | Prio | Deps |
|----|----|----|----|----|
| A1 | `inbox-mailbox-connect` | OAuth-LINK "add another mailbox" (attach to current user, not sign-in) + IMAP/SMTP connect | P0 | — |
| A2 | `inbox-send-as` | From-selector; default = thread's mailbox; carry `mailbox_id` to outbound | P0 | A1 |
| A3 | `inbox-mailbox-rail-identity` | Rail (All + per-box, unread, color) + per-mailbox signature/display-name/voice | P1 | A1, F1 |
| A4 | `inbox-multimailbox-sync` | Per-mailbox sync fan-out + refresh/reauth/health + cross-box thread dedup | P1 | A1 |

## Track B — Upstream quality-parity intelligences (8)
| ID | Spec dir | Scope | Prio | Deps |
|----|----|----|----|----|
| B1 | `inbox-ai-draft` | Generate-draft (button + Cmd/Ctrl+J) + edit-with-AI + SELECTIVITY (reply-worthy only); lands editable | P0 | C1 |
| B2 | `inbox-writing-style` | Writing Style & Tone (about-me/sign-off/scheduling-link/editable prompt/fill-from-sent/per-audience) | P0 | C1 |
| B3 | `inbox-splits` | Intention Splits (Needs Reply/Follow Ups/Promotions/Social) as routes + count chips + custom per-sender Splits | P1 | F1 |
| B4 | `inbox-noise-classifier` | Noise auto-demotion (cold/auto/newsletter) + "not noise" feedback + optional Gmail-filter persistence | P1 | C1, B3 |
| B5 | `inbox-ask-agent` | Ask-inbox AGENT (retrieve→verify→act, multi-step tool use) + retrieval-grounded summarization | P1 | C1 |
| B6 | `inbox-command-palette` | Cmd/Ctrl+K palette + single-key shortcuts (E/S/L/B/!) context-aware (reuse CLE-14 page-actions) | P2 | F1 |
| B7 | `inbox-followup-timing` | Awaiting-reply detection + computed follow-up time + pre-drafted nudge | P2 | C1, B1 |
| B8 | `inbox-collaboration` | Reactions + comments sidebar + channels + thread rename (only if team-first) | P3 | F1 |

## Track F — "Feel" layer (the UX-equivalence delta the 13 didn't cover) (3)
| ID | Spec dir | Scope | Prio | Deps |
|----|----|----|----|----|
| F1 | `inbox-design-system` | Tokens + components to the measured bar (44px rows, gradient #12B4D8→#6C73E4 r12, type scale, density). The foundation for G-design. | P0 | — |
| F2 | `inbox-performance` | Perceived speed: optimistic UI, prefetch, sub-100ms interaction budget, route transitions | P1 | — |
| F3 | `inbox-states-coverage` | Every screen's empty/loading/skeleton/hover/error states + the un-captured surfaces (compose-new, snooze picker, body folding, .ics cards) — completes the teardown so specs don't guess | P1 | finish teardown |

## Gates (2)
| ID | Spec dir | Scope | Prio |
|----|----|----|----|
| C1 | `inbox-quality-evals` | The measured bars: triage precision (~0 false-demotes), draft send-without-edit + edit-distance, refine-instruction adherence, summary factuality vs source, agent correctness. Wired to `pnpm eval:run`. | P0 (transverse) |
| — | G-design / G-eval | Acceptance criteria embedded in every spec above (not standalone). | — |

## Sequencing (expert order)
1. **Foundations first**: F1 (design-system) + C1 (eval gate). Everything visual/intelligent depends on these.
2. **Core value MVP**: A1 + A2 (multi-mailbox usable) · B1 + B2 (draft + voice — the felt win).
3. **Triage**: B3 + B4 (Splits + Noise — the most visible win).
4. **Depth**: B5 (agent), A3/A4 (rail/sync), B6 (palette), B7 (follow-up), F2 (perf), F3 (states).
5. **Optional**: B8 (collaboration) only if team-inbox is a positioning pillar.

## Honest scope note
13 specs (A+B+C) = functional + intelligence parity, measured. The +3 F-track specs + the
G-design/G-eval gates = the "feel" delta toward UI/UX experience-equivalence. Even at 16,
Superhuman-grade feel remains a craft/iteration effort the specs enable but don't guarantee.
