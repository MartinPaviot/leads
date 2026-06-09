import { google } from "googleapis";
import { db } from "@/db";
import { authAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  // Handle token refresh — persist new access_token and expiry to DB
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      const updates: Record<string, unknown> = { access_token: tokens.access_token };
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

/**
 * Send an email AS the user via the Gmail API (requires the gmail.send
 * scope — see lib/emails/oauth-send-scope.ts; callers gate on it). Builds
 * a UTF-8 RFC822 message (RFC2047-encoded subject so accents survive) and
 * base64url-encodes it for users.messages.send. Throws on failure so the
 * caller can fall back to Resend + flag needs_reauth.
 */
export async function sendViaGmail(
  userId: string,
  msg: { to: string; cc?: string[]; subject: string; text: string },
): Promise<{ messageId: string }> {
  const gmail = await getGmailClient(userId);
  if (!gmail) throw new Error("Gmail not connected");

  const lines = [
    `To: ${msg.to}`,
    ...(msg.cc && msg.cc.length > 0 ? [`Cc: ${msg.cc.join(", ")}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(msg.subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(msg.text, "utf-8").toString("base64"),
  ];
  const raw = Buffer.from(lines.join("\r\n"), "utf-8").toString("base64url");

  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return { messageId: res.data.id || "" };
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
  date: Date;
  direction: "inbound" | "outbound";
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

      // Extract full body from the payload
      const body = extractBodyFromPayload(detail.data.payload);

      // Determine direction: if user's email is in the From field → outbound
      const fromEmail = extractEmail(from);
      const direction =
        fromEmail.toLowerCase() === userEmail.toLowerCase()
          ? "outbound"
          : "inbound";

      emails.push({
        gmailMessageId: msg.id,
        threadId: msg.threadId || "",
        from,
        to,
        cc,
        subject,
        snippet: detail.data.snippet || "",
        body: body.slice(0, 50000), // cap at 50k chars
        date: dateStr ? new Date(dateStr) : new Date(),
        direction,
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
