"use client";

import { useEffect, useRef } from "react";
import { parseUiToolParts } from "@/components/tool-call-panel";
import {
  parseUiDirective,
  type UiDirective,
  type ComposeEmailDraft,
} from "@/lib/chat/ui-directives";
import { runRegisteredAction } from "@/lib/chat/page-actions/registry";
import type { PageActionResult } from "@/lib/chat/page-actions/types";

/** Frozen transport tags for the v1 page-action result round-trip (README §3.5). */
export const ACTION_RESULT_OPEN = "[[action-result]]";
export const ACTION_RESULT_CLOSE = "[[/action-result]]";

/** The frozen envelope (README §3.5). Only these keys cross back to the model. */
export interface ActionResultEnvelope {
  invocationId: string;
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
}

/** Serialize a result into the tagged transport string the model is taught to read. */
export function encodeActionResult(invocationId: string, r: PageActionResult): string {
  const env: ActionResultEnvelope = {
    invocationId,
    ok: r.ok,
    summary: r.summary,
    ...(r.data !== undefined ? { data: r.data } : {}),
    ...(r.error ? { error: r.error } : {}),
  };
  return `${ACTION_RESULT_OPEN}${JSON.stringify(env)}${ACTION_RESULT_CLOSE}`;
}

/** Minimal shape we need from the AI SDK `useChat` return value. */
interface ChatLike {
  messages: { id: string; role: string; parts: readonly { type: string }[] }[];
  status: string;
}

/**
 * Execute a directive against the two things the chat can drive: client
 * navigation and the email composer. Kept separate from the hook so callers
 * can supply their own composer setter (the dock and the /chat page each own
 * their own composer state).
 */
export function runUiDirective(
  d: UiDirective,
  ctx: {
    navigate: (path: string) => void;
    openComposer: (draft: ComposeEmailDraft) => void;
    /** Re-inject the tagged result envelope as a user turn (chat.sendMessage). */
    sendActionResult: (text: string) => void;
  },
): void {
  if (d.kind === "navigate") ctx.navigate(d.path);
  else if (d.kind === "composeEmail") ctx.openComposer(d.draft);
  else if (d.kind === "invokeAction") {
    // CLE-03: run the registered action on the live page, then round-trip the
    // result envelope so the model can chain. CLE-05 will branch on
    // d.requireConfirm to render a confirm card first; the CLE-03 smoke action
    // is confirm:"never", so we run directly. Fire-and-forget: the dock owns the
    // promise, so a page unmount mid-run does not cancel it.
    void runRegisteredAction(d.actionId, d.params).then((result) => {
      ctx.sendActionResult(encodeActionResult(d.invocationId, result));
    });
  }
}

/**
 * Watches the latest assistant message for UI directives on its tool results
 * and runs each exactly once. Gated on the turn being settled (not streaming)
 * so a navigation never cuts a live response. Directives are keyed by
 * messageId+partIndex, so a re-render (or the message being re-read on the
 * next turn) never re-fires one.
 *
 * History replay is inherently safe: reconstructed thread messages carry only
 * text parts, so there are no tool parts — and thus no directives — to fire.
 */
export function useUiDirectives(chat: ChatLike, execute: (d: UiDirective) => void): void {
  const executedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (chat.status === "streaming") return;
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== "assistant") return;

    const calls = parseUiToolParts(last.parts);
    calls.forEach((call, idx) => {
      if (call.isStreaming) return;
      const key = `${last.id}:${idx}`;
      if (executedRef.current.has(key)) return;
      const directive = parseUiDirective(call.result);
      if (!directive) return;
      executedRef.current.add(key);
      execute(directive);
    });
  }, [chat.messages, chat.status, execute]);
}
