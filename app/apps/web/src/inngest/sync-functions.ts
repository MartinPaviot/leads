import { inngest } from "./client";
import { db } from "@/db";
import { activities, contacts, companies, users, authAccounts, tenants } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { fetchRecentEmails, type SyncedEmail } from "@/lib/gmail";
import { fetchRecentMeetings, type SyncedMeeting } from "@/lib/calendar";
import { embedEntity, activityToText } from "@/lib/embeddings";

// Type for a contact row from the database
type ContactRow = typeof contacts.$inferSelect;

function extractEmail(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return match ? match[1] : header.trim();
}

function extractName(header: string): { firstName: string; lastName: string } {
  // "John Doe <john@example.com>" → { firstName: "John", lastName: "Doe" }
  const nameMatch = header.match(/^([^<]+)</);
  if (nameMatch) {
    const parts = nameMatch[1].trim().split(/\s+/);
    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || "",
    };
  }
  // Fallback: use email prefix
  const email = extractEmail(header);
  const prefix = email.split("@")[0] || "";
  return { firstName: prefix, lastName: "" };
}

/** Sync emails for a single user — called by cron and initial sync */
export const syncEmails = inngest.createFunction(
  {
    id: "sync-emails",
    name: "Sync Gmail Emails",
    retries: 2,
    concurrency: [{ limit: 1, key: "event.data.userId" }],
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] sync-emails failed for user ${(event as any).data?.userId}:`, error.message);
    },
    triggers: [{ event: "email/sync-requested" }],
  },
  async ({ event, step }: { event: { data: { userId: string; tenantId: string; appUserId: string; daysBack?: number } }; step: any }) => {
    const { userId, tenantId, appUserId, daysBack = 30 } = event.data;

    // Get user email for direction detection
    const userEmail = await step.run("get-user-email", async () => {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, appUserId)).limit(1);
      return user?.email || "";
    });

    if (!userEmail) return { synced: 0, reason: "No user email found" };

    // Fetch emails
    const emails = await step.run("fetch-emails", async () => {
      try {
        return await fetchRecentEmails(userId, userEmail, daysBack);
      } catch (err) {
        console.error("Gmail fetch failed:", err);
        return [];
      }
    });

    if (emails.length === 0) return { synced: 0, reason: "No emails or Gmail not connected" };

    // Get existing contacts for matching
    const existingContacts: ContactRow[] = await step.run("get-contacts", async () => {
      const all = await db.select().from(contacts).where(eq(contacts.tenantId, tenantId));
      return all;
    });

    const contactByEmail = new Map<string, ContactRow>(
      existingContacts.filter((c: ContactRow) => c.email).map((c: ContactRow) => [c.email!.toLowerCase(), c])
    );

    let created = 0;
    let contactsCreated = 0;

    // Process in batches of 50
    const batches: SyncedEmail[][] = [];
    for (let i = 0; i < emails.length; i += 50) {
      batches.push(emails.slice(i, i + 50));
    }

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      const result = await step.run(`process-batch-${batchIdx}`, async () => {
        let batchCreated = 0;
        let batchContacts = 0;

        for (const email of batch) {
          // Dedup by gmailMessageId in metadata
          const [existing] = await db
            .select({ id: activities.id })
            .from(activities)
            .where(
              and(
                eq(activities.tenantId, tenantId),
                sql`metadata->>'gmailMessageId' = ${email.gmailMessageId}`
              )
            )
            .limit(1);

          if (existing) continue;

          // Determine counterparty email
          const counterpartyHeader =
            email.direction === "inbound"
              ? email.from
              : email.to[0] || email.from;
          const counterpartyEmail = extractEmail(counterpartyHeader).toLowerCase();

          // Find or create contact for counterparty
          let matchedContact = contactByEmail.get(counterpartyEmail);

          if (!matchedContact && counterpartyEmail && !counterpartyEmail.includes("noreply") && !counterpartyEmail.includes("no-reply") && !counterpartyEmail.includes("mailer-daemon")) {
            // Auto-create contact from email
            const { firstName, lastName } = extractName(counterpartyHeader);
            const domain = counterpartyEmail.split("@")[1];

            // Try to find or auto-create company from email domain (S6: Gap 2 Phase 1)
            let companyId: string | null = null;
            if (domain) {
              // Skip common personal email providers
              const personalDomains = new Set([
                "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
                "aol.com", "protonmail.com", "mail.com", "live.com", "msn.com",
                "yandex.com", "zoho.com", "gmx.com", "fastmail.com",
              ]);

              const [existingCompany] = await db
                .select({ id: companies.id })
                .from(companies)
                .where(and(eq(companies.tenantId, tenantId), eq(companies.domain, domain)))
                .limit(1);

              if (existingCompany) {
                companyId = existingCompany.id;
              } else if (!personalDomains.has(domain)) {
                // Check domain exclusion list from workspace settings
                const [tenantRow] = await db.select({ settings: tenants.settings })
                  .from(tenants)
                  .where(eq(tenants.id, tenantId))
                  .limit(1);
                const settings = (tenantRow?.settings || {}) as Record<string, unknown>;
                const excludedDomains = (settings.excludedDomains || []) as string[];

                if (!excludedDomains.includes(domain)) {
                  // Auto-create company from email domain
                  const companyName = domain
                    .replace(/\.(com|io|co|ai|dev|org|net|app)$/i, "")
                    .split(".")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ");

                  const [newCompany] = await db
                    .insert(companies)
                    .values({
                      tenantId,
                      name: companyName,
                      domain,
                      properties: { source: "email_domain_auto", auto_created: true },
                    })
                    .returning();

                  companyId = newCompany.id;

                  // Fire enrichment for the new company
                  await inngest.send({
                    name: "company/created",
                    data: { companyId: newCompany.id, tenantId },
                  }).catch(console.warn);
                }
              }
            }

            const [newContact] = await db
              .insert(contacts)
              .values({
                tenantId,
                email: counterpartyEmail,
                firstName,
                lastName,
                companyId,
                properties: { source: "email_sync", auto_created: true },
              })
              .returning();

            matchedContact = newContact;
            contactByEmail.set(counterpartyEmail, newContact);
            batchContacts++;

            // Fire enrichment event for the new contact
            await inngest.send({
              name: "contact/created",
              data: { contactId: newContact.id, tenantId },
            }).catch(console.warn);
          }

          // Create activity record
          const [activity] = await db.insert(activities).values({
            tenantId,
            actorType: email.direction === "inbound" ? "contact" : "user",
            actorId: email.direction === "inbound" ? matchedContact?.id || null : appUserId,
            entityType: "contact",
            entityId: matchedContact?.id || "unknown",
            activityType: email.direction === "inbound" ? "email_received" : "email_sent",
            channel: "email",
            direction: email.direction,
            occurredAt: email.date,
            summary: email.subject,
            rawContent: email.snippet,
            metadata: {
              gmailMessageId: email.gmailMessageId,
              threadId: email.threadId,
              from: email.from,
              to: email.to,
              snippet: email.snippet,
            },
          }).returning();

          // Embed the activity for RAG
          if (process.env.OPENAI_API_KEY && activity) {
            try {
              const text = activityToText({
                activityType: activity.activityType,
                summary: activity.summary,
                rawContent: email.snippet,
                channel: "email",
                direction: email.direction,
                occurredAt: email.date,
                contactName: matchedContact ? [matchedContact.firstName, matchedContact.lastName].filter(Boolean).join(" ") : null,
              });
              if (text.trim()) {
                await embedEntity(tenantId, "activity", activity.id, text);
              }
            } catch {
              // Non-critical embedding failure
            }
          }

          batchCreated++;
        }

        return { created: batchCreated, contacts: batchContacts };
      });

      created += result.created;
      contactsCreated += result.contacts;
    }

    return { synced: created, contactsCreated, total: emails.length };
  }
);

/** Sync calendar events for a single user */
export const syncCalendar = inngest.createFunction(
  {
    id: "sync-calendar",
    name: "Sync Google Calendar",
    retries: 2,
    concurrency: [{ limit: 1, key: "event.data.userId" }],
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] sync-calendar failed for user ${(event as any).data?.userId}:`, error.message);
    },
    triggers: [{ event: "calendar/sync-requested" }],
  },
  async ({ event, step }: { event: { data: { userId: string; tenantId: string; appUserId: string } }; step: any }) => {
    const { userId, tenantId, appUserId } = event.data;

    const userEmail = await step.run("get-user-email", async () => {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, appUserId)).limit(1);
      return user?.email || "";
    });

    const meetings = await step.run("fetch-meetings", async () => {
      try {
        return await fetchRecentMeetings(userId, 30, 14);
      } catch (err) {
        console.error("Calendar fetch failed:", err);
        return [];
      }
    });

    if (meetings.length === 0) return { synced: 0 };

    const existingContacts2: ContactRow[] = await step.run("get-contacts", async () => {
      const all = await db.select().from(contacts).where(eq(contacts.tenantId, tenantId));
      return all;
    });

    const contactByEmail = new Map<string, ContactRow>(
      existingContacts2.filter((c: ContactRow) => c.email).map((c: ContactRow) => [c.email!.toLowerCase(), c])
    );

    let created = 0;

    const result = await step.run("process-meetings", async () => {
      let synced = 0;

      for (const meeting of meetings) {
        // Dedup
        const [existing] = await db
          .select({ id: activities.id })
          .from(activities)
          .where(
            and(
              eq(activities.tenantId, tenantId),
              sql`metadata->>'calendarEventId' = ${meeting.calendarEventId}`
            )
          )
          .limit(1);

        if (existing) continue;

        // Match attendees to contacts
        type AttendeeWithContact = { email: string; displayName: string | null; responseStatus: string; contact: ContactRow | null };
        const matchedAttendees: AttendeeWithContact[] = meeting.attendees
          .filter((a: { email: string }) => a.email.toLowerCase() !== userEmail.toLowerCase())
          .map((a: { email: string; displayName: string | null; responseStatus: string }) => ({
            ...a,
            contact: contactByEmail.get(a.email.toLowerCase()) || null,
          }));

        const primaryContact = matchedAttendees.find((a: AttendeeWithContact) => a.contact)?.contact;

        const isPast = meeting.startTime < new Date();
        const activityType = isPast ? "meeting_completed" : "meeting_scheduled";

        const [activity] = await db.insert(activities).values({
          tenantId,
          actorType: "user",
          actorId: appUserId,
          entityType: primaryContact ? "contact" : "company",
          entityId: primaryContact?.id || "unknown",
          activityType,
          channel: "meeting",
          direction: "outbound",
          occurredAt: meeting.startTime,
          summary: meeting.title,
          rawContent: meeting.description,
          metadata: {
            calendarEventId: meeting.calendarEventId,
            startTime: meeting.startTime.toISOString(),
            endTime: meeting.endTime.toISOString(),
            attendees: matchedAttendees.map((a: AttendeeWithContact) => ({
              email: a.email,
              displayName: a.displayName,
              responseStatus: a.responseStatus,
              contactId: a.contact?.id || null,
            })),
            location: meeting.location,
            meetingLink: meeting.meetingLink,
          },
        }).returning();

        // Embed meeting for RAG
        if (process.env.OPENAI_API_KEY && activity) {
          try {
            const text = activityToText({
              activityType,
              summary: meeting.title,
              rawContent: meeting.description,
              channel: "meeting",
              direction: "outbound",
              occurredAt: meeting.startTime,
              contactName: primaryContact ? [primaryContact.firstName, primaryContact.lastName].filter(Boolean).join(" ") : null,
            });
            if (text.trim()) {
              await embedEntity(tenantId, "activity", activity.id, text);
            }
          } catch {
            // Non-critical
          }
        }

        synced++;
      }

      return synced;
    });

    return { synced: result, total: meetings.length };
  }
);

/** Triggered after Google OAuth completes — kicks off initial email+calendar sync */
export const onGoogleOAuthConnected = inngest.createFunction(
  {
    id: "google-oauth-connected",
    name: "Handle Google OAuth Connection",
    retries: 1,
    triggers: [{ event: "google/oauth-connected" }],
  },
  async ({ event, step }: { event: { data: { userId: string; tenantId: string; appUserId: string } }; step: any }) => {
    const { userId, tenantId, appUserId } = event.data;

    // Kick off email sync (2 year backfill for first sync)
    await step.run("trigger-email-sync", async () => {
      await inngest.send({
        name: "email/sync-requested",
        data: { userId, tenantId, appUserId, daysBack: 730 },
      });
    });

    // Kick off calendar sync
    await step.run("trigger-calendar-sync", async () => {
      await inngest.send({
        name: "calendar/sync-requested",
        data: { userId, tenantId, appUserId },
      });
    });

    return { triggered: true };
  }
);

/** Cron: sync emails every 15 minutes for all connected users */
export const cronSyncEmails = inngest.createFunction(
  {
    id: "cron-sync-emails",
    name: "Cron: Sync All Email",
    retries: 1,
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) => {
    // Find all users with Google OAuth connected
    const googleUsers = await step.run("find-google-users", async () => {
      const accounts = await db
        .select({
          userId: authAccounts.userId,
        })
        .from(authAccounts)
        .where(eq(authAccounts.provider, "google"));

      // Resolve tenant info for each
      const results = [];
      for (const account of accounts) {
        const [user] = await db
          .select({ id: users.id, tenantId: users.tenantId })
          .from(users)
          .where(eq(users.clerkId, account.userId))
          .limit(1);
        if (user) {
          results.push({
            userId: account.userId,
            tenantId: user.tenantId,
            appUserId: user.id,
          });
        }
      }
      return results;
    });

    // Send sync events for each user
    await step.run("trigger-syncs", async () => {
      for (const user of googleUsers) {
        await inngest.send([
          { name: "email/sync-requested", data: { ...user, daysBack: 1 } },
          { name: "calendar/sync-requested", data: user },
        ]);
      }
    });

    return { usersTriggered: googleUsers.length };
  }
);
