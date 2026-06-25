/**
 * Spec 36 (T7) — the LIVE UnipileClient the UnipileAdapter calls. Implements the
 * three send primitives against the real API: invitations as JSON, chats as
 * multipart/form-data (POST /chats and POST /chats/{id}/messages are multipart,
 * and InMail rides `linkedin[inmail]`/`linkedin[api]` form fields — per the API
 * completeness pass). The form-entry builders are pure + unit-tested; `fetch` is
 * injectable so tests run without a network. Server-only.
 *
 * The exact multipart field names are documented but not yet runtime-verified
 * (T12 first-live-action confirms them) — kept in one place to adjust fast.
 */

import { UnipileApiError, type UnipileClient, type UnipileNewChatPayload, type UnipileReplyPayload, type UnipileInvitePayload, type UnipileActionResponse } from "./client";
import { unipileApiBase, type UnipileConfig } from "./http";

/** Multipart entries for POST /chats (start a new chat / InMail). Pure. */
export function startChatFormEntries(p: UnipileNewChatPayload): [string, string][] {
  const entries: [string, string][] = [["account_id", p.account_id]];
  for (const id of p.attendees_ids) entries.push(["attendees_ids", id]);
  entries.push(["text", p.text]);
  if (p.inmail) {
    entries.push(["linkedin[inmail]", "true"]);
    entries.push(["linkedin[api]", p.api ?? "classic"]);
  }
  return entries;
}

/** Multipart entries for POST /chats/{id}/messages (reply). Pure. */
export function replyFormEntries(p: UnipileReplyPayload): [string, string][] {
  return [["text", p.text]];
}

export type FetchLike = typeof fetch;

export function unipileMessagingClient(cfg: UnipileConfig, fetchImpl: FetchLike = fetch): UnipileClient {
  const base = unipileApiBase(cfg.dsn);

  async function send(path: string, init: RequestInit): Promise<UnipileActionResponse> {
    const res = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: { "X-API-KEY": cfg.apiKey, accept: "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new UnipileApiError(`Unipile ${init.method} ${path} -> ${res.status}: ${text.slice(0, 300)}`, res.status);
    }
    return (await res.json()) as UnipileActionResponse;
  }

  function form(entries: [string, string][]): FormData {
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
    return fd;
  }

  return {
    // Invitations are JSON (not multipart).
    sendInvitation(p: UnipileInvitePayload) {
      const body: Record<string, unknown> = { account_id: p.account_id, provider_id: p.provider_id };
      if (p.message) body.message = p.message;
      return send("/users/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    // Chats are multipart/form-data — let fetch set the boundary; no content-type.
    startNewChat(p: UnipileNewChatPayload) {
      return send("/chats", { method: "POST", body: form(startChatFormEntries(p)) });
    },
    sendMessage(p: UnipileReplyPayload) {
      return send(`/chats/${encodeURIComponent(p.chat_id)}/messages`, { method: "POST", body: form(replyFormEntries(p)) });
    },
  };
}
