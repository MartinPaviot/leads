# P1-9 — research-agent — Verification (2026-06-22)

Branch `feat/agentic-p1`. The prospect-research pipeline can now run as an
agentic loop (the model decides what to crawl), behind the `RESEARCH_AGENT_ENABLED`
flag, with the deterministic `fetchAllSources` as fallback. Same `IntelligenceBrief`
output → plugs into the P0-2 wiring with no schema change.

## Requirements diff
| Req | Status | Evidence |
|---|---|---|
| R1 model-driven loop | DONE | `research-agent.ts` `runResearchAgent` = `tracedGenerateText({ tools, stopWhen: stepCountIs(8), experimental_output: Output.object({schema}), prepareStep })` |
| R1.5 structured output | DONE | `briefOutputSchema` (zod) = synthesized IntelligenceBrief fields; mapped to `SynthesizedFields` + derived `publicContentDepth` |
| R1.6 model routing | DONE | `routeStep`: step 0 Sonnet (default), step>0 Haiku |
| R2.2 browsePage + SSRF | DONE | `sources/browse-page.ts`: http(s)-only, host==root/subdomain, private-IP block, post-redirect host re-check |
| R2.4 conditional tools | DONE | `buildResearchTools` registers a tool only if its dep exists; `enrichApollo` only when the P1-10 impl is passed |
| R2.5/R2.6 memoise + fail-soft | DONE | per-(name,args) memo, `withTimeout` 8s, `{ok:false}` never throws |
| R4.2/R4.3 budget fail-closed / else fallback | DONE | `build-intelligence-brief.ts`: budget error rethrown, other error → `fetchAllSources`+`synthesizeBrief` |
| R4.5 flag-gated | DONE | runs only when `RESEARCH_AGENT_ENABLED==="1"`; default keeps the exact current path |
| API correctness | DONE | `pnpm tsc` 0 — `Output`/`experimental_output`/`stepCountIs`/`tool`/`ToolSet` validated against `ai@6.0.199` |

## Tests (16, all green)
- `browse-page.test.ts` (9) — helpers (rootHostOf/hostInScope/isBlockedHost); valid
  HTML → same-domain links only (no external, no self); off-domain → out_of_scope
  no-fetch; private IP → blocked_host; non-HTML → not_html; cross-domain redirect
  (res.url) → out_of_scope.
- `research-agent-tools.test.ts` (5) — conditional registration (domain/no-domain/
  apollo); fail-soft `{ok:false}`+error; success collects; memoised no-refetch.
- `research-agent.test.ts` (2 desc) — output→SynthesizedFields mapping +
  publicContentDepth; params passed to tracedGenerateText; routeStep routing.
- Regression (campaign-engine/brief): 71 green. web tsc 0.

## Deferred (flagged ocean / out of MVP)
- Full `build-intelligence-brief` flag/fallback/budget INTEGRATION test (heavy db +
  sources mock) — the wiring is tsc-validated + flag-gated OFF by default; the
  unit pieces (mapping, fail-soft, budget detection) are tested.
- T6 eval (cost ≤4x mono-call, quality ≥ deterministic on 3 fixtures) — run before
  flipping `RESEARCH_AGENT_ENABLED` on in prod.
- Headless/JS-render crawler for SPAs (browsePage is fetch+cheerio only).
- `enrichApollo` real impl = P1-10 (the tool slot is wired, impl conditional).
- Rollout: ship dark, enable per-tenant via the env flag after the eval gate.
