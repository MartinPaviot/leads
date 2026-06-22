# RECONCILE.md — Spec 10 Fit Qualification Agent (T0)

> Read-only reconciliation, 5-finder audit. No `qualifyFit`/`AgentVerdict` exists; `runAgent` (spec 04) is parked. The building blocks (a website-fetch agentic loop, a fail-closed classifier, the cite-or-abstain pattern, the qualification enum) all exist but none returns a fit verdict over fetched evidence.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Agent inspects retrieved website evidence → structured fit verdict w/ citations | **partial** | `institution-classifier` is "is-actually-X" over **fields** (no fetch, no citations); `research-agent` fetches + cites but outputs a **dossier**, not a verdict; no `runAgent` |
| AC2 | Run only on cheaply-filtered accounts | **missing** | No gate tying an agentic qualification to a prior cheap-filter pass |
| AC3 | Cite-or-abstain; insufficient → needs-review | **partial** | The pattern exists (`research-agent` "leave null", `institution-classifier` fail-closed) but not as a verdict's abstain path |
| AC4 | Feed verdict into spec-09 partition + meter | **missing** | No agentic verdict feeds `scoreAccount`; metering is spec-02 (parked) |
| AC5 | Eval rubric enforced before the verdict counts | **missing** | spec-04 eval gate parked; no rubric on a fit verdict |

## Reuse inventory
- `campaign-engine/research-agent-tools.ts` — `fetchWebsite` + `browsePage` (the website-fetch **tool** for the agent).
- `campaign-engine/research-agent.ts` — the agentic loop + cite-or-abstain system prompt + `publicContent{quote,url}` (the **Citation** shape + grounding pattern).
- `icp/institution-classifier-core.ts` — the fail-closed "anything unplaceable → unknown" discipline.
- `scoring/score-account.ts` `Qualification` enum + the criterion-input seam (AC4 target).
- spec-04 `runAgent` (parked, **injected**) — the governed call (schema + eval gate + metering).

## Decisions (taken, full autonomy)
1. Build `lib/qualification/agent/qualify.ts` `qualifyFit(account, question, deps): AgentVerdict` — deterministic orchestration around the **injected** `runAgent`; the verdict itself is agentic.
2. **AC2:** gate — `qualifyFit` refuses (returns `needs-review`, never calls the agent) unless `account.passedCheapFilters`.
3. **AC1/AC4/AC5:** call the injected `runAgent` (kind `fit-qualification`, the `AgentVerdict` schema, the website-fetch tool, the kind's rubric). `runAgent` meters + eval-gates internally (spec 02/04). On `evalPassed:false` → `needs-review` (AC5).
4. **AC3:** cite-or-abstain — a `pass`/`fail` verdict with **zero citations** is downgraded to `needs-review` (never an ungrounded verdict).
5. **AC4 feed:** `verdictToFitInput(v)` maps `pass→{operable,matched}`, `fail→{operable,exclude}`, `needs-review→{operable:false}` for the spec-09 criterion.

Deterministic gate/abstain/feed unit-tested with a **stub `runAgent`** (no live model/fetch in CI). No schema → **mergeable** off main.
