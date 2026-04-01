/**
 * Mailbox rotation engine
 * Weighted round-robin with health scoring and domain diversity
 */

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

interface Mailbox {
  id: string;
  emailAddress: string;
  domain: string;
  status: string;
  dailyLimit: number;
  sentToday: number;
  healthScore: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  sendDays: string[];
}

export class RotationEngine {
  static async pickMailbox(tenantId: string): Promise<Mailbox | null> {
    const rows = await sql`
      SELECT id, email_address as "emailAddress", domain, status,
             daily_limit as "dailyLimit", sent_today as "sentToday",
             health_score as "healthScore",
             send_window_start as "sendWindowStart",
             send_window_end as "sendWindowEnd",
             send_days as "sendDays"
      FROM connected_mailboxes
      WHERE tenant_id = ${tenantId} AND status = 'active'
    `;

    if (rows.length === 0) return null;

    const now = new Date();
    const hour = now.getHours();
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const today = dayNames[now.getDay()];

    const eligible = (rows as unknown as Mailbox[]).filter((m) => {
      if (m.sentToday >= m.dailyLimit) return false;
      const startHour = parseInt(m.sendWindowStart);
      const endHour = parseInt(m.sendWindowEnd);
      if (hour < startHour || hour >= endHour) return false;
      if (!m.sendDays.includes(today)) return false;
      return true;
    });

    if (eligible.length === 0) return null;

    // Weighted sort: prioritize mailboxes with most remaining capacity × health
    eligible.sort((a, b) => {
      const scoreA = (a.dailyLimit - a.sentToday) * (a.healthScore / 100);
      const scoreB = (b.dailyLimit - b.sentToday) * (b.healthScore / 100);
      return scoreB - scoreA;
    });

    // Pick randomly from top 3 for domain diversity
    const top3 = eligible.slice(0, Math.min(3, eligible.length));
    return top3[Math.floor(Math.random() * top3.length)];
  }
}
