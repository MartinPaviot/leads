# Audit approfondi — Sequences (outbound campaigns)

## Synthèse
Feature **80 % prototype, 20 % production-ready**. Wizard et UI solides. **3 blocages critiques bloquent le launch** :
1. Aucun scheduler → les campaigns **ne s'exécutent jamais** (`nextStepAt` calculé mais jamais consommé)
2. Aucun webhook handler → engagement tracking inerte
3. Aucune analytics → impossible de savoir si ça marche

---

## UI pages

### 1. Liste — `app/(dashboard)/sequences/page.tsx:1-122`
- Liste toutes sequences du tenant, status (draft/active/paused/archived)
- Par sequence : nom, description, steps count, enrollments count, email stats
- CTA "New campaign" → CampaignWizard fullscreen
- Fetch `/api/sequences` sans pagination, `limit(50)` hardcoded côté API
- **Manquants :** pagination, tri/filtrage, bulk actions, search, détail ongoing

### 2. Détail — `app/(dashboard)/sequences/[id]/page.tsx:1-368`
- Header : name + description + status badge
- Timeline visuelle : order, délai par step, subject preview (collapsible body)
- Section **Campaign** : status prep (preparing/ready/launched) + stats temps réel
  - `companiesSelected, companiesEnriched, contactsFound, emailsDrafted`
  - **Polling 3 s** si status="preparing" (lignes 89-103)
- Section **Enrolled** : table 20 premiers contacts, current step + status
- Boutons : Resume/Pause, Configure Campaign (draft)
- Auto-ouvre wizard si sequence draft non configurée (lignes 73-78)
- **Manquants :** analytics détaillées (open/click/reply/bounce rate), logs granulaires, unroll/stop contacts, export CSV, editor post-launch, pagination enrolled

### 3. Review — `app/(dashboard)/sequences/[id]/review/page.tsx:1-245`
- Filtre par status : draft / queued / sent
- Par email : to_address, contact name + title, step number
- Editable inline : subject + bodyHtml (toggle edit)
- Actions : Approve (draft→queued), Edit, Skip (→skipped)
- Bulk "Approve All" sur drafts
- **Manquants :** preview rendu final, templates copy/paste, undo, rate limit sur approvals

---

## API endpoints

### A. CRUD Sequences

**`GET /api/sequences`** (`route.ts:6-61`)
- Fetch toutes sequences + per-sequence : count steps, count enrollments, email stats par status
- **Limit 50 hardcoded**, pas d'offset/cursor
- `Promise.all` agrégation → **N+4 queries** inefficace

**`POST /api/sequences`** (`route.ts:63-91`)
- Crée sequence vide (draft). Requiert name. Optionnel description.

**`GET /api/sequences/{id}`** (`[id]/route.ts:6-58`)
- Fetch sequence + steps ordonnés + enrollments (avec contact join)
- **Issue :** no ordering sur enrollments (pagination chaotique)

**`PUT /api/sequences/{id}`** (`[id]/route.ts:60-95`)
- Update name/description/status
- **Pas de validation** du status (any string accepté)

### B. Campaign prep & launch

**`POST /api/campaigns/generate`** (`generate/route.ts:14-174`)
- AI génère sequence (5 steps par défaut) depuis contact/company context
- Flow : find best contact → load prospect context → `generateSequence()` LLM → insert steps avec `subjectTemplate` + `bodyTemplate` + `delayDays`
- Fallback template si no contacts
- Prompt utilise : signals, company desc, tenant settings
- Returns : `{ sequenceId, steps[], sequenceName, reasoning }`

**`POST /api/campaigns/prepare`** (`prepare/route.ts:27-98`)
- Lance prep async. Input : `segmentFilters` (industries, sizes, geographies, minScore), `targetRoles`, `maxCompanies`, `maxContactsPerCompany`
- Valide sequence + steps, sauve `campaignConfig` dans `sequence.campaignConfig` JSONB
- Fire Inngest event `campaign/prepare` → async job
- **Returns 202 Accepted** (fire-and-forget)
- CampaignConfig :
```ts
{
  status: "preparing" | "ready" | "launched",
  segmentFilters: {...},
  targetRoles: string[],
  maxCompanies: number,
  maxContactsPerCompany: number,
  stats?: { companiesSelected, companiesEnriched, contactsFound, emailsDrafted }
}
```

**`GET /api/campaigns/{id}/preview`** (`preview/route.ts:6-57`)
- Returns matching companies count selon filters (industries/sizes/geographies/minScore)
- Query `companies WHERE source='tam'`
- Returns : `matchingCompanies, needsEnrichment, alreadyEnriched`

**`GET /api/campaigns/{id}/status`** (`status/route.ts:6-85`)
- Polls campaign prep status. Returns : status, stats, emailStats (draft/queued/sent)
- Contact preview (top 50 si status ready/launched)

**`POST /api/campaigns/{id}/launch`** (`launch/route.ts:6-76`)
- Transitions tous draft emails → queued
- Valide status == "ready"
- Updates sequence.status → active
- **Pas d'atomicité transaction** (queries séparées)

### C. Enrollment & outbound

**`POST /api/sequences/{id}/enroll`** (`enroll/route.ts:6-108`)
- Manual enrollment : `contactIds[]`
- Limit 100 contacts/call
- `nextStepAt = now + firstStepDelay`
- **Pas de bulk import**

**`POST /api/sequences/{id}/autopilot`** (`autopilot/route.ts:6-108`)
- Auto-enroll top contacts par minScore + email
- Order by score DESC, limit `maxEnroll` (défaut 20, max 100)

**`POST /api/sequences/{id}/steps`** (`steps/route.ts:6-60`)
- Ajoute step manuel. Requiert `subjectTemplate, bodyTemplate`, optionnel `delayDays`. Auto-calcule `stepNumber`.

**`GET /api/outbound/review`** (`outbound/review/route.ts:6-63`)
- Fetch emails review. Filters : sequenceId, status (draft/queued/all)
- Limit 500 emails, order created_at DESC

**`PUT /api/outbound/review`** (lignes 65-115)
- Actions : approve (draft→queued), skip (→skipped), edit (subject+bodyHtml)

**`POST /api/outbound/review`** (lignes 118-145)
- Bulk approve_all : drafts→queued + `queuedAt` timestamp

### D. Email generation

**`POST /api/emails`** (`emails/route.ts:18-192`)
- AI génère email personnalisé (Claude Sonnet 4.6 / GPT-4o-mini fallback)
- Context : contact (name, title, seniority) + company (industry, size, revenue) + signals
- Load tenant writing samples + style guide
- Variable substitution `{{firstName}} {{lastName}} {{company}}` post-génération

---

## Campaign Wizard — `components/campaign-wizard.tsx:1-552`

### Step 1 : TARGET SELECTION (lignes 330-394)
- Campaign name (auto-default date-based)
- Target industries (searchable multi-select)
- Company size (pills : 1-10, 11-50, 51-200, 200+)
- Target decision-makers (searchable multi-select : CEO/CTO/VP Sales…)
- Contacts per company (pills : 1, 2, 3, 5)
- Preview via `/api/campaigns/{id}/preview?industry=X&size=Y`
- State : `selectedIndustries[], selectedSizes[], selectedGeographies[], minScore, maxCompanies, selectedRoles[]`

### Step 2 : CAMPAIGN GENERATION (lignes 396-441)
Workflow :
1. `POST /api/sequences` (create)
2. `POST /api/campaigns/generate` (steps)
3. `POST /api/campaigns/prepare` (launch async)
4. Poll `GET /api/campaigns/{id}/status` toutes 3 s

Progress stages : creating → generating_steps → preparing → enriching → discovering → drafting → ready
**Polling timeout 5 min hardcoded** (peut fail large campaigns)
Auto-advance Step 3 quand status=ready.
**Manquants :** step regeneration cache, error recovery UI

### Step 3 : REVIEW EMAILS (lignes 443-494)
- Load `/api/outbound/review?sequenceId=&status=draft`
- Display 30 emails max inline
- Filters : Drafts / Approved
- Action : approve_all bulk

### Step 4 : LAUNCH (lignes 496-511)
- Summary : X emails approved
- Note : "Emails will be sent over next few days"
- Button → `POST /api/campaigns/{id}/launch`

### State & flow
- `WizardStep = "targets" | "generating" | "review" | "launch"`
- Props : `onClose, onComplete(sequenceId), sequenceId` (optional pour continuation)
- Back button uniquement sur generating (error recovery)

---

## Schéma DB (relevant)

```sql
sequences (id, tenant_id, name, description, status, campaign_config JSONB, created/updated_at)
sequence_steps (id, sequence_id, step_number, subject_template, body_template, delay_days)
sequence_enrollments (id, sequence_id, contact_id, status, current_step, enrolled_at, last_step_at, next_step_at)
outbound_emails (
  id, tenant_id, campaign_id, enrollment_id, contact_id, step_number,
  from_address, to_address, subject, body_html, body_text,
  status (draft|queued|sending|sent|delivered|opened|clicked|replied|bounced),
  queued/sent/delivered/opened/clicked/replied/bounced_at,
  reply_classification, reply_snippet
)
```

---

## Gaps critiques

### 🔴 Blocage 1 — Scheduling / Cadence
- `sequenceEnrollments.nextStepAt` calculé mais **jamais consommé** : aucun cron worker visible
- Aucun "business days only" / timezone
- Aucun retry sur failed sends
- Aucun rate limit per mailbox (risque spam)
**→ Les campaigns ne s'exécutent jamais. Prototype UI-only.**

Nécessite : Inngest/Bull cron, business day filter, timezone-aware scheduling, mailbox rate limiting.

### 🔴 Blocage 2 — Engagement tracking
- Schéma prêt (opened_at, clicked_at, replied_at) mais **aucun webhook endpoint visible** pour EmailEngine
- `webhooks/emailengine/route.ts` existe peut-être mais pas wired
- Reply detection rudimentaire (`reply_classification, reply_snippet`) non branchée
- **Aucun unsubscribe handling** (risque compliance CAN-SPAM)

Nécessite : webhook consumer open/click/reply, parsing unsubscribe + compliance, smart reply intent detection.

### 🔴 Blocage 3 — Analytics / reporting
- Aucun endpoint analytics
- Email stats calculées ad-hoc
- Pas d'open/click/reply/bounce rate agrégés
- Pas de performance per step / per contact
- Pas de support A/B test (subject variants)

Nécessite : `GET /api/sequences/{id}/analytics` (breakdown par step), funnel view, A/B test.

### 🟡 Blocage 4 — Validation / limits
- `segmentFilters` structure non validée
- Target role sans validation vs taxonomie
- Step count sans min/max
- Pas de dédup sequence
- Pas de limit campagnes concurrentes par tenant

### 🟡 Blocage 5 — Control / modification post-launch
- Impossible d'éditer steps après launch
- Pas de unenroll contact spécifique
- Pas de pause per-contact
- Pas de clone/duplicate sequence
- Pas de bulk contact removal

Nécessite : `PUT /api/sequences/{id}/steps/{stepId}`, `DELETE /api/sequences/{id}/enrollments/{id}`, `PATCH /api/sequences/{id}/enrollments` bulk.

### 🟡 Blocage 6 — Performance at scale
- `GET /api/sequences` : N+4 queries
- `GET /api/sequences/{id}` : pas de batching (2000+ enrollments = lag)
- `outboundEmails` sans index `(campaignId, status)`
- Email generation per-contact (pas batch)

### 🟡 Blocage 7 — Compliance / safety
- Pas de bounce management (contacts bounced pas auto-unenrolled)
- Pas de compliance unsubscribe
- Pas de validation DKIM/SPF sur mailboxes
- Pas de throttling per mailbox (déclenchement filtres spam)
- Pas d'audit log des approvals

---

## Points forts
- Wizard multi-step progressif, erreurs gérées gracefully
- Contact enrichment intégré (prospect context + signals + company data)
- AI personnalisation à l'échelle (Claude Sonnet + GPT fallback, variables `{{firstName}}`)
- `campaign_config` JSONB extensible
- Review draft→queued avec inline editing + bulk approve
- Schéma DB normalisé, FK propres, cascading deletes
- Targeting sophistiqué (multi-critères + role-based)

---

## Tableau récapitulatif

| Composant | État | Couverture |
|---|---|---|
| UI List | ✅ | Basique |
| UI Detail | ✅ | Intermédiaire |
| UI Review | ✅ | Basique |
| Wizard Steps 1-4 | ✅ | Complet |
| API CRUD | ✅ | Complet |
| API Prepare / Generate / Launch | ✅ | Complet |
| API Enroll | ✅ | Basique |
| Scheduling | ❌ | **Manquant total** |
| Webhooks tracking | ⚠ | Schéma OK, logique absente |
| Analytics | ❌ | Manquant |
| Compliance | ⚠ | Basique |
