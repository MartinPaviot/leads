# Audit approfondi — Meetings + Opportunities

## FEATURE 1 — MEETINGS (capture, prep, transcripts)

### État synthèse
Intégration Recall.ai complète, pipeline IA mature, support upload manuel (audio/VTT/SRT/text), prep IA avant/après meeting.
**Blocage principal :** pas de Microsoft Calendar exposé côté `/api/meetings`, pas de conflict-detection sur booking.

---

### A. Pages & UI

#### 1. Meetings List — `app/(dashboard)/meetings/page.tsx` (162 lignes)
- Meetings 30j passés + 14j futurs via Google Calendar
- Séparation Upcoming / Past
- Card : titre, date, durée, attendees, badges "Notes"/"Transcript", bouton Prep, lien Zoom/Meet/Teams direct
- Prep doc caching mémoire (pas de refetch si déjà généré)
- **Manquant :** pagination, indicateur Recall bot actif, vue calendrier mois/semaine
- **Data model Meeting :** id, calendarEventId, title, start/end, attendees[{email, displayName, responseStatus}], hasTranscript, hasNotes, notes{summary}, recordingUrl, activityId

#### 2. Meeting Detail — `app/(dashboard)/meetings/[id]/page.tsx` (579 lignes)
- **Post-meeting :** structured notes (summary, keyPoints, actionItems, decisions), buying signals (budget, timeline, competitors, pain points, objections), sentiment badge, follow-up email draft, timeline activités liées, scoped chat de coaching
- **Upcoming :** génération prep on-demand
- **Manual upload :** drag-drop + paste transcript
- **Formats supportés :** audio `.mp3/.m4a/.webm/.wav/.ogg/.flac` (Whisper `gpt-4o-mini-transcribe`, verbose_json), subtitles `.vtt/.srt` (parseur custom), texte `.txt` direct
- **Limites :** 25 MB audio, 5 MB texte
- **Review banner** quand `transcriptSource==="recall_bot" && notes && !linkedTasks.length && !followUpDraft` — demande validation avant update CRM
- **Manquant :** édition notes (read-only), intégrations Fireflies/Otter/Read.ai, add attendee post-facto, association deal dynamique

---

### B. API Endpoints

#### 1. `GET /api/meetings` — `api/meetings/route.ts:1-176`
- Fetch Google Calendar real-time (pas de sync DB)
- Crée activity rows manquantes
- **Auto-schedule Recall.ai bot** si : meeting < 15 min dans futur + video link + `RECALL_API_KEY`
- Status update async via webhook
- Limit 500 activities mémoire
- **Manquant :** Microsoft Calendar exposé (`fetchMicrosoftMeetings` existe dans cron mais pas exposée ici), dédup cross-calendars, timezone handling

#### 2. `POST /api/meetings/upload-transcript` — `api/meetings/upload-transcript/route.ts:1-160`
- Accepte file (audio/subtitle/text), text (paste), ou les deux
- Audio → Whisper `gpt-4o-mini-transcribe`
- Subtitle → parseur VTT/SRT custom (strip timestamps)
- Validation : min 50 chars, max 25 MB audio / 5 MB texte
- Call interne `/api/meetings/process-transcript`
- Marque `transcriptSource: "audio_whisper" | "file_upload"`
- Support overwrite (HTTP 409 si flag absent)
- **Manquant :** streaming gros fichiers, progress UX, conversion format

#### 3. `POST /api/meetings/process-transcript` — `api/meetings/process-transcript/route.ts:1-259`
- LLM extraction (Claude Sonnet 4.6 ou GPT-4o-mini) avec `meetingNotesSchema` : summary, keyPoints, actionItems, decisions, participants, buyingSignals, sentiment
- Contact matching : email lookup puis fuzzy name (first+last)
- Deal update si dealId : extract budget/timeline/competitors/painPoints → `deal.properties.extractedIntel`
- Embeddings OpenAI pour RAG
- Context graph ingestion async (episode-based)
- Prompt strict : "ONLY information explicitly stated"
- Fallback : sans LLM retourne notes vides
- **Manquant :** validation post-extraction (hallucination check), dédup action items, link contacts si email inconnu

#### 4. `POST /api/meetings/[id]/post-call` — `api/meetings/[id]/post-call/route.ts:1-246`
- Fetch structured notes du metadata
- **Create tasks** (si actionItems) : owner→assignee mapping, deadline parsing, entityType contact/company
- **Update deal** (si dealId) : write `extractedIntel` sur deal + company
- **Generate follow-up email** (Claude Sonnet) :
  ```
  RULES:
  - 3-4 short paragraphs, never more
  - Reference 2-3 SPECIFIC discussion points
  - List action items with clear timelines
  - Tone: professional, warm, colleague — not vendor
  ```
- Flags : `createTasks`, `generateFollowUp`, `updateDeal` (défaut true)
- Résultat → `activity.metadata.followUpEmailDraft`, `generatedTaskIds`
- **Manquant :** send email (user doit copier/envoyer), auto-advance stage, update close date

#### 5. `GET /api/meetings/[id]/live` — `api/meetings/[id]/live/route.ts:1-95`
- Fetch `activity.metadata.partialTranscript`
- Cache-aware : re-extract seulement si transcript > 200 chars de plus
- LLM léger (Claude Haiku, maxTokens 150) : budget, teamSize, currentTools, competitors, sentiment
- In-memory cache per activity (`extractionCache` Map)
- **Manquant :** cache timeout, webhook streaming (polling only), partialTranscript truncated 5000 chars (perte début)

#### 6. `POST /api/meetings/prep` — `api/meetings/prep/route.ts:1-297`
Contexte compilé (150-300 lignes avant LLM) :
- Meeting details
- Attendee contacts (email match + company)
- Company snapshot (size, industry, revenue, score, technos)
- Active deals (name, stage, value, expectedClose)
- Recent interactions (last 20)
- Notes (last 10)

LLM génère 8 sections : Meeting Overview, Account Snapshot, Key Attendees, Deal Status, Recent Interactions, Talking Points, Risks & Opportunities, Open Items.
Fallback : `formatFallbackPrep` (markdown simple).
Rate-limit LLM bucket. Caching uniquement côté client.
**Manquant :** caching serveur, talking points structurés, deal stage prediction

---

### C. Background jobs & webhooks

#### 1. Recall.ai bot scheduling — `inngest/meeting-functions.ts:165-225`
- `cronCalendarSync` toutes les 15 min : pour chaque user OAuth, fetch Google + Microsoft meetings, auto-create Recall bot sur nouveaux meetings avec video link
- `autoMeetingPrep` chaque 1h : meetings dans les 24h sans prep → event `meeting/generate-prep`
- `generateMeetingPrep` async : gather contexte → LLM → save `activity.metadata.prepDocument`
- Prep auto seulement si attendees externes. Target < 500 words.
- Recall bot errors catchés (ne cassent pas la sync)
- **Manquant :** deletion bot si meeting canceled, retry logic transcripts, métriques observability

#### 2. Recall.ai webhook — `api/webhooks/recall/route.ts:1-340`
- `bot.status_change` → update `recordingStatus` ; si `call_ended` ou `done` → trigger `processTranscriptFromBot`
- `bot.transcription` / `bot.transcript` → update `partialTranscript` (last 10K chars) ; status="recording"
- `processTranscriptFromBot` (async non-blocking) :
  1. Fetch transcript Recall API
  2. LLM extraction structured notes
  3. Contact matching email + fuzzy name
  4. Update activity structuredNotes
  5. Update `deal.properties.extractedIntel`
  6. Embed RAG
  7. Ingest context graph
- Latence webhook 30-60 s (pas de streaming)
- **Manquant :** dédup transcript (bot + upload), human review queue, handling `fatal`/`error` bot statuses

#### 3. Meeting booking — `api/meetings/book/route.ts:1-77`
- POST `contactId, startTime, durationMinutes, title` → `createCalendarEvent` Google → log activity `meeting_scheduled` → return `eventId, meetLink, htmlLink`
- **Manquant :** Outlook/Microsoft Calendar, availability check, follow-up reminders auto

---

### D. Recall.ai integration — `lib/recall.ts` (219 lignes)
- `createBot(meetingUrl, { botName?, webhookUrl? })` → `POST https://us-east-1.recall.ai/api/v1/bot/`
- `getBotStatus`, `getBotTranscript` → parse `recording.media_shortcuts.transcript`
- `transcriptToText` : word-level segments → speaker labels
- `mapBotStatus` : ready / joining_call / waiting / recording / done / error
- webhookUrl = `NEXTAUTH_URL`
- Metadata : `recallBotId, recordingStatus, lastStatusUpdate`
- **Manquant :** fallback provider (Read.ai, Fireflies), cleanup archived bots, recording duration limits

---

## FEATURE 2 — OPPORTUNITIES / PIPELINE

### État synthèse
Kanban drag-drop fonctionnel, analytics côté backend, risk scoring + deal coaching avec next best actions, extract intel depuis interactions.
**Blocage principal :** filter builder client-side only, pas de custom properties avancées, Kanban sans validation workflow.

---

### A. Pages & UI

#### 1. Opportunities List — `app/(dashboard)/opportunities/page.tsx` (600+ lignes)
- **Dual-view :** Kanban (default) + Table
- **Kanban :** colonnes par stage, drag-drop cards
- **Analytics panel** (collapsible) : win rate %, avg deal value, avg velocity, value by stage (funnel), risk summary (high/medium/low/none)
- Search real-time (name/company)
- **Filtres avancés :** stage multi-select, account multi-select, owner multi-select, value ≥/≤, close date before, risk level
- Display options : toggle colonnes (Account/Owner/Value/Close/Summary/Risk)
- Sorting : createdAt, name, value, expectedCloseDate, companyName, stage
- **Manquant :** bulk actions, column collapse/resize, custom stage order override, pipeline color coding

#### 2. Deal Detail — `app/(dashboard)/opportunities/[id]/page.tsx` (333 lignes)
- **Extracted Intelligence card :** budget, teamSize, decisionMaker, currentStack, painPoints, etc.
- **Deal Coaching card** (si risk high ou stalled > 7j) : risk badge + color, days since last activity, risks (bulleted red dots), suggested next steps (blue arrows), CTA "Ask the chat below"
- **Activity Timeline :** vertical, inbound vert / outbound bleu, limit 50
- **Scoped Chat :** coaching contextuel au deal, full history
- **Manquant :** edit extracted intelligence, manual risk override, stage history audit, export PDF

---

### B. API Endpoints

#### 1. `GET|POST /api/opportunities` — `api/opportunities/route.ts` (96 lignes)
GET : SELECT deals + companyName + ownerFirstName/Last LIMIT 100, pas de filter/pagination.
POST : INSERT + audit log.
**Manquant :** pagination, filter serveur, search

#### 2. `GET|PUT /api/opportunities/[id]` — `api/opportunities/[id]/route.ts` (121 lignes)
GET : deal + timeline (last 50 activities).
PUT : update fields, **pas d'audit log** sur PUT.
**Manquant :** audit sur stage change, bulk property updates

#### 3. `POST /api/deals/analyze` — `api/deals/analyze/route.ts` (149 lignes)
- Input : `dealIds` (max 10)
- LLM Claude Sonnet : `suggestedStage`, `stageReason`, `riskLevel` (high/medium/low/none), `risks[]`, `summary`, `nextActions[]`
- Write → `deal.properties { riskLevel, risks, suggestedStage, nextActions, analyzedAt }`
- Prompt : "Be realistic — don't assume progress without evidence"
- **Manquant :** audit log sur risk change, stage auto-transition, confidence scoring

#### 4. `POST /api/opportunities/[id]/extract-intel` — (94 lignes)
- Last 20 activities `entityId=dealId` (**note : deal activities, pas company !**)
- LLM Claude Sonnet extract : budget, teamSize, currentCRM, competitorTools, decisionTimeline, painPoints
- Save → `deal.properties.extractedIntel`
- Gère empty gracefully
- **Manquant :** chercher company activities aussi, limite 90j, dédup (compétiteurs listés 3×), link decision maker à contact

#### 5. `GET /api/pipeline/analytics` — `api/pipeline/analytics/route.ts` (93 lignes)
Calculé en mémoire (pas d'agrégation SQL) :
- `totalDeals`, `activeDeals`, `totalPipelineValue`, `wonValue`
- `winRate = wonDeals / (wonDeals + lostDeals) × 100`
- `avgDealValue = sum(valued) / count(valued)`
- `avgVelocityDays = avg(updatedAt - createdAt)` pour won
- `valueByStage`, `funnel`, `riskSummary`
- **All-time uniquement, pas de time windowing**
- **Manquant :** Q/M/YTD, conversion par stage, avg days per stage, forecast revenue

#### 6. `POST /api/deals/[id]/extract` — (120 lignes)
- Input : `dealId, notes` (free-form user/meeting)
- LLM extract budget, teamSize, competitorTools, timeline, decisionMaker, nextSteps
- Save → `deal.properties.extracted*`
- **Manquant :** link decisionMaker à contact ID, merge (pas overwrite), track extraction source

---

### C. Deal velocity & risk — `lib/deal-velocity.ts` (183 lignes)
`predictDealVelocity(dealId, tenantId)` :
1. `daysInCurrentStage = now - lastUpdate`
2. `avgDaysPerStage = avg(updatedAt - createdAt) / 8` [for won deals]
3. Activity trend : recent 14j vs previous 14-28j, > 1.3× = increasing, < 0.7× = decreasing
4. Sentiment trend : positive ratio delta > 0.15 = improving
5. Risk : stalled si `daysInStage > avgDaysPerStage × 2`, slowing si decreasing OR `> × 1.5`
6. Velocity factor : increasing+improving = 0.8×, decreasing+worsening = 1.8×
7. Estimated close = now + (2 × avgDaysPerStage × velocityFactor)
8. Confidence : high (5+ won, 3+ recent), medium (2+), low

**Hardcoded assumptions :** 8 stages, 2 remaining stages, seuils 1.3/0.7/0.15.
**Manquant :** usage de `expectedCloseDate`, historical per stage, deal size weighting, facteurs saisonniers.

---

### D. Filter builder & custom properties
**Filter logic** (`opportunities/page.tsx:275-297`) :
```ts
filteredDeals = deals.filter(deal => {
  if (searchQuery) check name/company
  for (const filter of activeFilters) {
    switch (filter.field) {
      case "stage": deal.stage !== filter.value
      case "value": op==="gte" && value < threshold
      case "expectedCloseDate": op==="lte" && date > threshold
      case "risk": deal.properties.riskLevel !== filter.value
      // ...
    }
  }
})
```
Opérateurs : `eq`, `contains`, `gte`, `lte`. Pas de AND/OR groupés, pas de JSON path queries, filter **client-side** après fetch.
**Manquant :** server-side SQL, custom property types, templates sauvegardés, operators IN/NOT IN.

---

### E. Kanban drag-drop
`opportunities/page.tsx:240-263` :
- `handleDragStart` → `setData("text/plain", id)`
- `handleDrop` → optimistic update `setDeals()` → `PUT /api/deals/{id} {stage}` → rollback si échec
- `dragOverStage` highlight drop zone
- **Pas de validation workflow**, pas de permission check, bulk move absent, pas d'auto-fill `expectedCloseDate` au passage "won", pas de log activity

---

## Synthèse manquants

### Meetings
| Composant | État | Blocage | Priorité |
|---|---|---|---|
| Calendar integration | 95 % | MS Calendar non exposé, recurring events | Moyenne |
| Recall.ai bot | 100 % | Fallback providers absents | Basse |
| Transcript upload | 100 % | Pas streaming/progress | Basse |
| AI extraction | 95 % | Pas hallucination validation, dédup contacts | Moyenne |
| Prep generation | 85 % | Pas cache serveur, talking points libres | Basse |
| Post-call actions | 90 % | Email pas auto-send, stage pas auto-advance | **Haute** |
| Meeting booking | 75 % | Pas Outlook, pas conflict detection | Moyenne |

### Opportunities
| Composant | État | Blocage | Priorité |
|---|---|---|---|
| Kanban | 95 % | Pas workflow validation, pas bulk | Moyenne |
| Analytics | 80 % | Pas time-windowing, pas forecast | Moyenne |
| Risk scoring | 90 % | Hardcoded assumptions | Basse |
| Extract intel | 75 % | Deal activities only, pas dedup | **Haute** |
| Filter builder | 60 % | Client-only, pas custom props | **Haute** |
| Deal coaching | 90 % | Suggestions pas actionable | Moyenne |
| Custom properties | 0 % | Non implémenté | **Très haute** |

---

## Patterns d'architecture observés

**IA :** Claude Sonnet 4.6 primary + GPT-4o-mini fallback. Zod schemas. `tracedGenerateText` / `tracedGenerateObject` (agentId + tenantId). Rate limit `checkRateLimit("llm", userId)`.

**Data :** activity log central (meetings, calls, emails avec activityType/channel/direction/sentiment). Properties JSON extensible (deals/companies). `activity.metadata` pour meeting-specific (recallBotId, partialTranscript, structuredNotes).

**Jobs :** Inngest crons (15 min calendar, 1h prep). Webhooks Recall.ai → fire-and-forget async transcript processing. Non-blocking (errors ne font pas échouer main flow).
