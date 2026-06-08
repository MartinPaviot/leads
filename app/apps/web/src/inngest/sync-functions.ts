import { inngest } from "./client";
import { db } from "@/db";
import { activities, contacts, companies, users, authAccounts, outboundEmails, sequenceEnrollments, tenants, connectedMailboxes } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { fetchRecentEmails, type SyncedEmail } from "@/lib/integrations/gmail";
import { fetchOutlookEmails } from "@/lib/integrations/outlook";
import { fetchRecentEmailsImap } from "@/lib/integrations/imap";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { fetchRecentMeetings, type SyncedMeeting } from "@/lib/integrations/calendar";
import { embedEntity, activityToText, contactToText, companyToText } from "@/lib/ai/embeddings";
import { markNeedsReauth, clearSyncHealth, isNeedsReauth, isOAuthAuthError } from "@/lib/integrations/sync-health";
import { getTenantSettings, backsyncRangeToDays, buildIgnoredDomains, shouldAutoCreateContact } from "@/lib/config/tenant-settings";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

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

const sentimentSchema = z.object({
  results: z.array(z.object({
    index: z.number(),
    sentiment: z.enum(["positive", "neutral", "negative"]),
    intent: z.array(z.enum([
      "interested", "not_interested", "question", "objection",
      "budget_mention", "timeline_mention", "competitor_mention",
      "decision_pending", "referral", "follow_up_needed"
    ])),
  })),
});

async function analyzeEmailBatch(emails: { index: number; subject: string; body: string; direction: string }[]): Promise<Map<number, { sentiment: "positive" | "neutral" | "negative"; intent: string[] }>> {
  const results = new Map<number, { sentiment: "positive" | "neutral" | "negative"; intent: string[] }>();

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model || emails.length === 0) return results;

  try {
    const prompt = emails.map((e) =>
      `[${e.index}] ${e.direction.toUpperCase()} | Subject: ${e.subject}\n${e.body.slice(0, 800)}`
    ).join("\n---\n");

    const { object } = await tracedGenerateObject({
      model,
      schema: sentimentSchema,
      prompt: `Analyze each email's sentiment and intent. Be concise.

For sentiment: "positive" = interested, thankful, wants to move forward. "negative" = not interested, annoyed, unsubscribe. "neutral" = informational, automated, unclear.

For intent, tag ALL that apply from: interested, not_interested, question, objection, budget_mention, timeline_mention, competitor_mention, decision_pending, referral, follow_up_needed.

Emails:
${prompt}`,
      _trace: { agentId: "sync-emails", inputPreview: `Sentiment analysis for ${emails.length} emails` },
    });

    for (const r of object.results) {
      results.set(r.index, { sentiment: r.sentiment, intent: r.intent });
    }
  } catch (err) {
    console.warn("Sentiment analysis failed:", err);
  }

  return results;
}

/** Sync emails for a single user — called by cron and initial sync */
export const syncEmails = inngest.createFunction(
  {
    id: "sync-emails",
    name: "Sync Emails",
    retries: 2,
    concurrency: [{ limit: 1, key: "event.data.userId" }],
    onFailure: async ({ error, event }) => {
      console.error(`[DEAD LETTER] sync-emails failed for user ${(event as any).data?.userId}:`, error.message);
    },
    triggers: [{ event: "email/sync-requested" }],
  },
  async ({ event, step }: { event: { data: { userId: string; tenantId: string; appUserId: string; daysBack?: number; provider?: string; mailboxId?: string } }; step: any }) => {
    const { userId, tenantId, appUserId, daysBack = 30, provider, mailboxId } = event.data;

    // For a direct IMAP/SMTP mailbox, direction is relative to the mailbox
    // address (there's no Google/Microsoft user identity). Resolve it from the
    // connected_mailboxes row; otherwise use the app user's email.
    const userEmail = await step.run("get-user-email", async () => {
      if (provider === "smtp_custom" && mailboxId) {
        const [mb] = await db
          .select({ email: connectedMailboxes.emailAddress })
          .from(connectedMailboxes)
          .where(eq(connectedMailboxes.id, mailboxId))
          .limit(1);
        return mb?.email || "";
      }
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, appUserId)).limit(1);
      return user?.email || "";
    });

    if (!userEmail) return { synced: 0, reason: "No user email found" };

    // Fetch emails — route by provider. Surface auth failures as
    // notifications so the user knows their sync stopped working
    // (previously these were swallowed and returned silent zeros).
    let fetchError: string | null = null;
    const emails = await step.run("fetch-emails", async () => {
      try {
        if (provider === "smtp_custom") {
          if (!mailboxId) return [];
          const [mb] = await db
            .select()
            .from(connectedMailboxes)
            .where(eq(connectedMailboxes.id, mailboxId))
            .limit(1);
          if (!mb || !mb.imapHost || !mb.secretEncrypted) return [];
          const password = decryptSecret(mb.secretEncrypted);
          const { emails: imapEmails, maxUid } = await fetchRecentEmailsImap(
            { emailAddress: mb.emailAddress, imapHost: mb.imapHost, imapPort: mb.imapPort, password, imapLastUid: mb.imapLastUid },
            daysBack,
          );
          // Persist the high-water UID so the next poll only fetches new mail.
          if (maxUid != null && maxUid !== mb.imapLastUid) {
            await db
              .update(connectedMailboxes)
              .set({ imapLastUid: maxUid, updatedAt: new Date() })
              .where(eq(connectedMailboxes.id, mailboxId));
          }
          return imapEmails;
        }
        if (provider === "microsoft") {
          return await fetchOutlookEmails(userId, userEmail, daysBack);
        }
        return await fetchRecentEmails(userId, userEmail, daysBack);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Email fetch failed (${provider || "google"}):`, msg);
        // Detect auth failures — these need user action
        const isAuthError = msg.includes("401") || msg.includes("403") ||
          msg.includes("invalid_grant") || msg.includes("token") ||
          msg.includes("unauthorized") || msg.includes("auth");
        if (isAuthError) {
          fetchError = `Email sync failed: ${provider || "Google"} OAuth token expired. Reconnect in Settings → Mail & Calendar.`;
        }
        return [];
      }
    });

    // Auth failure → flag the connection `needs_reauth` so the 15-min crons
    // stop hammering a dead token, and notify the user exactly once (only on
    // the healthy → needs_reauth transition, not every cycle).
    if (fetchError) {
      try {
        const { newlyMarked } = await markNeedsReauth(tenantId, userId, provider, fetchError);
        if (newlyMarked) {
          const { notifications, users } = await import("@/db/schema");
          const tenantUsers = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantId)).limit(5);
          for (const u of tenantUsers) {
            await db.insert(notifications).values({
              tenantId,
              userId: u.id,
              type: "system" as const,
              title: "Email sync disconnected",
              body: fetchError,
            });
          }
        }
      } catch (e) {
        console.warn("sync: needs-reauth mark/notification failed", e);
      }
      return { synced: 0, reason: fetchError };
    }

    if (emails.length === 0) return { synced: 0, reason: "No new emails in sync window" };

    // Get existing contacts for matching
    const existingContacts: ContactRow[] = await step.run("get-contacts", async () => {
      const all = await db.select().from(contacts).where(eq(contacts.tenantId, tenantId));
      return all;
    });

    const contactByEmail = new Map<string, ContactRow>();
    for (const c of existingContacts) {
      if (c.email) {
        contactByEmail.set(c.email.toLowerCase(), c);
      }
      // Also index additional emails from properties
      const props = (c.properties || {}) as Record<string, unknown>;
      const additionalEmails = (props.additionalEmails || []) as string[];
      for (const ae of additionalEmails) {
        if (ae && !contactByEmail.has(ae.toLowerCase())) {
          contactByEmail.set(ae.toLowerCase(), c);
        }
      }
    }

    // Load tenant settings for domain filtering + creation mode
    const tenantSettings = await step.run("get-tenant-settings", async () => {
      const s = await getTenantSettings(tenantId);
      return {
        companyDomain: s.companyDomain || "",
        contactCreationMode: s.contactCreationMode || "selective",
        doNotTrackDomains: s.doNotTrackDomains || [],
      };
    });
    const ownDomain = tenantSettings.companyDomain.toLowerCase().replace(/^www\./, "");
    const ignoredDomains = buildIgnoredDomains(tenantSettings as any, ownDomain);
    const creationMode = tenantSettings.contactCreationMode;

    let created = 0;
    let contactsCreated = 0;
    const createdActivities: { id: string; entityId: string; subject: string; body: string; direction: string; metadata: Record<string, unknown> }[] = [];

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

          if (
            !matchedContact &&
            counterpartyEmail &&
            !counterpartyEmail.includes("noreply") &&
            !counterpartyEmail.includes("no-reply") &&
            !counterpartyEmail.includes("mailer-daemon") &&
            shouldAutoCreateContact(creationMode, email.direction as "inbound" | "outbound")
          ) {
            // Auto-create contact from email
            const { firstName, lastName } = extractName(counterpartyHeader);
            const domain = counterpartyEmail.split("@")[1];

            // Try to find or auto-create company from email domain
            let companyId: string | null = null;
            let companyName: string | undefined;
            if (domain) {
              const [existingCompany] = await db
                .select({ id: companies.id })
                .from(companies)
                .where(and(eq(companies.tenantId, tenantId), eq(companies.domain, domain)))
                .limit(1);

              if (existingCompany) {
                companyId = existingCompany.id;
              } else if (!ignoredDomains.has(domain)) {
                // Auto-create company from email domain
                companyName = domain
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

                // Embed company for RAG
                if (process.env.OPENAI_API_KEY) {
                  embedEntity(tenantId, "company", newCompany.id, companyToText({ name: companyName, domain }))
                    .catch((e) => console.warn("sync: embedEntity company failed (non-blocking)", e));
                }

                // Fire enrichment for the new company
                await inngest.send({
                  name: "company/created",
                  data: { companyId: newCompany.id, tenantId },
                }).catch(console.warn);
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

            // Embed contact for RAG
            if (process.env.OPENAI_API_KEY) {
              embedEntity(tenantId, "contact", newContact.id, contactToText({ firstName, lastName, email: counterpartyEmail, companyName: companyName || undefined }))
                .catch((e) => console.warn("sync: embedEntity contact failed (non-blocking)", e));
            }

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
            rawContent: (email.body || email.snippet || "").slice(0, 10000),
            threadId: email.threadId,
            metadata: {
              gmailMessageId: email.gmailMessageId,
              threadId: email.threadId,
              from: email.from,
              to: email.to,
              snippet: email.snippet,
              bodyLength: email.body?.length || 0,
            },
          }).returning();

          // Embed the activity for RAG
          if (process.env.OPENAI_API_KEY && activity) {
            try {
              const text = activityToText({
                activityType: activity.activityType,
                summary: activity.summary,
                rawContent: (email.body || email.snippet || "").slice(0, 10000),
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

          // Detect replies to outbound sequence emails (match by threadId)
          if (email.direction === "inbound" && email.threadId && matchedContact?.id) {
            const [outbound] = await db
              .select({
                id: outboundEmails.id,
                enrollmentId: outboundEmails.enrollmentId,
                contactId: outboundEmails.contactId,
              })
              .from(outboundEmails)
              .where(
                and(
                  eq(outboundEmails.threadId, email.threadId),
                  eq(outboundEmails.tenantId, tenantId),
                  eq(outboundEmails.status, "sent"),
                )
              )
              .limit(1);

            if (outbound?.enrollmentId) {
              // Mark outbound email as replied
              await db.update(outboundEmails).set({
                repliedAt: new Date(),
                replySnippet: (email.body || email.snippet || "").slice(0, 500),
              }).where(eq(outboundEmails.id, outbound.id));

              // Emit reply event for processReply handler
              await inngest.send({
                name: "email/reply-received",
                data: {
                  tenantId,
                  enrollmentId: outbound.enrollmentId,
                  contactId: outbound.contactId || matchedContact.id,
                  outboundEmailId: outbound.id,
                  replyBody: (email.body || email.snippet || "").slice(0, 5000),
                  replySubject: email.subject || "",
                  replierEmail: counterpartyEmail,
                },
              }).catch(console.warn);
            }
          }

          createdActivities.push({ id: activity.id, entityId: activity.entityId, subject: email.subject, body: (email.body || "").slice(0, 2000), direction: email.direction, metadata: activity.metadata as Record<string, unknown> });

          batchCreated++;
        }

        return { created: batchCreated, contacts: batchContacts };
      });

      created += result.created;
      contactsCreated += result.contacts;
    }

    // Batch sentiment analysis
    const activitiesToAnalyze = createdActivities.filter(a => a.body);
    for (let i = 0; i < activitiesToAnalyze.length; i += 5) {
      const batch = activitiesToAnalyze.slice(i, i + 5);
      const emailBatch = batch.map((a, idx) => ({
        index: idx,
        subject: a.subject,
        body: a.body,
        direction: a.direction,
      }));

      const sentiments = await analyzeEmailBatch(emailBatch);

      for (const [idx, result] of sentiments) {
        const act = batch[idx];
        if (act) {
          await db.update(activities)
            .set({
              sentiment: result.sentiment as any,
              intent: result.intent,
              metadata: { ...(act.metadata || {}), intent: result.intent },
            })
            .where(eq(activities.id, act.id));
        }
      }
    }

    // Auto-score contacts that had new activities
    if (createdActivities.length > 0) {
      const contactIds = [...new Set(createdActivities.map(a => a.entityId).filter(Boolean))];
      if (contactIds.length > 0) {
        fetch(`${process.env.AUTH_URL || "http://localhost:3000"}/api/score/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds }),
        }).catch((e) => console.warn("sync: enrich-contacts trigger failed (non-blocking)", e));
      }
    }

    // Real-time signal detection (competitive gap #3): evaluate signals
    // immediately after email sync, not in a weekly batch.
    if (createdActivities.length > 0) {
      for (const act of createdActivities) {
        await inngest.send({
          name: "signals/evaluate-realtime",
          data: {
            type: "email_synced" as const,
            tenantId,
            activityId: act.id,
            contactId: act.entityId !== "unknown" ? act.entityId : undefined,
          },
        }).catch((e) => console.warn("sync: realtime-signal trigger failed (non-blocking)", e));
      }
    }

    // Deep LLM signal extraction (fire-and-forget, runs in parallel function).
    // Existing `analyzeEmailBatch` above keeps simple sentiment + intent.
    // The extractor below adds objections, competitors, next steps, champion
    // signals, extracted budget/timeframe — see SOURCES_ANALYSIS.md §6.3 Module 1.
    if (createdActivities.length > 0) {
      const activityIds = createdActivities
        .filter((a) => a.body && a.body.length >= 40)
        .map((a) => a.id);
      if (activityIds.length > 0) {
        await inngest.send({
          name: "enrichment/email-extract-batch-requested",
          data: { tenantId, activityIds },
        }).catch((e) => console.warn("sync: email-extract trigger failed (non-blocking)", e));
      }
    }

    // Thread-level intelligence extraction (fire-and-forget). Groups emails
    // by threadId and extracts buying signals, sentiment trends, objections,
    // competitor mentions, and urgency from the full conversation arc.
    if (createdActivities.length > 0) {
      const threadIds = [
        ...new Set(
          createdActivities
            .map((a) => (a.metadata as Record<string, unknown>)?.threadId)
            .filter((tid): tid is string => typeof tid === "string" && tid.length > 0),
        ),
      ];
      if (threadIds.length > 0) {
        await inngest.send({
          name: "enrichment/thread-intelligence-requested",
          data: { tenantId, threadIds },
        }).catch((e) => console.warn("sync: thread-intelligence trigger failed (non-blocking)", e));
      }
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
  async ({ event, step }: { event: { data: { userId: string; tenantId: string; appUserId: string; provider?: string } }; step: any }) => {
    const { userId, tenantId, appUserId, provider } = event.data;

    const userEmail = await step.run("get-user-email", async () => {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, appUserId)).limit(1);
      return user?.email || "";
    });

    let calAuthError: string | null = null;
    const meetings = await step.run("fetch-meetings", async () => {
      try {
        return await fetchRecentMeetings(userId, 30, 14);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Calendar fetch failed:", msg);
        if (isOAuthAuthError(msg)) calAuthError = msg;
        return [];
      }
    });

    // Dead OAuth grant → flag needs_reauth so the crons skip it. The email
    // sync path owns the single user-facing notification; here we only mark.
    if (calAuthError) {
      await markNeedsReauth(tenantId, userId, provider, calAuthError);
      return { synced: 0, reason: "calendar auth error" };
    }

    if (meetings.length === 0) return { synced: 0 };

    const existingContacts2: ContactRow[] = await step.run("get-contacts", async () => {
      const all = await db.select().from(contacts).where(eq(contacts.tenantId, tenantId));
      return all;
    });

    const contactByEmail = new Map<string, ContactRow>();
    for (const c of existingContacts2) {
      if (c.email) {
        contactByEmail.set(c.email.toLowerCase(), c);
      }
      const props = (c.properties || {}) as Record<string, unknown>;
      const additionalEmails = (props.additionalEmails || []) as string[];
      for (const ae of additionalEmails) {
        if (ae && !contactByEmail.has(ae.toLowerCase())) {
          contactByEmail.set(ae.toLowerCase(), c);
        }
      }
    }

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

    // Reconnect clears any prior needs-reauth flag so the crons resume syncing.
    await step.run("clear-sync-health", async () => {
      await clearSyncHealth(tenantId, userId, "google");
    });

    // Read backsync range from tenant settings
    const daysBack = await step.run("get-backsync-range", async () => {
      const s = await getTenantSettings(tenantId);
      return backsyncRangeToDays(s.backsyncRange);
    });

    // Kick off email sync with user-configured range
    await step.run("trigger-email-sync", async () => {
      await inngest.send({
        name: "email/sync-requested",
        data: { userId, tenantId, appUserId, daysBack },
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

/** Triggered after Microsoft OAuth completes — kicks off initial email+calendar sync */
export const onMicrosoftOAuthConnected = inngest.createFunction(
  {
    id: "microsoft-oauth-connected",
    name: "Handle Microsoft OAuth Connection",
    retries: 1,
    triggers: [{ event: "microsoft/oauth-connected" }],
  },
  async ({ event, step }: { event: { data: { userId: string; tenantId: string; appUserId: string } }; step: any }) => {
    const { userId, tenantId, appUserId } = event.data;

    // Reconnect clears any prior needs-reauth flag so the crons resume syncing.
    await step.run("clear-sync-health", async () => {
      await clearSyncHealth(tenantId, userId, "microsoft");
    });

    // Read backsync range from tenant settings
    const daysBack = await step.run("get-backsync-range", async () => {
      const s = await getTenantSettings(tenantId);
      return backsyncRangeToDays(s.backsyncRange);
    });

    // Kick off email sync with user-configured range
    await step.run("trigger-email-sync", async () => {
      await inngest.send({
        name: "email/sync-requested",
        data: { userId, tenantId, appUserId, daysBack, provider: "microsoft" },
      });
    });

    // Kick off calendar sync
    await step.run("trigger-calendar-sync", async () => {
      await inngest.send({
        name: "calendar/sync-requested",
        data: { userId, tenantId, appUserId, provider: "microsoft" },
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
    // Find all users with Google or Microsoft OAuth connected
    const connectedUsers = await step.run("find-connected-users", async () => {
      const accounts = await db
        .select({
          userId: authAccounts.userId,
          provider: authAccounts.provider,
        })
        .from(authAccounts)
        .where(
          sql`${authAccounts.provider} IN ('google', 'microsoft-entra-id')`
        );

      // Resolve tenant info for each
      const results: { userId: string; tenantId: string; appUserId: string; provider: string }[] = [];
      const tenantSettingsCache = new Map<string, unknown>();
      for (const account of accounts) {
        const [user] = await db
          .select({ id: users.id, tenantId: users.tenantId })
          .from(users)
          .where(eq(users.clerkId, account.userId))
          .limit(1);
        if (!user) continue;
        if (!tenantSettingsCache.has(user.tenantId)) {
          const [t] = await db
            .select({ settings: tenants.settings })
            .from(tenants)
            .where(eq(tenants.id, user.tenantId))
            .limit(1);
          tenantSettingsCache.set(user.tenantId, t?.settings ?? null);
        }
        // Skip connections flagged needs_reauth — don't dispatch sync for a
        // dead token. This is what stops the infinite 15-min retry loop.
        if (isNeedsReauth(tenantSettingsCache.get(user.tenantId), account.userId, account.provider)) continue;
        results.push({
          userId: account.userId,
          tenantId: user.tenantId,
          appUserId: user.id,
          provider: account.provider === "microsoft-entra-id" ? "microsoft" : "google",
        });
      }
      return results;
    });

    // Send sync events for each user with their provider
    await step.run("trigger-syncs", async () => {
      for (const user of connectedUsers) {
        await inngest.send([
          { name: "email/sync-requested", data: { userId: user.userId, tenantId: user.tenantId, appUserId: user.appUserId, daysBack: 1, provider: user.provider } },
          { name: "calendar/sync-requested", data: { userId: user.userId, tenantId: user.tenantId, appUserId: user.appUserId, provider: user.provider } },
        ]);
      }
    });

    // Direct IMAP/SMTP mailboxes have no authAccounts row — enumerate them
    // separately and poll each via the same email/sync-requested handler.
    const imapMailboxes = await step.run("find-imap-mailboxes", async () => {
      const rows = await db
        .select({ id: connectedMailboxes.id, tenantId: connectedMailboxes.tenantId })
        .from(connectedMailboxes)
        .where(and(eq(connectedMailboxes.provider, "smtp_custom"), eq(connectedMailboxes.status, "active")));
      const out: { mailboxId: string; tenantId: string; appUserId: string }[] = [];
      for (const mb of rows) {
        const [u] = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, mb.tenantId)).limit(1);
        out.push({ mailboxId: mb.id, tenantId: mb.tenantId, appUserId: u?.id ?? "" });
      }
      return out;
    });

    await step.run("trigger-imap-syncs", async () => {
      for (const mb of imapMailboxes) {
        await inngest.send({
          name: "email/sync-requested",
          data: { userId: mb.appUserId, tenantId: mb.tenantId, appUserId: mb.appUserId, daysBack: 1, provider: "smtp_custom", mailboxId: mb.mailboxId },
        });
      }
    });

    return { usersTriggered: connectedUsers.length, imapMailboxesTriggered: imapMailboxes.length };
  }
);
