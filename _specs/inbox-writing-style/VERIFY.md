# B2 — inbox-writing-style — Verification (self-verify loop, 2026-06-19)

Branch `feat/inbox-ai-draft` (integration branch carrying B1 + C1 selectivity floor
+ B2, all unmerged + interdependent). Worktree agent-a64e5014ce08a19ab.

## Commits (7 slices)
1. `118f06d` writing-style record + pure helpers (clamp / normalizeSchedulingLink /
   buildWritingStylePrompt / selectAudience) + 20 tests
2. `0b5345d` writing-style GET/PUT route
3. `bcf4606` prepend writing-style (+ audience variant) into compose/reply instructions
4. `e4c5dcd` derive-style no-PII floor (buildDerivePrompt + sanitizeDerivedStyle) +
   golden (14 cases) + gate, wired into eval:run
5. `b6f32b9` derive Inngest job + proposal store + stripQuotedReply
6. `83d5a0e` derive + audience-preview routes
7. `831af90` Writing Style & Tone settings page + nav

## Requirements diff (→ implementation)
| Req | Status | Evidence |
|---|---|---|
| R1.1 writing_style JSONB record | DONE | writing-style.ts get/saveWritingStyle, key writing_style |
| R1.2 verbatim Upstream default prompt | DONE | DEFAULT_PROMPT (5 directives, teardown 09:34-38) |
| R1.3 clamp caps | DONE | clampWritingStyle (tested) |
| R1.4 scheduling link validate/drop | DONE | normalizeSchedulingLink (tested) |
| R1.5 voice/memory intact, additive | DONE | separate keys; page reads voice separately |
| R2.1 literal editable prompt textarea | DONE | settings page prompt textarea |
| R2.2 persist + use verbatim next draft | DONE | PUT clamps; compose/reply reads getWritingStyle |
| R2.3 Reset to default | DONE | Reset button sets prompt=defaultPrompt |
| R2.4 auto-send scrub | DONE | scrubAutoSend via isAutoSendInstruction (tested) |
| R3.1 buildWritingStylePrompt pure | DONE | tested |
| R3.2 prepend [style, voice, memory] | DONE | compose/reply/route.ts |
| R3.3 scheduling link only on meeting | DONE | prompt directive |
| R3.4 sign-off instruction | DONE | buildWritingStylePrompt |
| R3.5 absent → default; AI off → empty | DONE | getWritingStyle default; route aiEnabled gate |
| R4.1 add/edit/remove audiences | DONE | settings page |
| R4.2 resolve segment + first match | DONE | resolveRecipientSegment + selectAudience |
| R4.3 audience prompt replaces base | DONE | buildWritingStylePrompt (tested) |
| R4.4 selectAudience pure/order-stable | DONE | tested |
| R4.5 audience routing preview | DONE | audience-preview route + page field |
| R5.1 Inngest derive job | DONE | deriveWritingStyle |
| R5.2 ≤50 human-authored, exclude seq/campaign | DONE | query filters campaignId/enrollmentId null |
| R5.3 <5 → insufficient | DONE | MIN_MESSAGES gate |
| R5.4 reviewable proposal + derivedAt | DONE | proposal store + Accept/Dismiss |
| R5.5 no-PII sanitize | DONE | sanitizeDerivedStyle + golden gate |
| R5.6 idempotent pending | DONE | concurrency limit 1 + POST no-op |
| R6.1-6.4 settings surface + states | DONE | writing-style/page.tsx |
| R7.1 inbox-draft voice judge >=0.75 | PENDING | needs the LLM-tier inbox-draft suite (broader C1 deliverable, not built) |
| R7.2 derive no-PII golden gate | DONE GREEN | cases=14 correct=14/14, in eval:run |
| R7.3 G-design 12-item | PASS 12/12 (notes below) |
| R7.4-7.7 non-goals | RESPECTED | no per-mailbox identity, no auto-send, no new dep, no B1 rebuild |

## R7.3 G-design 12-item (settings surface)
1 tokens-only PASS · 2 one-gradient PASS (only "Fill it up for me!") · 3 one-button-system PASS · 4 type-scale PASS (16/12/11) · 5 density PASS (4px rhythm) · 6 radius PASS (lg cards / md inputs / full chips) · 7 elevation PASS (no custom shadow) · 8 contrast PASS* (hints at text-muted match sibling settings convention; proposal state shown by text+icon not hue) · 9 dark-mode PASS · 10 no-emoji/lucide PASS · 11 focus/motion PASS* (inputs outline-none like sibling inputs; Button focus ring; spinners) · 12 state-coverage PASS (loading/empty-audiences/saving/saved/derive pending-ready-rejected-insufficient/error toast).

## Tests / build
- `pnpm tsc` clean after every slice.
- writing-style 20 + derive-style gate 15 green.
- Full Vitest suite: **602 files, 5934 passed, 1 skipped, 0 failures** — no
  regression in compose/reply consumers, the inngest serve list, or settings.
- `next build` (8GB heap): **exit 0**, full route table (compile + type-check +
  route generation) — the new writing-style page + 3 routes + the inngest-route
  and compose/reply changes all compile under `next build`.
- `pnpm eval:run` (chat + golden + reply-worthy + derive-style gates): green
  (derive-style cases=14 correct=14/14).

## Honest gaps
- R7.1 (inbox-draft voice `dimension_judge` >=0.75 @ k>=3): the LLM-tier draft
  suite is part of the broader C1 deliverable and is NOT built — the deterministic
  no-PII floor (R7.2) IS green. R7.1 cannot be asserted until that suite exists
  and runs with an ANTHROPIC_API_KEY.
- Live OAuth smoke of the settings page (Fill-it-up derive round-trip, audience
  preview, Accept/Dismiss) needs a human-authenticated session (login is human-only);
  compile + unit + full-suite + build stand in autonomously.
