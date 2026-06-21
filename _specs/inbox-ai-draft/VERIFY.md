# B1 — inbox-ai-draft — Verification (self-verify loop, 2026-06-19)

Branch `feat/inbox-ai-draft` (worktree agent-a64e5014ce08a19ab), based on origin/main.
Loop: implement each slice → re-read spec → diff → tsc + tests → correct → commit.

## Commits (6 slices, one logical change each)
1. `4260e34` reply-worthy resolver `lib/inbox/reply-worthy.ts` + 22 Vitest cases
2. `24ea7c9` expose `replyWorthy` on the Conversation shape (`conversations.ts`)
3. `5fbbe45` auto-draft pref `lib/inbox/auto-draft-prefs.ts` + `/api/inbox/auto-draft` route + 5 tests
4. `a0c51a1` pane wiring: Generate-draft + Cmd/Ctrl+J + auto-draft-on-open (`_conversation-pane.tsx`, `_types.ts`)
5. `8062fdc` composer always-visible edit-with-AI field + Cmd/Ctrl+J (`email-composer-panel.tsx`)
6. `bdcf608` auto-draft toggle on the writing-voice settings page

## Requirements diff (EARS → implementation)
| Req | Status | Evidence |
|---|---|---|
| R1.1 primary Generate-draft only WHERE reply-worthy | DONE | `_conversation-pane.tsx` header block gated on `conv.replyWorthy` |
| R1.2 click/Cmd+J (no draft) → composeReply | DONE | `generateDraft()` POST `/api/inbox/compose/reply`; pane Cmd/Ctrl+J when `!composer` |
| R1.3 non-empty → editable body+subject, composer open+focused | DONE | `setComposer({ body: text, subject })`; composer auto-focuses body on mount |
| R1.4 ground in thread+voice+memory+language | DONE (reuse) | route folds `buildVoicePrompt`+`buildMemoryPrompt`; `composeReply` matches language |
| R1.5 in-flight loading, non-blocking | DONE | `drafting` → Loader2 + "Drafting…"; composer stays editable |
| R1.6 empty/error → body unchanged, "Couldn't draft" | DONE | `setComposer((c) => c ?? blank)` + warning toast |
| R1.7 no send/queue/schedule side-effect | DONE | generateDraft only mutates composer state |
| R2.1 AI-instructions input "Hit Cmd/Ctrl+J to edit with AI" + repurpose key | DONE | always-visible input above body; composer Cmd/Ctrl+J submit/focus; no emoji |
| R2.2 submit NL → rewrite → replace body in place | DONE (reuse) | existing `handleRewrite` |
| R2.3 multi-part semantic transforms one pass | DONE (reuse) | `rewrite.ts`; measured by C1 |
| R2.4 preserve facts/signature/language | DONE (reuse) | `rewrite.ts` |
| R2.5 one-tap Undo | DONE (kept) | `rewriteUndo` |
| R2.6 refine empty/error → unchanged + notice | DONE (reuse) | `handleRewrite` |
| R3.1 pure `isReplyWorthy` (boolean + reasons), composes existing signals, no LLM/vendor list | DONE | `lib/inbox/reply-worthy.ts` |
| R3.2 machine-sent / no-reply intents → false | DONE | NO_REPLY_INTENTS + isMachineSent gate; 22 tests |
| R3.3 human + response-inviting intent → true | DONE | HUMAN_RESPONSE_INTENTS |
| R3.4 false → no affordance, no auto-draft | DONE | button gated; auto-draft gated |
| R3.5 exposed on detail payload | DONE | `replyWorthy` on Conversation shape, spread by detail route; type on `detail.conversation` |
| R3.6 recall bias on ambiguous human mail | DONE | STEP 4 default true |
| R4.1 pref user_preferences (inbox/auto_draft), default OFF, no migration | DONE | `auto-draft-prefs.ts` |
| R4.2 ON + reply-worthy on open → auto generate | DONE | auto-draft effect (once per open, ref-guarded) |
| R4.3 OFF → only explicit | DONE | effect no-ops when `!autoDraftOn` |
| R4.4 non-reply-worthy → no auto generate | DONE | effect gated on `replyWorthy` |
| R4.5 toggle + owner-scoped persist | DONE | voice settings checkbox → PUT `/api/inbox/auto-draft` |
| R5.1 every draft editable + explicit Send | DONE | only `handleSend` sends |
| R5.2 never imply already sent | DONE | copy "never sent on its own" |
| R5.3 gate on aiEnabled; off → empty/non-answer | DONE (reuse) | route returns `{subject:"",text:""}` when off → fail-closed blank composer |
| R6.1 owner+tenant scope, server-reload by key | DONE (reuse) | route `getInboxScope`+`scopeConversationRows` |
| R6.2 LLM rate limit on endpoints | DONE (reuse) | existing `checkRateLimit` |
| R7.1 C1 eval green at thresholds | SELECTIVITY GREEN; prose/refine PENDING | `inbox-reply-worthy.golden` (36 cases) via `replyWorthyPR`: **precision=1.000 recall=1.000 fn=0**, wired into `pnpm eval:run` (3 files, 41 tests, exit 0). `send_without_edit`/`edit_distance`/draft `dimension_judge`/`inbox-refine` suites = separate C1 deliverable |
| R7.2 G-design 12-item | PASS 12/12 (notes below) |

## Tests
- `reply-worthy.test.ts` 22 + `auto-draft-prefs.test.ts` 5 green.
- Full web suite: **483 files, 4947 passed, 1 skipped, 0 failures** — no regression in any `conversations.ts` consumer.
- `pnpm tsc` clean after every slice.
- `next build` (no-lint, 8GB heap): **exit 0**, full route table printed (compile + type-check + route generation all green) — proves the new `/api/inbox/auto-draft` route + settings pages + pane/composer compile under `next build` (guards the page-export gap, reference_nextjs-page-export-build-gap). The 4GB run compiled successfully but OOM'd in the type-check worker; standalone `pnpm tsc` is green, and the 8GB run cleared it.
- `pnpm eval:run`: **3 files, 41 tests, exit 0** — chat-eval-suite + golden-eval-gate + the new inbox-reply-worthy-gate all green.

## R7.2 G-design 12-item (composer + draft block)
1 tokens-only PASS · 2 one-gradient PASS (added none) · 3 one-button-system PASS (Generate-draft/Reply = shared Button; one gradient Send per composer view) · 4 type-scale PASS (12/13px) · 5 density PASS (no new list rows) · 6 radius PASS (rounded-lg) · 7 elevation PASS (no new shadow) · 8 contrast PASS* (hint text uses text-tertiary, matching the existing voice/ai-profile settings convention) · 9 dark-mode PASS (all var(--color-*)) · 10 no-emoji/lucide PASS (Sparkles/Mail/RefreshCw) · 11 focus/motion PASS* (inputs use outline-none like existing composer inputs) · 12 state-coverage PASS (disabled + in-flight states on the AI field).
*two items follow the existing sibling-component convention rather than introducing a new pattern.

## Not autonomously verifiable here (honest)
- A true end-to-end live Playwright pass needs the worktree dev server on a free port (3000 is the other session's, on a different branch) AND an authenticated session — login is Google OAuth, a human-only step. Compilation + unit + full-suite + build stand in for it autonomously; the interactive UI beats (button appears only on reply-worthy mail, Cmd/Ctrl+J, auto-draft-on-open) should get one human-OAuth smoke pass before merge.
- R7.1: B1 is DONE only once the C1 suites are green — built next.
