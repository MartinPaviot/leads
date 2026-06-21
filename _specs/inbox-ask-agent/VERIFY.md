# B5 — inbox-ask-agent — Verification (self-verify loop, 2026-06-19)

Branch `feat/inbox-ai-draft` (integration branch: B1 + C1-floor + B2 + A1 + A2 +
B3 + B4 + B5, all unmerged). Worktree agent-a64e5014ce08a19ab.

## Commits (2 slices)
1. `1d8a693` verifier (ask-agent-verify.ts) + floor metrics (inbox-metrics.ts) + inbox-ask.golden.jsonl (16) + inbox-ask-agent-gate.test.ts (retrieval_recall=1.000, abstention==1.0), wired into eval:run
2. `67d0f1c` tools (ask-agent-tools.ts) + bounded loop (ask-agent.ts runInboxAgent) + ask-inbox route upgrade (multi-step when a model is present, single-pass fallback)

## Requirements diff (→ implementation)
| Req | Status | Evidence |
|---|---|---|
| R1 bounded multi-step loop (retrieve→verify→act) | DONE | runInboxAgent: tracedGenerateText + tools + stopWhen: stepCountIs(6), NOT hand-rolled |
| R1.6 honest degrade with no key | DONE | route falls back to single-pass askInbox |
| R2 grounded + scoped retrieval | DONE | tools close over the getInboxScope corpus; no DB in execute (structural tenancy) |
| R2.4/R2.6 citation in-range + drop fabricated | DONE | verifyAnswer (8 tests) |
| R3 abstention beats fabrication | DONE + LOCKED | zero valid citations → answered=false; abstention_correctness==1.0 on negatives |
| R4 three AI-SDK tools, max-step cap | DONE | search_inbox/read_thread/summarize_thread; MAX_STEPS=6; 5 execute tests |
| R5 retrieval-grounded summarization | PARTIAL | summarize_thread returns thread content for the model to summarize; full summarizeThread reuse is a noted refinement |
| R6 never auto-acts | DONE | no write tool in the loop; read-only |
| R7 gated + rate-limited | PARTIAL | aiEnabled gate kept; rateLimitLLM/enforceLlmBudget — enforceLlmBudget runs inside tracedGenerateText; an explicit rateLimitLLM call is a noted follow-up |
| R8/G-eval deterministic floor | DONE GREEN | retrieval_recall>=0.90 (=1.000), citation-in-range, abstention==1.0; wired into eval:run |
| R9 ask UI panel | REMAINING | _inbox-ask.tsx [BLOCKED-ON F1] — the ask-inbox API is upgraded; the panel is presentation |

## Tests
- verifier 8 + tools 5 + metrics/floor gate 7 = 20 B5 unit/gate tests green.
- `pnpm tsc` clean after every slice.
- Floor: retrieval_recall=1.000 (12/12), abstention_correctness=1.0, fabricated citations rejected.
- Full suite + `next build` (8GB): see run results below.

## Honest gaps (autonomous-verification ceiling)
- The LIVE multi-step agent behavior (does the model abstain on real negatives,
  ground its answers, stay within the step cap) + grounded_answer_rate >= 0.85 are
  the LLM tier — they need an ANTHROPIC_API_KEY run. The DETERMINISTIC spine
  (retrieval recall, the verifier's fabrication-rejection + in-range clamp +
  collapse-to-abstain, abstention==1.0 on a correct-agent pass) is green offline.
- The route runs the agent only when ANTHROPIC_API_KEY is set; otherwise the
  single-pass keyword answerer (unchanged) handles the request.
- R5 (true summarizeThread reuse) + R7 (explicit rateLimitLLM) + R9 (UI panel) are
  small noted refinements; the agent's retrieve→verify→act core is complete + the
  measurable spine is locked.
