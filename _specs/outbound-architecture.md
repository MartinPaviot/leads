# Architecture Outbound — LeadSens
## Capacité cible : 100 tenants × 100K emails/mois = 10M emails/mois

---

## Vue d'ensemble

```
                        ┌─────────────────────────────┐
                        │         LEADSENS APP          │
                        │       (Next.js + API)         │
                        │                               │
                        │  Campaigns, Sequences, UI     │
                        │  Personalization (Claude)      │
                        │  Enrichment (Apollo.io)        │
                        └────────────┬──────────────────┘
                                     │ REST API
                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SENDING ORCHESTRATOR                          │
│                    (Node.js Worker Service)                        │
│                                                                    │
│  ┌────────────┐  ┌────────────────┐  ┌──────────────────────┐   │
│  │ Scheduler   │  │ Rate Limiter    │  │ Rotation Engine      │   │
│  │ (BullMQ)    │  │ (per-mailbox)   │  │ (round-robin +       │   │
│  │             │  │ (per-domain)    │  │  weighted by health)  │   │
│  │ Cron: */2m  │  │ (per-tenant)    │  │                      │   │
│  └──────┬─────┘  └───────┬────────┘  └──────────┬───────────┘   │
│         │                │                       │                │
│         ▼                ▼                       ▼                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    SENDING QUEUE                           │   │
│  │                  Redis + BullMQ                            │   │
│  │                                                            │   │
│  │  Queue: outbound:send     (emails à envoyer)              │   │
│  │  Queue: outbound:warmup   (emails de warm-up)             │   │
│  │  Queue: outbound:reply    (réponses à classifier)         │   │
│  │  Queue: outbound:health   (checks de santé)               │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│         ┌────────────────────┼────────────────────┐              │
│         ▼                    ▼                    ▼              │
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────┐      │
│  │ Send Worker  │  │ Reply Worker     │  │ Warmup Worker   │      │
│  │ (×4-8)       │  │ (×2)             │  │ (×2)            │      │
│  └──────┬──────┘  └───────┬─────────┘  └───────┬────────┘      │
│         │                  │                     │                │
└─────────┼──────────────────┼─────────────────────┼────────────────┘
          │                  │                     │
          ▼                  ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                       EMAILENGINE                                 │
│                  (Self-hosted Email API)                           │
│                                                                    │
│  • Gère 6 600+ mailboxes connectées (IMAP/SMTP/OAuth/Graph)     │
│  • REST API unifiée pour envoyer, lire, chercher                  │
│  • Webhooks pour chaque événement (new email, bounce, etc.)       │
│  • Connection pooling et reconnexion automatique                  │
│  • Refresh automatique des OAuth tokens                           │
│  • Pas de coût par mailbox — licence flat annuelle                │
│                                                                    │
│  POST /v1/account/{id}/submit   → envoyer un email               │
│  GET  /v1/account/{id}/messages → lire les réponses              │
│  Webhook: messageNew            → nouvelle réponse détectée       │
│  Webhook: messageBounce         → bounce détecté                  │
└──────────────────────────────────────────────────────────────────┘
          │                  │                     │
          ▼                  ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                   MAILBOXES DES CLIENTS                           │
│                                                                    │
│  Tenant A: martin@outreach-a1.com, sales@outreach-a2.com, ...   │
│  Tenant B: john@company-b.com, team@outreach-b1.com, ...        │
│  ...                                                               │
│  Tenant N: 66 mailboxes × N domaines                              │
│                                                                    │
│  Protocoles: Google OAuth, Microsoft Graph, SMTP/IMAP custom     │
│  Chaque mailbox: SPF + DKIM + DMARC configurés                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Composant 1 : EmailEngine (couche de connectivité)

### Pourquoi EmailEngine et pas build from scratch

| | Build from scratch | EmailEngine |
|---|---|---|
| Connecter 6 600 mailboxes IMAP/SMTP | 3-6 mois de dev | Out of the box |
| OAuth token refresh (Google, Microsoft) | Complex, edge cases | Automatique |
| Connection pooling | À implémenter | Inclus |
| Webhooks (new email, bounce) | À implémenter | Inclus |
| IMAP IDLE pour toutes les mailboxes | Très complexe à scale | Géré |
| Pricing | Dev time | Licence flat / an |

### Setup EmailEngine

```yaml
# docker-compose.yml (production)
services:
  emailengine:
    image: postalsys/emailengine:latest
    ports:
      - "3100:3000"    # API
      - "3101:3001"    # Admin UI
    environment:
      EENGINE_REDIS: redis://redis:6379/1
      EENGINE_SECRET: ${EMAILENGINE_SECRET}
    depends_on:
      - redis
    deploy:
      replicas: 2       # HA
      resources:
        limits:
          memory: 2G
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --maxmemory 4gb --maxmemory-policy allkeys-lru
```

### API EmailEngine utilisée

```typescript
// Connecter une mailbox (SMTP/IMAP)
POST /v1/account
{
  "account": "tenant-a_mailbox-1",
  "name": "Martin - Outreach 1",
  "imap": {
    "host": "imap.gmail.com",
    "port": 993,
    "secure": true,
    "auth": { "user": "martin@outreach-a1.com", "pass": "app-password" }
  },
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 465,
    "secure": true,
    "auth": { "user": "martin@outreach-a1.com", "pass": "app-password" }
  }
}

// Connecter une mailbox (Google OAuth)
POST /v1/account
{
  "account": "tenant-a_mailbox-1",
  "oauth2": {
    "provider": "gmail",
    "auth": {
      "user": "martin@company.com"
    },
    "accessToken": "ya29.xxx",
    "refreshToken": "1//xxx"
  }
}

// Envoyer un email
POST /v1/account/{accountId}/submit
{
  "from": { "name": "Martin", "address": "martin@outreach-a1.com" },
  "to": [{ "address": "sarah@meridianlabs.io" }],
  "subject": "Quick question about your API stack",
  "html": "<p>Hi Sarah, ...</p>",
  "messageId": "<custom-id@outreach-a1.com>",
  "headers": {
    "In-Reply-To": "<previous-msg-id>",    // pour follow-up
    "References": "<previous-msg-id>"       // thread
  }
}
// → Retourne: { messageId, response (SMTP response) }

// Webhook configuré: POST /api/webhooks/emailengine
// Events: messageNew, messageBounce, messageDeleted
```

---

## Composant 2 : Base de données

### Nouvelles tables

```sql
-- Mailboxes connectées par les tenants
CREATE TABLE connected_mailboxes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  
  -- Identité
  email_address   TEXT NOT NULL,
  display_name    TEXT,
  provider        TEXT NOT NULL,  -- gmail, outlook, smtp_custom
  
  -- EmailEngine
  ee_account_id   TEXT NOT NULL UNIQUE,  -- ID dans EmailEngine
  
  -- Domaine (pour rotation)
  domain          TEXT NOT NULL,  -- extrait de email_address
  
  -- Health
  status          TEXT NOT NULL DEFAULT 'warming_up',
    -- warming_up, active, paused, disabled, error
  daily_limit     INTEGER NOT NULL DEFAULT 50,
  sent_today      INTEGER NOT NULL DEFAULT 0,
  sent_total      INTEGER NOT NULL DEFAULT 0,
  bounce_count_7d INTEGER NOT NULL DEFAULT 0,
  reply_count_7d  INTEGER NOT NULL DEFAULT 0,
  health_score    INTEGER NOT NULL DEFAULT 100,  -- 0-100
  
  -- Warm-up
  warmup_started_at   TIMESTAMPTZ,
  warmup_daily_target INTEGER DEFAULT 5,   -- ramp: 5→10→20→30→50
  warmup_completed_at TIMESTAMPTZ,
  
  -- Config
  send_window_start   TEXT DEFAULT '08:00',  -- timezone du tenant
  send_window_end     TEXT DEFAULT '18:00',
  send_days           TEXT[] DEFAULT '{mon,tue,wed,thu,fri}',
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, email_address)
);

CREATE INDEX idx_mailbox_tenant ON connected_mailboxes(tenant_id);
CREATE INDEX idx_mailbox_status ON connected_mailboxes(status);
CREATE INDEX idx_mailbox_domain ON connected_mailboxes(domain);

-- Emails sortants (chaque email envoyé)
CREATE TABLE outbound_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  
  -- Relations
  campaign_id     UUID,                     -- future: campaigns table
  enrollment_id   UUID REFERENCES sequence_enrollments(id),
  contact_id      UUID REFERENCES contacts(id),
  mailbox_id      UUID REFERENCES connected_mailboxes(id),
  step_number     INTEGER,
  
  -- Contenu
  from_address    TEXT NOT NULL,
  to_address      TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  body_text       TEXT,
  
  -- Tracking IDs
  message_id      TEXT,          -- RFC 2822 Message-ID
  ee_message_id   TEXT,          -- EmailEngine internal ID
  thread_id       TEXT,          -- pour follow-ups dans le même thread
  in_reply_to     TEXT,          -- Message-ID du précédent
  
  -- Status machine
  status          TEXT NOT NULL DEFAULT 'draft',
    -- draft → queued → sending → sent → delivered
    --                                  → bounced
    --                          → failed (SMTP error)
    -- draft → skipped (user skip dans review)
  
  -- Événements
  queued_at       TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  
  -- Reply
  reply_classification TEXT,     -- interested, not_interested, ooo, unsubscribe, question
  reply_snippet        TEXT,     -- premiers 200 chars de la réponse
  
  -- Erreur
  error_message   TEXT,
  bounce_type     TEXT,          -- hard, soft
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outbound_tenant ON outbound_emails(tenant_id);
CREATE INDEX idx_outbound_status ON outbound_emails(status);
CREATE INDEX idx_outbound_mailbox ON outbound_emails(mailbox_id);
CREATE INDEX idx_outbound_contact ON outbound_emails(contact_id);
CREATE INDEX idx_outbound_thread ON outbound_emails(thread_id);
CREATE INDEX idx_outbound_enrollment ON outbound_emails(enrollment_id);
CREATE INDEX idx_outbound_sent ON outbound_emails(sent_at);

-- Warm-up emails (séparés des vrais envois)
CREATE TABLE warmup_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id      UUID REFERENCES connected_mailboxes(id),
  target_mailbox_id UUID REFERENCES connected_mailboxes(id),
  direction       TEXT NOT NULL,  -- sent, received
  message_id      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
    -- pending → sent → opened → replied
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Opt-outs globaux (CAN-SPAM compliance)
CREATE TABLE email_optouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  email_address   TEXT NOT NULL,
  reason          TEXT,           -- unsubscribe, bounce_hard, manual
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email_address)
);
```

---

## Composant 3 : Sending Orchestrator (Worker Service)

### Architecture des workers

```
Ce n'est PAS dans Next.js. C'est un service Node.js séparé.

leadsens/
├── app/apps/web/          ← Next.js (UI + API)
├── app/apps/worker/       ← Worker service (NEW)
│   ├── src/
│   │   ├── queues/
│   │   │   ├── send.queue.ts        ← Queue d'envoi
│   │   │   ├── reply.queue.ts       ← Queue de réponses
│   │   │   ├── warmup.queue.ts      ← Queue de warm-up
│   │   │   └── health.queue.ts      ← Queue de health checks
│   │   ├── workers/
│   │   │   ├── send.worker.ts       ← Process d'envoi
│   │   │   ├── reply.worker.ts      ← Classifier les réponses
│   │   │   ├── warmup.worker.ts     ← Envoyer/gérer warm-up
│   │   │   └── health.worker.ts     ← Vérifier santé mailboxes
│   │   ├── services/
│   │   │   ├── emailengine.ts       ← Client REST EmailEngine
│   │   │   ├── rotation.ts          ← Algorithme de rotation
│   │   │   ├── rate-limiter.ts      ← Rate limits par mailbox/domain/tenant
│   │   │   └── warmup-scheduler.ts  ← Ramping warm-up
│   │   └── index.ts                 ← Bootstrap workers
│   ├── package.json
│   └── tsconfig.json
```

### Send Worker

```typescript
// workers/send.worker.ts
import { Worker, Queue } from "bullmq";
import { EmailEngineClient } from "../services/emailengine";
import { RateLimiter } from "../services/rate-limiter";
import { RotationEngine } from "../services/rotation";
import { db } from "../db";

const sendQueue = new Queue("outbound:send", { connection: redis });

const sendWorker = new Worker("outbound:send", async (job) => {
  const { outboundEmailId } = job.data;
  
  // 1. Charger l'email
  const email = await db.outboundEmails.findById(outboundEmailId);
  if (!email || email.status !== "queued") return;
  
  // 2. Vérifier opt-out
  const optedOut = await db.emailOptouts.exists(email.tenantId, email.toAddress);
  if (optedOut) {
    await db.outboundEmails.update(outboundEmailId, { status: "skipped" });
    return;
  }
  
  // 3. Choisir la mailbox (rotation)
  const mailbox = email.mailboxId
    ? await db.connectedMailboxes.findById(email.mailboxId)
    : await RotationEngine.pickMailbox(email.tenantId);
  
  if (!mailbox || mailbox.status !== "active") {
    // Re-queue avec délai si aucune mailbox dispo
    await sendQueue.add("send", { outboundEmailId }, { delay: 60_000 });
    return;
  }
  
  // 4. Vérifier rate limits
  const canSend = await RateLimiter.check({
    mailboxId: mailbox.id,
    domain: mailbox.domain,
    tenantId: email.tenantId,
  });
  
  if (!canSend) {
    // Re-queue avec délai
    await sendQueue.add("send", { outboundEmailId }, { delay: 45_000 });
    return;
  }
  
  // 5. Envoyer via EmailEngine
  try {
    await db.outboundEmails.update(outboundEmailId, { status: "sending" });
    
    const result = await EmailEngineClient.send(mailbox.eeAccountId, {
      from: { name: mailbox.displayName, address: mailbox.emailAddress },
      to: [{ address: email.toAddress }],
      subject: email.subject,
      html: email.bodyHtml,
      text: email.bodyText,
      ...(email.inReplyTo && {
        headers: {
          "In-Reply-To": email.inReplyTo,
          "References": email.inReplyTo,
        }
      }),
    });
    
    // 6. Mettre à jour
    await db.outboundEmails.update(outboundEmailId, {
      status: "sent",
      sentAt: new Date(),
      messageId: result.messageId,
      eeMessageId: result.id,
      mailboxId: mailbox.id,
      fromAddress: mailbox.emailAddress,
    });
    
    // 7. Incrémenter compteur mailbox
    await RateLimiter.recordSend(mailbox.id);
    
    // 8. Update enrollment
    if (email.enrollmentId) {
      await db.sequenceEnrollments.advanceStep(email.enrollmentId);
    }
    
  } catch (err) {
    await db.outboundEmails.update(outboundEmailId, {
      status: "failed",
      failedAt: new Date(),
      errorMessage: err.message,
    });
    
    // Si SMTP error permanent → marquer mailbox
    if (isAuthError(err)) {
      await db.connectedMailboxes.update(mailbox.id, { status: "error" });
    }
  }
}, {
  connection: redis,
  concurrency: 8,          // 8 envois simultanés
  limiter: {
    max: 20,               // Max 20 jobs par 60s (global)
    duration: 60_000,
  },
});
```

### Rate Limiter

```typescript
// services/rate-limiter.ts
export class RateLimiter {
  
  // Vérifie toutes les limites avant envoi
  static async check(params: {
    mailboxId: string;
    domain: string;
    tenantId: string;
  }): Promise<boolean> {
    
    const now = new Date();
    const mailbox = await db.connectedMailboxes.findById(params.mailboxId);
    
    // Limite par mailbox (50/jour par défaut)
    if (mailbox.sentToday >= mailbox.dailyLimit) return false;
    
    // Fenêtre horaire
    const hour = now.getHours();
    const startHour = parseInt(mailbox.sendWindowStart);
    const endHour = parseInt(mailbox.sendWindowEnd);
    if (hour < startHour || hour >= endHour) return false;
    
    // Jour de la semaine
    const dayNames = ["sun","mon","tue","wed","thu","fri","sat"];
    const today = dayNames[now.getDay()];
    if (!mailbox.sendDays.includes(today)) return false;
    
    // Gap minimum entre envois (45s par mailbox)
    const lastSent = await redis.get(`ratelimit:lastsend:${params.mailboxId}`);
    if (lastSent && Date.now() - parseInt(lastSent) < 45_000) return false;
    
    // Limite par domaine (150/jour pour éviter de griller un domaine)
    const domainSent = await redis.get(`ratelimit:domain:${params.domain}:${today}`);
    if (domainSent && parseInt(domainSent) >= 150) return false;
    
    // Auto-stop si bounce rate > 10% sur 7 jours
    if (mailbox.bounceCount7d > 0 && mailbox.sentTotal > 0) {
      const bounceRate = mailbox.bounceCount7d / Math.min(mailbox.sentTotal, 100);
      if (bounceRate > 0.10) return false;
    }
    
    return true;
  }
  
  static async recordSend(mailboxId: string) {
    const mailbox = await db.connectedMailboxes.findById(mailboxId);
    await db.connectedMailboxes.update(mailboxId, {
      sentToday: mailbox.sentToday + 1,
      sentTotal: mailbox.sentTotal + 1,
    });
    await redis.set(`ratelimit:lastsend:${mailboxId}`, Date.now().toString());
    await redis.incr(`ratelimit:domain:${mailbox.domain}:${new Date().toISOString().split("T")[0]}`);
  }
}
```

### Rotation Engine

```typescript
// services/rotation.ts
export class RotationEngine {
  
  // Choisit la meilleure mailbox pour envoyer
  static async pickMailbox(tenantId: string): Promise<ConnectedMailbox | null> {
    
    // Mailboxes actives du tenant, pas au max, dans la fenêtre horaire
    const available = await db.connectedMailboxes.findMany({
      tenantId,
      status: "active",
    });
    
    const now = new Date();
    const eligible = available.filter(m => {
      // Pas au daily limit
      if (m.sentToday >= m.dailyLimit) return false;
      // Dans la fenêtre horaire
      const hour = now.getHours();
      if (hour < parseInt(m.sendWindowStart) || hour >= parseInt(m.sendWindowEnd)) return false;
      // Bon jour
      const dayNames = ["sun","mon","tue","wed","thu","fri","sat"];
      if (!m.sendDays.includes(dayNames[now.getDay()])) return false;
      return true;
    });
    
    if (eligible.length === 0) return null;
    
    // Weighted round-robin:
    // - Priorité aux mailboxes avec le moins d'envois aujourd'hui
    // - Pondéré par health score
    // - Diversité de domaines (éviter d'envoyer 10 emails du même domaine d'affilée)
    eligible.sort((a, b) => {
      const scoreA = (a.dailyLimit - a.sentToday) * (a.healthScore / 100);
      const scoreB = (b.dailyLimit - b.sentToday) * (b.healthScore / 100);
      return scoreB - scoreA;
    });
    
    // Ajouter un peu de randomisation pour diversifier les domaines
    const top3 = eligible.slice(0, Math.min(3, eligible.length));
    return top3[Math.floor(Math.random() * top3.length)];
  }
}
```

---

## Composant 4 : Reply Detection

### Webhook EmailEngine → LeadSens

```typescript
// app/apps/web/src/app/api/webhooks/emailengine/route.ts
export async function POST(req: Request) {
  const event = await req.json();
  
  switch (event.event) {
    case "messageNew": {
      // Nouveau message entrant sur une mailbox connectée
      const { account, from, to, subject, text, messageId, threadId } = event.data;
      
      // Chercher si c'est une réponse à un outbound email
      const outbound = await db.outboundEmails.findByThread(threadId);
      
      if (outbound) {
        // C'est une réponse à une séquence !
        await replyQueue.add("classify", {
          outboundEmailId: outbound.id,
          replyText: text,
          replyFrom: from,
          replyMessageId: messageId,
        });
      }
      
      // Toujours enregistrer comme activité
      await db.activities.create({
        tenantId: getTenantFromAccount(account),
        activityType: "email_received",
        direction: "inbound",
        summary: `Email from ${from}: ${subject}`,
        rawContent: text,
      });
      break;
    }
    
    case "messageBounce": {
      const { account, recipient, bounceType } = event.data;
      
      // Mettre à jour l'outbound email
      const outbound = await db.outboundEmails.findByRecipient(recipient);
      if (outbound) {
        await db.outboundEmails.update(outbound.id, {
          status: "bounced",
          bouncedAt: new Date(),
          bounceType,
        });
        
        // Hard bounce → opt-out le contact
        if (bounceType === "hard") {
          await db.emailOptouts.create({
            tenantId: outbound.tenantId,
            emailAddress: recipient,
            reason: "bounce_hard",
          });
        }
        
        // Stop l'enrollment
        if (outbound.enrollmentId) {
          await db.sequenceEnrollments.stop(outbound.enrollmentId, "bounced");
        }
        
        // Incrémenter bounce count mailbox
        await db.connectedMailboxes.incrementBounce(outbound.mailboxId);
      }
      break;
    }
  }
  
  return Response.json({ ok: true });
}
```

### Reply Classifier Worker

```typescript
// workers/reply.worker.ts
const replyWorker = new Worker("outbound:reply", async (job) => {
  const { outboundEmailId, replyText, replyFrom, replyMessageId } = job.data;
  
  const outbound = await db.outboundEmails.findById(outboundEmailId);
  if (!outbound) return;
  
  // Claude classifie la réponse
  const classification = await classifyReply(replyText);
  // → interested | not_interested | ooo | unsubscribe | question | bounce
  
  // Mettre à jour l'email
  await db.outboundEmails.update(outboundEmailId, {
    status: "replied",
    repliedAt: new Date(),
    replyClassification: classification,
    replySnippet: replyText.slice(0, 200),
    replyMessageId,
  });
  
  // Agir selon la classification
  const enrollment = outbound.enrollmentId
    ? await db.sequenceEnrollments.findById(outbound.enrollmentId)
    : null;
  
  switch (classification) {
    case "interested":
      if (enrollment) await db.sequenceEnrollments.pause(enrollment.id, "reply_positive");
      // TODO: notification au user, créer tâche de follow-up
      break;
      
    case "not_interested":
    case "unsubscribe":
      if (enrollment) await db.sequenceEnrollments.stop(enrollment.id, "reply_negative");
      if (classification === "unsubscribe") {
        await db.emailOptouts.create({
          tenantId: outbound.tenantId,
          emailAddress: replyFrom,
          reason: "unsubscribe",
        });
      }
      break;
      
    case "ooo":
      if (enrollment) {
        // Reschedule le prochain step dans 7 jours
        await db.sequenceEnrollments.reschedule(enrollment.id, 7);
      }
      break;
      
    case "question":
      if (enrollment) await db.sequenceEnrollments.pause(enrollment.id, "reply_question");
      // TODO: notification au user pour réponse manuelle
      break;
  }
}, { connection: redis, concurrency: 4 });
```

---

## Composant 5 : Warm-up Engine

### Stratégie

Le warm-up se fait ENTRE les mailboxes des tenants de la plateforme.
Pas besoin d'un réseau de 1M comptes — on utilise les mailboxes déjà connectées.

```
Tenant A mailbox-1  ←→  Tenant B mailbox-3
Tenant A mailbox-2  ←→  Tenant C mailbox-1
Tenant B mailbox-1  ←→  Tenant A mailbox-3

Chaque mailbox en warm-up:
  Semaine 1: 5 emails/jour (envoi + réception + ouverture)
  Semaine 2: 10 emails/jour
  Semaine 3: 20 emails/jour
  Semaine 4: 35 emails/jour
  → Graduation à "active" quand 50/jour atteint
```

```typescript
// workers/warmup.worker.ts (Inngest cron toutes les 30 min)

async function processWarmup() {
  // 1. Trouver toutes les mailboxes en warm-up
  const warmingUp = await db.connectedMailboxes.findMany({
    status: "warming_up",
  });
  
  for (const mailbox of warmingUp) {
    const daysSinceStart = daysBetween(mailbox.warmupStartedAt, new Date());
    
    // Calculer le target du jour (ramp linéaire)
    const dailyTarget = Math.min(50, 5 + Math.floor(daysSinceStart * 2));
    
    // Combien déjà envoyés aujourd'hui en warm-up ?
    const sentToday = await db.warmupEmails.countToday(mailbox.id);
    const remaining = dailyTarget - sentToday;
    
    if (remaining <= 0) continue;
    
    // Graduation check
    if (dailyTarget >= 50 && daysSinceStart >= 21) {
      await db.connectedMailboxes.update(mailbox.id, {
        status: "active",
        warmupCompletedAt: new Date(),
        dailyLimit: 50,
      });
      continue;
    }
    
    // Trouver une mailbox partenaire (d'un autre tenant)
    const partner = await findWarmupPartner(mailbox);
    if (!partner) continue;
    
    // Envoyer un email de warm-up
    const warmupContent = generateWarmupEmail(); // email réaliste aléatoire
    
    await EmailEngineClient.send(mailbox.eeAccountId, {
      to: [{ address: partner.emailAddress }],
      subject: warmupContent.subject,
      html: warmupContent.body,
    });
    
    // Le partenaire va recevoir → webhook messageNew
    // → on détecte que c'est un warm-up → on ouvre, on reply
  }
}
```

---

## Composant 6 : Sequence Executor (nouveau flow)

```typescript
// Cron BullMQ : toutes les 2 minutes
async function executeSequenceSteps() {
  // 1. Trouver les enrollments prêts
  const ready = await db.sequenceEnrollments.findReady();
  // WHERE status = 'active' AND next_step_at <= NOW()
  
  for (const enrollment of ready) {
    // 2. Charger le contexte
    const step = await db.sequenceSteps.findByNumber(
      enrollment.sequenceId,
      enrollment.currentStep
    );
    if (!step) {
      await db.sequenceEnrollments.complete(enrollment.id);
      continue;
    }
    
    const contact = await db.contacts.findById(enrollment.contactId);
    const company = contact.companyId
      ? await db.companies.findById(contact.companyId)
      : null;
    
    // 3. Vérifier opt-out avant de personnaliser
    if (await db.emailOptouts.exists(enrollment.tenantId, contact.email)) {
      await db.sequenceEnrollments.stop(enrollment.id, "opted_out");
      continue;
    }
    
    // 4. Trouver le thread si c'est un follow-up
    const previousEmail = enrollment.currentStep > 1
      ? await db.outboundEmails.findByEnrollmentStep(enrollment.id, enrollment.currentStep - 1)
      : null;
    
    // 5. Personnaliser avec Claude (depuis VRAIES données Apollo)
    const personalized = await personalizeEmail({
      template: { subject: step.subjectTemplate, body: step.bodyTemplate },
      contact,
      company,
      previousEmail,  // pour référencer le dernier échange
      stepNumber: enrollment.currentStep,
    });
    
    // 6. Créer l'outbound email
    const outboundEmail = await db.outboundEmails.create({
      tenantId: enrollment.tenantId,
      enrollmentId: enrollment.id,
      contactId: contact.id,
      stepNumber: enrollment.currentStep,
      toAddress: contact.email,
      subject: personalized.subject,
      bodyHtml: personalized.bodyHtml,
      bodyText: personalized.bodyText,
      threadId: previousEmail?.threadId,
      inReplyTo: previousEmail?.messageId,
      status: step.requiresReview ? "draft" : "queued",  // Review vs Autopilot
    });
    
    // 7. Si queued → ajouter à la queue d'envoi
    if (outboundEmail.status === "queued") {
      await sendQueue.add("send", {
        outboundEmailId: outboundEmail.id,
      }, {
        delay: randomDelay(30_000, 120_000), // 30s-2min delay aléatoire
      });
    }
  }
}
```

---

## Composant 7 : UI — Mailbox Management

### Page `/settings/mailboxes`

```
┌─────────────────────────────────────────────────────────┐
│ Connected Mailboxes                  [+ Connect Mailbox] │
│ 8 active · 2 warming up · 340 sent today                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ┌─ martin@outreach-a1.com ─────────────────────────────┐│
│ │ ● Active  │ Gmail  │ 42/50 today │ Health: 95  │ ▼  ││
│ └──────────────────────────────────────────────────────┘│
│ ┌─ sales@outreach-a2.com ──────────────────────────────┐│
│ │ ● Active  │ Gmail  │ 38/50 today │ Health: 88  │ ▼  ││
│ └──────────────────────────────────────────────────────┘│
│ ┌─ team@outreach-a3.com ──────────────────────────────┐│
│ │ ○ Warming  │ Gmail │ Day 12/21   │ 20/day ramp │ ▼  ││
│ └──────────────────────────────────────────────────────┘│
│                                                          │
│ Domain Health                                            │
│ ┌──────────────────────────────────────────────────────┐│
│ │ outreach-a1.com  │ SPF ✓ DKIM ✓ DMARC ✓ │ 3 mbox  ││
│ │ outreach-a2.com  │ SPF ✓ DKIM ✓ DMARC ✓ │ 3 mbox  ││
│ │ outreach-a3.com  │ SPF ✓ DKIM ✗ DMARC ✗ │ 2 mbox  ││
│ └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## Composant 8 : Review Queue UI

### Page `/sequences/[id]/review`

```
┌──────────────────────────────────────────────────────────┐
│ Review Queue — "Enterprise Outreach Q2"                   │
│ 23 emails pending · 12 approved today · 0 skipped        │
│                                                           │
│ [Approve All]  [Approve Next 10]                         │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ ┌─ To: sarah@meridianlabs.io ─── Step 1 of 3 ─────────┐ │
│ │ From: martin@outreach-a1.com (auto-selected)          │ │
│ │ Subject: Quick question about Meridian's API stack     │ │
│ │ ┌────────────────────────────────────────────────────┐ │ │
│ │ │ Hi Sarah,                                           │ │ │
│ │ │                                                     │ │ │
│ │ │ I noticed Meridian Labs just closed your Series A — │ │ │
│ │ │ congrats! As CTO, you're probably looking at        │ │ │
│ │ │ scaling your data pipeline...                       │ │ │
│ │ │                                                     │ │ │
│ │ │ [editable — contentEditable]                        │ │ │
│ │ └────────────────────────────────────────────────────┘ │ │
│ │                                                        │ │
│ │ Personalization context:                               │ │
│ │ • Apollo: Healthcare, 51-200, Series A ($12M)         │ │
│ │ • No prior interaction                                 │ │
│ │                                                        │ │
│ │ [✓ Approve & Queue]  [✏️ Edit & Approve]  [✗ Skip]    │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─ To: james@novatech.dev ─── Step 2 of 3 ────────────┐ │
│ │ (follow-up — in same thread as Step 1)                │ │
│ │ ...                                                    │ │
│ └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Stack technique résumé

| Composant | Techno | Rôle |
|-----------|--------|------|
| **EmailEngine** | Self-hosted (Docker) | Gère 6 600+ mailboxes IMAP/SMTP/OAuth |
| **Redis** | Managed (Upstash Pro ou self-hosted) | Queue BullMQ + rate limit counters |
| **BullMQ** | Node.js | 4 queues: send, reply, warmup, health |
| **Workers** | Node.js séparé | 8 send + 4 reply + 2 warmup + 1 health |
| **PostgreSQL** | Supabase | State: mailboxes, emails, enrollments, optouts |
| **Claude** | API | Personnalisation + classification réponses |
| **Apollo.io** | API | Données d'enrichissement réelles |
| **Next.js** | App existante | UI + API routes + webhooks |

---

## Limites de sécurité (hardcodées)

```
PER MAILBOX:
  max_daily:          50 emails/jour (configurable: 30-100)
  min_gap:            45 secondes entre envois
  max_bounces_7d:     auto-pause si > 10%
  warmup_duration:    minimum 14 jours

PER DOMAIN:
  max_daily:          150 emails/jour (3 mailboxes × 50)
  max_mailboxes:      5 par domaine

PER TENANT:
  max_mailboxes:      100
  max_daily:          5 000 emails/jour
  max_monthly:        100 000 emails/mois
  max_contacts:       unlimited
  
PLATFORM GLOBAL:
  max_concurrent_sends: 20
  webhook_timeout:      10s
  reply_classify_timeout: 30s
```

---

## Ordre d'implémentation

```
Phase 1 — Infra (1-2 jours)
  1. Docker compose: EmailEngine + Redis
  2. Tables DB: connected_mailboxes, outbound_emails, warmup_emails, email_optouts
  3. Worker service scaffold (app/apps/worker)
  4. EmailEngine client service

Phase 2 — Envoi (2-3 jours)
  5. Connect mailbox flow (UI + API + EmailEngine)
  6. Send worker + rate limiter + rotation engine
  7. Rewire sequence executor → outbound_emails → send queue
  8. Review queue UI

Phase 3 — Reply & Safety (1-2 jours)
  9. EmailEngine webhooks → reply detection
  10. Reply classifier worker
  11. Bounce handling + opt-out
  12. Health monitoring + auto-pause

Phase 4 — Warm-up (1-2 jours)
  13. Warmup scheduler + worker
  14. Warmup partner matching (inter-tenant)
  15. Graduation logic (warming_up → active)
  16. Warmup UI dans settings/mailboxes

Phase 5 — Analytics (1 jour)
  17. Real deliverability dashboard (from outbound_emails)
  18. Per-mailbox health dashboard
  19. Per-campaign analytics (sent, opened, replied, bounced)
```
