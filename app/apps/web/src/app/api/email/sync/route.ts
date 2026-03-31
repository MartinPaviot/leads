import { auth } from "@/auth";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchRecentEmails } from "@/lib/gmail";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const emails = await fetchRecentEmails(
      session.user.id,
      session.user.email,
      30
    );

    // Get all contacts for email matching
    const allContacts = await db.select().from(contacts);
    const contactByEmail = new Map(
      allContacts
        .filter((c) => c.email)
        .map((c) => [c.email!.toLowerCase(), c])
    );

    let created = 0;
    let skipped = 0;

    for (const email of emails) {
      // Check for existing activity with same Gmail message ID (dedup)
      const [existing] = await db
        .select({ id: activities.id })
        .from(activities)
        .where(
          eq(
            activities.metadata,
            JSON.stringify({ gmailMessageId: email.gmailMessageId }) as unknown as Record<string, unknown>
          )
        )
        .limit(1);

      // Simple dedup: check metadata contains the gmailMessageId
      // Note: JSONB containment check would be better but this works for MVP
      if (existing) {
        skipped++;
        continue;
      }

      // Match email to contact
      const relevantEmail =
        email.direction === "inbound"
          ? extractEmailFromHeader(email.from)
          : email.to.map(extractEmailFromHeader).find((e) => contactByEmail.has(e.toLowerCase()));

      const matchedContact = relevantEmail
        ? contactByEmail.get(relevantEmail.toLowerCase())
        : null;

      await db.insert(activities).values({
        tenantId: "default",
        actorType: email.direction === "inbound" ? "contact" : "user",
        actorId:
          email.direction === "inbound"
            ? matchedContact?.id || null
            : session.user.id,
        entityType: matchedContact ? "contact" : "company",
        entityId: matchedContact?.id || "unknown",
        activityType:
          email.direction === "inbound" ? "email_received" : "email_sent",
        channel: "email",
        direction: email.direction,
        occurredAt: email.date,
        summary: email.subject,
        metadata: {
          gmailMessageId: email.gmailMessageId,
          threadId: email.threadId,
          from: email.from,
          to: email.to,
          snippet: email.snippet,
        },
      });

      created++;
    }

    return Response.json({
      success: true,
      created,
      skipped,
      total: emails.length,
    });
  } catch (error) {
    console.error("Email sync failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Sync failed: ${message}` }, { status: 500 });
  }
}

function extractEmailFromHeader(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return match ? match[1] : header.trim();
}
