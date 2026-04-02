# Category 9: Product-Specific: Coaching Audit

**Date:** 2026-04-01
**Tester:** Browser Session (Playwright)

## Item-by-item results

### Deal coaching references SPECIFIC data from the deal
- **Status:** ❌ NOT DONE
- **What's missing:** No deals exist to test coaching on. The Opportunities page has "Analyze Pipeline" button and an opportunity detail view exists, but without deals, coaching cannot be evaluated. Need to create deals and test if AI references specific deal data.
- **Effort:** M

### Meeting coaching references SPECIFIC moments from meeting recordings/transcripts
- **Status:** ❌ NOT DONE
- **What's missing:** No meeting recording integration exists. No transcripts to reference. No timestamp-based coaching ("at 3:42 you lost control").
- **Effort:** XL (requires Recall.ai integration + transcript processing + AI coaching)

### Prioritized actions based on REAL pipeline state, deal velocity, activity gaps
- **Status:** ❌ NOT DONE (partial)
- **What's missing:** Dashboard shows "Your priorities today" section with actionable items. However, these are currently onboarding-focused priorities (build TAM, enrich contacts), not data-driven pipeline insights. With real pipeline data, need to verify the system generates specific, data-driven priorities.
- **Effort:** M (infrastructure for priorities exists, needs real data)

### "Why this account" explanations reference real signals
- **Status:** ❌ NOT DONE
- **What's missing:** No accounts with signals to test. The Accounts page has a "Signals" button in the header, suggesting signal infrastructure exists. But cannot verify if explanations reference real signals (funding, job postings, tech stack).
- **Effort:** M

### Proactive insights: system surfaces information before the user asks
- **Status:** ❌ NOT DONE (partial)
- **What's missing:** Dashboard priorities section IS proactive in nature — it surfaces what needs attention. But without real data, it only shows onboarding tasks. Need deals at risk, re-engagement opportunities, competitor detection with real data.
- **Effort:** M

### Coaching adapts to user's sales methodology (configurable in settings)
- **Status:** ❌ NOT DONE
- **What's missing:** No sales methodology configuration found in settings. Agent settings only has "Record creation and updates" permission. No MEDDIC/BANT/SPIN methodology selector.
- **Effort:** M

## Summary

| Status | Count |
|--------|-------|
| ✅ DONE | 0 |
| ❌ NOT DONE | 6 |
| Total | 6 |

**Overall readiness:** 0% (0/6)

**Critical dependency:** Coaching requires (1) deals with real data, (2) meeting recordings/transcripts, (3) signal data on accounts. All upstream dependencies (Categories 7 and 8) must be resolved first. Coaching is the last layer of the stack.
