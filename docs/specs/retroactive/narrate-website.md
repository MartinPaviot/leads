# Retroactive spec: narrate-website

## Status
- Shipped in: `9a1d937` (PR #5, "WS-0 PR 1"), 2026-04-21
- Spec written: 2026-04-22
- Reviewed by Martin: pending

## Purpose
Streams a short, first-person narrative of what the AI understood about the user's company from its website. Displayed during onboarding wizard step "product" as the first visible proof that the agent is reasoning about the founder's business — the "wow effect." Fires immediately when the user clicks Continue on the welcome step, so by the time they reach the product step the text is partially or fully written.

## Current behavior
- **Trigger:** `onboarding-wizard.tsx:676` calls `startNarrative(domain)` on welcome-step Continue, in parallel with `analyze-website` (structured ICP extraction) and Apollo enrichment.
- **Endpoint:** `POST /api/onboarding/narrate-website` with body `{ domain: string }`.
- **Auth:** `getAuthContext()` — any authenticated user (no role check).
- **Rate limit:** `checkRateLimit("llm", authCtx.userId)` — per-user LLM rate bucket.
- **Domain cleaning:** strips protocol, `www.` prefix, and trailing paths.
- **Scrape:** tries `https://<domain>` then `https://www.<domain>`. Each candidate goes through `assertPublicUrl()` (SSRF guard — blocks private IPs, metadata endpoints, localhost). Fetch timeout is 6s. On success, extracts title, meta description, OG description, up to 12 H1/H2 headings, and 2,000 chars of body text (scripts/styles/nav/footer stripped).
- **LLM call:** `tracedStreamText` with `agentId: "onboarding-narrator"`. Model: `claude-sonnet-4-6` (falls back to `gpt-4o-mini` if no Anthropic key). Temperature 0.3. Prompt specifies 4 paragraphs: what the company does, buyer persona, first outbound angle, what the agent does next.
- **Response:** `result.toTextStreamResponse()` — raw text stream, not NDJSON. Client reads via `TextDecoderStream` and appends chunks to state.
- **Fallback:** if scrape fails entirely, the LLM infers from the domain name alone (prompt says: "Infer what you can from the domain name alone").
- **Client abort:** `AbortController` — re-triggering aborts the previous request. Errors other than `AbortError` are silently logged to console.
- **No persistence:** the narrative text is not saved anywhere. It exists only in React state during the wizard session. Navigating away loses it. Re-entering the wizard re-streams it.

## Dependencies

### Upstream (what calls this)
- `onboarding-wizard.tsx:startNarrative()` — the only caller.

### Downstream (what this calls)
- `lib/auth-utils.ts:getAuthContext()` — session auth.
- `lib/rate-limit.ts:checkRateLimit("llm", userId)` — per-user rate bucket.
- `lib/ssrf-guard.ts:assertPublicUrl(url)` — blocks private/internal URLs.
- `lib/traced-ai.ts:tracedStreamText()` — traced LLM streaming wrapper.
  - This in turn calls `enforceLlmBudget(tenantId)` (pre-dispatch budget gate).
  - And `recordTrace()` which writes to `agent_traces` table.
- `lib/observability.ts:AGENT_REGISTRY["onboarding-narrator"]` — registered with maxLatencyMs: 20,000, maxCostPerCall: $0.08.
- `lib/estimate-cost.ts` — lists `narrate-website` with p50 $0.04, ~8s estimate.

### Data read/written
- Reads: nothing from DB (stateless).
- Writes: one row to `agent_traces` via `tracedStreamText` (latency, tokens, cost, status).

## Edge cases handled
- SSRF protection via `assertPublicUrl` — blocks private IPs, cloud metadata endpoints, non-http schemes.
- Scrape timeout at 6s — doesn't hang on slow sites.
- Domain-only fallback — LLM still produces a narrative when the site is unreachable.
- Abort on re-trigger — previous in-flight request is cancelled.
- No LLM configured — returns 500 "No LLM configured" (defensive, should never happen in production).
- Rate limiting — per-user burst protection via `checkRateLimit`.
- Budget enforcement — `enforceLlmBudget` via `tracedStreamText` prevents over-cap usage.
- Body text capped at 2,000 chars — bounds prompt size.

## Edge cases NOT handled (known gaps)
- **No retry on scrape failure.** If both URL candidates fail (e.g., site is temporarily down), the LLM gets domain-name-only input. No retry is attempted.
- **No caching.** If the user navigates back and re-enters the product step, the entire scrape + LLM call fires again. Each re-entry costs ~$0.04.
- **No persistence.** The narrative is ephemeral — lost on page refresh, tab close, or wizard re-entry. If this content is valuable enough to show, it may be valuable enough to persist (in `tenants.settings` or a dedicated field).
- **Redirect handling is `manual`.** `redirect: "manual"` on the fetch (line 122) means HTTP 301/302 redirects are NOT followed. Sites behind a `www` redirect that returns 301 instead of serving content directly will fail the scrape. The second candidate (`www.` prefix) mitigates the most common case, but chains of redirects (e.g., `example.com` → `www.example.com` → `app.example.com`) are not followed.
- **No content-type check.** The scrape assumes `text/html`. If the server returns JSON, PDF, or binary content, the `extractNarrativeSlice` function will attempt to parse it as HTML. It won't crash (regex on non-HTML just returns empty), but the LLM gets garbage input.
- **No language detection.** The prompt is English-only. Non-English websites will have their content scraped correctly but the LLM will produce an English narrative, which may mismatch the user's expectations if their site is in another language.
- **TOCTOU on SSRF guard.** `assertPublicUrl` resolves DNS once; a subsequent `fetch` resolves DNS again. An attacker could theoretically flip a DNS record between the two. The SSRF guard's own docstring acknowledges this (line 24-28 of `ssrf-guard.ts`). Low risk for this use case since the domain comes from the user's own onboarding input, not an external source.
- **No streaming error recovery.** If the LLM stream errors mid-way (e.g., Anthropic API timeout), the client receives a partial narrative and `narrativeStreaming` flips to false. No error indicator is shown to the user — they just see an abruptly truncated paragraph.

## Test coverage
- **Unit tests:** none. No `narrate-website.test.ts` exists. The `extractNarrativeSlice` function (pure HTML parsing) has no tests.
- **Integration tests:** none. The endpoint is not covered by any Vitest or Playwright test.
- **Observability coverage:** the `onboarding-narrator` agent is registered in `AGENT_REGISTRY` with alerting thresholds (maxLatencyMs: 20,000, maxCostPerCall: $0.08). Traces land in `agent_traces`. The `observability-queries.ts` helper includes it in the `ONBOARDING_AGENT_IDS` list. The WS-0 PostHog dashboard spec includes it in the TTFAA distribution. So production behavior is observable, but there are no automated correctness tests.

## Review flags
1. **No tests at all.** This is a user-facing feature with LLM interaction, SSRF-sensitive network calls, and HTML parsing — exactly the kind of code that should have unit tests for `extractNarrativeSlice` and at least one integration test for the happy path. Priority test targets: (a) SSRF guard integration (confirm private IPs are rejected), (b) `extractNarrativeSlice` with representative HTML fixtures, (c) stream-close behavior on partial LLM output.
2. **`redirect: "manual"` may be too conservative.** Many legitimate business websites redirect. Consider `redirect: "follow"` with a max-redirects limit (3-5). The SSRF guard runs before the initial fetch but not on redirect targets — if changing to `follow`, the SSRF guard should validate the final URL too (or use a pinned-IP fetch implementation).
3. **Narrative is ephemeral but costly.** Each invocation costs ~$0.04 and ~8s of LLM time. If a user re-enters the wizard 5 times (common during initial exploration), that's $0.20 and 5 LLM calls with identical input. Consider caching the result in `tenants.settings.lastNarrative` with a TTL (e.g., 24h or until domain changes).
4. **No user-facing error state.** If the stream fails or the scrape returns nothing, the UI silently shows an empty or truncated card. The wizard should show a fallback state ("We couldn't reach your website — we'll learn more about your business as you use the product").
