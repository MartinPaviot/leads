/**
 * Spec 36 — Unipile adapter behind the provider-agnostic LinkedInPort (spec 24).
 * Sibling to HeyReachAdapter (lib/providers/heyreach/linkedin-adapter.ts:68): it
 * implements the SAME port, so the entire runLinkedInAction orchestration
 * (idempotency, suppression-22, anti-collision-14, daily limits, metering,
 * events; linkedin.ts:62) is reused unchanged.
 *
 * Key difference from HeyReach: Unipile targets an opaque, viewer-scoped
 * `provider_id`, not the contact's `profileUrl`. Resolution (profileUrl ->
 * provider_id, plus connection degree + an existing chat_id) is the spec-36 T1
 * step; the adapter receives it via an injected `TargetResolver` so it stays
 * pure. `connect` -> POST /users/invite; `message` -> POST /chats (new chat to a
 * 1st-degree relation, or InMail) or POST /chats/{id}/messages (reply in chat).
 *
 * Blast radius: lib/providers/unipile/* only.
 */

import type { LinkedInPort, LinkedInRequest, LinkedInResult } from "@/lib/sending/linkedin/port"; // gitleaks:allow (LinkedIn* are TS type names, not credentials)
import { LinkedInError } from "@/lib/sending/linkedin/port";
import {
  mapUnipileError,
  type UnipileClient,
  type UnipileInvitePayload,
  type UnipileNewChatPayload,
} from "./client";

/** LinkedIn caps a connection note at 300 characters. */
export const INVITE_NOTE_MAX = 300;

/** Trim + clamp an invite note to LinkedIn's 300-char limit; undefined if empty. */
export function clampInviteNote(note: string | undefined): string | undefined {
  const trimmed = (note ?? "").trim();
  if (!trimmed) return undefined;
  return trimmed.length > INVITE_NOTE_MAX ? trimmed.slice(0, INVITE_NOTE_MAX) : trimmed;
}

/**
 * The resolved Unipile routing for a contact, viewer-scoped to the sending
 * account. Produced by the spec-36 T1 `resolveProviderId` step + cache
 * (`linkedin_provider_identity`).
 */
export interface ResolvedTarget {
  /** Unipile opaque id for the target person, resolved with the sending account. */
  providerId: string;
  /** Existing 1:1 chat with this person; when set, a message replies in it. */
  chatId?: string | null;
  /** '1st' | '2nd' | '3rd' | null — informational; the orchestrator branches on it. */
  degree?: string | null;
  /** When true and no chat exists, the message is sent as an InMail. */
  inmail?: boolean;
  /** Seat API surface for an InMail send. */
  api?: UnipileNewChatPayload["api"];
}

export type TargetResolver = (req: LinkedInRequest) => Promise<ResolvedTarget> | ResolvedTarget;

/** Map an invite request to the Unipile /users/invite payload. */
export function toInvitePayload(req: LinkedInRequest, providerId: string): UnipileInvitePayload {
  return {
    account_id: req.senderAccountId,
    provider_id: providerId,
    message: clampInviteNote(req.note),
  };
}

/** Map a message request to the Unipile /chats (new chat) payload. */
export function toNewChatPayload(req: LinkedInRequest, target: ResolvedTarget, text: string): UnipileNewChatPayload {
  return {
    account_id: req.senderAccountId,
    attendees_ids: [target.providerId],
    text,
    inmail: target.inmail || undefined,
    api: target.inmail ? target.api : undefined,
  };
}

export class UnipileAdapter implements LinkedInPort {
  constructor(
    private readonly client: UnipileClient,
    /** Resolves profileUrl -> provider_id (+ chat/degree) for the sending account. */
    private readonly resolveTarget: TargetResolver,
  ) {}

  private async resolved(req: LinkedInRequest): Promise<ResolvedTarget> {
    const target = await this.resolveTarget(req);
    if (!target?.providerId || !target.providerId.trim()) {
      // Mirrors the no-profile refusal class — Unipile cannot act without an id.
      throw new LinkedInError("unresolved Unipile provider_id", "client_error", 400);
    }
    return target;
  }

  async connect(req: LinkedInRequest): Promise<LinkedInResult> {
    const target = await this.resolved(req);
    try {
      const res = await this.client.sendInvitation(toInvitePayload(req, target.providerId));
      return {
        providerActionId: res.invitation_id ?? res.id ?? "",
        action: "connect",
        status: "sent",
        senderAccountId: req.senderAccountId,
      };
    } catch (e) {
      throw mapUnipileError(e);
    }
  }

  async message(req: LinkedInRequest): Promise<LinkedInResult> {
    const target = await this.resolved(req);
    const text = (req.message ?? "").trim();
    if (!text) throw new LinkedInError("empty LinkedIn message", "client_error", 400);
    try {
      if (target.chatId && target.chatId.trim()) {
        // Reply in the existing chat — avoids the 1st-degree re-check on a new chat.
        const res = await this.client.sendMessage({ chat_id: target.chatId, text });
        return {
          providerActionId: res.message_id ?? res.id ?? "",
          action: "message",
          status: "sent",
          senderAccountId: req.senderAccountId,
        };
      }
      const res = await this.client.startNewChat(toNewChatPayload(req, target, text));
      return {
        providerActionId: res.chat_id ?? res.id ?? "",
        action: "message",
        status: "sent",
        senderAccountId: req.senderAccountId,
      };
    } catch (e) {
      throw mapUnipileError(e);
    }
  }
}
