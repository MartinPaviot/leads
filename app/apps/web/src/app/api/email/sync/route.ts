import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities, contacts, companies, users, tenants, connectedMailboxes, authAccounts } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { fetchRecentEmails } from "@/lib/integrations/gmail";
import { ingestEpisode } from "@/lib/ai/context-graph";
import { embedEntity } from "@/lib/ai/embeddings";
import { getTenantSettings, backsyncRangeToDays, buildIgnoredDomains, shouldAutoCreateContact } from "@/lib/config/tenant-settings";
import { recordCapturedActivity, getCaptureApprovalMode } from "@/lib/capture/approval";
import { inngest } from "@/inngest/client";

export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // "Force sync now" used to run ONLY the inline Gmail path below, so an
  // IMAP/SMTP ("Other provider") or Microsoft mailbox — the page's headline
  // feature for self-hosted mail — silently did nothing and the user got a
  // misleading "not connected". Dispatch the real sync worker (the same
  // `email/sync-requested` handler the 15-min cron uses) for every non-Gmail
  // mailbox the user owns; the inline Gmail block still runs synchronously so
  // the common Google case can report real counts in the toast.
  let dispatched = 0;

  try {
    // Look up user email for direction detection
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, authCtx.appUserId)).limit(1);
    const userEmail = user?.email || "";

    // Load tenant settings for sync preferences
    const settings = await getTenantSettings(authCtx.tenantId);
    const ownDomain = (settings.companyDomain || "").toLowerCase().replace(/^www\./, "");
    const ignoredDomains = buildIgnoredDomains(settings, ownDomain);
    const creationMode = settings.contactCreationMode || "selective";
    const daysBack = backsyncRangeToDays(settings.backsyncRange);

    // ── Non-Gmail mailboxes → dispatch the Inngest sync worker ──────────
    // IMAP/SMTP mailboxes (provider "smtp_custom") are polled by mailboxId;
    // Microsoft mailboxes by the OAuth identity. Both run through the exact
    // same handler the cron uses, so force-sync is now provider-complete.
    const customMailboxes = await db
      .select({ id: connectedMailboxes.id })
      .from(connectedMailboxes)
      .where(
        and(
          eq(connectedMailboxes.tenantId, authCtx.tenantId),
          eq(connectedMailboxes.userId, authCtx.userId),
          eq(connectedMailboxes.provider, "smtp_custom"),
        ),
      );
    for (const mb of customMailboxes) {
      await inngest
        .send({
          name: "email/sync-requested",
          data: {
            userId: authCtx.userId,
            tenantId: authCtx.tenantId,
            appUserId: authCtx.appUserId,
            daysBack,
            provider: "smtp_custom",
            mailboxId: mb.id,
          },
        })
        .then(() => { dispatched++; })
        .catch((e) => console.warn("force-sync: IMAP dispatch failed (non-blocking)", e));
    }

    const msAccounts = await db
      .select({ providerAccountId: authAccounts.providerAccountId })
      .from(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, authCtx.userId),
          eq(authAccounts.provider, "microsoft-entra-id"),
        ),
      );
    for (const _ms of msAccounts) {
      await inngest
        .send({
          name: "email/sync-requested",
          data: {
            userId: authCtx.userId,
            tenantId: authCtx.tenantId,
            appUserId: authCtx.appUserId,
            daysBack,
            provider: "microsoft",
          },
        })
        .then(() => { dispatched++; })
        .catch((e) => console.warn("force-sync: Microsoft dispatch failed (non-blocking)", e));
    }
    // Capture-approval mode (gap E) — read once from the raw tenant
    // settings; 'auto' inserts directly (default), 'review' queues.
    const [tenantRow] = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, authCtx.tenantId))
      .limit(1);
    const captureMode = getCaptureApprovalMode(tenantRow?.settings as Record<string, unknown> | null);

    const emails = await fetchRecentEmails(
      authCtx.userId,
      userEmail,
      daysBack
    );

    // Get all contacts for email matching
    const allContacts = await db.select().from(contacts).where(and(eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));
    const contactByEmail = new Map(
      allContacts
        .filter((c) => c.email)
        .map((c) => [c.email!.toLowerCase(), c])
    );

    // Get all companies for domain matching
    const allCompanies = await db.select().from(companies).where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)));
    const companyByDomain = new Map(
      allCompanies
        .filter((c) => c.domain)
        .map((c) => [c.domain!.toLowerCase().replace(/^www\./, ""), c])
    );

    let created = 0;
    let skipped = 0;
    let contactsCreated = 0;
    let companiesCreated = 0;

    for (const email of emails) {
      // Dedup by gmailMessageId — use raw SQL for JSONB containment
      const existing = await db.select({ id: activities.id }).from(activities)
        .where(and(
          eq(activities.tenantId, authCtx.tenantId),
          eq(activities.channel, "email"),
          eq(activities.summary, email.subject),
        ))
        .limit(1);

      // More robust dedup: check if we already have this message ID
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Match email to contact
      const relevantEmail =
        email.direction === "inbound"
          ? extractEmailFromHeader(email.from)
          : email.to.map(extractEmailFromHeader).find((e) => contactByEmail.has(e.toLowerCase()));

      let matchedContact = relevantEmail
        ? contactByEmail.get(relevantEmail.toLowerCase())
        : null;

      // Auto-create contact + company from email domain
      const counterpartyEmail = email.direction === "inbound"
        ? extractEmailFromHeader(email.from)
        : email.to.map(extractEmailFromHeader)[0];

      if (
        !matchedContact &&
        counterpartyEmail &&
        shouldAutoCreateContact(creationMode, email.direction as "inbound" | "outbound")
      ) {
        const domain = counterpartyEmail.split("@")[1]?.toLowerCase();

        if (domain && !ignoredDomains.has(domain)) {
          // Find or create company by domain
          let company = companyByDomain.get(domain.replace(/^www\./, ""));
          if (!company) {
            const [newCompany] = await db.insert(companies).values({
              tenantId: authCtx.tenantId,
              name: domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1),
              domain,
            }).returning();
            company = newCompany;
            companyByDomain.set(domain, company);
            companiesCreated++;
          }

          // Create contact from email header
          const nameFromHeader = extractNameFromHeader(
            email.direction === "inbound" ? email.from : email.to[0]
          );
          const [newContact] = await db.insert(contacts).values({
            tenantId: authCtx.tenantId,
            firstName: nameFromHeader.firstName,
            lastName: nameFromHeader.lastName,
            email: counterpartyEmail,
            companyId: company.id,
          }).returning();
          matchedContact = newContact;
          contactByEmail.set(counterpartyEmail.toLowerCase(), newContact);
          contactsCreated++;
        }
      }

      // Determine entity — link to contact if matched, else company
      const entityType = matchedContact ? "contact" : "company";
      const entityId = matchedContact?.id || "unknown";

      await recordCapturedActivity({
        tenantId: authCtx.tenantId,
        mode: captureMode,
        kind: "email",
        sourceRef: email.gmailMessageId,
        activity: {
          tenantId: authCtx.tenantId,
          actorType: email.direction === "inbound" ? "contact" : "user",
          actorId:
            email.direction === "inbound"
              ? matchedContact?.id || null
              : authCtx.userId,
          entityType,
          entityId,
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
            cc: email.cc,
            snippet: email.snippet,
            body: email.body,
          },
        },
      });

      // Embed the email for RAG search
      if (email.body && process.env.OPENAI_API_KEY) {
        try {
          const textToEmbed = `Email: ${email.subject}\nFrom: ${email.from}\nTo: ${email.to.join(", ")}\n\n${email.body.slice(0, 5000)}`;
          await embedEntity(authCtx.tenantId, entityType, entityId + "-email-" + email.gmailMessageId, textToEmbed);
        } catch {
          // Non-critical — embedding failure shouldn't block sync
        }
      }

      // Ingest into context graph (async, non-blocking)
      if (email.body) {
        const graphContent = `Email from ${email.from} to ${email.to.join(", ")}:\nSubject: ${email.subject}\n\n${email.body.slice(0, 3000)}`;
        ingestEpisode(authCtx.tenantId, graphContent, "email", email.gmailMessageId)
          .catch((e) => console.warn("email/sync: ingestEpisode failed (non-blocking)", e));
      }

      created++;
    }

    return Response.json({
      success: true,
      created,
      skipped,
      contactsCreated,
      companiesCreated,
      total: emails.length,
      dispatched,
    });
  } catch (error) {
    console.error("Email sync failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";

    // Gmail not connected is not a server error. If we already dispatched a
    // sync for an IMAP/SMTP or Microsoft mailbox, the force-sync DID start —
    // report that instead of the misleading "connect Google" message.
    if (message === "Gmail not connected") {
      if (dispatched > 0) {
        return Response.json(
          { status: "started", dispatched, message: `Syncing ${dispatched} mailbox${dispatched > 1 ? "es" : ""}…` },
          { status: 200 }
        );
      }
      return Response.json(
        { status: "not_connected", message: "No mailbox is connected. Connect an account in Settings → Mail & Calendar first." },
        { status: 200 }
      );
    }

    return Response.json({ error: `Sync failed: ${message}` }, { status: 500 });
  }
}

function extractEmailFromHeader(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return match ? match[1] : header.trim();
}

function extractNameFromHeader(header: string): { firstName: string; lastName: string } {
  // "John Doe <john@example.com>" → { firstName: "John", lastName: "Doe" }
  const nameMatch = header.match(/^([^<]+)</);
  if (nameMatch) {
    const parts = nameMatch[1].trim().replace(/"/g, "").split(/\s+/);
    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || "",
    };
  }
  // Fallback: use email prefix
  const email = extractEmailFromHeader(header);
  const prefix = email.split("@")[0] || "";
  const parts = prefix.split(/[._-]/);
  return {
    firstName: parts[0]?.charAt(0).toUpperCase() + (parts[0]?.slice(1) || ""),
    lastName: parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : "",
  };
}
