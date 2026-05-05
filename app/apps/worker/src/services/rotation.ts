/**
 * Mailbox rotation engine
 * Weighted round-robin with health scoring and domain diversity
 */

import { db, connectedMailboxes } from "../db.js";
import { eq, and } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type Mailbox = InferSelectModel<typeof connectedMailboxes>;

export class RotationEngine {
  static async pickMailbox(tenantId: string): Promise<Mailbox | null> {
    const rows = await db
      .select()
      .from(connectedMailboxes)
      .where(
        and(
          eq(connectedMailboxes.tenantId, tenantId),
          eq(connectedMailboxes.status, "active")
        )
      );

    if (rows.length === 0) return null;

    const now = new Date();
    const hour = now.getHours();
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const today = dayNames[now.getDay()];

    const eligible = rows.filter((m) => {
      if (m.sentToday >= m.dailyLimit) return false;
      const startHour = parseInt(m.sendWindowStart || "8");
      const endHour = parseInt(m.sendWindowEnd || "18");
      if (hour < startHour || hour >= endHour) return false;
      const days = (m.sendDays || []) as string[];
      if (!days.includes(today)) return false;
      return true;
    });

    if (eligible.length === 0) return null;

    eligible.sort((a, b) => {
      const scoreA = (a.dailyLimit - a.sentToday) * (a.healthScore / 100);
      const scoreB = (b.dailyLimit - b.sentToday) * (b.healthScore / 100);
      return scoreB - scoreA;
    });

    const top3 = eligible.slice(0, Math.min(3, eligible.length));
    return top3[Math.floor(Math.random() * top3.length)];
  }
}
