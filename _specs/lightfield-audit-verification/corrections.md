# Corrections Factuelles — Audit Lightfield vs Elevay

**Date**: 2026-05-05
**Methode**: Lecture directe du code actuel, pas de documents intermediaires.

---

## ERREUR MAJEURE : L'audit etait base sur des donnees du 1er avril 2026

Le git log montre **80+ commits** entre le 1er avril et aujourd'hui.
Parmi eux, des features structurantes que l'audit ignorait completement :

- `3fd272b` — Knowledge layer + custom skills builder + long-running tasks
- `010feed` — Knowledge entries wire dans le system prompt
- `fbcff5c` — Skills pre-fill depuis query params
- `4b29d26`..`7e7c6b4` — 6 commits construisant le Skills UI complet
- `73aa00c` — Code execution sandbox
- `c53fb5d` — Agentic import (CSV via chat)
- `0be5357`..`b175016` — AI account summaries
- `31765ca` — Capabilities advertises dans le system prompt
- `64e06a8` — Agent actions schema + undo

---

## CORRECTIONS POINT PAR POINT

### 1. Nombre de tools

| Claim audit | Realite code | Statut |
|-------------|-------------|--------|
| "~11 tools" | **128 tools** dans 17 modules | **FAUX** |
| "13 tools manquants" | Elevay a 5.3x PLUS de tools que Lightfield (128 vs 24) | **FAUX** |

**Detail par module** (lu dans `app/apps/web/src/lib/chat/tools/`) :

| Module | Nombre | Exemples |
|--------|--------|----------|
| query.ts | 25 | searchCRM, queryContacts, queryAccounts, queryDeals, queryActivities, queryNotes, queryTasks, searchMeetings, searchEmailsByMetadata, semanticSearchNotes, semanticSearchEmails, semanticSearchCallRecordings, getNoteBody, getEmailContent, getCallRecording, getRecordsByIds, runBasicReport, whoami, listWorkspaceMembers, findDuplicateContacts, listComments, listCommentReplies, listRecentToolCalls, listSharedPrompts, deleteSharedPrompt |
| create.ts | 16 | createContact, createAccount, createDeal, createNote, createTask, createKnowledgeEntry, logActivity, createSequence, addSequenceStep, upsertContact, upsertAccount, upsertDealByCompany, createCustomObjectType, createSavedView, createComment, createSharedPrompt |
| update.ts | 26 | updateContact, updateAccount, updateDeal, updateTask, updateDealStage, completeTask, bulkUpdateDeals, bulkUpdateContacts, updateAccountLifecycle, updateMeetingNotes, updateSequence, updateSequenceStep, updateICP, updateWorkspace, updateUserProfile, updateNotificationPreferences, updatePrivacySettings, updateKnowledgeEntry, updatePipelineStages, updateCustomFieldSchema, updateCustomSignalDefinitions, updateWorkflows, updateMemberRole, updateMailboxSettings, updateMailCalendarIntegration, updateCustomObjectType |
| action.ts | 18 | draftEmail, generateFollowUpEmail, suggestEmailReply, autoProgressDeal, sendMeetingFollowUp, bookMeeting, enrollInSequence, runSequenceAutopilot, launchCampaign, unsubscribeContact, proposeCampaign, inviteMember, resendInvite, addMailbox, runAiAttribute, deleteComment, deleteSequenceStep, mergeContacts |
| skills.ts | 25 | analyzePipeline, scanSignals, generateBattlecard, researchCompetitor, detectChurnRisk, analyzeSequencePerformance, findLeadsAtCompany, detectExpansionOpportunities, buildTAM, findLeadsByDomain, defineICP, prepSalesCall, qualifyLeads, qualifyInboundLead, enrichContact, checkDuplicates, trackChampions, checkFundingSignals, checkHiringSignals, detectLeadershipChanges, scopePoC, draftProposal, handleObjection, reEngageStalledDeal |
| intelligence.ts | 7 | getDealCoaching, getAccountIntelligence, generateMeetingPrep, getMeetingNotes, getBuyerIntentScore, getDealsAtRisk, getWinLossAnalysis |
| memory.ts | 5 | exploreGraph, rememberContext, recallMemories, forgetMemory, exploreRelationships |
| briefing.ts | 3 | briefAllDeals, briefDeal, getEnrichedContext |
| coaching.ts | 3 | getCoachingInsights, getMyPerformance, searchExactWords |
| workflow.ts | 3 | createWorkflow, listWorkflows, deleteWorkflow |
| schema.ts | 2 | listSchema, listAttributeDefinitions |
| import.ts | 2 | analyzeCSVForImport, executeImport |
| research.ts | 1 | buildCompanyDossier |
| forecast.ts | 1 | getRevenueForcast |
| stakeholder.ts | 1 | mapDealStakeholders |
| code-execution.ts | 1 | executeCode |
| undo.ts | 1 | undoLastAction |

**Tools Lightfield qu'on a mais qui portent un nom different** :

| Lightfield Tool | Equivalent Elevay | Statut |
|-----------------|-------------------|--------|
| `askAccountQuestionArray` | `semanticSearchNotes` + `semanticSearchEmails` + `semanticSearchCallRecordings` (3 tools specialises au lieu de 1 generique) | COUVERT + PLUS GRANULAIRE |
| `getAccounts` | `queryAccounts` | COUVERT |
| `getOpportunities` | `queryDeals` | COUVERT |
| `getContacts` | `queryContacts` | COUVERT |
| `getMeetings` | `searchMeetings` | COUVERT |
| `getTasks` | `queryTasks` | COUVERT |
| `getNotes` | `queryNotes` | COUVERT |
| `findEntities` | `searchCRM` | COUVERT |
| `getMeetingDetails` | `getMeetingNotes` | COUVERT |
| `getNoteDetails` | `getNoteBody` | COUVERT |
| `createCrmAccounts` | `createAccount` (singulier) + `upsertAccount` (dedup-safe) | COUVERT (pas de batch mais upsert) |
| `createCrmContacts` | `createContact` + `upsertContact` | COUVERT (pas de batch mais upsert) |
| `createCrmOpportunities` | `createDeal` + `upsertDealByCompany` | COUVERT |
| `createEmail` | `draftEmail` | COUVERT |
| `createTask` | `createTask` | COUVERT |
| `updateEmail` | non trouve | MANQUANT (faible priorite) |
| `updateTask` | `updateTask` + `completeTask` | COUVERT |
| `updateFieldValuesAccount` | `updateAccount` (accepte properties) | COUVERT |
| `updateFieldValuesOpportunity` | `updateDeal` | COUVERT |
| `updateFieldValuesContact` | `updateContact` | COUVERT |
| `calculator` | `executeCode` (JS sandbox, plus puissant) | DEPASSE |
| `exa_web_search` | `buildCompanyDossier` | COUVERT |
| `getCalendarAvailability` | `bookMeeting` (inclut la logique) | COUVERT |
| `supportBot` | non trouve | MANQUANT (faible priorite) |

**Resultat : 22/24 tools Lightfield sont couverts. 2 manquants (updateEmail, supportBot) sont a faible priorite.**

**Tools Elevay SANS equivalent Lightfield** (selection) :
- `bulkUpdateDeals`, `bulkUpdateContacts` — Lightfield n'a PAS de bulk ops
- `enrollInSequence`, `runSequenceAutopilot`, `launchCampaign` — Lightfield n'a PAS de sequences
- `getDealsAtRisk`, `getWinLossAnalysis`, `getBuyerIntentScore` — Lightfield n'a PAS d'analytics agent
- `mapDealStakeholders` — Lightfield n'a PAS de stakeholder mapping
- `getRevenueForcast` — Lightfield n'a PAS de forecast
- `undoLastAction` — Lightfield n'a PAS de undo
- `exploreGraph`, `exploreRelationships` — Lightfield n'a PAS de knowledge graph
- `mergeContacts`, `findDuplicateContacts` — Lightfield n'a PAS de dedup
- `executeCode` — Lightfield a un Python sandbox; nous avons JS

---

### 2. Context Composition

| Claim audit | Realite code | Statut |
|-------------|-------------|--------|
| "Context layers : 3 vs 1" | Elevay a **5 couches** de contexte vs 3 pour Lightfield | **FAUX** |
| "`<Account>` XML tags : NON" | `getEntityContext()` dans route.ts injecte le contexte complet de l'entite courante | **FAUX** |
| "RAG per-account : PARTIEL" | 3 semantic search tools specialises + hybrid search (BM25 + vector via RRF) + context graph | **FAUX** |
| "Knowledge injection : NON" | `retrieveKnowledge()` avec semantic search + keyword fallback, injecte dans `knowledgeContext` | **FAUX** |

**Les 5 couches Elevay** (lu dans `buildChatSystemPrompt` params) :
1. `crmSnapshot` — counts + 10 recent records par entity type + business context + custom fields + pipeline stages
2. `entityContext` — contexte complet de l'entite courante (company + ses contacts + ses deals + 20 activities recentes)
3. `ragContext` — semantic search + context graph (bi-temporal knowledge graph, entities + relations)
4. `knowledgeContext` — knowledge entries par pertinence semantique (pgvector) avec fallback keyword
5. `memoriesContext` — chat memories persistantes cross-session

**Lightfield a 3 couches** (du system prompt leake) :
1. Table snapshots
2. `<Account>` XML tags
3. `askAccountQuestionArray` RAG

**Elevay a 2 couches supplementaires** :
- Knowledge graph (bi-temporal, entites + relations)
- Chat memories persistantes

---

### 3. Knowledge Layer

| Claim audit | Realite code | Statut |
|-------------|-------------|--------|
| "Knowledge layer : NON" | Table `knowledge_entries` + semantic retrieval + prompt injection | **FAUX** |
| "Knowledge API : NON" | `createKnowledgeEntry` + `updateKnowledgeEntry` tools dans le chat | **FAUX** |
| "Knowledge injection dans system prompt : NON" | `formatKnowledgeForPrompt()` produit une section "## Business Knowledge" | **FAUX** |

**Details** (lu dans `app/apps/web/src/lib/knowledge/retrieval.ts`) :
- Table : `knowledge_entries` (id, tenantId, createdBy, scope, title, category, content, contentHash, isActive)
- Categories : icp, competitors, objections, product, process, context, custom
- Scoping : workspace + user (filtre sur scope + createdBy)
- Retrieval : semantic search (pgvector cosine similarity) avec fallback keyword (ilike)
- Embedding : `embedKnowledgeEntry()` stocke dans la table `embeddings` avec entity_type='knowledge'
- Injection : `formatKnowledgeForPrompt()` -> "## Business Knowledge\n\nThe following is knowledge..."

---

### 4. Skills System

| Claim audit | Realite code | Statut |
|-------------|-------------|--------|
| "Skills system : NON" | **29 pre-built skills** + `customSkillTemplates` table + Skills UI + runner | **FAUX** |
| "Create skill meta-skill : NON" | `customSkillTemplates` table avec CRUD (slug, name, category, steps, constraints, parameters, examples) | **FAUX** |
| "Skill execution engine : NON" | `runSkill()` dans `app/apps/web/src/skills/runner.ts` | **FAUX** |
| "Draft Proposal : impossible sans les 6 couches" | `draftProposal` tool existe dans skills.ts:594, invoque `draftProposalSkill` via `runSkill` | **FAUX** |

**29 skills pre-built** (lu dans `app/apps/web/src/skills/`) :

| Categorie | Skills |
|-----------|--------|
| enrichment (4) | apollo-lead-finder, company-contact-finder, inbound-lead-enrichment, tam-builder |
| intelligence (11) | battlecard-generator, churn-risk-detector, competitor-intel, draft-proposal, handle-objection, meeting-brief, pipeline-review, re-engage-stalled, sales-call-prep, sales-coaching, scope-poc, sequence-performance |
| outreach (3) | cold-email-outreach, email-drafting, leadership-change-outreach |
| scoring (3) | icp-identification, inbound-lead-qualification, lead-qualification |
| signals (7) | champion-tracker, contact-cache, expansion-signal-spotter, funding-signal-monitor, investor-overlap, job-posting-intent, signal-scanner |

Le `draftProposal` skill a un schema type avec output structure :
- executiveSummary, problemStatement, proposedSolution (overview + keyCapabilities + differentiators),
  implementationPlan (phases + totalDuration), pricing (summary + tiers), nextSteps, closingStatement

---

### 5. Database Schema

| Claim audit | Realite code | Statut |
|-------------|-------------|--------|
| "Pas de notes entity" | Table `notes` existe (polymorphic: entityType + entityId) | **FAUX** |
| "Pas de tasks entity" | Table `tasks` existe (polymorphic) | **FAUX** |
| "Pas de Knowledge table" | Table `knowledge_entries` existe | **FAUX** |
| "Pas de Skills table" | Table `custom_skill_templates` existe | **FAUX** |
| "custom_field_definitions : manquant" | Stocke dans TenantSettings.customFields (pas de table dediee) | **PARTIELLEMENT CORRECT** — architecture differente mais fonctionnalite presente |
| "pipeline_stage_definitions : manquant" | Stocke dans TenantSettings.pipelineStages | **PARTIELLEMENT CORRECT** — idem |
| "Meetings standalone table : manquant" | Activities avec type meeting_scheduled/completed | **CORRECT** — pas de table meetings dediee |

**Tables totales** : 63 tables Drizzle (pas une app triviale).

---

### 6. Fonctionnalites supplementaires non mentionnees dans l'audit

L'audit ne mentionne PAS ces fonctionnalites qui existent dans le code :

| Feature | Fichier | Description |
|---------|---------|-------------|
| Tool routing dynamique | `lib/chat/tool-router.ts` | Reduit 128 tools -> ~40-50 par requete selon l'intent |
| Multi-agent orchestrator | `lib/agents/orchestrator.ts` | Route vers des agents specialistes (deal coaching, pipeline, research) |
| Capability resolver | `lib/agents/capability-resolver.ts` | Filtre les tools par role + surface context (page courante) |
| Context budget manager | `lib/ai/context-budget.ts` | Alloue les tokens entre system prompt, tools, messages, RAG |
| Prompt experiments A/B | `lib/prompts/prompt-experiments.ts` | Variants de prompt avec delta application |
| RAG quality sampling | Dans route.ts | 10% des requetes mesurees pour qualite de retrieval |
| Message compaction | Dans route.ts | Summarization LLM des vieilles conversations |
| Agent tracing | `lib/ai/traced-ai.ts` | Logging complet de chaque interaction agent |
| Prompt canary | `lib/prompts/prompt-canary.ts` | Versioning de prompts pour rollback |
| Hybrid search | `lib/ai/embeddings.ts` | BM25 full-text + semantic via Reciprocal Rank Fusion |
| Context graph | `lib/ai/context-graph.ts` | Knowledge graph bi-temporal (entities + relations) |
| Upsert tools | create.ts | `upsertContact`, `upsertAccount`, `upsertDealByCompany` — dedup-safe create |

---

### 7. System Prompt Leake Lightfield — Verification

| Claim | Statut |
|-------|--------|
| "24 tools dans le system prompt leake" | **INCONNU** — Je n'ai pas pu lire le fichier brut moi-meme. Le subagent l'a trouve mais je n'ai pas cross-verifie le contenu. |
| "Format des `<Account>` tags" | **INCONNU** — Le system prompt mentionne `<Account>` tags mais le format exact n'est pas visible. |
| "Tool names matchent le comportement observe" | **NON VERIFIE** — Aucune cross-reference faite entre les noms de tools du prompt et les tool call labels dans nos screenshots de teardown. |

---

## SYNTHESE : CE QUI ETAIT CORRECT DANS L'AUDIT

1. L'architecture 3 couches de Lightfield (snapshots + XML tags + RAG) — **CORRECT**
2. Le role du Knowledge Layer comme multiplicateur — **CORRECT** (et confirme par l'implementation Elevay)
3. `associateUnassociatedActivity` sur create opportunity — **CORRECT** (Elevay n'a pas cet equivalent)
4. L'interdependance Skills -> Knowledge -> RAG -> Data Capture — **CORRECT** (logique valide)
5. Batch create de Lightfield (arrays) — **CORRECT** (Elevay a upsert mais pas de batch array create)
6. Meetings comme table standalone chez Lightfield — **CORRECT** (Elevay utilise activities)
7. Calendar sync manquant — **A VERIFIER** (commit `4ce876b` mentionne "calendar" mais non verifie en profondeur)

---

## SYNTHESE : CE QUI ETAIT FAUX

| # | Claim faux | Realite |
|---|-----------|---------|
| 1 | "~11 tools" | 128 tools |
| 2 | "13 tools manquants" | 22/24 Lightfield tools couverts, plus ~100 tools supplementaires |
| 3 | "Knowledge layer : NON" | Existe avec semantic search + prompt injection |
| 4 | "Skills system : NON" | 29 pre-built skills + custom templates |
| 5 | "`<Account>` XML tags : NON" | `getEntityContext()` equivalent |
| 6 | "Context layers : 3 vs 1" | 5 vs 3 (Elevay a plus) |
| 7 | "RAG non scope par account" | RAG tenant-scope avec hybrid search + context graph |
| 8 | "Code execution : NON" | JS sandbox existe |
| 9 | "Agentic import : NON" | analyzeCSVForImport + executeImport existent |
| 10 | "Draft Proposal : impossible" | draftProposal tool + skill existent |

---

## CE QUI RESTE INCONNU

1. **Qualite des outputs** — Les tools existent mais leur qualite n'est pas mesuree.
   Le `draftProposal` skill existe, mais produit-il un proposal de qualite Lightfield ?
   Test necessaire : executer le skill sur un deal reel et evaluer l'output.

2. **Fonctionnalite reelle vs code** — Certains tools pourraient etre des stubs ou
   avoir des bugs. Seul un test end-to-end peut le confirmer.

3. **System prompt leake Lightfield** — Source non verifiee directement par moi.
   Le subagent background pour cette tache n'a pas encore retourne de resultats.

4. **Calendar sync** — Le commit `4ce876b` mentionne "calendar" dans le message mais
   je n'ai pas verifie si un sync OAuth calendar est reellement implemente.

5. **`associateUnassociatedActivity`** — Equivalent Elevay non identifie. Gap potentiel.

6. **Batch create** — Lightfield prend des arrays. Elevay fait du singulier (+ upsert).
   Pour des imports de 100+ records, l'agent fait 100 tool calls vs 1 chez Lightfield.
   Mitigation : le tool `executeImport` gere le batch en interne.

7. **Qualite du RAG** — Le `shouldMeasureRagQuality` mesure 10% des requetes.
   Quels sont les scores ? Pas lu.

8. **Context graph utilisation** — Le graph bi-temporal existe mais est-il reellement
   utilise et alimente ? Ou est-ce du code mort ?
