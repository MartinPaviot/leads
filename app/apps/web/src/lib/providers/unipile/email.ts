/**
 * Unipile client — the Emails tag (emails, folders, drafts). Provided for client
 * completeness; NOT wired into Elevay's product, which uses its own email stack
 * (IMAP/SMTP/Gmail/Resend, spec 21). Available if a tenant ever connects a mailbox
 * through Unipile.
 */
import { unipileFetch, unipileMultipart, unipileFetchBinary, type UnipileConfig, type UnipileList, type UnipileFilePart } from "./http";

export interface EmailRecipient {
  identifier: string; // the email address
  display_name?: string;
}

export interface EmailListOptions {
  accountId: string;
  folder?: string;
  excludeFolders?: string[];
  from?: string;
  to?: string;
  anyEmail?: string;
  search?: string;
  threadId?: string;
  messageId?: string;
  metaOnly?: boolean;
  includeHeaders?: boolean;
  before?: string;
  after?: string;
  limit?: number;
  cursor?: string;
}

/** GET /emails — list synced emails (folder / search / time filters). */
export function listEmails(cfg: UnipileConfig, opts: EmailListOptions): Promise<UnipileList<Record<string, unknown>>> {
  const q = new URLSearchParams({ account_id: opts.accountId });
  if (opts.folder) q.set("folder", opts.folder);
  if (opts.excludeFolders?.length) q.set("exclude_folders", opts.excludeFolders.join(","));
  if (opts.from) q.set("from", opts.from);
  if (opts.to) q.set("to", opts.to);
  if (opts.anyEmail) q.set("any_email", opts.anyEmail);
  if (opts.search) q.set("search", opts.search);
  if (opts.threadId) q.set("thread_id", opts.threadId);
  if (opts.messageId) q.set("message_id", opts.messageId);
  if (opts.metaOnly != null) q.set("meta_only", String(opts.metaOnly));
  if (opts.includeHeaders != null) q.set("include_headers", String(opts.includeHeaders));
  if (opts.before) q.set("before", opts.before);
  if (opts.after) q.set("after", opts.after);
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  return unipileFetch(cfg, "GET", `/emails?${q.toString()}`);
}

/** GET /emails/{id} — a single email. */
export function getEmail(cfg: UnipileConfig, emailId: string, opts: { accountId?: string; includeHeaders?: boolean } = {}): Promise<Record<string, unknown>> {
  const q = new URLSearchParams();
  if (opts.accountId) q.set("account_id", opts.accountId);
  if (opts.includeHeaders != null) q.set("include_headers", String(opts.includeHeaders));
  const s = q.toString();
  return unipileFetch(cfg, "GET", `/emails/${encodeURIComponent(emailId)}${s ? `?${s}` : ""}`);
}

/** GET /emails/contacts — the account's email contacts. */
export function listEmailContacts(cfg: UnipileConfig, accountId: string, opts: { limit?: number; cursor?: string } = {}): Promise<UnipileList<Record<string, unknown>>> {
  const q = new URLSearchParams({ account_id: accountId });
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  return unipileFetch(cfg, "GET", `/emails/contacts?${q.toString()}`);
}

/** GET /emails/{id}/attachments/{aid} — download an email attachment (bytes). */
export function getEmailAttachment(cfg: UnipileConfig, emailId: string, attachmentId: string, accountId?: string): Promise<ArrayBuffer> {
  const q = accountId ? `?account_id=${encodeURIComponent(accountId)}` : "";
  return unipileFetchBinary(cfg, `/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}${q}`);
}

export interface SendEmailInput {
  accountId: string;
  to: EmailRecipient[];
  body: string;
  from?: EmailRecipient;
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  subject?: string;
  replyTo?: string;
  customHeaders?: Array<{ name: string; value: string }>;
  attachments?: UnipileFilePart[];
}

function emailForm(input: SendEmailInput): Record<string, unknown> {
  return {
    account_id: input.accountId,
    to: input.to,
    body: input.body,
    from: input.from,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    reply_to: input.replyTo,
    custom_headers: input.customHeaders,
  };
}

/** POST /emails — send an email (multipart; attachments optional). */
export function sendEmail(cfg: UnipileConfig, input: SendEmailInput): Promise<{ object?: string }> {
  return unipileMultipart(cfg, "POST", "/emails", emailForm(input), (input.attachments ?? []).map((part) => ({ field: "attachments", part })));
}

/** POST /drafts — create a draft (same body shape as send). */
export function createDraft(cfg: UnipileConfig, input: SendEmailInput): Promise<{ object?: string }> {
  return unipileMultipart(cfg, "POST", "/drafts", emailForm(input), (input.attachments ?? []).map((part) => ({ field: "attachments", part })));
}

/** PUT /emails/{id} — update an email's flags (unread / folders / categories). */
export function updateEmail(cfg: UnipileConfig, emailId: string, body: { unread?: boolean; folders?: string[]; categories?: string[] }, accountId?: string): Promise<{ object?: string }> {
  const q = accountId ? `?account_id=${encodeURIComponent(accountId)}` : "";
  return unipileFetch(cfg, "PUT", `/emails/${encodeURIComponent(emailId)}${q}`, body);
}

/** DELETE /emails/{id}. */
export function deleteEmail(cfg: UnipileConfig, emailId: string, accountId?: string): Promise<{ object?: string }> {
  const q = accountId ? `?account_id=${encodeURIComponent(accountId)}` : "";
  return unipileFetch(cfg, "DELETE", `/emails/${encodeURIComponent(emailId)}${q}`);
}

/** GET /folders — list the account's mail folders. */
export function listFolders(cfg: UnipileConfig, accountId?: string): Promise<UnipileList<Record<string, unknown>>> {
  const q = accountId ? `?account_id=${encodeURIComponent(accountId)}` : "";
  return unipileFetch(cfg, "GET", `/folders${q}`);
}

/** GET /folders/{id} — a single folder. */
export function getFolder(cfg: UnipileConfig, folderId: string, accountId?: string): Promise<Record<string, unknown>> {
  const q = accountId ? `?account_id=${encodeURIComponent(accountId)}` : "";
  return unipileFetch(cfg, "GET", `/folders/${encodeURIComponent(folderId)}${q}`);
}
