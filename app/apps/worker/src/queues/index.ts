import { Queue } from "bullmq";
import Redis from "ioredis";

const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const sendQueue = new Queue("outbound:send", { connection });
export const replyQueue = new Queue("outbound:reply", { connection });
export const warmupQueue = new Queue("outbound:warmup", { connection });
export const healthQueue = new Queue("outbound:health", { connection });

export { connection };
