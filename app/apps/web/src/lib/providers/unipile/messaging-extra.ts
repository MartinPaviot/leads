/**
 * Unipile client — the rest of the Messaging tag beyond the chat read/send
 * primitives in http.ts: global message list, single message get/edit/delete,
 * message reactions/forward, attachment download, chat sync/delete/patch, and
 * the chat-attendee routes.
 */
import {
  unipileFetch,
  unipileFetchBinary,
  type UnipileConfig,
  type UnipileList,
  type UnipileMessage,
  type UnipileChat,
  type UnipileChatAttendee,
} from "./http";

function listQuery(opts: { accountId?: string; limit?: number; cursor?: string; before?: string; after?: string; senderId?: string }): string {
  const q = new URLSearchParams();
  if (opts.accountId) q.set("account_id", opts.accountId);
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  if (opts.before) q.set("before", opts.before);
  if (opts.after) q.set("after", opts.after);
  if (opts.senderId) q.set("sender_id", opts.senderId);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** GET /messages — list messages across all chats (global inbox poll / backfill). */
export function listAllMessages(
  cfg: UnipileConfig,
  opts: { accountId?: string; senderId?: string; before?: string; after?: string; limit?: number; cursor?: string } = {},
): Promise<UnipileList<UnipileMessage>> {
  return unipileFetch(cfg, "GET", `/messages${listQuery(opts)}`);
}

/** GET /messages/{id} — a single message by Unipile or provider id. */
export function getMessage(cfg: UnipileConfig, messageId: string): Promise<UnipileMessage> {
  return unipileFetch(cfg, "GET", `/messages/${encodeURIComponent(messageId)}`);
}

/** DELETE /messages/{id} — delete a message. */
export function deleteMessage(cfg: UnipileConfig, messageId: string): Promise<{ object?: string }> {
  return unipileFetch(cfg, "DELETE", `/messages/${encodeURIComponent(messageId)}`);
}

/** PATCH /messages/{id} — edit a message's text. */
export function editMessage(cfg: UnipileConfig, messageId: string, text: string): Promise<{ object?: string }> {
  return unipileFetch(cfg, "PATCH", `/messages/${encodeURIComponent(messageId)}`, { text });
}

/** POST /messages/{id}/reaction — react to a message (e.g. an emoji value). */
export function reactToMessage(cfg: UnipileConfig, messageId: string, reaction: string): Promise<{ object?: string }> {
  return unipileFetch(cfg, "POST", `/messages/${encodeURIComponent(messageId)}/reaction`, { reaction });
}

/** POST /messages/{id}/forward — forward a message into another chat. */
export function forwardMessage(cfg: UnipileConfig, messageId: string, chatId: string): Promise<{ object?: string }> {
  return unipileFetch(cfg, "POST", `/messages/${encodeURIComponent(messageId)}/forward`, { chat_id: chatId });
}

/** GET /messages/{id}/attachments/{aid} — download an inbound message attachment (bytes). */
export function getMessageAttachment(cfg: UnipileConfig, messageId: string, attachmentId: string): Promise<ArrayBuffer> {
  return unipileFetchBinary(cfg, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
}

/** GET /chats/{id}/sync — re-synchronize a single conversation from its beginning. */
export function syncChat(cfg: UnipileConfig, chatId: string): Promise<{ object?: string; status?: string }> {
  return unipileFetch(cfg, "GET", `/chats/${encodeURIComponent(chatId)}/sync`);
}

/** DELETE /chats/{id} — delete a chat. */
export function deleteChat(cfg: UnipileConfig, chatId: string): Promise<{ object?: string }> {
  return unipileFetch(cfg, "DELETE", `/chats/${encodeURIComponent(chatId)}`);
}

export type ChatPatchAction =
  | "setReadStatus"
  | "setMuteStatus"
  | "setArchiveStatus"
  | "setPinnedStatus"
  | "addParticipant"
  | "removeParticipant";

/** PATCH /chats/{id} — mutate a chat (mark read, mute, archive, pin, add/remove participant). */
export function patchChat(cfg: UnipileConfig, chatId: string, action: ChatPatchAction, value?: unknown): Promise<{ object?: string }> {
  return unipileFetch(cfg, "PATCH", `/chats/${encodeURIComponent(chatId)}`, value === undefined ? { action } : { action, value });
}

/** GET /chat_attendees — list all attendees the connected account has seen. */
export function listAllAttendees(cfg: UnipileConfig, opts: { accountId?: string; limit?: number; cursor?: string } = {}): Promise<UnipileList<UnipileChatAttendee>> {
  return unipileFetch(cfg, "GET", `/chat_attendees${listQuery(opts)}`);
}

/** GET /chat_attendees/{id} — retrieve one attendee. */
export function getAttendee(cfg: UnipileConfig, attendeeId: string, accountId?: string): Promise<UnipileChatAttendee> {
  const q = accountId ? `?account_id=${encodeURIComponent(accountId)}` : "";
  return unipileFetch(cfg, "GET", `/chat_attendees/${encodeURIComponent(attendeeId)}${q}`);
}

/** GET /chat_attendees/{id}/picture — download an attendee's profile picture (bytes). */
export function getAttendeePicture(cfg: UnipileConfig, attendeeId: string): Promise<ArrayBuffer> {
  return unipileFetchBinary(cfg, `/chat_attendees/${encodeURIComponent(attendeeId)}/picture`);
}

/** GET /chat_attendees/{id}/chats — the 1:1 chats for a given attendee. */
export function listAttendeeChats(cfg: UnipileConfig, attendeeId: string, opts: { accountId?: string; limit?: number; cursor?: string; before?: string; after?: string } = {}): Promise<UnipileList<UnipileChat>> {
  return unipileFetch(cfg, "GET", `/chat_attendees/${encodeURIComponent(attendeeId)}/chats${listQuery(opts)}`);
}

/** GET /chat_attendees/{id}/messages — messages for a given attendee. */
export function listAttendeeMessages(cfg: UnipileConfig, attendeeId: string, opts: { accountId?: string; limit?: number; cursor?: string; before?: string; after?: string } = {}): Promise<UnipileList<UnipileMessage>> {
  return unipileFetch(cfg, "GET", `/chat_attendees/${encodeURIComponent(attendeeId)}/messages${listQuery(opts)}`);
}
