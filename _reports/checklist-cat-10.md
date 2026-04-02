# Category 10: Chat & AI Audit

**Date:** 2026-04-01
**Tester:** Browser Session (Playwright)

## Item-by-item results

### Chat responds with real CRM data — not generic responses
- **Status:** ❌ NOT DONE
- **Evidence:** Asked "How many accounts do I have?" — response was "I don't currently have access to your CRM data, so I can't see how many accounts you have." The correct answer should be "0 accounts." The chat shows "Analyzed data" tag but fails to query actual CRM data. Screenshot: cat10-002.
- **Effort:** M (data retrieval pipeline needs debugging)

### Chat responses include citations/links to source records
- **Status:** ❌ NOT DONE
- **What's missing:** No citations in responses. Both test queries returned generic advice without any links to specific records.
- **Effort:** M

### Chat can create records via conversation
- **Status:** ❌ NOT DONE
- **What's missing:** Not tested. Agent settings has "Record creation and updates" with "Ask every time" setting, suggesting this feature exists. But chat's inability to access data means creation likely also fails.
- **Effort:** S (testing only, infrastructure may exist)

### Chat can update records via conversation
- **Status:** ❌ NOT DONE
- **What's missing:** Not tested. Same infrastructure concern as above.
- **Effort:** S

### Chat handles complex queries accurately
- **Status:** ❌ NOT DONE
- **What's missing:** Cannot test — chat doesn't access data at all.
- **Effort:** M

### Chat handles ambiguity gracefully
- **Status:** ✅ DONE (partial)
- **Evidence:** When asked "What should I focus on today?" with no data, the chat acknowledged the limitation and offered generic but useful sales advice. It also asked clarifying follow-up questions. This is graceful handling.

### Chat handles unanswerable questions without hallucinating
- **Status:** ✅ DONE
- **Evidence:** When asked about accounts, it honestly said "I don't currently have access to your CRM data" rather than hallucinating fake account numbers. This is correct behavior.

### Chat handles questions about missing data honestly
- **Status:** ✅ DONE
- **Evidence:** Both queries honestly acknowledged data unavailability. No fabricated information.

### Chat works in English and French
- **Status:** ❌ NOT DONE
- **What's missing:** Only tested in English. Need to test with French queries.
- **Effort:** S

### Chat streaming smooth (no flicker, no lost tokens)
- **Status:** ✅ DONE
- **Evidence:** Chat response appeared smoothly. "Analyzed data" tag appeared first, then text streamed in. No flicker or lost tokens observed.

### AI email drafts personalized to specific contact with real data
- **Status:** ❌ NOT DONE
- **What's missing:** No contacts to draft emails for. Cannot test personalization.
- **Effort:** M

### AI email tone configurable (formal, casual, etc.) in settings
- **Status:** ❌ NOT DONE
- **What's missing:** No email tone configuration found in Settings > Agent or Settings > Workspace.
- **Effort:** S

### NL query accuracy: tested on 50 queries, accuracy documented (target: 85%+)
- **Status:** ❌ NOT DONE
- **What's missing:** Cannot test — chat doesn't access CRM data. Need to fix data pipeline first.
- **Effort:** L

### Hallucination rate: tested on 50 queries, rate documented (target: < 5%)
- **Status:** ❌ NOT DONE
- **What's missing:** Only 2 queries tested. Both showed honest "no data" responses, which is anti-hallucination. But need systematic testing.
- **Effort:** L

### RAG retrieval precision@5 documented
- **Status:** ❌ NOT DONE
- **What's missing:** RAG pipeline not functioning — chat doesn't retrieve data.
- **Effort:** M

### Cost per conversation: tokens measured (target: < $0.05 per exchange)
- **Status:** ❌ NOT DONE
- **What's missing:** No cost tracking implemented.
- **Effort:** S

### Token budget per request to prevent cost explosions
- **Status:** ❌ NOT DONE
- **What's missing:** Not verified. Need to check if maxTokens is set in chat API route.
- **Effort:** S

### System prompts versioned, tested, and stored (not hardcoded inline)
- **Status:** ❌ NOT DONE
- **What's missing:** Need to check if system prompts are in config/constants vs hardcoded in route handler.
- **Effort:** S

### Prompt injection tested: malicious contact names, malicious email content
- **Status:** ❌ NOT DONE
- **What's missing:** Not tested.
- **Effort:** S

### Latency: P50, P95, P99 on chat responses documented
- **Status:** ❌ NOT DONE
- **What's missing:** Not measured. Observed ~5-10s for responses, but systematic measurement needed.
- **Effort:** S

## Summary

| Status | Count |
|--------|-------|
| ✅ DONE | 4 |
| ❌ NOT DONE | 16 |
| Total | 20 |

**Overall readiness:** 20% (4/20)

**Critical bug:** Chat shows "Analyzed data" but says "I don't have access to your CRM data." The data retrieval pipeline is broken — this is the #1 fix needed for Chat & AI. Without data access, 80% of chat features are untestable.
