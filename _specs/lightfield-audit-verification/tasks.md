# Tasks: Skill Knowledge Injection

## Task 1: Create shared Knowledge utility [DONE]
- [x] Create `skills/skill-knowledge.ts`
- [x] Implement `getSkillKnowledge()` using `retrieveKnowledge`
- [x] Implement `getDeepConversationContext()` with activities + notes + semantic search
- [x] Implement `getCompanyContacts()`
- [x] Verify: tsc --noEmit passes

## Task 2: Fix draftProposal handler [DONE]
- [x] Replace 200-char truncation with 1500-char context
- [x] Add Knowledge injection (pricing, positioning, terms)
- [x] Add semantic search for conversation retrieval
- [x] Add notes query (deal + company)
- [x] Add multi-contact (all company contacts)
- [x] Verify: tsc --noEmit passes

## Task 3: Wire Knowledge into intelligence skills [DONE]
- [x] handle-objection/handler.ts
- [x] re-engage-stalled/handler.ts
- [x] scope-poc/handler.ts
- [x] sales-coaching/handler.ts
- [x] meeting-brief/handler.ts
- [x] battlecard-generator/handler.ts
- [x] competitor-intel/handler.ts
- [x] pipeline-review/handler.ts
- [x] Verify: tsc --noEmit passes

## Task 4: Switch chat route to semantic Knowledge [DONE]
- [x] Import `retrieveKnowledge` + `formatKnowledgeForPrompt`
- [x] Replace flat DB load with semantic retrieval
- [x] Keep fallback for empty user message
- [x] Verify: tsc --noEmit passes

## Task 5: Wire Knowledge into outreach skills [IN PROGRESS]
- [ ] cold-email-outreach/handler.ts
- [ ] email-drafting/handler.ts
- [ ] leadership-change-outreach/handler.ts

## Task 6: Wire Knowledge into scoring skills [IN PROGRESS]
- [ ] lead-qualification/handler.ts
- [ ] icp-identification/handler.ts
- [ ] inbound-lead-qualification/handler.ts

## Task 7: Wire Knowledge into signals + enrichment skills [IN PROGRESS]
- [ ] Check each handler for LLM calls, skip pure data-processing
- [ ] signal-scanner, champion-tracker, funding-signal-monitor,
      job-posting-intent, expansion-signal-spotter, investor-overlap, contact-cache
- [ ] apollo-lead-finder, company-contact-finder, inbound-lead-enrichment, tam-builder

## Task 8: Wire deep conversation context into intelligence skills [IN PROGRESS]
- [ ] handle-objection — add semantic search + notes
- [ ] re-engage-stalled — add semantic search + notes
- [ ] scope-poc — add semantic search + notes
- [ ] sales-coaching — add semantic search + notes
- [ ] churn-risk-detector — add semantic search + notes

## Task 9: Final verification [BLOCKED]
- [ ] tsc --noEmit
- [ ] Run existing test suite
- [ ] Count total modified files
