import { google } from "googleapis";
import { db } from "@/db";
import { authAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  decryptOAuthToken,
  encryptOAuthToken,
} from "@/lib/crypto/oauth-token-crypto";
import { attachmentsFromGmailPayload, type AttachmentMeta } from "@/lib/inbox/attachment-meta";

export async function getGmailClient(userId: string) {
  // Get Google OAuth tokens from the database
  const [account] = await db
    .select()
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.userId, userId),
        eq(authAccounts.provider, "google")
      )
    )
    .limit(1);

  if (!account?.access_token) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: decryptOAuthToken(account.access_token),
    refresh_token: decryptOAuthToken(account.refresh_token),
  });

  // Handle token refresh — persist new access_token (encrypted) and expiry to DB
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      const updates: Record<string, unknown> = {
        access_token: encryptOAuthToken(tokens.access_token),
      };
      if (tokens.expiry_date) {
        updates.expires_at = Math.floor(tokens.expiry_date / 1000);
      }
      await db
        .update(authAccounts)
        .set(updates)
        .where(
          and(
            eq(authAccounts.userId, userId),
            eq(authAccounts.provider, "google")
          )
        );
    }
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export interface SyncedEmail {
  gmailMessageId: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string;
  body: string;
  /** Original `text/html` part, when the transport exposes it (IMAP today).
   *  Retained so the reading pane can render real HTML (INBOX-R01/R13); absent
   *  ⇒ the pane falls back to the text body. */
  html?: string | null;
  date: Date;
  direction: "inbound" | "outbound";
  /** Raw RFC headers (lower-cased keys) when the transport exposes them —
   *  drives machine-sent detection (List-Unsubscribe, Precedence, …). */
  headers?: Record<string, string> | null;
  /** Raw `text/calendar` (.ics) part of an inbound meeting invite, when present.
   *  Parsed by parseIcs for the inline event card + accept/decline (INBOX-R12/CAL). */
  calendar?: string | null;
  /** Attachment metadata (filename/type/size/inline) for the reading pane (INBOX-R04). */
  attachments?: AttachmentMeta[];
}

export async function fetchRecentEmails(
  userId: string,
  userEmail: string,
  daysBack: number = 30
): Promise<SyncedEmail[]> {
  const gmail = await getGmailClient(userId);
  if (!gmail) throw new Error("Gmail not connected");

  const after = Math.floor(
    (Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000
  );

  // Fetch message list
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: `after:${after}`,
    maxResults: 200,
  });

  const messages = listRes.data.messages || [];
  const emails: SyncedEmail[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    try {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value || "";

      const from = getHeader("from");
      const to = getHeader("to")
        .split(",")
        .map((t) => t.trim());
      const cc = getHeader("cc")
        ? getHeader("cc").split(",").map((t) => t.trim())
        : [];
      const subject = getHeader("subject");
      const dateStr = getHeader("date");

      // Extract full body from the payload (text for snippet/fallback, and the
      // original HTML part for fidelity rendering — INBOX-R01/R13).
      const body = extractBodyFromPayload(detail.data.payload);
      const html = extractHtmlFromPayload(detail.data.payload);
      const calendar = extractCalendarFromPayload(detail.data.payload);
      const attachments = attachmentsFromGmailPayload(detail.data.payload);

      // Determine direction: if user's email is in the From field → outbound
      const fromEmail = extractEmail(from);
      const direction =
        fromEmail.toLowerCase() === userEmail.toLowerCase()
          ? "outbound"
          : "inbound";

      // Normalise Gmail's {name,value}[] headers to a lower-cased record so the
      // inbound classifier can read List-Unsubscribe / Precedence / Auto-Submitted.
      const headerRecord: Record<string, string> = {};
      for (const h of headers) {
        if (h.name && h.value) headerRecord[h.name.toLowerCase()] = h.value;
      }

      emails.push({
        gmailMessageId: msg.id,
        threadId: msg.threadId || "",
        from,
        to,
        cc,
        subject,
        snippet: detail.data.snippet || "",
        body: body.slice(0, 50000), // cap at 50k chars
        html: html ? html.slice(0, 500000) : null,
        date: dateStr ? new Date(dateStr) : new Date(),
        direction,
        headers: Object.keys(headerRecord).length ? headerRecord : null,
        calendar: calendar ? calendar.slice(0, 100000) : null,
        attachments: attachments.length ? attachments : undefined,
      });
    } catch (err) {
      // Skip messages that fail to fetch (deleted, etc.)
      console.warn(`Failed to fetch message ${msg.id}:`, err);
    }
  }

  return emails;
}

function extractEmail(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return match ? match[1] : header.trim();
}

/** Recursively extract text body from Gmail message payload */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBodyFromPayload(payload: any): string {
  if (!payload) return "";

  // Direct body data on this part
  if (payload.body?.data) {
    const mimeType = (payload.mimeType || "").toLowerCase();
    if (mimeType === "text/plain" || mimeType === "text/html") {
      const decoded = Buffer.from(payload.body.data, "base64url").toString("utf-8");
      if (mimeType === "text/html") {
        // Strip HTML tags for plain text storage
        return decoded.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
      return decoded;
    }
  }

  // Multipart: prefer text/plain, fall back to text/html
  if (payload.parts && Array.isArray(payload.parts)) {
    // First pass: look for text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }
    // Second pass: look for text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64url").toString("utf-8");
        return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const nested = extractBodyFromPayload(part);
      if (nested) return nested;
    }
  }

  return "";
}

/**
 * Recursively extract the ORIGINAL `text/html` part (un-stripped) from a Gmail
 * payload, for fidelity rendering in the reading pane (INBOX-R01/R13). Returns
 * "" when the message has no HTML part. Sanitization happens at capture + render,
 * never here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractHtmlFromPayload(payload: any): string {
  if (!payload) return "";

  if (payload.body?.data && (payload.mimeType || "").toLowerCase() === "text/html") {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      const nested = extractHtmlFromPayload(part);
      if (nested) return nested;
    }
  }

  return "";
}

/**
 * Recursively extract the raw `text/calendar` (.ics) part from a Gmail payload,
 * for inline meeting-invite rendering in the reading pane (INBOX-R12/CAL). Returns
 * "" when the message carries no calendar part. Only inline parts (body.data) are
 * read; an .ics delivered as a fetch-only attachment is a residual.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractCalendarFromPayload(payload: any): string {
  if (!payload) return "";
  const mime = (payload.mimeType || "").toLowerCase();
  if (payload.body?.data && (mime.startsWith("text/calendar") || mime === "application/ics")) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const found = extractCalendarFromPayload(part);
      if (found) return found;
    }
  }
  return "";
}
