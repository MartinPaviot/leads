# Escalations

## 1. Email Sync (F2.1) — BLOCKED
**Date**: 2026-03-31
**Blocker**: Google/Microsoft OAuth credentials require manual browser interaction with a real email account
**Impact**: F2.1 Email sync, F2.2 Calendar sync, F2.3 Meeting recorder
**Workaround**: Skip to F2.8 (CSV import) and F2.7 (NL queries) — these provide data without email integration
**Resolution needed**: Martin creates Google Cloud project + OAuth credentials, or provides a Google account for automated setup

## 3. LLM API Key (F2.7, F1.4) — RESOLVED
**Date**: 2026-03-31
**Blocker**: No ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local
**Resolution**: API keys added to .env.local. Chat now works with real Claude Sonnet responses + RAG context from CRM data. Also fixed AI SDK v6 UIMessage format with convertToModelMessages().

## 2. Clerk Signup (F1.1) — RESOLVED
**Date**: 2026-03-31
**Blocker**: Cloudflare Turnstile blocked automated Clerk signup
**Resolution**: Switched to Auth.js v5 with credentials provider

---

## 4. Unstructured-First Architecture (SaaStr Gap 2 Phase 2) — OCEAN, NEEDS MARTIN
**Date**: 2026-04-01
**Source**: Lightfield SaaStr gap analysis
**Issue**: Lightfield's core architectural bet is "start from conversations, derive structure." Our architecture is structured-first (Apollo enrichment → fixed schema → conversations secondary). Phase 1 (making conversations a co-equal data source) is a lake and in progress. Phase 2 (making conversations the PRIMARY source, redesigning onboarding to start with Gmail connect instead of TAM builder) would invalidate our TAM-builder differentiator.
**Question for Martin**: Do we want to be "unstructured-first" (compete directly with Lightfield's positioning) or "best of both worlds" (Monaco's prospecting + Lightfield's memory)? Recommendation: Option B — hybrid. Keep Apollo/enrichment as our advantage, add conversation depth. Position as "the only AI CRM that builds your TAM AND remembers every conversation."
**Impact**: Product identity, onboarding flow, marketing positioning

## 5. Meeting Recording (SaaStr Gap 5) — BLOCKED
**Date**: 2026-04-01
**Source**: Lightfield SaaStr gap analysis
**Issue**: Both Monaco and Lightfield have native meeting recording. Recall.ai integration is blocked (email verification required — escalation #1). Without recording, we can still build minimum viable call intelligence (calendar sync + transcript paste/upload + meeting prep + follow-up generation). But we can't match their real-time recording capability.
**Alternatives to evaluate**: (1) Recall.ai manual verification (Martin), (2) Fireflies.ai API, (3) AssemblyAI for transcription only, (4) Native WebRTC recording (complex)
**Impact**: Gap 5 (call intelligence) partially blocked. Minimum viable version can ship without recording.

## 6. Agentic Workflow Builder (SaaStr Gap 6) — OCEAN, SKIP FOR NOW
**Date**: 2026-04-01
**Source**: Lightfield SaaStr gap analysis
**Issue**: Lightfield has a workflow builder (Beta, empty). We have nothing. Building a full workflow builder (triggers, conditions, actions, agent steps, visual editor) is 1-2 months. However: Lightfield's is Beta and empty — they haven't shipped this either. Our sequences + Inngest-based automations cover the most important use case (email outreach).
**Recommendation**: Skip for now. Revisit after shipping Gap 1 (schema-less), Gap 3 (memory), Gap 4 (agent actions), Gap 5 (call intel). Add to M14+ roadmap.
**Impact**: Low — Lightfield hasn't shipped this either. No competitive disadvantage from waiting.

## 7. Strategic Positioning Decision (SaaStr Gap 8) — NEEDS MARTIN
**Date**: 2026-04-01
**Source**: Lightfield SaaStr gap analysis
**Issue**: We're currently "modern CRM with AI bolted on" — same category as Attio, Folk, Clay with GPT. Not architecturally different. Three options:
- **Option A**: Become unstructured-first like Lightfield (conversation-first, lose TAM advantage)
- **Option B** (RECOMMENDED): Hybrid — Monaco's prospecting + Lightfield's memory. "Only CRM that builds your TAM AND remembers every conversation"
- **Option C**: Full Monaco clone (structured + opinionated, compete with $35M war chest)
**Recommendation**: Option B. Shipping Gap 1 (schema-less) + Gap 3 (memory) + Gap 2 Phase 1 (conversations as co-equal source) naturally creates this positioning. No additional work needed beyond the gap analysis build order.
**Impact**: Marketing positioning, feature prioritization, fundraising narrative
