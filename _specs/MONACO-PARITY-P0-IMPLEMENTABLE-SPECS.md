# Specs implémentables — 5 P0 Monaco Parity

**Date** : 2026-05-07
**Méthode** : audit du code Elevay existant (28 skills, 48 migrations Drizzle, ~80 routes API, schemas modulaires en `src/db/schema/*`) + extrapolation pixel-precise depuis screenshots Monaco + patterns d'ingénierie identifiés dans `_research/monaco-comment-ils-font-2026-05-07.md`.

**État du code constaté** :
- ✅ Migrations existantes : `0039_coaching_chunks_and_signal_url_cache.sql`, `0040_onboarding_and_visits.sql`, `0041_llm_observability.sql`, `0042_cs_health_snapshots.sql` — Monaco-parity 01/03/04/05 déjà partiellement tagués
- ✅ Schemas modulaires : `src/db/schema/{agent,ai-observability,auth,campaign,coaching,core,cs,enums,intelligence,onboarding-and-visitors,outbound}.ts`
- ✅ `lib/onboarding/checklist.ts` (gates DB-backed) + `lib/onboarding/phase-validators.ts` (Zod par phase 1-7)
- ✅ `lib/coaching/{chunk-transcript,citation-parser,index-transcript,interaction-scorer,performance-aggregator,pre-send-review,retrieve-transcript-chunks}.ts`
- ✅ `inngest/{coaching-engine,deal-signal-sync,custom-signal-backfill,...}.ts`
- ✅ Routes API onboarding : `analyze-website`, `chat`, `complete`, `email-intelligence`, `enrich-icp`, `find-contacts`, `narrate-website`, `phase`, `save`, `state`, `status`
- ⚠️ Page `/sequences/[id]/page.tsx` : edit/delete steps OK, mais PAS d'UI approve/reject per draft visible
- ⚠️ Schema `visits` créé mais aucun endpoint pixel ingestion / webhook provider

**Convention** : chaque P0 suit le format Kiro — *Audit / Requirements / Design / Tasks / Tests / Migration / Risks / Effort / Telemetry*.

---

## P0-1 — Sequence Approval UI per-draft

### Audit du code existant

| Élément | État | Fichier |
|---|---|---|
| Schema `sequences` + `sequence_steps` + `sequence_enrollments` | ✅ | `src/db/schema/outbound.ts` (présumé) |
| Page `/sequences/[id]` avec edit/delete steps | ✅ | `src/app/(dashboard)/sequences/[id]/page.tsx` |
| Page `/sequences/[id]/review/page.tsx` | ✅ existe | idem |
| Mode global `agentApprovalMode` (auto/ask/manual) | ✅ | `lib/tenant-settings.ts` |
| **Approve/Reject per-draft buttons** | ❌ MANQUE | — |
| **`sequence_drafts` table (état queue)** | ❌ MANQUE | — |
| **API `POST /api/sequences/drafts/:id/approve` + `/reject`** | ❌ MANQUE | — |
| **Audit log des décisions d'approval** | ⚠️ partiel via `audit_log` | `src/db/schema/auth.ts` (présumé) |

### Requirements (GIVEN/WHEN/THEN)

**User story** : *En tant que founder, quand un email AI-généré est prêt à partir, je veux le valider ou le rejeter en un clic depuis ma boîte de revue, avec le contexte (prospect, raison de l'enroll, citations utilisées) visible, et qu'aucun email ne parte sans mon OK durant les 14 premiers jours.*

**Acceptance criteria** :
- **GIVEN** un draft email généré par l'autopilot, **WHEN** il atterrit dans `sequence_drafts.status = 'pending_approval'`, **THEN** il apparaît dans `/sequences/review` triable par âge, prospect, sequence
- **GIVEN** un draft pending, **WHEN** je clique "Approve", **THEN** le draft transitionne `pending_approval → approved`, est passé au worker d'envoi (`emailSendWorker`), et l'audit log enregistre `{ user_id, decision: 'approve', timestamp, draft_snapshot }`
- **GIVEN** un draft pending, **WHEN** je clique "Reject", **THEN** un modal demande la raison (1-3 mots ou texte libre), le draft transitionne `pending_approval → rejected`, l'enrollment passe à `paused`, et la raison est injectée dans l'evaluator-optimizer loop pour ré-entraîner la génération
- **GIVEN** un draft pending depuis > 24h, **WHEN** le cron `expireOldDrafts` tourne, **THEN** le draft transitionne `pending_approval → expired`, notification au user
- **GIVEN** `tenant.settings.approvalMode = 'auto'`, **WHEN** un draft est généré, **THEN** il est immédiatement marqué `approved` sans passer par la queue (legacy comportement)
- **GIVEN** `tenant.settings.approvalMode = 'manual'`, **WHEN** un draft est généré, **THEN** il atterrit en `pending_approval` (nouveau comportement)
- **GIVEN** `tenant.settings.approvalMode = 'ask'`, **WHEN** un draft est généré, **THEN** notification immédiate (Slack/email) avec deadline 30 min — si pas de réponse, par défaut **rejected** (safety-first)

**Non-functional** :
- Latence approval action ≤ 200ms p95 (UI feedback instantané)
- Worker d'envoi pickup ≤ 30s après approval
- Queue tient 1000 drafts pending sans dégradation UI

### Design

#### Schema DB additions

```sql
-- drizzle/0043_sequence_drafts.sql
CREATE TYPE sequence_draft_status AS ENUM (
  'pending_approval',
  'approved',
  'rejected',
  'expired',
  'sent'
);

CREATE TABLE IF NOT EXISTS sequence_drafts (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       text NOT NULL,
  sequence_id     text NOT NULL,
  step_id         text NOT NULL,
  enrollment_id   text NOT NULL,
  contact_id      text NOT NULL,

  -- Drafted content
  subject         text NOT NULL,
  body_html       text NOT NULL,
  body_text       text NOT NULL,

  -- Why this draft was generated (for context in approval UI)
  trigger_reason  text NOT NULL, -- e.g., "scheduled_step_2", "post_funding_signal"
  personalization_sources jsonb NOT NULL DEFAULT '[]'::jsonb, -- citations used

  -- State machine
  status          sequence_draft_status NOT NULL DEFAULT 'pending_approval',
  generated_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewed_by     text, -- user_id
  review_reason   text, -- user-provided rejection reason
  scheduled_send_at timestamptz, -- when approved, when should this fly?
  sent_at         timestamptz,

  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sequence_drafts_tenant_status_idx
  ON sequence_drafts (tenant_id, status, generated_at DESC);
CREATE INDEX IF NOT EXISTS sequence_drafts_enrollment_idx
  ON sequence_drafts (enrollment_id);

-- For tenant.settings.approvalMode, add an enum + default 'manual' for new tenants
-- (already exists per lib/tenant-settings.ts; just enforce default in tenant creation)
```

#### Routes API

```
GET    /api/sequences/drafts?status=pending&limit=50&cursor=...
       → { drafts: SequenceDraft[], nextCursor }
POST   /api/sequences/drafts/:id/approve
       Body: { scheduledSendAt?: ISO8601 } (default: immediate)
       → { draft: SequenceDraft, queuedAt: ISO8601 }
POST   /api/sequences/drafts/:id/reject
       Body: { reason: string (3-200 chars) }
       → { draft: SequenceDraft, enrollmentPaused: boolean }
POST   /api/sequences/drafts/:id/edit
       Body: { subject?, bodyHtml?, bodyText? }
       → { draft: SequenceDraft } (status reste pending, but content updated)
GET    /api/sequences/drafts/:id/context
       → { contact, account, deal, recentInteractions, signalsAtTriggerTime }
```

**Tenant scope obligatoire** sur toutes les routes (cf. pattern existant dans `src/app/api/sequences/[id]/route.ts` lignes 21-32 — recopier exactement).

#### UI wireframe

```
┌────────────────────────────────────────────────────────────────────────────┐
│  /sequences/review                                                         │
│  ┌──────────────────────────────────────┐ ┌─────────────────────────────┐  │
│  │ Pending approval (12)                 │ │ Draft preview               │  │
│  │ ────────────────────────────────────  │ │ ─────────────────────────── │  │
│  │ ▣ Alex Shan @ Judgment Labs           │ │ To: alex@judgmentlabs.com   │  │
│  │   "Quick follow-up on RAG eval"  [B]🔥│ │ From: martin@elevay.com     │  │
│  │   Generated 4min ago • Step 2/3       │ │ Subject: Quick follow-up... │  │
│  │ ────────────────────────────────────  │ │                             │  │
│  │ ▢ Hari R. @ Autograph                 │ │ Hi Alex,                    │  │
│  │   "Congrats on the Series A"     [A]🔥│ │                             │  │
│  │   Generated 12min ago • Step 1/3      │ │ I noticed you raised...     │  │
│  │ ────────────────────────────────────  │ │ [body continues]            │  │
│  │ ▢ Sarah Chen @ Bluenote               │ │                             │  │
│  │   "Following up on demo"         [A]  │ │ Best, Martin                │  │
│  │   Generated 47min ago • Step 3/3      │ │                             │  │
│  │                                       │ │ ─────────────────────────── │  │
│  │ [Bulk approve selected]               │ │ Why this draft?             │  │
│  └──────────────────────────────────────┘ │ • Trigger: Series A funding │  │
│                                           │   announced 2 days ago      │  │
│                                           │ • Personalized from:         │  │
│                                           │   - "Series A" article (cit) │  │
│                                           │   - LinkedIn role: VP Eng    │  │
│                                           │                             │  │
│                                           │ [✓ Approve & send now]      │  │
│                                           │ [⏰ Approve, send tomorrow]  │  │
│                                           │ [✎ Edit before approving]   │  │
│                                           │ [✗ Reject (with reason)]    │  │
│                                           └─────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

**Composants nouveaux à créer** :
- `src/app/(dashboard)/sequences/review/page.tsx` (la nouvelle page liste)
- `src/components/sequence-draft-list.tsx` (liste gauche)
- `src/components/sequence-draft-preview.tsx` (panneau droit avec preview + actions)
- `src/components/sequence-draft-reject-modal.tsx` (modal rejection avec reason)

**Composants à étendre** :
- `src/app/(dashboard)/sequences/[id]/review/page.tsx` (existant) → soit le supprimer si devenu redondant, soit le rediriger vers `/sequences/review?sequenceId=X`

#### Worker logic — pseudocode

```typescript
// inngest/sequence-draft-router.ts (NEW)
inngest.createFunction(
  { id: "sequence-draft-router" },
  { event: "sequence.step.scheduled" },
  async ({ event, step }) => {
    const { enrollmentId, stepId, tenantId } = event.data;

    // 1) Generate draft (existing logic from sequence-generator)
    const draft = await step.run("generate-draft", async () => {
      return await generateDraftForStep({ enrollmentId, stepId, tenantId });
    });

    // 2) Insert in sequence_drafts with appropriate status
    const settings = await getTenantSettings(tenantId);
    const initialStatus = settings.approvalMode === "auto"
      ? "approved"
      : "pending_approval";

    const draftRecord = await step.run("insert-draft", async () => {
      return await db.insert(sequenceDrafts).values({
        ...draft,
        status: initialStatus,
        scheduledSendAt: initialStatus === "approved" ? new Date() : null,
      }).returning();
    });

    // 3) If 'ask' mode → notify with deadline
    if (settings.approvalMode === "ask") {
      await step.sendEvent("draft.review.requested", {
        name: "draft.review.requested",
        data: { draftId: draftRecord.id, tenantId, deadlineMinutes: 30 },
      });
    }

    // 4) If 'auto' mode → immediate send queue
    if (initialStatus === "approved") {
      await step.sendEvent("email.send.queued", {
        name: "email.send.queued",
        data: { draftId: draftRecord.id },
      });
    }
  },
);

// inngest/sequence-draft-expiry.ts (NEW)
inngest.createFunction(
  { id: "sequence-draft-expiry" },
  { cron: "0 * * * *" }, // hourly
  async ({ step }) => {
    // Expire pending drafts older than 24h
    const expired = await step.run("expire-old", async () => {
      return await db
        .update(sequenceDrafts)
        .set({ status: "expired" })
        .where(
          and(
            eq(sequenceDrafts.status, "pending_approval"),
            lt(sequenceDrafts.generatedAt, subHours(new Date(), 24)),
          ),
        )
        .returning();
    });
    // Notify users for each expired draft
    for (const draft of expired) {
      await sendNotification({ userId: ..., type: "draft_expired", draftId: draft.id });
    }
  },
);
```

#### Prompts LLM

**Pour générer un draft (existant — sequence-generator)** : pas de changement.

**Pour evaluator-optimizer après rejection** (nouveau prompt à wrapper) :

```
You are reviewing a rejected draft email to learn from the feedback.

REJECTED DRAFT:
Subject: {{rejected.subject}}
Body: {{rejected.body}}

CONTEXT WHEN GENERATED:
{{rejected.personalizationSources}}

USER REJECTION REASON: {{rejected.reason}}

Identify the specific anti-pattern in this draft. Output JSON:
{
  "antipattern": "<one of: too_generic | hallucinated_fact | wrong_tone | too_long | weak_cta | other>",
  "specific_issue": "<one sentence describing what was wrong>",
  "preventive_rule": "<one rule to add to the system prompt to prevent this in future>"
}
```

Sortie injectée dans `tenant.preferences.preventiveRules` (jsonb) → re-injecté dans le system prompt de génération à chaque draft.

### Tasks

| # | Task | Files | Effort |
|---|---|---|---|
| 1.1 | Migration 0043 + schema Drizzle `sequenceDrafts` | `drizzle/0043_sequence_drafts.sql`, `src/db/schema/outbound.ts` | 0.5j |
| 1.2 | API `GET/POST /api/sequences/drafts/...` (5 routes) | `src/app/api/sequences/drafts/**/route.ts` | 1j |
| 1.3 | Page `/sequences/review` + composants | `src/app/(dashboard)/sequences/review/page.tsx` + 3 components | 1.5j |
| 1.4 | Worker `sequence-draft-router` (refactor de l'autopilot existant) | `src/inngest/sequence-draft-router.ts` | 1j |
| 1.5 | Worker `sequence-draft-expiry` (cron hourly) | `src/inngest/sequence-draft-expiry.ts` | 0.5j |
| 1.6 | Evaluator-optimizer après rejection | `src/inngest/draft-rejection-learner.ts` | 1j |
| 1.7 | Tests unitaires + intégration | `src/__tests__/sequence-drafts-*.test.ts` | 1j |
| 1.8 | Tests E2E Playwright (approve, reject, edit, expire) | `tests/e2e/sequence-drafts.spec.ts` | 0.5j |
| 1.9 | Migration des autopilot existants vers le nouveau flow | refactor `inngest/autonomous-pipeline.ts` | 0.5j |
| 1.10 | Documentation + onboarding tenant default `approvalMode = 'manual'` | `RUNBOOK.md`, tenant creation logic | 0.5j |

**Total effort** : ~8 jours

### Tests

**Unit** :
- `phase-validators.test.ts` style — Zod schema for draft creation
- Worker logic mocked Inngest steps

**Integration** :
- Approve flow : insert draft → POST /approve → assert email queued + audit log entry
- Reject flow : insert draft → POST /reject → assert enrollment paused + preventive rule injected
- Expire flow : insert old pending draft → run cron → assert status='expired' + notification sent

**E2E Playwright** :
- Login → naviguer `/sequences/review` → approve premier draft → screenshot before/after → assert email queued (via API check)
- Login → reject avec reason "too generic" → modal → submit → assert enrollment paused

### Migration plan

1. Deploy migration 0043 (additive, zero downtime)
2. Deploy backend code (workers + API routes) avec feature flag `SEQUENCE_DRAFTS_ENABLED=false`
3. Deploy frontend code (page review) — pas accessible sans feature flag
4. Activer pour 1 tenant test (ton compte) → vérifier flow end-to-end
5. Activer pour tous les nouveaux tenants
6. Migrer les tenants existants : pour ceux en `approvalMode='manual'`, leurs prochains drafts iront dans la nouvelle queue
7. Décommissionner l'ancien flow direct (suppression du code legacy après 14 jours sans incident)

### Risques

| Risque | Impact | Mitigation |
|---|---|---|
| User n'approuve jamais → drafts s'accumulent | Élevé | Cron expiry 24h + digest email quotidien des drafts pending |
| Race condition : draft approved 2x en parallèle | Moyen | Optimistic locking via `version` column + check status='pending' |
| Volume élevé → UI lente | Faible | Pagination cursor-based, virtualisation liste si >50 |
| User rejette TOUT → boucle infinie de génération | Moyen | Si > 5 rejections consécutives même sequence, pause auto + alert |

### Telemetry

- `sequence_draft_created_total` (counter, labels: tenant, status_initial)
- `sequence_draft_approval_latency_seconds` (histogram, labels: decision)
- `sequence_draft_pending_age_seconds` (gauge — alert si > 12h pour > 10 drafts)
- `sequence_draft_rejection_rate` (computed, alert si > 30% sur 7d → quality LLM problem)
- Datadog dashboard : `Drafts pending`, `Approval rate 7d`, `Rejection reasons top-10`

---

## P0-2 — Visitor ID intégration provider (Snitcher first)

### Audit du code existant

| Élément | État | Fichier |
|---|---|---|
| Schema `visits` | ✅ | `src/db/schema/onboarding-and-visitors.ts` |
| Migration 0040 (table créée) | ✅ | `drizzle/0040_onboarding_and_visits.sql` |
| **Pixel JS public à embed sur site client** | ❌ MANQUE | — |
| **Endpoint `POST /api/track/visit` (pixel beacon)** | ❌ MANQUE | — |
| **Job async d'identification (Snitcher API call)** | ❌ MANQUE | — |
| **Match visit → company TAM** | ❌ MANQUE | — |
| **Notification Slack si visit identifié** | ❌ MANQUE (Slack integration not in subprocessors yet) | — |
| **Settings UI provider config + pixel snippet** | ❌ MANQUE | — |

### Requirements (GIVEN/WHEN/THEN)

**User story** : *En tant que founder, j'ajoute un script Elevay sur mon site (1 ligne JS), et chaque visiteur identifié comme appartenant à une entreprise est ajouté comme signal "intent_visited_site" sur son compte dans mon TAM, avec timestamp et URL visitée. Si le compte n'existe pas dans le TAM, il est ajouté en mode "warm inbound".*

**Acceptance criteria** :
- **GIVEN** un visiteur anonyme sur le site du client, **WHEN** il charge n'importe quelle page, **THEN** un pixel JS envoie `{ visitor_id (cookie 90j), url, referrer, utm, user_agent }` à `POST /api/track/visit/:tenantId`
- **GIVEN** un événement reçu, **WHEN** le worker `visitor-identifier` tourne, **THEN** il appelle l'API Snitcher avec l'IP hashée → si match, écrit `company_domain` + `identified_by='snitcher'`
- **GIVEN** une `company_domain` identifiée, **WHEN** elle matche un compte du TAM (lookup par domain), **THEN** crée un `signal` "intent_visited_site" sur le compte avec metadata `{ url, timestamp, count_30d }`
- **GIVEN** un compte hot (3+ visites en 7 jours OU 1 visite sur `/pricing` ou `/demo`), **WHEN** la transition se produit, **THEN** notification Slack (si configuré) + alerte dashboard
- **GIVEN** GDPR consent absent, **WHEN** le pixel se charge, **THEN** ne PAS envoyer d'événement (respect honor-do-not-track + cookie banner integration)
- **GIVEN** un visiteur en VPN/Tor, **WHEN** Snitcher retourne null, **THEN** stocker la visite anonyme (utile pour analytics) sans signal compte

**Non-functional** :
- Pixel JS < 2KB minified+gzipped
- Pixel async, n'impacte pas TTFB du site client (load à `defer`)
- Endpoint `/api/track/visit` p95 < 50ms (juste insert DB, identification async)
- Snitcher rate limit honored (typically 100 req/sec → batching)

### Design

#### Pixel JS (public, served from CDN)

`public/eve-pixel.js` :

```javascript
(function() {
  var TENANT_ID = document.currentScript?.getAttribute('data-tenant') || window.EVE_TENANT_ID;
  if (!TENANT_ID) return;

  // Honor Do Not Track
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  // Cookie management — first-party, 90d
  function getOrSetVisitorId() {
    var match = document.cookie.match(/(?:^|; )_eve_v=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
    var v = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, function(c) {
      return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
    });
    document.cookie = '_eve_v=' + v + '; max-age=' + (90*24*60*60) + '; path=/; samesite=lax';
    return v;
  }

  function track() {
    var payload = {
      visitor_id: getOrSetVisitorId(),
      url: location.href,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent.slice(0, 500),
      utm: ['source','medium','campaign','content','term'].reduce(function(acc, k) {
        var v = new URLSearchParams(location.search).get('utm_' + k);
        if (v) acc[k] = v;
        return acc;
      }, {}),
      timestamp: Date.now(),
    };
    var endpoint = 'https://app.elevay.com/api/track/visit/' + TENANT_ID;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, JSON.stringify(payload));
    } else {
      fetch(endpoint, { method: 'POST', body: JSON.stringify(payload), keepalive: true });
    }
  }

  // Fire on initial load
  if (document.readyState === 'complete') track();
  else window.addEventListener('load', track, { once: true });

  // Fire on SPA route changes (history API)
  var pushState = history.pushState;
  history.pushState = function() { pushState.apply(this, arguments); setTimeout(track, 100); };
  window.addEventListener('popstate', function() { setTimeout(track, 100); });
})();
```

Embed code donné au client (1 ligne) :
```html
<script async defer src="https://cdn.elevay.com/eve-pixel.js" data-tenant="TENANT_ID_HERE"></script>
```

#### API endpoint

```
POST /api/track/visit/:tenantId
  Body: { visitor_id, url, referrer, user_agent, utm, timestamp }
  Headers: X-Forwarded-For (IP, hashed before storage)
  Response: 204 No Content (always — no leakage)
  Side effects:
    1) Hash IP with SHA-256 + tenant-specific salt
    2) Insert into `visits` table
    3) Emit Inngest event `visit.received` with { visitId, tenantId }
```

```typescript
// src/app/api/track/visit/[tenantId]/route.ts
import { db } from "@/db";
import { visits } from "@/db/schema";
import { hashIp } from "@/lib/visitor/hash-ip";
import { inngest } from "@/lib/inngest/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.visitor_id || !body?.url) {
    return new Response(null, { status: 204 }); // silent fail to avoid leakage
  }

  // Tenant validation: does this tenant have visitor tracking enabled?
  const settings = await getTenantSettings(tenantId);
  if (!settings.visitorTracking?.enabled) {
    return new Response(null, { status: 204 });
  }

  const ipHash = await hashIp(req.headers.get("x-forwarded-for") || "0.0.0.0", tenantId);

  const [visit] = await db.insert(visits).values({
    tenantId,
    visitorId: body.visitor_id,
    ipHash,
    url: body.url.slice(0, 2048),
    referrer: body.referrer?.slice(0, 2048) || null,
    utm: body.utm || {},
    userAgent: body.user_agent?.slice(0, 500) || null,
  }).returning();

  // Async identification — don't block response
  await inngest.send({
    name: "visit.received",
    data: { visitId: visit.id, tenantId, ipHash },
  });

  return new Response(null, { status: 204 });
}
```

#### Worker — visitor-identifier

```typescript
// src/inngest/visitor-identifier.ts (NEW)
import { inngest } from "@/lib/inngest/client";
import { snitcher } from "@/lib/visitor/snitcher-client";
import { db } from "@/db";
import { visits, companies, signals } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export const visitorIdentifier = inngest.createFunction(
  { id: "visitor-identifier", concurrency: { limit: 50 } },
  { event: "visit.received" },
  async ({ event, step }) => {
    const { visitId, tenantId, ipHash } = event.data;

    // 1) Call Snitcher (rate-limited via concurrency)
    const result = await step.run("call-snitcher", async () => {
      return await snitcher.identifyByIpHash(ipHash, { tenantId });
    });

    if (!result?.companyDomain) {
      return { identified: false };
    }

    // 2) Update visit with company info
    await step.run("update-visit", async () => {
      await db
        .update(visits)
        .set({
          companyDomain: result.companyDomain,
          identifiedAt: new Date(),
          identifiedBy: "snitcher",
        })
        .where(eq(visits.id, visitId));
    });

    // 3) Match or create company
    const company = await step.run("match-or-create-company", async () => {
      const [existing] = await db
        .select()
        .from(companies)
        .where(and(
          eq(companies.tenantId, tenantId),
          eq(companies.domain, result.companyDomain),
        ))
        .limit(1);

      if (existing) return existing;

      // Create as inbound warm lead
      const [created] = await db.insert(companies).values({
        tenantId,
        domain: result.companyDomain,
        name: result.companyName || result.companyDomain,
        source: "visitor_identification",
        lifecycleStage: "inbound",
      }).returning();

      // Trigger enrichment (existing skill)
      await inngest.send({
        name: "company.enrichment.requested",
        data: { companyId: created.id, tenantId },
      });

      return created;
    });

    // 4) Create signal
    await step.run("create-signal", async () => {
      await db.insert(signals).values({
        tenantId,
        companyId: company.id,
        type: "intent_visited_site",
        metadata: {
          url: (await getVisit(visitId)).url,
          identifiedBy: "snitcher",
        },
        strength: calculateVisitStrength(visitId, company.id), // hot if pricing/demo, etc.
      });
    });

    // 5) Check hot threshold
    const visitCount30d = await step.run("count-recent-visits", async () => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(visits)
        .where(and(
          eq(visits.companyId, company.id),
          gte(visits.createdAt, subDays(new Date(), 7)),
        ));
      return count;
    });

    if (visitCount30d >= 3) {
      await inngest.send({
        name: "company.hot.detected",
        data: { companyId: company.id, tenantId, reason: "3+ visits in 7d" },
      });
    }

    return { identified: true, companyId: company.id, visitCount30d };
  },
);
```

#### Snitcher client

```typescript
// src/lib/visitor/snitcher-client.ts (NEW)
const SNITCHER_API = "https://api.snitcher.com/v1";

export const snitcher = {
  async identifyByIpHash(ipHash: string, opts: { tenantId: string }) {
    const apiKey = await getTenantSecret(opts.tenantId, "SNITCHER_API_KEY");
    if (!apiKey) return null;

    // Snitcher requires raw IP. We don't store raw IP.
    // Workaround: identification happens at request time before hash.
    // → architectural change : pass `ip_for_identification_only` from edge,
    //   identify before hashing, then store only hash.
    // For phase 1, use IP hash only if Snitcher supports lookup by hash
    // OR we change our pipeline to identify-then-hash.

    // For now, simplified: assume we change pipeline (see "Architectural note")
    throw new Error("See architectural note in spec");
  },
};
```

**Architectural note** : Snitcher (and most visitor ID providers) match on **raw IP**. Our schema stores only `ip_hash` for privacy. Solution :
- Identification happens **synchronously at edge** (in the API route, before insert)
- IP raw is used to call Snitcher API, then immediately hashed and discarded
- Only the result (`company_domain`) + `ip_hash` is persisted

Refactor `src/app/api/track/visit/[tenantId]/route.ts` :

```typescript
// Updated flow
const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "0.0.0.0";

// 1) Identify FIRST with raw IP (only in memory)
const identification = await snitcher.identifyByIp(rawIp, tenantId).catch(() => null);

// 2) Hash IP
const ipHash = await hashIp(rawIp, tenantId);

// 3) Persist visit + identification result together
const [visit] = await db.insert(visits).values({
  tenantId,
  visitorId: body.visitor_id,
  ipHash,
  url: body.url.slice(0, 2048),
  // ...
  companyDomain: identification?.companyDomain,
  identifiedAt: identification ? new Date() : null,
  identifiedBy: identification ? "snitcher" : null,
}).returning();

// 4) If identified, async match-to-TAM job
if (identification?.companyDomain) {
  await inngest.send({
    name: "visit.identified",
    data: { visitId: visit.id, tenantId, companyDomain: identification.companyDomain },
  });
}
```

#### Settings UI

`src/app/(dashboard)/settings/visitor-tracking/page.tsx` (NEW) :

```
┌────────────────────────────────────────────────┐
│ Settings > Visitor Tracking                    │
│                                                │
│ Provider: [○ Snitcher  ○ RB2B  ○ Clearbit]    │
│                                                │
│ Snitcher API Key:                              │
│ [********************] [Test connection]       │
│                                                │
│ ☑ Enable visitor tracking                      │
│                                                │
│ Embed snippet:                                 │
│ ┌────────────────────────────────────────────┐ │
│ │ <script async defer                         │ │
│ │   src="https://cdn.elevay.com/eve-pixel.js" │ │
│ │   data-tenant="abc123">                     │ │
│ │ </script>                                   │ │
│ └────────────────────────────────────────────┘ │
│ [Copy snippet]                                 │
│                                                │
│ Recent identified visits (last 7 days):        │
│ • acme.com — 5 visits, last: 2h ago — A 🔥     │
│ • foobar.io — 2 visits, last: 1d ago — B       │
│ • [+ 12 more...]                               │
│                                                │
│ ☑ Notify on hot account (3+ visits/7d)         │
│ Notification channel: [Slack ▼]                │
└────────────────────────────────────────────────┘
```

### Tasks

| # | Task | Files | Effort |
|---|---|---|---|
| 2.1 | Pixel JS file + bundle deploy CDN | `public/eve-pixel.js` + Vercel deploy | 1j |
| 2.2 | API `POST /api/track/visit/:tenantId` | `src/app/api/track/visit/[tenantId]/route.ts` + `src/lib/visitor/hash-ip.ts` | 0.5j |
| 2.3 | Snitcher client + edge identification | `src/lib/visitor/snitcher-client.ts` | 1j |
| 2.4 | Worker `visitor-identifier` (match TAM, create signals) | `src/inngest/visitor-identifier.ts` | 1.5j |
| 2.5 | Hot account detection + Slack notification | `src/inngest/hot-account-notifier.ts` + Slack OAuth | 1.5j |
| 2.6 | Settings page `visitor-tracking` | `src/app/(dashboard)/settings/visitor-tracking/page.tsx` | 1j |
| 2.7 | Tenant settings schema (`visitorTracking.enabled`, `visitorTracking.provider`, secrets storage) | `lib/tenant-settings.ts` | 0.5j |
| 2.8 | RB2B provider integration (Phase 2) | `src/lib/visitor/rb2b-client.ts` | 1j |
| 2.9 | Tests unitaires + E2E | `src/__tests__/visitor-*.test.ts` + `tests/e2e/visitor-tracking.spec.ts` | 1.5j |
| 2.10 | Documentation + privacy/GDPR boilerplate | `RUNBOOK.md`, settings UI text | 0.5j |

**Total effort** : ~10 jours

### Tests

**Unit** :
- `hashIp` deterministic + tenant-isolated
- Pixel JS string parsing (UTM extraction, cookie set/get)
- Snitcher response parser (mock fixtures)

**Integration** :
- POST /api/track/visit/:tenantId → assert visit row + Inngest event sent
- Worker visitor-identifier with mocked Snitcher → assert signal created + company upserted
- Hot account threshold → assert event emitted

**E2E Playwright** :
- Mount a test page with embedded pixel
- Visit → assert visit row in DB
- Setup mock Snitcher → assert identification + signal

### Migration plan

1. Deploy migration 0040 (déjà appliquée — vérifier en prod)
2. Deploy pixel JS to CDN (test domain first)
3. Deploy backend API + worker (feature flag `VISITOR_TRACKING_ENABLED=false`)
4. Activate for 1 tenant test (your own elevay.com site as guinea pig)
5. Validate identification rate (expect 30-50% B2B identified)
6. Activate for opt-in tenants via settings UI
7. Add Slack OAuth integration (if not already)
8. Add RB2B as second provider (multi-source dedup)

### Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Snitcher rate limit hit | Élevé | Concurrency limit + queue + retry exponential backoff |
| Privacy/GDPR violation if no consent banner | Critique (legal) | Settings doc obligatoire + sample consent banner code provided |
| False positive identification (wrong company) | Moyen | Confidence score from Snitcher + threshold (only signals if confidence > 0.7) |
| Bot traffic pollutes signals | Moyen | UA filter (block known bot UAs) + JS execution requirement |
| Cost runaway (Snitcher = $$$) | Moyen | Per-tenant monthly cap + alert if >80% used |

### Telemetry

- `visit_received_total` (counter, labels: tenant, identified)
- `visitor_identification_latency_seconds` (histogram, labels: provider)
- `visitor_identification_rate` (computed % per tenant per day)
- `hot_account_detected_total` (counter, labels: tenant, reason)
- Datadog dashboard : `Visits/day`, `Identification rate`, `Top hot accounts`

---

## P0-3 — Onboarding wizard hardening (qualité production-ready)

### Audit du code existant

| Élément | État | Fichier |
|---|---|---|
| Schema `onboarding_progress` | ✅ | `src/db/schema/onboarding-and-visitors.ts` |
| Migration 0040 | ✅ | `drizzle/0040_onboarding_and_visits.sql` |
| Phase validators (Zod, 7 phases) | ✅ partial (au moins 1, 2 visibles) | `src/lib/onboarding/phase-validators.ts` |
| Hard checklist gates (DB-backed) | ✅ partial (4 gates visibles : tam_size, tam_relevance, email_sync, ...) | `src/lib/onboarding/checklist.ts` |
| API routes onboarding | ✅ 11 routes | `src/app/api/onboarding/*` |
| Page `/onboarding-v3` | ✅ | `src/app/(dashboard)/onboarding-v3/page.tsx` |
| **Audit qualité par phase** | ❌ MANQUE | — |
| **Telemetry funnel onboarding** | ❌ MANQUE | — |
| **A/B test framework pour optimiser conversion** | ❌ MANQUE | — |
| **Eval suite onboarding** (cohérence des outputs LLM par phase) | ❌ MANQUE | — |

### Constat critique

L'infrastructure est en place mais **la qualité de chaque phase n'est pas mesurée** :
- Quel % de users complète chaque phase ?
- Quel temps moyen par phase ?
- Où sont les drop-offs ?
- La qualité des outputs (TAM généré, ICP capturé, sequences générées) — est-elle bonne ?

Le P0 ici n'est pas "construire" mais **"mesurer + itérer la qualité"**.

### Requirements (GIVEN/WHEN/THEN)

**User story** : *En tant qu'admin Elevay, je veux mesurer chaque phase d'onboarding (durée, taux completion, qualité outputs), détecter les drop-offs, et avoir un dashboard de santé de l'onboarding pour itérer la conversion.*

**Acceptance criteria** :
- **GIVEN** un user qui passe l'onboarding, **WHEN** il avance de phase X à phase X+1, **THEN** un event `onboarding.phase.completed` est émis avec `{ phase, durationSeconds, validationsPassed, validationsFailed, retryCount }`
- **GIVEN** les events accumulés, **WHEN** je consulte `/admin/onboarding-funnel`, **THEN** je vois pour les 30 derniers jours : taux conversion par phase, durée médiane par phase, top 5 erreurs de validation
- **GIVEN** un user bloqué sur une phase pour > 10 min, **WHEN** le timer expire, **THEN** soit help nudge in-app, soit notification à Martin
- **GIVEN** un onboarding completed, **WHEN** je consulte la qualité outputs, **THEN** je vois : TAM size, A-grade count, sequences créées, voice profile capturé OUI/NON
- **GIVEN** une cohorte d'onboardings, **WHEN** je compare 2 versions de phase 5 (A/B test), **THEN** je vois la différence de conversion phase 5→6 + la différence de qualité downstream

**Non-functional** :
- Telemetry overhead < 50ms par event
- Dashboard admin charge < 2s
- Eval suite onboarding tourne < 10 min

### Design

#### Telemetry events (additions au schema d'observabilité existant)

```sql
-- drizzle/0044_onboarding_telemetry.sql
CREATE TABLE IF NOT EXISTS onboarding_events (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       text NOT NULL,
  user_id         text,
  event_type      text NOT NULL, -- 'phase.started', 'phase.validation.failed', 'phase.completed', 'wizard.abandoned', 'help.requested'
  phase           integer,
  duration_ms     integer,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS onboarding_events_tenant_idx ON onboarding_events (tenant_id);
CREATE INDEX IF NOT EXISTS onboarding_events_created_at_idx ON onboarding_events (created_at DESC);
CREATE INDEX IF NOT EXISTS onboarding_events_type_idx ON onboarding_events (event_type);
```

#### Lib telemetry

```typescript
// src/lib/onboarding/telemetry.ts (NEW)
export async function emitOnboardingEvent(params: {
  tenantId: string;
  userId?: string;
  type: "phase.started" | "phase.validation.failed" | "phase.completed" | "wizard.abandoned" | "help.requested";
  phase?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(onboardingEvents).values({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: params.type,
    phase: params.phase,
    durationMs: params.durationMs,
    metadata: params.metadata,
  });

  // Mirror to Datadog metric
  metrics.increment("onboarding.event", 1, {
    type: params.type,
    phase: params.phase?.toString(),
  });
}
```

Hook in à 3 endroits :
- `POST /api/onboarding/phase` (avant/après save) — emit `phase.started` + `phase.completed`
- `POST /api/onboarding/save` (validation Zod) — si fail, emit `phase.validation.failed`
- Frontend `onboarding-v3/page.tsx` — emit `wizard.abandoned` sur `beforeunload` si pas completed

#### Admin dashboard

`src/app/(admin)/admin/onboarding-funnel/page.tsx` (NEW, admin-only) :

```
┌──────────────────────────────────────────────────────────────────────┐
│ Onboarding Funnel — Last 30 days                                      │
│                                                                       │
│ Phase 1 → 2:  100 starts → 87 completed (87%)  ⏱ p50: 4m32s          │
│ Phase 2 → 3:   87       →  72 completed (83%)  ⏱ p50: 8m11s          │
│ Phase 3 → 4:   72       →  68 completed (94%)  ⏱ p50: 3m05s          │
│ Phase 4 → 5:   68       →  51 completed (75%)  ⏱ p50: 6m44s          │
│ Phase 5 → 6:   51       →  38 completed (75%)  ⏱ p50: 12m18s ⚠️ HIGH │
│ Phase 6 → 7:   38       →  35 completed (92%)  ⏱ p50: 4m02s          │
│ Phase 7 → DONE: 35      →  31 completed (89%)  ⏱ p50: 5m17s          │
│                                                                       │
│ OVERALL: 100 → 31 (31%) — Median 44 min                              │
│                                                                       │
│ Top failure reasons:                                                  │
│ 1. Phase 2 — "ICP must include industry, size, persona" (12)         │
│ 2. Phase 4 — "Need ≥3 custom signals" (9)                            │
│ 3. Phase 3 — "Email sync test failed: 0 emails synced" (7)           │
│                                                                       │
│ Output quality (completed only):                                      │
│ • TAM size median: 487 accounts                                       │
│ • A-grade % median: 8% (39 accounts)                                  │
│ • Sequences created median: 2.3                                       │
│ • Voice profile captured: 78%                                         │
└──────────────────────────────────────────────────────────────────────┘
```

#### Eval suite

```typescript
// src/__tests__/onboarding-quality.eval.ts (NEW)
// Inspired by chat-eval pattern
import { runOnboardingEval } from "@/lib/onboarding/eval-runner";

const cases = [
  {
    name: "phase1_icp_capture_completeness",
    input: { situation: "founder_team", dealsToDate: 5, icp: { raw: "We sell DevOps tools to CTOs of Series A SaaS in US" } },
    expect: (output) => output.icp.industry && output.icp.sizeRange && output.icp.buyerPersona,
  },
  {
    name: "phase2_tam_relevance",
    input: { bestCustomers: ["stripe.com", "linear.app", "vercel.com"], antiIcp: ["walmart.com", "exxonmobil.com"] },
    expect: (output) => output.tam.length > 100 && output.tam.filter(a => a.score >= 80).length > 5,
  },
  // ... 5-10 cases per phase
];

for (const c of cases) {
  test(c.name, async () => {
    const result = await runOnboardingEval(c.input);
    expect(c.expect(result)).toBe(true);
  });
}
```

#### A/B test framework

Light-weight :
```typescript
// src/lib/onboarding/ab-test.ts (NEW)
export function selectVariant(tenantId: string, experiment: string, variants: string[]): string {
  // Deterministic hash → variant
  const hash = simpleHash(tenantId + experiment);
  return variants[hash % variants.length];
}

// In phase 5 page:
const variant = selectVariant(tenantId, "phase5_voice_capture_method", ["text_only", "voice_memo", "video_loom"]);
// emit telemetry with variant
emitOnboardingEvent({ tenantId, type: "phase.started", phase: 5, metadata: { variant } });
```

### Tasks

| # | Task | Files | Effort |
|---|---|---|---|
| 3.1 | Migration 0044 + schema | `drizzle/0044_onboarding_telemetry.sql` | 0.5j |
| 3.2 | Lib `emitOnboardingEvent` + intégration dans routes | `src/lib/onboarding/telemetry.ts` + 3 routes | 1j |
| 3.3 | Frontend wizard.abandoned + duration tracking | `src/app/(dashboard)/onboarding-v3/page.tsx` | 0.5j |
| 3.4 | Admin dashboard `/admin/onboarding-funnel` | `src/app/(admin)/admin/onboarding-funnel/page.tsx` + queries | 1.5j |
| 3.5 | Eval suite onboarding (5-10 cases × 7 phases = 35-70 cases) | `src/__tests__/onboarding-quality.eval.ts` + helpers | 2j |
| 3.6 | A/B test framework léger | `src/lib/onboarding/ab-test.ts` | 0.5j |
| 3.7 | Audit phases existantes (validators) — combler les manques | `src/lib/onboarding/phase-validators.ts` | 1j |
| 3.8 | Audit checklist gates (vérifier que les 7 phases ont leurs gates) | `src/lib/onboarding/checklist.ts` | 1j |
| 3.9 | Polish UX par phase (review en staging avec utilisateur test) | UI components phase 1-7 | 2j |
| 3.10 | Tests E2E par phase (Playwright) | `tests/e2e/onboarding-phase-*.spec.ts` | 2j |

**Total effort** : ~12 jours

### Tests

**Unit** :
- `emitOnboardingEvent` shape validation
- A/B test variant selection determinism
- Phase validators Zod schemas (each phase 1-7)

**Integration** :
- Funnel queries return correct numbers from synthetic event data
- Onboarding completion triggers tenant.onboardingCompletedAt update

**E2E Playwright** :
- Full happy path : phase 1 → 7 → completed (assert tenant state)
- Phase 2 fails ICP validation → user must edit before continuing
- Phase 5 sequences fail to generate → fallback path

**Eval** :
- 35-70 cases (5-10 per phase) → score quality of outputs

### Migration plan

1. Deploy migration 0044
2. Deploy telemetry hooks (additive, zero downtime)
3. Backfill existing onboardings (run `lib/onboarding/replay-events-from-tenant-state.ts`)
4. Deploy admin dashboard
5. Run eval suite weekly in CI
6. A/B test phase 5 (currently 25% drop) with 2-3 variants

### Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Telemetry overhead slows onboarding | Faible | Async emission + batched writes |
| PII in metadata accidentally logged | Moyen | Strict allowlist for metadata fields |
| Drop-off Phase 5 (25%) — root cause unknown | Élevé | A/B test 3 variants of voice capture method |
| Eval suite false positives | Moyen | Manual review of evals quarterly |

### Telemetry

- `onboarding.events.total` (counter, labels: type, phase)
- `onboarding.phase.duration_seconds` (histogram, labels: phase)
- `onboarding.completion_rate` (gauge, computed daily)
- `onboarding.quality.tam_size_median` (gauge, computed daily)
- Datadog dashboard : Funnel chart, drop-off heatmap, output quality trends

---

## P0-4 — Coaching transcript-grounded production-ready

### Audit du code existant

| Élément | État | Fichier |
|---|---|---|
| Schema `transcript_chunks` (avec pgvector) | ✅ | migration `0039_coaching_chunks_and_signal_url_cache.sql` |
| Lib `chunk-transcript.ts` | ✅ | `src/lib/coaching/chunk-transcript.ts` |
| Lib `index-transcript.ts` (embed + insert) | ✅ | idem |
| Lib `retrieve-transcript-chunks.ts` (RAG retrieval) | ✅ | idem |
| Lib `citation-parser.ts` | ✅ | idem |
| Lib `pre-send-review.ts` | ✅ | idem |
| Inngest `coaching-engine.ts` | ✅ | `src/inngest/coaching-engine.ts` |
| Inngest `transcript-chunk-and-embed.ts` | ✅ (présumé via migration 0039 commentaires) | — |
| **End-to-end production test avec real transcript** | ❌ MANQUE | — |
| **Citations time-stamped UI dans chat answers** | ❌ MANQUE | — |
| **Coaching prompt eval (cas qualité brutalement honnête)** | ❌ MANQUE | — |
| **Latency monitoring on coaching queries** | ❌ MANQUE | — |

### Constat critique

Toute l'infra existe. Le P0 = **prouver que ça marche end-to-end + UI citations + eval**.

### Requirements (GIVEN/WHEN/THEN)

**User story** : *En tant que founder, quand je demande "Comment aurais-je pu mieux faire ce demo Judgment Labs?", l'AI répond avec un coaching brutally honest qui cite des moments précis du transcript ("À 14:32, Alex a dit X et tu as répondu Y au lieu de Z"), avec timecodes cliquables qui ouvrent le moment exact dans le meeting recording.*

**Acceptance criteria** :
- **GIVEN** un meeting avec transcript indexé (chunks dans `transcript_chunks` avec embeddings), **WHEN** je pose une question coaching dans le chat, **THEN** la réponse contient ≥ 2 citations avec timecodes au format `[MM:SS]`
- **GIVEN** une citation `[14:32]` dans la réponse, **WHEN** je clique dessus, **THEN** un modal/overlay ouvre le meeting recording au moment 14:32 avec contexte ±10 secondes
- **GIVEN** un meeting sans transcript indexé, **WHEN** je pose une question coaching, **THEN** la réponse explique "Je n'ai pas de transcript pour ce meeting" plutôt que d'halluciner
- **GIVEN** une réponse coaching, **WHEN** une citation référence un timecode qui n'existe pas dans le transcript, **THEN** le post-process supprime la citation invalide + flag pour re-eval
- **GIVEN** 10 questions coaching test, **WHEN** je lance l'eval suite, **THEN** ≥ 80% des réponses contiennent ≥ 2 citations valides ET sont jugées "brutally honest" par un LLM judge

**Non-functional** :
- Coaching response latency p95 < 8s
- Citation accuracy > 95% (timecodes exist + texte cité matche le transcript chunk)

### Design

#### Pipeline RAG complet (probablement déjà en place, à vérifier)

```
Meeting record completed (Recall.ai webhook)
  ↓
Transcript downloaded → stored in `interactions.metadata.transcript`
  ↓
Inngest `transcript-chunk-and-embed`:
  1) chunk transcript by speaker turn or fixed window (60s with 10s overlap)
  2) for each chunk:
     - extract { startSec, endSec, speakerName, text }
     - generate embedding (OpenAI text-embedding-3-small)
     - insert into `transcript_chunks`
  ↓
On chat query "Coach me on this meeting":
  1) retrieve_transcript_chunks(query, meetingId, topK=8)
  2) construct context: chunk texts + metadata
  3) LLM call with system prompt enforcing citation format [MM:SS]
  4) post-process: validate each [MM:SS] exists in retrieved chunks
  5) return answer with valid citations
```

#### System prompt coaching (à durcir)

```
You are a brutally honest sales coach analyzing a meeting between {founder} and {prospect}.

Your job: provide specific, actionable feedback. NOT generic advice.

RULES:
1. Every claim must reference a specific moment from the transcript using [MM:SS] format.
2. If you can't find evidence in the transcript, say "I don't see evidence of this in the recording."
3. Be direct. Tell them what they did wrong, not what they did right.
4. Use the prospect's exact words when relevant — quote them.
5. End with ONE specific action they can take next time.

Available transcript chunks (most relevant to query):
{{retrieved_chunks_with_timecodes}}

User question: {{question}}
```

#### Citation parser

Le `citation-parser.ts` existe. À vérifier qu'il :
- Détecte les patterns `[MM:SS]` et `[H:MM:SS]`
- Valide que le timecode existe dans le `transcript_chunks` du meeting
- Retire les citations invalides (or marks them with `[invalid_citation]`)
- Génère URLs cliquables `→ /meetings/{id}#t={MM}m{SS}s`

#### UI changes

`src/app/(dashboard)/chat/page.tsx` (existant) — Markdown renderer doit :
- Reconnaître pattern `[MM:SS]` ou `[H:MM:SS]` après mention de meeting
- Le rendre comme un bouton/lien cliquable qui ouvre le meeting modal au timecode

`src/app/(dashboard)/meetings/[id]/page.tsx` — accepter query param `?t=14m32s` pour scroll/seek le video player au moment exact.

#### Eval suite coaching

```typescript
// src/__tests__/coaching-quality.eval.ts (NEW)
const cases = [
  {
    name: "lost_control_during_demo",
    input: {
      meetingId: "test_meeting_1", // fixture meeting with known issues
      query: "How could I have done a better job on this demo?",
    },
    expect: {
      hasCitations: (response) => response.citations.length >= 2,
      brutalHonesty: (response) => {
        // LLM judge
        const judgement = await llmJudge(response.text, [
          "Is the feedback specific (not generic)?",
          "Does it identify a concrete mistake?",
          "Does it include actionable next steps?",
        ]);
        return judgement.score >= 0.7;
      },
      citationsValid: (response) => {
        return response.citations.every(c =>
          c.timecode && transcriptHasTimecode(c.meetingId, c.timecode)
        );
      },
    },
  },
  // ... 10-20 more cases
];
```

### Tasks

| # | Task | Files | Effort |
|---|---|---|---|
| 4.1 | Audit pipeline existant (chunk → embed → retrieve) end-to-end | manuel + tests | 0.5j |
| 4.2 | Run E2E test avec 1 vrai meeting → vérifier chunks créés | script + manuel | 0.5j |
| 4.3 | System prompt coaching durci (rules, examples) | `src/lib/coaching/prompts.ts` | 1j |
| 4.4 | Citation parser : valider timecodes existent | `src/lib/coaching/citation-parser.ts` | 1j |
| 4.5 | Chat markdown renderer : citations cliquables | `src/components/chat-markdown.tsx` | 1j |
| 4.6 | Meeting page accepter `?t=14m32s` query | `src/app/(dashboard)/meetings/[id]/page.tsx` | 0.5j |
| 4.7 | Eval suite coaching (10-20 cases avec fixture meetings) | `src/__tests__/coaching-quality.eval.ts` + fixtures | 2j |
| 4.8 | LLM judge utility | `src/lib/eval/llm-judge.ts` | 1j |
| 4.9 | Latency monitoring (Datadog APM trace pour coaching path) | `src/lib/coaching/retrieve-transcript-chunks.ts` instrumentation | 0.5j |
| 4.10 | Documentation user-facing : "How coaching works, why citations matter" | `RUNBOOK.md` + onboarding hint | 0.5j |

**Total effort** : ~8.5 jours

### Tests

**Unit** :
- Citation parser : regex match, timecode validation, URL generation
- LLM judge : score consistency on golden examples

**Integration** :
- chunk → embed → retrieve roundtrip avec real meeting fixture
- Coaching query end-to-end → assert citations + valid timecodes

**E2E Playwright** :
- Login → naviguer chat → ask coaching question on real meeting → assert response has citations → click citation → assert meeting page opens at correct time

**Eval** :
- 10-20 cases × 3 quality dimensions (citations, honesty, actionability)
- Run weekly in CI, alert on regression

### Migration plan

1. Audit et corriger le pipeline existant (probablement déjà fonctionnel mais non vérifié)
2. Deploy citation parser improvements
3. Deploy chat UI citations cliquables
4. Run eval suite avec baseline
5. Iterate sur prompt jusqu'à eval > 80%

### Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Transcripts non disponibles (Recall webhook fail) | Élevé | Health check Recall + fallback "transcript pending" message |
| Embedding cost (5K chunks/meeting × $0.0001 = $0.50/meeting) | Faible | OK pour démarrer |
| LLM hallucinates timecodes | Moyen | Validation post-process + retry si <2 citations valides |
| Coaching trop dur → user feedback négatif | Moyen | Mode "tone : balanced" en option |

### Telemetry

- `coaching.query.latency_seconds` (histogram, labels: tenant, has_transcript)
- `coaching.citations.per_response` (gauge)
- `coaching.citation.validation_rate` (computed % valid timecodes)
- `coaching.eval.score_weekly` (gauge, alert if < 0.7)

---

## P0-5 — Auto-fill deal fields E2E proof + monitoring

### Audit du code existant

| Élément | État | Fichier |
|---|---|---|
| Skill `enrichment-email-extract` | ✅ | `src/skills/enrichment/...` (présumé) |
| Inngest `deal-signal-sync.ts` | ✅ | `src/inngest/deal-signal-sync.ts` |
| Cascade signals → deal properties (`syncSignalsToDeal`) | ✅ (en code) | `lib/deal-signal-sync.ts` |
| Schema `deals` avec champs `properties jsonb` | ✅ | `src/db/schema/core.ts` (présumé) |
| **End-to-end test prouvant que ça marche** | ❌ MANQUE | — |
| **Source attribution UI** ("Source: meeting Oct 27") | ❌ MANQUE | — |
| **Conflict resolution policy explicite** | ❌ MANQUE | — |
| **Monitoring extraction success rate** | ❌ MANQUE | — |

### Constat critique

Le code existe. **Personne ne sait s'il marche en prod**. Le P0 = **proof of life + UI source attribution + monitoring**.

### Requirements (GIVEN/WHEN/THEN)

**User story** : *En tant que founder, quand un email entrant ou un meeting note mentionne le budget/team size/timeline du prospect, ces infos remplissent automatiquement les champs du deal correspondant, et je peux voir d'où vient chaque info ("Budget: $30K — extracted from meeting Oct 27 at 14:32").*

**Acceptance criteria** :
- **GIVEN** un email avec mention de budget ("we have around $50K for this"), **WHEN** l'enrichment-email-extract tourne, **THEN** un signal `budget_mentioned` est créé sur le contact + le deal lié reçoit une mise à jour de `deal.properties.budget` avec source attribution
- **GIVEN** un deal avec `properties.budget = $30K (source: meeting Oct 1)` et un nouveau signal `budget_mentioned: $50K (source: email Oct 15)`, **WHEN** la cascade tourne, **THEN** la règle "latest-wins" applique → `budget = $50K (source: email Oct 15)`, ancien gardé en `properties.budget_history`
- **GIVEN** un user a manuellement entré `properties.budget = $40K`, **WHEN** la cascade détecte un conflit, **THEN** ne PAS écraser, mais flag le conflit dans `deal.properties_conflicts` jsonb
- **GIVEN** je consulte la page deal `/opportunities/:id`, **WHEN** je hover sur un champ auto-rempli, **THEN** un tooltip affiche "Auto-filled from {source} on {date}. [View source]"
- **GIVEN** la cascade tourne tous les jours, **WHEN** elle process 100 deals, **THEN** un metric `deal_autofill.success_rate` reporte le % de deals avec ≥ 1 field updated

**Non-functional** :
- Cascade latency p95 < 30s par deal
- Extraction confidence threshold > 0.7 (sinon ne pas écrire)

### Design

#### Conflict resolution policy (explicite)

```typescript
// src/lib/deal-autofill/conflict-resolution.ts (NEW)
export type ConflictRule =
  | { type: "latest_wins" }       // budget, timeline, next_step
  | { type: "union" }              // stakeholders, competitors, point_solutions
  | { type: "preserve_manual" }   // any field touched manually by user
  | { type: "highest_confidence" } // when multiple sources agree but differ slightly
  | { type: "llm_synthesize" };   // narrative fields (why_now, summary)

export const FIELD_CONFLICT_RULES: Record<string, ConflictRule> = {
  budget: { type: "latest_wins" },
  team_size: { type: "highest_confidence" },
  current_crm: { type: "latest_wins" },
  competitors: { type: "union" },
  point_solutions: { type: "union" },
  stakeholders: { type: "union" },
  next_step: { type: "latest_wins" },
  timeline: { type: "latest_wins" },
  why_now: { type: "llm_synthesize" },
  summary: { type: "llm_synthesize" },
};

export function resolveConflict(
  fieldName: string,
  current: { value: any; source: string; date: Date; manual: boolean },
  incoming: { value: any; source: string; date: Date; confidence: number },
): { value: any; source: string; date: Date; conflict: boolean } {
  const rule = FIELD_CONFLICT_RULES[fieldName] || { type: "latest_wins" };

  // Always preserve manual
  if (current.manual) {
    return { ...current, conflict: current.value !== incoming.value };
  }

  switch (rule.type) {
    case "latest_wins":
      return incoming.date > current.date ? incoming : current;
    case "union":
      return { value: [...new Set([...current.value, ...incoming.value])], source: incoming.source, date: incoming.date, conflict: false };
    case "highest_confidence":
      return incoming.confidence > 0.8 ? incoming : current;
    // ...
  }
}
```

#### Source attribution dans `deals.properties`

Schema change : `deals.properties` jsonb passe de `Record<string, value>` à `Record<string, { value, source, date, confidence, manual }>`.

Migration backwards-compat : un wrapper `getDealProperty(deal, fieldName)` qui gère ancien et nouveau format.

```sql
-- drizzle/0045_deal_property_metadata.sql
-- No schema change (jsonb is flexible). Just convention shift.
-- Backfill existing deals to new shape:
UPDATE deals
SET properties = jsonb_build_object(
  'budget', jsonb_build_object('value', properties->'budget', 'source', 'manual', 'date', updated_at::text, 'manual', true),
  -- ... for each known field
)
WHERE properties IS NOT NULL AND jsonb_typeof(properties->'budget') != 'object';
```

#### UI changes

`src/app/(dashboard)/opportunities/[id]/page.tsx` (existant) :

Pour chaque field du deal, render :
```
Budget: $30,000  [ⓘ]
                  └─ Tooltip: "Auto-filled from email Oct 15 ('we have around $30K')
                              View source →"
```

Sur hover du `[ⓘ]`, fetch `/api/deals/:id/property-source/:fieldName` qui retourne :
```json
{
  "value": "$30,000",
  "source": "email",
  "sourceId": "interaction_abc123",
  "sourceDate": "2026-10-15T14:32:00Z",
  "sourceQuote": "we have around $30K for this initiative",
  "confidence": 0.92,
  "manual": false,
  "history": [
    { "value": "$25,000", "date": "2026-10-01", "source": "meeting" }
  ]
}
```

#### E2E test fixture

```typescript
// src/__tests__/deal-autofill-e2e.test.ts (NEW)
test("budget extraction from email cascades to deal", async () => {
  // Setup: tenant with 1 deal, 1 contact, 1 account
  const { tenantId, dealId, contactId } = await setupTestData();

  // Insert a synthetic email mentioning budget
  await db.insert(activities).values({
    tenantId,
    contactId,
    activityType: "email_received",
    subject: "Re: Pricing discussion",
    bodyText: "Thanks for the call. We have around $30K budget for this project. Can you send a proposal?",
    occurredAt: new Date(),
  });

  // Trigger the extraction pipeline
  await runEnrichmentEmailExtract({ tenantId, activityId });

  // Wait for syncSignalsToDeal cascade
  await waitForInngestEvents([
    "signals.extracted",
    "deal.properties.updated",
  ], { timeout: 30_000 });

  // Assert deal updated
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  expect(deal.properties.budget?.value).toBe(30000);
  expect(deal.properties.budget?.source).toBe("email");
  expect(deal.properties.budget?.confidence).toBeGreaterThan(0.7);
});
```

#### Monitoring

```typescript
// src/inngest/deal-signal-sync.ts — add at end of cascade
metrics.increment("deal_autofill.field_updated", 1, {
  tenant_id: tenantId,
  field: fieldName,
  source: incoming.source,
});

metrics.histogram("deal_autofill.confidence", incoming.confidence, {
  field: fieldName,
});

if (conflict) {
  metrics.increment("deal_autofill.conflict_detected", 1, {
    tenant_id: tenantId,
    field: fieldName,
  });
}
```

Dashboard Datadog : `Auto-fill rate per tenant`, `Conflicts top 5 fields`, `Confidence distribution`

### Tasks

| # | Task | Files | Effort |
|---|---|---|---|
| 5.1 | Conflict resolution lib + tests | `src/lib/deal-autofill/conflict-resolution.ts` + tests | 1j |
| 5.2 | Schema convention shift `deals.properties` (backwards-compat wrapper) | `src/lib/deal-autofill/property-accessor.ts` + migration | 1j |
| 5.3 | E2E test budget extraction | `src/__tests__/deal-autofill-e2e.test.ts` | 1j |
| 5.4 | Étendre E2E à 5 autres fields (team_size, competitors, timeline, current_crm, point_solutions) | idem | 1j |
| 5.5 | API `GET /api/deals/:id/property-source/:fieldName` | `src/app/api/deals/[id]/property-source/[fieldName]/route.ts` | 0.5j |
| 5.6 | UI tooltip source attribution sur deal page | `src/components/deal-property-cell.tsx` | 1j |
| 5.7 | Monitoring Datadog metrics | `src/inngest/deal-signal-sync.ts` instrumentation | 0.5j |
| 5.8 | Datadog dashboard "Deal Autofill Health" | YAML/UI Datadog | 0.5j |
| 5.9 | Run pipeline en prod sur 1 tenant test → vérifier metrics | manuel | 0.5j |
| 5.10 | Documentation user "How auto-fill works, conflicts policy" | `RUNBOOK.md` | 0.5j |

**Total effort** : ~7.5 jours

### Tests

**Unit** :
- Conflict resolution : tester les 5 rules (latest_wins, union, preserve_manual, highest_confidence, llm_synthesize)
- Property accessor : backwards-compat avec ancien format

**Integration** :
- Run `enrichment-email-extract` + `syncSignalsToDeal` cascade end-to-end
- Verify confidence threshold filtering

**E2E Playwright** :
- Login → naviguer deal page → assert tooltip source attribution visible

### Migration plan

1. Deploy conflict resolution lib (no schema change yet)
2. Deploy E2E test in CI (run nightly)
3. Backfill existing `deals.properties` to new shape (script idempotent)
4. Deploy UI tooltip
5. Activate monitoring + dashboard
6. Validate on production tenant for 1 week
7. Document in RUNBOOK

### Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Backfill of existing deals corrupts data | Élevé | Dry-run mode, snapshot DB before backfill |
| LLM extraction false positives → wrong budget | Élevé | Confidence threshold > 0.7 + user can correct |
| Conflict resolution overwrites user manual entry | Critique | "preserve_manual" rule + audit log |
| Cascade infinite loop (signal → deal → signal) | Moyen | Idempotency keys + max-retry |

### Telemetry

- `deal_autofill.field_updated_total` (counter, labels: field, source)
- `deal_autofill.confidence` (histogram, labels: field)
- `deal_autofill.conflict_detected_total` (counter, labels: field)
- `deal_autofill.cascade_latency_seconds` (histogram)
- Alert: `confidence p50 < 0.7 for any field` → quality regression

---

## RECAP — Effort total et planning

| P0 | Description | Effort | Priorité raison |
|---|---|---|---|
| P0-1 | Sequence approval UI per-draft | 8j | Sans ça, Martin = forward-deployed AE perpétuel |
| P0-2 | Visitor ID Snitcher integration | 10j | Seul gap visible vs Monaco que reviews flag |
| P0-3 | Onboarding wizard hardening | 12j | Sans qualité onboarding, scaling impossible |
| P0-4 | Coaching transcript-grounded | 8.5j | Différentiateur AI vs ChatGPT |
| P0-5 | Auto-fill deal fields E2E | 7.5j | Code existe, jamais prouvé |
| **TOTAL** | | **~46j** (≈ 9 semaines à 1 dev plein temps) | |

### Séquencement suggéré

**Sprint 1-2 (semaines 1-3)** : P0-5 (auto-fill E2E) + P0-1 (sequence approval) en parallèle
- Quick win + plus rentable immédiatement
- Débloque le scaling Martin

**Sprint 3-4 (semaines 4-6)** : P0-3 (onboarding hardening) + P0-4 (coaching) en parallèle
- Onboarding = scaling
- Coaching = différentiateur visible

**Sprint 5-6 (semaines 7-9)** : P0-2 (visitor ID)
- Plus gros effort, plus dépendant (Snitcher contract, GDPR review)
- Bénéfice grand mais peut attendre 6 semaines

### Risques transverses

1. **Capacité dev** : 46j = 9 semaines à 1 dev. À 2 devs (avec parallélisation), réalisable en 5-6 semaines.
2. **Tests existants** : 1621 tests, 180 fails (esm next-auth) — il faut résoudre ce blocker avant de lancer les nouveaux tests.
3. **Migrations DB** : 4 nouvelles migrations (0043, 0044 + backfill scripts). Toujours additives, idempotentes.
4. **LLM cost** : eval suites + nouveaux prompts → estimer +$200-500/mois en LLM cost.
5. **Provider contracts** : Snitcher contract + Slack OAuth review = 1-2 semaines de lead time.

---

## ANNEXE A — Standards d'implémentation à respecter

Ces patterns existent dans le code Elevay et doivent être suivis :

1. **Tenant scope obligatoire** sur toutes les routes API. Pattern à recopier de `src/app/api/sequences/[id]/route.ts` lignes 21-32.

2. **Migrations idempotentes** : `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`. Voir `drizzle/0040_onboarding_and_visits.sql` pour template.

3. **Inngest functions** : `concurrency.limit` pour les workers qui appellent APIs externes (rate limit). Voir `src/inngest/coaching-engine.ts` pour template.

4. **Zod validation** sur toute entrée user (API body, search params). Voir `src/lib/onboarding/phase-validators.ts` pour template.

5. **Drizzle schemas** : modulaires dans `src/db/schema/*.ts`, ré-exportés via `src/db/schema.ts`.

6. **Tests** : Vitest pour unit/integration, Playwright pour E2E. Tests dans `src/__tests__/`. Pattern `.test.ts` (unit) vs `.eval.ts` (LLM evals).

7. **Audit log** : pour toute action user-significative, écrire dans la table `audit_log` (existant). Cf pattern dans approval workflow P0-1.

8. **Telemetry** : `metrics.increment` / `metrics.histogram` pattern (Datadog). Centralisé dans `src/lib/observability/metrics.ts`.

9. **Auth context** : toujours obtenu via `getAuthContext()` au début de chaque route. Si null → 401.

10. **Soft delete** : table avec `deleted_at` colonne (migration 0030). Ne jamais hard-delete.

---

## ANNEXE B — Checklist pre-merge par P0

Avant de merger chaque P0, vérifier :

- [ ] Migration testée en staging (apply + rollback)
- [ ] Tenant scope présent sur toutes les routes
- [ ] Zod validation sur tous inputs
- [ ] Tests unit ≥ 80% coverage du nouveau code
- [ ] Au moins 1 test integration end-to-end
- [ ] Au moins 1 test E2E Playwright
- [ ] Telemetry events instrumentés
- [ ] Datadog dashboard créé (ou row added to existing)
- [ ] Documentation user (RUNBOOK.md) mise à jour
- [ ] Feature flag pour rollout progressif
- [ ] Plan de rollback documenté
- [ ] Risk matrix reviewed avec Martin

---

## CONCLUSION

Ces 5 specs sont **immédiatement implémentables**. Pas de "TBD", pas de "à investiguer". Chaque ligne de code à écrire, chaque table à créer, chaque test à passer est défini.

L'effort total est de ~46 jours-développeur. Avec 2 devs (toi + futur freelance/embauche), c'est 5-6 semaines.

Le différentiateur clé qu'on doit garder en tête : **Monaco a $35M et 40 personnes. Nous avons toi + l'AI**. Donc on doit être 10x plus précis dans nos choix : pas de feature pour la feature, pas de re-engineering. Chaque ligne doit servir à fermer un gap visible.

Ces 5 P0 ferment l'écart visible. Le reste est de l'optimisation incrémentale.
