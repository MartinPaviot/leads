/**
 * Direct IMAP capture for "smtp_custom" mailboxes (Zimbra, Infomaniak, OVH,
 * Gandi, any IMAP host) — the EmailEngine-free path.
 *
 * Continuity: this mirrors `gmail.ts#fetchRecentEmails` — same `SyncedEmail`
 * shape, fed into the SAME ingestion pipeline (`inngest/sync-functions.ts`),
 * driven by the SAME `cron-sync-emails`. The only difference is the transport:
 * a short-lived `imapflow` TLS connection (works inside a Vercel Node function;
 * no persistent IDLE, we poll) instead of the Gmail API.
 *
 * Incremental: we track the highest INBOX UID seen (`connected_mailboxes
 * .imap_last_uid`) so each poll only fetches new mail. First run (no last UID)
 * falls back to a date window. Capped per run so a huge backlog pages across
 * successive cron ticks instead of blowing the function timeout.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { SyncedEmail } from "./gmail";
import { attachmentsFromImap } from "@/lib/inbox/attachment-meta";

/** Max messages pulled in a single poll — a large backlog pages over ticks. */
const MAX_PER_RUN = 150;

export interface ImapMailbox {
  emailAddress: string;
  imapHost: string;
  imapPort: number | null;
  /** Decrypted password (caller decrypts via settings-encryption). */
  password: string;
  imapLastUid?: number | null;
}

/** Minimal shape of the imapflow ENVELOPE — server-parsed, no mailparser needed. */
interface ImapEnvelopeAddress {
  name?: string;
  address?: string;
}
interface ImapEnvelope {
  date?: Date;
  subject?: string;
  messageId?: string;
  inReplyTo?: string;
  from?: ImapEnvelopeAddress[];
  to?: ImapEnvelopeAddress[];
  cc?: ImapEnvelopeAddress[];
}

function formatEnvelopeAddr(a: ImapEnvelopeAddress | undefined): string {
  if (!a) return "";
  if (a.name && a.address) return `${a.name} <${a.address}>`;
  return a.address || a.name || "";
}

function envelopeAddrList(arr: ImapEnvelopeAddress[] | undefined): string[] {
  if (!arr) return [];
  return arr.map((a) => (a.address || "").toLowerCase()).filter(Boolean);
}

/**
 * Build a degraded `SyncedEmail` from the IMAP ENVELOPE when mailparser throws on
 * the raw MIME (INBOX-R09). Records headers/subject/from/to with a null HTML body
 * and a marker header — capture-degraded so the message still appears in the inbox
 * and in CRM last-interaction, instead of being silently dropped.
 */
function degradedFromEnvelope(
  env: ImapEnvelope | undefined,
  uid: number,
  mailboxEmail: string,
): SyncedEmail {
  const fromAddr = (env?.from?.[0]?.address || "").toLowerCase();
  const direction: "inbound" | "outbound" =
    fromAddr === mailboxEmail.toLowerCase() ? "outbound" : "inbound";
  return {
    gmailMessageId: env?.messageId || `imap-${mailboxEmail}-${uid}`,
    threadId: env?.inReplyTo || env?.messageId || "",
    from: formatEnvelopeAddr(env?.from?.[0]),
    to: envelopeAddrList(env?.to),
    cc: envelopeAddrList(env?.cc),
    subject: env?.subject || "(unreadable message)",
    snippet: "",
    body: "",
    html: null,
    date: env?.date || new Date(),
    direction,
    headers: { "x-elevay-capture": "degraded" },
  };
}

function makeClient(m: { imapHost: string; imapPort: number | null; emailAddress: string; password: string }) {
  const port = m.imapPort || 993;
  return new ImapFlow({
    host: m.imapHost,
    port,
    // 993 = implicit TLS. 143/other = upgrade via STARTTLS (secure:false lets
    // imapflow negotiate it). Servers without TLS at all are rejected.
    secure: port === 993,
    auth: { user: m.emailAddress, pass: m.password },
    logger: false,
    // Bound the handshake so a wrong host doesn't hang the function.
    socketTimeout: 20_000,
  });
}

/**
 * Verify IMAP credentials by connecting and opening INBOX. Throws a
 * human-readable error on failure (used by the connect route so the user
 * learns immediately their server/port/password is wrong — instead of the
 * old silent "mailbox saved but nothing syncs").
 */
export async function verifyImap(m: {
  imapHost: string;
  imapPort: number | null;
  emailAddress: string;
  password: string;
}): Promise<void> {
  const client = makeClient(m);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
  } catch (err) {
    throw new Error(humanImapError(err));
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fetch new INBOX messages for a mailbox, mapped to `SyncedEmail`. Returns the
 * emails plus the highest UID seen so the caller can persist `imap_last_uid`.
 */
export async function fetchRecentEmailsImap(
  m: ImapMailbox,
  daysBack = 30,
): Promise<{ emails: SyncedEmail[]; maxUid: number | null }> {
  const client = makeClient(m);
  const emails: SyncedEmail[] = [];
  let maxUid: number | null = m.imapLastUid ?? null;

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    // Build the UID range. With a known last UID we fetch strictly-newer mail;
    // first run uses a date window so we don't import an entire mailbox at once.
    const lastUid = m.imapLastUid ?? 0;
    const range = lastUid > 0 ? `${lastUid + 1}:*` : undefined;
    const since = new Date(Date.now() - daysBack * 86_400_000);

    const query = range ? range : { since };

    let count = 0;
    for await (const msg of client.fetch(
      query,
      { uid: true, source: true, envelope: true },
      { uid: !!range },
    )) {
      // The `lastUid+1:*` range can re-return the last message on some servers;
      // guard with an explicit uid check.
      if (lastUid > 0 && msg.uid <= lastUid) continue;
      if (msg.uid > (maxUid ?? 0)) maxUid = msg.uid;

      if (!msg.source) continue;
      let parsed;
      try {
        parsed = await simpleParser(msg.source);
      } catch {
        // Capture-degraded instead of silent drop (INBOX-R09): build a record
        // from the server-parsed ENVELOPE (no mailparser needed) so the message
        // still lands in the inbox + CRM last-interaction. bodyHtml is null.
        emails.push(degradedFromEnvelope((msg as { envelope?: ImapEnvelope }).envelope, msg.uid, m.emailAddress));
        if (++count >= MAX_PER_RUN) break;
        continue;
      }

      const fromText = parsed.from?.text || "";
      const toList = addressList(parsed.to);
      const ccList = addressList(parsed.cc);
      const fromEmail = (parsed.from?.value?.[0]?.address || "").toLowerCase();
      const direction: "inbound" | "outbound" =
        fromEmail === m.emailAddress.toLowerCase() ? "outbound" : "inbound";
      // Keep text and HTML apart: `body` (text-preferred) feeds the snippet and
      // text fallback, while the original `html` part is retained for the reading
      // pane to render with fidelity (INBOX-R01/R13). HTML-only mail degrades to
      // a tag-stripped preview so the list snippet stays readable.
      const text = (parsed.text || "").toString();
      const html = (parsed.html || "").toString();
      const body = text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      // Inbound meeting invite: retain the raw text/calendar (.ics) part so the
      // reading pane can render an inline event card + accept/decline (INBOX-R12/CAL).
      const calendar =
        parsed.attachments?.find((a) => /^text\/calendar/i.test(a.contentType || ""))?.content?.toString("utf8") || null;
      // Attachment metadata (filename/type/size/inline) for the reading pane (INBOX-R04).
      const attachments = attachmentsFromImap(parsed.attachments);

      // Normalise mailparser's header Map to a lower-cased record so the
      // inbound classifier can read List-Unsubscribe / Precedence / Auto-Submitted.
      const headerRecord: Record<string, string> = {};
      if (parsed.headers) {
        for (const [k, v] of parsed.headers) {
          headerRecord[String(k).toLowerCase()] = Array.isArray(v)
            ? v.map((x) => String(x)).join(", ")
            : String(v ?? "");
        }
      }

      emails.push({
        // Stable dedup key: the RFC Message-ID, else a synthetic UID key.
        gmailMessageId: parsed.messageId || `imap-${m.emailAddress}-${msg.uid}`,
        threadId: parsed.inReplyTo || parsed.messageId || "",
        from: fromText,
        to: toList,
        cc: ccList,
        subject: parsed.subject || "",
        snippet: body.slice(0, 200),
        body,
        html: html || null,
        date: parsed.date || new Date(),
        direction,
        headers: Object.keys(headerRecord).length ? headerRecord : null,
        calendar,
        attachments: attachments.length ? attachments : undefined,
      });

      if (++count >= MAX_PER_RUN) break;
    }
  } finally {
    lock.release();
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  return { emails, maxUid };
}

function addressList(
  a: import("mailparser").AddressObject | import("mailparser").AddressObject[] | undefined,
): string[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  const out: string[] = [];
  for (const obj of arr) {
    for (const v of obj.value || []) {
      if (v.address) out.push(v.address);
    }
  }
  return out;
}

/** Map raw IMAP/socket errors to actionable user-facing messages. */
function humanImapError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("authentication") || msg.includes("auth") || msg.includes("login") || msg.includes("credentials")) {
    return "IMAP login failed — check the email address and password (use an app-specific password if 2FA is on).";
  }
  if (msg.includes("enotfound") || msg.includes("getaddrinfo") || msg.includes("dns")) {
    return "Couldn't resolve the IMAP server — check the incoming server host.";
  }
  if (msg.includes("econnrefused") || msg.includes("timeout") || msg.includes("etimedout")) {
    return "Couldn't reach the IMAP server on that port — check the host and port (usually 993).";
  }
  if (msg.includes("certificate") || msg.includes("tls") || msg.includes("ssl")) {
    return "TLS handshake with the IMAP server failed — confirm the port (993 for SSL).";
  }
  return "Couldn't connect to the IMAP server — double-check the host, port and password.";
}
