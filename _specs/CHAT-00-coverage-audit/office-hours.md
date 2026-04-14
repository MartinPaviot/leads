# CHAT-00 — Office Hours

## Problem statement (one sentence)

LeadSens chat exposes 51 tools against 129 mutating API endpoints — meaning ~101 CRM actions available in the UI cannot be triggered via chat, so users hit dead ends whenever the assistant needs to do something non-trivial.

## Why now

Attio's "Ask Attio" reaches parity with its UI (35 MCP tools + internal Thread Agent superset) precisely because **every meaningful action is reachable as a tool**. Without that coverage baseline, every downstream investment (capability resolver, undo, long-running agents, Slack bot) is layered on a partial substrate and will ship gaps by construction.

## Premise challenge — is this the right thing to build first?

**Alternative 1: Skip the audit, build capability resolver directly (Phase 2).**
- Pro: resolver is the "brains", audit is just mapping.
- Con: resolver without a complete registry means the resolver filters a partial set — the chat will still hit "I can't do that" walls for 80% of actions. False confidence.
- Verdict: reject.

**Alternative 2: Build tools on-demand as user requests fail.**
- Pro: user-driven prioritization.
- Con: degrades trust every time chat refuses; production outage per gap; no ETA for full coverage.
- Verdict: reject — violates "boil lakes" (CLAUDE.md).

**Alternative 3: Full audit + tiered build plan (chosen).**
- Pro: deterministic coverage, parallelizable batches, testable per tier.
- Con: 3-day audit before any tool gets built.
- Verdict: accepted. Audit is cheap given we already have the raw data from the Agent run.

## Layer check (CLAUDE.md three-layer rule)

- **Layer 1 — tried and true**: Attio's 35 MCP tool shape is a documented public reference. Kiro-style spec per-tool is our proven methodology.
- **Layer 2 — new and popular**: AI SDK `tool()` + zod validation is already in the codebase. Nothing new to adopt.
- **Layer 3 — first principles**: the per-turn capability resolver (Attio's Thread Agent pattern) is Layer 3 territory — we'll ship it in CHAT-02, not here.

## Completeness target

**10/10** — every mutating endpoint either (a) has a chat tool, (b) is explicitly excluded with a reason (webhooks, cron, e2e-test, admin-only-one-click), or (c) is flagged as "UI-only by design" with Martin's approval. Zero unknowns at end of Phase 0.

## Known pitfalls to avoid

1. Don't let "audit" mean "give the model 129 tools" — registry bloat hurts tool-selection accuracy. The audit must **categorize by user-facing action**, and many endpoints will map to one higher-level tool (e.g., `updateOpportunity` covers name/value/date/owner rather than one tool per field).
2. Don't expose destructive tools without guardrails. Delete/merge require confirmation + undo (CHAT-04). Flag them in the matrix, gate in CHAT-02.
3. Don't re-implement endpoints — tools should wrap existing routes, not duplicate business logic. One source of truth per action.
4. Don't skip semantic variants — `semanticSearchNotes` and `queryNotes` are both needed, they're different query shapes.

## Definition of done for CHAT-00

- `coverage-matrix.md` lists all 129 mutating endpoints with status: covered / gap-tier-A / gap-tier-B / excluded (reason).
- `tasks.md` enumerates tool creation tickets for tier A/B gaps in dependency order.
- `feature_list.json` has entries `CHAT-01` through `CHAT-09` with dependencies.
- All files committed on `feat/CHAT-00-coverage-audit`.
- Ready to open CHAT-01 without re-discovery.
