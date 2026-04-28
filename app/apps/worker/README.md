# @leadsens/worker

Background job processing service for Elevay's outbound email engine. Built on [BullMQ](https://docs.bullmq.io/) with Redis as the message broker.

## Workers

### send.worker.ts — Outbound Email Dispatch

Queue: `outbound:send`

Picks up queued outbound emails and delivers them via EmailEngine. Before sending, the worker:

1. Loads the email record from the database
2. Checks opt-out lists (skips if the recipient has unsubscribed)
3. Selects a mailbox via explicit assignment or the rotation engine
4. Enforces rate limits (per-mailbox daily cap, per-domain cap, send windows, bounce thresholds)
5. Injects a CAN-SPAM unsubscribe footer if not already present
6. Sends via EmailEngine's REST API
7. Updates the email record with `sent` status, message ID, and timestamp
8. Increments mailbox send counters
9. Advances sequence enrollment if the email belongs to a sequence

On failure, the email is marked `failed` with the error message. Auth errors automatically pause the mailbox.

- Concurrency: 8
- Rate limiter: max 20 jobs per 60 seconds
- Retry on no-mailbox: re-queued with 60s delay
- Retry on rate-limit: re-queued with 45s delay

### reply.worker.ts — Reply Classification

Queue: `outbound:reply`

Classifies inbound replies to outbound emails using Claude (claude-haiku-4-5) and takes automated action:

| Classification   | Action                                      |
|------------------|---------------------------------------------|
| `interested`     | Pause enrollment (mark replied)             |
| `not_interested` | Stop enrollment (mark replied)              |
| `ooo`            | Pause enrollment (will resume later)        |
| `unsubscribe`    | Add to opt-out list, stop enrollment        |
| `question`       | Pause enrollment (mark replied)             |

- Concurrency: 4
- Fallback classification: `question` (if LLM call fails)

### warmup.worker.ts — Mailbox Warmup

Queue: `outbound:warmup`

Sends warmup emails between mailboxes to build sender reputation before real outbound begins. Picks a random target mailbox and sends a natural-sounding email from a pool of subjects and bodies.

Graduation criteria: 21+ days of warmup AND daily target reaches 50 emails/day.

Ramp schedule (managed by `warmup-scheduler.ts`):
- Week 1: 5 emails/day
- Week 2: 10 emails/day
- Week 3: 20 emails/day
- Week 4+: 50 emails/day (graduation threshold)

- Concurrency: 2

### health.worker.ts — Mailbox Health Checks

Queue: `outbound:health`

Runs periodic health assessments on connected mailboxes. Computes a 0-100 health score based on:

| Factor                              | Penalty  |
|--------------------------------------|----------|
| Bounce count > 5 in 7 days          | -30      |
| Bounce count > 2 in 7 days          | -15      |
| Reply rate < 1% (after 50+ sends)   | -10      |
| EmailEngine connection not connected | -40      |

Actions:
- Auto-pauses mailboxes with health score below 20
- Resets `sent_today` counter at midnight (new day detection)

Scheduled: every 10 minutes via `healthQueue.upsertJobScheduler`.

- Concurrency: 2

## Running locally

```bash
pnpm --filter @leadsens/worker dev
```

Requires:
- Redis running at `REDIS_URL` (default: `redis://localhost:6379`)
- PostgreSQL at `DATABASE_URL`
- EmailEngine at `EMAILENGINE_URL` (default: `http://localhost:3100`)
- `ANTHROPIC_API_KEY` for reply classification

## Queue configuration

All queues use a shared Redis connection (`ioredis`). Queue names:

| Queue             | Purpose                     |
|-------------------|-----------------------------|
| `outbound:send`   | Outbound email dispatch     |
| `outbound:reply`  | Reply classification        |
| `outbound:warmup` | Mailbox warmup sends        |
| `outbound:health` | Mailbox health checks       |

Connection config: `maxRetriesPerRequest: null` (required by BullMQ for blocking commands).

## Retry behavior

- **send.worker**: No BullMQ-level retries. Re-queues manually with delay when mailbox is unavailable (60s) or rate-limited (45s). Failed sends are marked in the database.
- **reply.worker**: No retries. Classification failures fall back to `question`.
- **warmup.worker**: No retries. Failures are logged and skipped.
- **health.worker**: No retries. Failures are logged; next scheduled run will retry.

## Health checks

The health worker runs on a 10-minute interval via `healthQueue.upsertJobScheduler`. It checks every connected mailbox's:
- EmailEngine connection state
- Bounce rate over the last 7 days
- Reply rate (for mailboxes with 50+ sends)

Critically unhealthy mailboxes (score < 20) are auto-paused to protect sender reputation.

## Graceful shutdown

The service handles `SIGTERM` and `SIGINT` signals. On shutdown, all four workers are closed gracefully, allowing in-progress jobs to complete before the process exits.
