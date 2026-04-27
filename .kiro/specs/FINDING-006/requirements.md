# FINDING-006: Extend Prompt Caching to Non-Chat Endpoints

## User Story
As a platform operator, I want all Anthropic LLM calls to use prompt caching so that repeated system-prompt tokens are not re-billed on every request.

## Current State
- `api/chat/route.ts:479` uses `cacheControl: { type: "ephemeral" }` on the system message.
- `api/signals/route.ts:129` and `api/onboarding/analyze-website/route.ts:214` also cache.
- Six other endpoints call `generateText`/`generateObject`/`streamText` via Anthropic **without** cacheControl: `voice-of-customer`, `meetings/prep`, `import/smart`, `import/smart/preview`, `eval/run-all`, `eval/route`.
- `deal-briefing.ts` uses `tracedGenerateObject` with Anthropic but passes no cacheControl.

## Acceptance Criteria

### AC-1: All Anthropic system messages cached
**When** any API route or Inngest function calls the Anthropic provider with a system prompt  
**Then** the system message block includes `cacheControl: { type: "ephemeral" }`

### AC-2: No regression on non-Anthropic providers
**When** the configured LLM is OpenAI (no ANTHROPIC_API_KEY)  
**Then** the cacheControl property is either absent or ignored without error

### AC-3: Cost reduction observable
**When** a cached endpoint is called twice within the 5-minute TTL  
**Then** the Anthropic API response headers show cache-hit tokens > 0

### AC-4: No behavioral change
**When** cacheControl is added to an endpoint  
**Then** response content and schema remain identical to the non-cached version
