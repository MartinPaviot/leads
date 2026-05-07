# Design: Skill Knowledge Injection

## System Fit

### Problem
29 pre-built skill handlers generate LLM outputs without consulting the
Knowledge layer. Custom skills (via executor.ts) already use Knowledge —
pre-built skills don't. This creates a quality gap where custom skills
produce better-grounded outputs than system skills.

### Solution
1. Shared utility (`skills/skill-knowledge.ts`) providing:
   - `getSkillKnowledge()` — semantic Knowledge retrieval for prompt injection
   - `getDeepConversationContext()` — multi-source conversation retrieval (activities + notes + semantic search)
   - `getCompanyContacts()` — all contacts for a company

2. Each pre-built handler calls these utilities before the LLM generation step.
   Handlers without LLM generation (pure data processing) are skipped.

3. Chat route switches from flat Knowledge load to semantic retrieval via
   `retrieveKnowledge()` with fallback to flat load when no user message.

### Data Flow (after fix)

```
User asks "draft a proposal for Meridian Labs deal"
  |
  v
Chat route:
  1. CRM snapshot (counts + recent records)
  2. Entity context (company + contacts + deals + activities)
  3. RAG (semantic + context graph)
  4. Knowledge (semantic retrieval based on user message)  <-- FIX #4
  5. Memories
  |
  v
draftProposal tool invoked:
  1. Deal + Company from DB
  2. Knowledge (semantic: pricing, positioning, terms)     <-- FIX #1
  3. Deep conversation (activities + notes + semantic)     <-- FIX #2-5
  4. All company contacts                                  <-- FIX #6
  |
  v
LLM generates proposal grounded in real data + Knowledge
```

### API Contracts

```typescript
// skill-knowledge.ts
async function getSkillKnowledge(
  query: string,
  tenantId: string,
  options?: { userId?: string; limit?: number },
): Promise<string>  // formatted markdown block or empty string

async function getDeepConversationContext(
  tenantId: string,
  opts: {
    dealId?: string;
    companyId?: string;
    contactIds?: string[];
    query?: string;
    activityLimit?: number;
    contentMaxChars?: number;
  },
): Promise<{ activities: string; notes: string; semanticResults: string }>

async function getCompanyContacts(
  companyId: string,
  tenantId: string,
): Promise<Array<{ id: string; name: string; title: string | null; email: string | null }>>
```

### Failure Handling
- All retrieval functions catch errors and return empty results
- Skills continue to work without Knowledge (degraded but functional)
- No new failure modes introduced

### Security
- All queries are tenant-scoped (tenantId filter on every DB query)
- Knowledge scope filter: workspace entries + user's own entries
- No cross-tenant data leakage
