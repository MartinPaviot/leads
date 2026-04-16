# Phase 4 — Differentiation: Elevay vs. Lightfield

**Date**: 2026-04-15
**Applying rules**: none returned by hook

---

## The Positioning Gap

Lightfield = **assistant for AEs on a team**. An AE joins, the agent briefs them, coaches them, helps them draft. The human drives; the agent co-pilots.

Elevay = **autonomous GTM engine for founders who ARE the AE**. The agent doesn't help you sell — it sells for you, and you approve.

This isn't a philosophical difference. It changes every architectural decision.

---

## Angle 1: Multi-Source GTM Intelligence

### What Lightfield does
Lightfield's agent knows what happened inside the CRM: emails sent, meetings held, notes taken. Its context is **retroactive** — it tells you what already happened.

### What Elevay can do that Lightfield can't

Elevay already has infrastructure Lightfield doesn't:

| Signal Source | Elevay Status | Lightfield |
|--------------|---------------|------------|
| Apollo enrichment (firmographics, tech stack, funding) | DONE — `apollo-client.ts` | No |
| TAM building (build ICP-matched prospect lists) | DONE — `tam-builder` skill | No |
| Signal scanning (funding, hiring, tech adoption) | DONE — 5 signal skills | No |
| Champion tracking (job changes) | DONE — `champion-tracker` skill | No |
| Contact scoring (fit + engagement + momentum) | DONE — `contact-scoring.ts` | No |
| LLM email signal extraction (objections, budget, competitors) | DONE — `enrichment-email-extract` | Partial |
| Context graph (bi-temporal knowledge graph) | DONE — `context-graph.ts` | No |
| Battlecard generation | DONE — `battlecard-generator` skill | No |

### Concrete Feature: Proactive Deal Intelligence

**User story**: Without being asked, the agent alerts the founder when a deal's external context changes — the prospect just raised funding, hired a new VP Engineering, adopted a competitor's tool, or their champion changed jobs.

**Architecture**:

```
Existing: weeklySignalScan (Inngest cron - already runs)
  ↓
Enhancement: Link signal results to open deals
  ↓
New: signalToDealAlert (Inngest function)
  ├── For each detected signal:
  │   ├── Match signal.companyId to deals WHERE companyId = signal.companyId AND stage NOT IN ('won', 'lost')
  │   ├── If match found:
  │   │   ├── Generate impact assessment via LLM:
  │   │   │   "Acme Corp just raised $20M Series B. Your deal is at qualification stage.
  │   │   │    This is likely positive — they have budget now. Suggest: accelerate to demo,
  │   │   │    reference funding in next email, propose expanded scope."
  │   │   ├── Store as coachingInsight (type: "deal_signal")
  │   │   └── Push notification with suggested action
  │   └── If no deal match: store as TAM signal for prospecting
  └── Update deal brief with signal context
```

**Why this is hard to replicate**: Lightfield would need to build Apollo integration, signal detection, TAM scoring, and the deal-linkage pipeline from scratch. Elevay already has all the primitives — this feature is a ~50-line Inngest function that connects existing pipes.

---

## Angle 2: Autonomous Execution (Not Just Assistance)

### What Lightfield does
"Austin was sending follow-ups" — Austin decides, Austin sends. The agent provides context and drafts, but the human acts.

### What Elevay can do

Elevay already has an **action layer** that Lightfield doesn't:

| Action | Elevay Status | Lightfield |
|--------|---------------|------------|
| Send emails (via connected mailbox) | DONE — `sendEmail` tool + `email-send-worker` | Draft only |
| Enroll in sequences (multi-step campaigns) | DONE — `enrollInSequence` tool | No |
| Create deals/contacts/notes | DONE — full CRUD tools | Partial |
| Schedule meetings | DONE — `createMeeting` tool | No |
| Assign tasks | DONE — `assignTask` tool | No |
| Execute skills (enrichment, research) | DONE — `runSkill` tool | No |
| Undo actions | DONE — `undoLastAction` tool | No |

### Concrete Feature: Autonomous Deal Progression

**User story**: The founder says "autopilot my pipeline" and the agent handles the operational grunt work — sends follow-ups to unresponsive deals, updates deal stages based on outcomes, schedules re-engagement for stalled deals, creates tasks for deals that need human judgment.

**Architecture**:

```
src/inngest/autonomous-pipeline.ts

autoPipelineStep (cron: "0 9 * * 1-5" — weekdays 9am)
  ├── For each open deal:
  │   ├── Assess state:
  │   │   ├── Last activity date (stale if >3 days for active, >7 for proposal)
  │   │   ├── Pending promises (ours or theirs)
  │   │   ├── Deal stage vs activity pattern
  │   │   └── Enrichment signals (new funding, job change, etc.)
  │   │
  │   ├── Decision engine (LLM with structured output):
  │   │   ├── Input: deal context + enriched prospect context + signals
  │   │   ├── Output: { action, confidence, reasoning }
  │   │   ├── Actions:
  │   │   │   ├── SEND_FOLLOWUP — auto-draft + queue email
  │   │   │   ├── SCHEDULE_MEETING — propose meeting via email
  │   │   │   ├── UPDATE_STAGE — advance/regress based on signals
  │   │   │   ├── CREATE_TASK — needs human judgment (flag for founder)
  │   │   │   ├── RE_ENGAGE — run re-engage-stalled skill
  │   │   │   └── HOLD — nothing to do right now
  │   │   └── Confidence threshold: 0.7 for auto-execute, below → CREATE_TASK
  │   │
  │   ├── Execute action (if confidence >= threshold):
  │   │   ├── Draft email with enriched context (C3)
  │   │   ├── Run pre-send coaching review (C5)
  │   │   ├── Queue email via email-send-worker
  │   │   ├── Log activity + update deal
  │   │   └── Store agent trace for audit
  │   │
  │   └── Notify founder:
  │       ├── Actions taken: "Sent follow-up to 3 deals, re-engaged 1 stalled deal"
  │       ├── Decisions deferred: "2 deals need your input" (with context)
  │       └── Digest format in morning notification
  │
  └── Log to aePerformanceSnapshots (agent as AE)
```

**Approval modes** (tenant setting):

| Mode | Behavior |
|------|----------|
| `full_auto` | Agent executes all actions above confidence threshold |
| `approve_emails` | Agent queues emails for approval, executes everything else |
| `approve_all` | Agent proposes all actions, founder approves each |
| `suggest_only` | Agent suggests, never executes (Lightfield mode) |

**Why this is hard to replicate**: This isn't a prompt trick — it requires a battle-tested action layer (email sending with warmup, sequence management, deal CRUD, task creation) that Lightfield doesn't have. Their agent can query; Elevay's agent can act.

---

## Angle 3: SMB-First (The Founder IS the AE)

### What Lightfield assumes
A team with roles: AE, manager, SDR. The agent helps the AE ramp. The manager reviews.

### What Elevay assumes
One person doing everything. The agent isn't a co-pilot — it's the SDR, the AE, the ops person, and the analyst. The founder makes decisions; the agent does work.

### Concrete Feature: Zero-Config Deal Coaching (Self-Coaching)

**User story**: The solo founder doesn't have a manager to review their pipeline. The agent IS the manager — it proactively reviews every deal, flags issues, suggests improvements, and tracks the founder's selling patterns over time.

**Architecture**:

```
src/inngest/founder-coach.ts

dailyFounderBrief (cron: "0 8 * * 1-5" — weekdays 8am)
  ├── Generate deal briefs (C1) for all open deals
  ├── Score yesterday's outgoing emails (C5)
  ├── Detect pattern issues:
  │   ├── "You tend to skip qualification — 3 of your last 5 deals went straight to demo"
  │   ├── "Your follow-up timing is improving — avg dropped from 72h to 36h this week"
  │   ├── "You haven't addressed pricing objections in your last 2 proposals"
  │   └── "Deal velocity is slowing — consider narrowing your pipeline"
  ├── Generate today's priorities:
  │   ├── "3 follow-ups due" (auto-drafted if full_auto)
  │   ├── "1 meeting to prep for" (auto-prep generated)
  │   ├── "2 new signals detected" (funding, job changes)
  │   └── "1 deal needs decision: close or drop?"
  ├── Deliver as:
  │   ├── Chat message (pinned at top of conversation)
  │   ├── Email digest (if enabled)
  │   └── Notification
  └── Track coaching trends in aePerformanceSnapshots
```

**Key design decisions for solo founders**:

| Lightfield (team) | Elevay (solo) |
|-------------------|---------------|
| Manager dashboard separate from AE view | Single unified view — the founder sees everything |
| Coaching = manager → AE feedback | Coaching = agent → founder self-improvement |
| Skills defined by manager | Skills bootstrapped from best practices, refined by founder |
| "How's Austin doing?" | "How am I doing?" |
| Multi-AE performance comparison | Self-comparison over time |
| Delegation model (manager assigns) | Automation model (agent executes, founder approves) |

**Why this matters**: Lightfield's post literally says "We onboarded Austin as our first full-time AE" — they're building for companies that hire AEs. Elevay's founder-users don't have AEs. They need an agent that IS the AE, not one that helps the AE. This changes the coaching model fundamentally: instead of "help the new person learn the process," it's "tell ME what I'm doing wrong and fix it for me."

---

## Summary: Three Moats

| # | Angle | Lightfield Equivalent | Elevay Advantage | Effort to Build |
|---|-------|-----------------------|------------------|-----------------|
| 1 | Multi-source GTM intelligence | CRM-only context | Apollo + signals + graph already built | S (~50 lines to connect) |
| 2 | Autonomous execution | Assist + draft | Full action layer already built | M (pipeline orchestrator) |
| 3 | Solo founder coaching | Team coaching model | Architectural difference, not feature | S (daily brief function) |

The key insight: these aren't features to build from scratch. They're **wiring existing capabilities** into a coherent autonomous workflow. The primitives — Apollo enrichment, email sending, sequence management, signal scanning, context graph — already exist. The differentiation comes from **composing them into an autonomous loop** rather than presenting them as tools for a human to invoke.
