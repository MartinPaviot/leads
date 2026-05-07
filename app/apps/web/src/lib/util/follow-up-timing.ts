import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

interface FollowUpTiming {
  bestDayOfWeek: string;
  bestTimeWindow: "morning" | "afternoon" | "evening";
  avgResponseHours: number;
  reasoning: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function analyzeFollowUpTiming(contactId: string, tenantId: string): Promise<FollowUpTiming | null> {
  // Get all inbound emails from this contact (their responses)
  const responses = await db
    .select({
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .where(and(
      eq(activities.entityId, contactId),
      eq(activities.entityType, "contact"),
      eq(activities.tenantId, tenantId),
      eq(activities.direction, "inbound"),
      sql`${activities.activityType} IN ('email_received')`,
    ))
    .orderBy(activities.occurredAt);

  if (responses.length < 3) return null; // Need at least 3 responses for patterns

  // Analyze day of week distribution
  const dayCount: Record<number, number> = {};
  const hourCount: Record<string, number> = { morning: 0, afternoon: 0, evening: 0 };
  const responseTimes: number[] = [];

  // Get outbound emails to calculate response times
  const outbound = await db
    .select({ occurredAt: activities.occurredAt })
    .from(activities)
    .where(and(
      eq(activities.entityId, contactId),
      eq(activities.entityType, "contact"),
      eq(activities.tenantId, tenantId),
      eq(activities.direction, "outbound"),
      sql`${activities.activityType} IN ('email_sent')`,
    ))
    .orderBy(activities.occurredAt);

  for (const r of responses) {
    if (!r.occurredAt) continue;
    const date = new Date(r.occurredAt);
    const day = date.getDay();
    const hour = date.getHours();

    dayCount[day] = (dayCount[day] || 0) + 1;

    if (hour >= 6 && hour < 12) hourCount.morning++;
    else if (hour >= 12 && hour < 18) hourCount.afternoon++;
    else hourCount.evening++;

    // Find the closest outbound email before this response
    const closestOutbound = outbound
      .filter(o => o.occurredAt && new Date(o.occurredAt) < date)
      .pop();

    if (closestOutbound?.occurredAt) {
      const responseTime = (date.getTime() - new Date(closestOutbound.occurredAt).getTime()) / (1000 * 60 * 60);
      if (responseTime > 0 && responseTime < 168) { // Less than 1 week
        responseTimes.push(responseTime);
      }
    }
  }

  // Best day
  const bestDay = Object.entries(dayCount).sort(([, a], [, b]) => b - a)[0];
  const bestDayOfWeek = bestDay ? DAYS[parseInt(bestDay[0])] : "Tuesday";

  // Best time window
  const bestTime = Object.entries(hourCount).sort(([, a], [, b]) => b - a)[0];
  const bestTimeWindow = (bestTime?.[0] || "morning") as "morning" | "afternoon" | "evening";

  // Average response time
  const avgResponseHours = responseTimes.length > 0
    ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10
    : 24;

  return {
    bestDayOfWeek,
    bestTimeWindow,
    avgResponseHours,
    reasoning: `Responds most on ${bestDayOfWeek}s, ${bestTimeWindow} (avg ${avgResponseHours}h response time, ${responses.length} responses analyzed)`,
  };
}
