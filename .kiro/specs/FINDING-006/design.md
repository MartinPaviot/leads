# FINDING-006: Design — Prompt Cache Extension

## Approach
Create a shared helper that wraps system-message construction for Anthropic calls, injecting `cacheControl: { type: "ephemeral" }` when the provider is Anthropic. Apply it to all endpoints that currently lack caching.

## Affected Files
| File | Current caching | Action |
|------|----------------|--------|
| `lib/deal-briefing.ts` | none | Add to system prompt in `tracedGenerateObject` |
| `api/voice-of-customer/route.ts` | none | Add to system message |
| `api/meetings/prep/route.ts` | none | Add to system message |
| `api/import/smart/route.ts` | none | Add to system message |
| `api/import/smart/preview/route.ts` | none | Add to system message |
| `api/eval/run-all/route.ts` | none | Add to system message |
| `api/eval/route.ts` | none | Add to system message |
| `inngest/memory-auto-extract.ts` | none | Add to system message |

## Helper Utility
```typescript
// lib/llm-cache.ts
export function withCacheControl(systemContent: string, isAnthropic: boolean) {
  if (!isAnthropic) return systemContent;
  return { type: "text", text: systemContent, cacheControl: { type: "ephemeral" } };
}
```

## Provider Detection
Check `process.env.ANTHROPIC_API_KEY` presence or inspect model instance — same pattern already used in `deal-briefing.ts:getLLMModel()`.

## Risk
Low. The `cacheControl` property is a pass-through annotation; Anthropic SDK ignores unknown properties on non-Anthropic models. Vercel AI SDK already supports it.
