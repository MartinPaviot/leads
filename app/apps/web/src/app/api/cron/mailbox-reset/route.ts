import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { sql } from "drizzle-orm";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * Reset daily sent counters on all connected mailboxes.
 * Run as cron at midnight UTC daily.
 */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  try {
    await db
      .update(connectedMailboxes)
      .set({ sentToday: 0, updatedAt: new Date() })
      .where(sql`${connectedMailboxes.sentToday} > 0`);

    return Response.json({
      ok: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Mailbox reset cron failed:", error);
    return Response.json({ error: "Failed to reset mailbox counters" }, { status: 500 });
  }
}
