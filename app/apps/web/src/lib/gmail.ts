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

  // Handle token refresh
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db
        .update(authAccounts)
        .set({ access_token: tokens.access_token })
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
  subject: string;
  snippet: string;
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
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value || "";

      const from = getHeader("from");
      const to = getHeader("to")
        .split(",")
        .map((t) => t.trim());
      const subject = getHeader("subject");
      const dateStr = getHeader("date");

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
        subject,
        snippet: detail.data.snippet || "",
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
