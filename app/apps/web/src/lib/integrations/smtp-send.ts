/**
 * Direct SMTP send for "smtp_custom" mailboxes — the EmailEngine-free outbound
 * path. Sends AS the user from their own mailbox (so replies thread back to
 * them and deliverability rides their domain), using a short-lived nodemailer
 * transport. Callable from an Inngest function (Vercel Node runtime allows the
 * outbound TLS socket to ports 465/587).
 */

import nodemailer from "nodemailer";

export interface SmtpCreds {
  emailAddress: string;
  smtpHost: string;
  smtpPort: number | null;
  /** Decrypted password (caller decrypts via settings-encryption). */
  password: string;
  displayName?: string | null;
}

export interface OutgoingMessage {
  to: string;
  /** Optional CC recipients, comma-separated. */
  cc?: string;
  subject: string;
  html?: string;
  text?: string;
  /** RFC Message-ID of the message we're replying to (threading). */
  inReplyTo?: string | null;
  references?: string | null;
}

function makeTransport(c: SmtpCreds) {
  const port = c.smtpPort || 465;
  return nodemailer.createTransport({
    host: c.smtpHost,
    port,
    // 465 = implicit TLS. 587/other = STARTTLS upgrade.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: c.emailAddress, pass: c.password },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
  });
}

/** Verify SMTP credentials (connect + auth) without sending. Throws on failure. */
export async function verifySmtp(c: SmtpCreds): Promise<void> {
  const t = makeTransport(c);
  try {
    await t.verify();
  } catch (err) {
    throw new Error(humanSmtpError(err));
  } finally {
    t.close();
  }
}

/** Send a message from the connected mailbox. Returns the sent Message-ID. */
export async function sendViaSmtp(
  c: SmtpCreds,
  msg: OutgoingMessage,
): Promise<{ messageId: string }> {
  const t = makeTransport(c);
  try {
    const from = c.displayName ? `"${c.displayName}" <${c.emailAddress}>` : c.emailAddress;
    const info = await t.sendMail({
      from,
      to: msg.to,
      cc: msg.cc || undefined,
      subject: msg.subject,
      html: msg.html,
      text: msg.text || stripHtml(msg.html || ""),
      inReplyTo: msg.inReplyTo || undefined,
      references: msg.references || msg.inReplyTo || undefined,
    });
    return { messageId: info.messageId };
  } catch (err) {
    throw new Error(humanSmtpError(err));
  } finally {
    t.close();
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function humanSmtpError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("invalid login") || msg.includes("auth") || msg.includes("535") || msg.includes("credentials") || msg.includes("password")) {
    return "SMTP login failed — check the email and password (use an app-specific password if 2FA is on).";
  }
  if (msg.includes("enotfound") || msg.includes("getaddrinfo") || msg.includes("dns")) {
    return "Couldn't resolve the SMTP server — check the outgoing server host.";
  }
  if (msg.includes("econnrefused") || msg.includes("timeout") || msg.includes("etimedout")) {
    return "Couldn't reach the SMTP server on that port — check the host and port (465 or 587).";
  }
  if (msg.includes("certificate") || msg.includes("tls") || msg.includes("ssl")) {
    return "TLS handshake with the SMTP server failed — confirm the port (465 for SSL, 587 for STARTTLS).";
  }
  return "Couldn't send via the SMTP server — double-check the host, port and password.";
}
