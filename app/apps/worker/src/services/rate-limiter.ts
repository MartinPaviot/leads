/**
 * Rate limiter for outbound email sending
 * Enforces per-mailbox, per-domain, and per-tenant limits
 */

import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

interface MailboxInfo {
  id: string;
  sentToday: number;
  dailyLimit: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  sendDays: string[];
  domain: string;
  bounceCount7d: number;
  sentTotal: number;
}

export class RateLimiter {
  // Check all limits before sending
  static async check(mailbox: MailboxInfo): Promise<boolean> {
    const now = new Date();

    // Per-mailbox daily limit (default 50)
    if (mailbox.sentToday >= mailbox.dailyLimit) return false;

    // Business hours window
    const hour = now.getHours();
    const startHour = parseInt(mailbox.sendWindowStart);
    const endHour = parseInt(mailbox.sendWindowEnd);
    if (hour < startHour || hour >= endHour) return false;

    // Day of week
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const today = dayNames[now.getDay()];
    if (!mailbox.sendDays.includes(today)) return false;

    // Minimum gap between sends (45s per mailbox)
    const lastSent = await redis.get(`ratelimit:lastsend:${mailbox.id}`);
    if (lastSent && Date.now() - parseInt(lastSent) < 45_000) return false;

    // Per-domain daily limit (150/day to avoid burning a domain)
    const dateKey = now.toISOString().split("T")[0];
    const domainSent = await redis.get(`ratelimit:domain:${mailbox.domain}:${dateKey}`);
    if (domainSent && parseInt(domainSent) >= 150) return false;

    // Auto-stop if bounce rate > 10% over 7 days
    if (mailbox.bounceCount7d > 0 && mailbox.sentTotal > 0) {
      const bounceRate = mailbox.bounceCount7d / Math.min(mailbox.sentTotal, 100);
      if (bounceRate > 0.10) return false;
    }

    return true;
  }

  // Record a successful send
  static async recordSend(mailboxId: string, domain: string) {
    const dateKey = new Date().toISOString().split("T")[0];
    await redis.set(`ratelimit:lastsend:${mailboxId}`, Date.now().toString());
    await redis.incr(`ratelimit:domain:${domain}:${dateKey}`);
    // Expire domain keys after 2 days
    await redis.expire(`ratelimit:domain:${domain}:${dateKey}`, 172800);
  }
}
