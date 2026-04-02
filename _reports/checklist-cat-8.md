# Category 8: Product-Specific: Customer Memory Audit

**Date:** 2026-04-01
**Tester:** Browser Session (Playwright)

## Item-by-item results

### Schema-less data model: users don't define fields upfront
- **Status:** ✅ DONE (partial)
- **Evidence:** Settings > Data Model page exists, implying custom fields can be added. The system doesn't require field definition before use — accounts, contacts, and deals have predefined schemas. However, true schema-less (Lightfield-style) where the system captures ANY data point without pre-definition is not implemented.
- **Effort:** L

### Auto-capture from email: every sent/received email attached to right contact+account automatically
- **Status:** ❌ NOT DONE
- **What's missing:** Gmail OAuth configured (gmail.readonly scope). "Connect Gmail" button on profile page. Email sync API exists (/api/email/sync). But the flow is not end-to-end tested — no emails captured in the system currently. Need Gmail connected + sync triggered + email→contact matching.
- **Effort:** M

### Auto-capture from calendar: meetings detected, linked to contacts
- **Status:** ❌ NOT DONE
- **What's missing:** Google Calendar scope (calendar.readonly) is configured in auth.ts. Calendar sync API exists (/api/calendar/sync). Meetings page exists in sidebar. But no meetings captured yet — need to connect Gmail OAuth (which also grants calendar access) and trigger sync.
- **Effort:** M

### Meeting recording/transcript (or integration with Fireflies/Otter)
- **Status:** ❌ NOT DONE
- **What's missing:** Recall.ai account created but not verified (email verification pending). No meeting recording integration in the app code yet.
- **Effort:** L

### Meeting notes auto-structured: extracts budget, team size, current stack, key points, objections, next steps
- **Status:** ❌ NOT DONE
- **What's missing:** No meeting transcription exists, so no auto-structuring.
- **Effort:** L (depends on meeting recording integration)

### 2-year email backfill: when user connects Gmail, historical emails are imported and processed
- **Status:** ❌ NOT DONE
- **What's missing:** Email sync API exists but backfill scope not verified. Need to test if it fetches 2 years of history or only recent emails.
- **Effort:** M

### NL queries with citations: "what did X say about pricing?" returns answer WITH link to specific email/meeting
- **Status:** ❌ NOT DONE
- **What's missing:** Chat exists and mentions "citations" in the checklist. The chat page has suggested prompts like "Who haven't I followed up with?" But without any data in the system, cannot test if citations are included in responses.
- **Effort:** M (requires RAG pipeline with citation tracking)

### Recall accuracy: tested on 1,000+ records, measured (target: 90%+)
- **Status:** ❌ NOT DONE
- **What's missing:** No data to test recall accuracy on.
- **Effort:** L (testing only, once data exists)

### Cross-reference queries work: "which contacts mentioned [keyword] across all interactions"
- **Status:** ❌ NOT DONE
- **What's missing:** No data to test. Chat exists but cross-reference capability untested.
- **Effort:** S (testing only)

### Follow-up detection: "who haven't I followed up with?" returns accurate list sorted by urgency
- **Status:** ❌ NOT DONE
- **What's missing:** Chat has this as a suggested prompt. But no data to verify accuracy.
- **Effort:** S (testing only)

### Activity timeline on every contact/account: complete, chronological, all interaction types
- **Status:** ❌ NOT DONE
- **What's missing:** Account detail pages have slide-over panels (from previous audit screenshots). But without activities/emails/meetings captured, timeline is empty. Need to verify timeline UI exists and renders properly with data.
- **Effort:** S (UI may exist, just needs data)

### Auto-enrichment: LinkedIn URL, department, photo populated automatically when contact is created
- **Status:** ❌ NOT DONE
- **What's missing:** Apollo API key is configured. Enrichment endpoints exist (/api/enrich, /api/enrich-contacts). But auto-enrichment on contact creation not tested. Need to create a contact and verify enrichment triggers automatically.
- **Effort:** S (testing only, infrastructure exists)

## Summary

| Status | Count |
|--------|-------|
| ✅ DONE | 0 (1 partial) |
| ❌ NOT DONE | 12 |
| Total | 12 |

**Overall readiness:** ~4% (0.5/12)

**Critical dependency:** Most items require Gmail OAuth connection + email sync to test. The infrastructure (APIs, OAuth scopes) exists but the end-to-end flow hasn't been validated. Without email data, 80% of Customer Memory is untestable.
