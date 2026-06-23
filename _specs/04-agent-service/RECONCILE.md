# RECONCILE.md — Spec 04 Agent Service (T0)

> Read-only reconciliation, 5-finder audit, cited `file:line`. This spec hits a **real conflict**: it mandates **Bedrock** + **Composio**, neither of which is wired, and Bedrock contradicts the implemented **Anthropic-direct** architecture. `=== GATE: reconciliation ===` — needs a decision (adapt vs. provide creds).

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1-call | Call Claude **via Bedrock** | **conflict** | Repo is Anthropic-direct (`@ai-sdk/anthropic`, EU endpoint `eu.anthropic.com`); **no** AWS SDK / `@ai-sdk/amazon-bedrock` / Bedrock code; Bedrock is comment-only |
| AC1-tools | Inject workspace-scoped tools **via Composio** | **missing** | **Zero** Composio anywhere (no dep, no key, no MCP toolset); in-process tenant-scoped chat-tool registry exists instead |
| AC1-validation | Zod-validated output, repair-or-fail | **partial** | `generateObject` validates (fail-only, throws); **no repair**; no central `runAgent` entry |
| AC2 | Meter tokens via spec-02 middleware | **partial** | `trackTokenUsage`/`enforceLlmBudget` exist; spec-02 `meter()` not wired (it's on the unmerged feat/02) |
| AC3 | `agent_run` row (inputs/tools/output/tokens/latency/eval) | **partial** | `agent_traces`/`llm_calls` log tokens/latency but not tools-called or eval-result; no `agent_run` shape |
| AC4 | Eval rubric **before return**, block on fail | **missing** | All eval is post-hoc/async/sampled/offline; `traced-ai` returns unconditionally; `withCorrection` returns best-effort on exhaustion (opposite of AC4) |
| AC5 | No ambient creds / cross-tenant tools | **partial** | Tenant scoping by-construction (closures capture `tenantId`); but ambient `process.env` keys + no cross-tenant assertion; no Composio surface |

## The conflict (AC1-call, AC1-tools)

- **Bedrock — `conflict`.** `ai-provider.ts:28,105-114` uses `createAnthropic` against `api.anthropic.com` / `eu.anthropic.com`; `package.json:24-27` has no `@aws-sdk/*` / `@ai-sdk/amazon-bedrock` (repo-wide grep = 0). `FINDING-004/requirements.md:13`: "There is no Bedrock EU-west configuration." ~100 call sites import `anthropic()` directly. Forcing Bedrock needs AWS creds (I don't have) + rewires ~100 sites = **changes working behavior**.
- **Composio — `missing`.** Zero hits for `composio`/MCP-toolset; no `@composio` dep, no `COMPOSIO_API_KEY`. The session's Composio MCP is unrelated to the codebase. The existing workspace scoping is in-process: `buildAllChatTools(ctx)` closures capture `ctx.tenantId` (`chat/tools/context.ts:8-21`), `resolveCapabilities` filters by role/plan/surface (`capability-resolver.ts:223-263`).

## The buildable parts (on existing infra)

- **AC1-validation:** `generateObject` via `tracedGenerateObject` validates against a Zod schema (reply-agent `replySchema`, sequence-generator), but throws with no repair (`traced-ai.ts:161-192`). Add repair-or-fail in the `runAgent` facade.
- **AC4 eval gate:** the judge exists (`onlineEval`/`gradeWithLLM`, `corrections.ts`) but runs post-hoc, sampled, async (`eval-functions.ts:146`), never blocking. `runAgent` calls it **inline** and branches on the result.
- **AC2 metering:** spec-02 `meter()` (feat/02) wraps the model call — injected so feat/04 stays off main.
- **AC3 agent_run:** `agent_traces`/`llm_calls` (`ai-observability.ts`) capture tokens/latency; add an `agent_run` table (or columns) for tools-called + eval-result.
- **AC5:** reuse the `tenantId`-closure scoping; add an explicit cross-tenant assertion + a no-ambient-cred rule in the facade.

## Recommendation (the adaptation — standing invariant: adapt around a conflict + document)

Build `runAgent({kind, input, schema, tools?, evalRubric})` as a governed facade over the **existing Anthropic-direct provider** + the **in-process workspace-scoped tool registry**, with Zod repair-or-fail, an **inline blocking eval gate**, an `agent_run` log, and injected spec-02 metering. Document two deviations:
1. **Bedrock → Anthropic-direct EU** (`eu.anthropic.com` already satisfies EU residency, the likely reason Bedrock was specced; forcing Bedrock changes working behavior + needs absent AWS creds).
2. **Composio → in-process tenant-scoped tools** (Composio = external connected-account tools; defer until there's a need + `COMPOSIO_API_KEY`; the in-process registry already gives workspace isolation + AC5).

This satisfies the **governance intent** of spec 04 (one audited, cost-bounded, eval-gated entry) on existing infra, without changing working behavior. The literal Bedrock/Composio path needs AWS + Composio credentials.

## Decision needed at this gate
- **(A, recommended)** Build the adaptation above. I proceed now.
- **(B)** Build as specified — provide AWS Bedrock creds + `COMPOSIO_API_KEY`; I wire `@ai-sdk/amazon-bedrock` + Composio (larger blast radius, rewires the provider path).

`agent_run` is a schema change (migration 0086) → merge parks pending prod migration regardless of A/B.
