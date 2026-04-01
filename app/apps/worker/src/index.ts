import "dotenv/config";
import { createSendWorker } from "./workers/send.worker.js";
import { createReplyWorker } from "./workers/reply.worker.js";
import { createWarmupWorker } from "./workers/warmup.worker.js";
import { createHealthWorker } from "./workers/health.worker.js";
import { healthQueue, warmupQueue } from "./queues/index.js";

console.log("[worker] Starting LeadSens worker service...");

// Start all workers
const sendWorker = createSendWorker();
const replyWorker = createReplyWorker();
const warmupWorker = createWarmupWorker();
const healthWorker = createHealthWorker();

// Schedule recurring jobs
async function setupRecurring() {
  // Health checks every 10 minutes
  await healthQueue.upsertJobScheduler(
    "health-check-all",
    { every: 600_000 },
    {
      name: "health-check-all",
      data: { type: "check-all" },
    }
  );

  // Warmup scheduler every 30 minutes during business hours
  await warmupQueue.upsertJobScheduler(
    "warmup-scheduler",
    { every: 1_800_000 },
    {
      name: "warmup-schedule",
      data: { type: "schedule" },
    }
  );

  console.log("[worker] Recurring jobs scheduled");
}

setupRecurring().catch(console.error);

// Graceful shutdown
async function shutdown() {
  console.log("[worker] Shutting down...");
  await Promise.all([
    sendWorker.close(),
    replyWorker.close(),
    warmupWorker.close(),
    healthWorker.close(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[worker] All workers started. Waiting for jobs...");
