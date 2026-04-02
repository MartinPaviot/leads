# Category 7: Product-Specific: Onboarding Audit

**Date:** 2026-04-01
**Tester:** Browser Session (Playwright)

## Item-by-item results

### New user signs up → TAM is built automatically within minutes
- **Status:** ❌ NOT DONE
- **What's missing:** After sign-in, the dashboard shows a CRITICAL priority card saying "Build and upload your TAM list of 500-1000 target companies." This is manual — the user is told to build the TAM, not that the system builds it automatically. No automatic TAM building on signup.
- **Effort:** XL (requires background job to auto-query Apollo/PDL for ICP-matching companies on first login)

### TAM building uses real data sources, not Claude-generated fake companies
- **Status:** ❌ NOT DONE
- **What's missing:** No TAM building flow exists yet. The Accounts page shows empty state. No auto-enrichment or auto-import pipeline observed.
- **Effort:** L (API integration with Apollo Org Search exists but not wired into auto-TAM)

### TAM is scored and ranked with clear "why this account" explanations on Day 1
- **Status:** ❌ NOT DONE
- **What's missing:** No accounts to score. Scoring scripts exist (_tools/score-accounts.mjs) but not integrated into the onboarding flow.
- **Effort:** M

### ICP definition is conversational (chat-first, not a form with 20 fields)
- **Status:** ❌ NOT DONE
- **What's missing:** No ICP definition flow exists. The Knowledge page (Settings > Knowledge) allows adding business context, but there's no guided conversational flow to define the ICP. No "Tell me about your ideal customer" chat experience.
- **Effort:** L (build a chat-based onboarding wizard that extracts ICP from conversation)

### Existing email history is imported and analyzed (with Google/Microsoft OAuth)
- **Status:** ❌ NOT DONE (partial infrastructure)
- **What's missing:** "Connect Gmail" button exists on Settings > Profile page. Google OAuth is configured with gmail.readonly and calendar.readonly scopes. But no email sync/import flow is triggered after connection. The email sync API exists (/api/email/sync) but not tested end-to-end. Microsoft OAuth not configured.
- **Effort:** M (wiring existing API to the OAuth callback + background processing)

### Existing contacts from email are auto-created as CRM records
- **Status:** ❌ NOT DONE
- **What's missing:** No auto-creation of contacts from email data. The email sync endpoint exists but contact extraction isn't verified.
- **Effort:** M

### User sees a populated, useful product within 5 minutes — not an empty shell
- **Status:** ❌ NOT DONE
- **What's missing:** After login, every page shows empty state. Dashboard shows action items but no data. User must manually create accounts, contacts, deals. No auto-population from any source. This is the biggest gap vs Monaco/Lightfield.
- **Effort:** XL (requires auto-TAM + auto-enrichment + auto-scoring pipeline)

### Onboarding flow compared side-by-side with Monaco's onboarding — ours is at least as smooth
- **Status:** ❌ NOT DONE
- **What's missing:** Monaco auto-builds TAM on Day 1 with real data. LeadSens shows empty screens with "build your TAM" instructions. Significant gap.
- **Effort:** XL

## Summary

| Status | Count |
|--------|-------|
| ✅ DONE | 0 |
| ❌ NOT DONE | 8 |
| Total | 8 |

**Overall readiness:** 0% (0/8)

**Critical path:** The entire onboarding category is blocked. The core issue is: no automatic data population on signup. User gets an empty product. This is THE most critical gap before launch.
