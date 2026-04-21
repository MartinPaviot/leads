# Provider Abstraction — Requirements

## Problem

Every data need (company enrichment, investor data, visitor ID) is wired straight to one vendor. `skills/enrichment/tam-builder/handler.ts` imports Apollo directly; `lib/llm-enrichment.ts` is called as a one-off fallback in scattered if-blocks. Adding a second source for any domain means touching N call sites and hand-coding the failover. Monaco parity (multi-source enrichment, PitchBook investors, RB2B visitor ID) is blocked on this.

## Goals

1. Every data need routes through a **domain-scoped registry** of providers. Callers ask for *what* they want, not *from whom*.
2. Adding a new provider = register one adapter, zero changes elsewhere.
3. **Waterfall chain** with fallback: primary → secondary → LLM — each merging non-null fields rather than overwriting.
4. **Provenance stamp** — for every persisted field, record which provider contributed it, when, and for how much.
5. **Cost tracking** wired in from call one. Cost-zero providers declare that explicitly.
6. **Deterministic tests** — can simulate provider outages + budget caps without hitting the network.

## Non-goals

- Not a generic RPC/plugin framework. Providers are domain-specific (company enrichment is a separate concern from investor lookup is a separate concern from visitor-ID).
- Not a replacement for existing provider clients (`apollo-client.ts` stays). We wrap them in adapters.
- No runtime-dynamic loading — providers are registered at module load time, simple and inspectable.

## Scope (this phase)

Only **company enrichment**. Ships:
- `lib/providers/company-enrichment/` with types, registry, waterfall, Apollo adapter, LLM fallback adapter.
- Migration of `/api/enrich/route.ts` to use the waterfall.
- Tests covering: normal chain, Apollo-down, LLM-only, all-down, provenance stamping.

Future phases plug in Clearbit, Hunter, Crunchbase, and parallel domain registries for investors / visitor-ID without any code change downstream.

## Constraints

- Callers must not need to know providers exist — `enrichCompany({domain}, ctx)` returns a normalized `EnrichedCompany`.
- A provider that is not configured (no API key) must quietly skip, not throw.
- Results must be JSON-serializable (for Inngest / audit logging).
- Must work in both API routes and Inngest background functions.
