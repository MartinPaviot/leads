"use client";

import { useEffect, useRef } from "react";
import { parseUiToolParts } from "@/components/tool-call-panel";
import {
  parseUiDirective,
  type UiDirective,
  type ComposeEmailDraft,
  type InvokeActionDirective,
  type HighlightAnchor,
} from "@/lib/chat/ui-directives";
import {
  runRegisteredAction,
  getRegisteredActionMeta,
} from "@/lib/chat/page-actions/registry";
import type { PageActionResult, UndoDescriptor } from "@/lib/chat/page-actions/types";

// Frozen transport tags live in a pure module so the server-side prompt can
// import the same literals without pulling this "use client" module (CLE-04).
import { ACTION_RESULT_OPEN, ACTION_RESULT_CLOSE } from "@/lib/chat/page-actions/result-tags";
export { ACTION_RESULT_OPEN, ACTION_RESULT_CLOSE };

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

/**
 * CLE-11 — the audit path. After a Page Action runs on the client, post its
 * outcome (+ the serializable undo descriptor) to the server audit seam, in
 * PARALLEL with the model envelope. Independent of the model path: one is for
 * chaining (the model), one is for undo (the server). Fire-and-forget — a
 * failed audit row never blocks the action, which already ran (E-7).
 *
 *  - A FORWARD action posts the forward log ONLY if it is mutating (reads are
 *    not audited — AC-2). The undo descriptor is forwarded only in its
 *    serializable (object) form; a closure cannot cross to the server.
 *  - The INVERSE of an undo (directive carried `reconcileEventId`) posts the
 *    reconcile body so a failed inverse re-opens the original event (E-3).
 */
function postPageActionLog(
  d: Extract<UiDirective, { kind: "invokeAction" }>,
  result: PageActionResult,
): void {
  const isReconcile = typeof d.reconcileEventId === "string" && d.reconcileEventId.length > 0;

  if (!isReconcile) {
    // Forward action — only audit mutating ones.
    const meta = getRegisteredActionMeta(d.actionId);
    if (!meta || !meta.mutating) return;
  }

  // Only the serializable descriptor form of undo is persistable.
  const undo: UndoDescriptor | undefined =
    result.undo && typeof result.undo === "object" ? (result.undo as UndoDescriptor) : undefined;

  const body = {
    invocationId: d.invocationId,
    actionId: d.actionId,
    params: d.params,
    ok: result.ok,
    summary: result.summary,
    error: result.error,
    ...(undo ? { undo } : {}),
    ...(isReconcile ? { reconcileEventId: d.reconcileEventId } : {}),
    // The server only audits mutating forward actions; pass the flag so the
    // route can double-check (defense in depth).
    ...(isReconcile ? {} : { mutating: true }),
  };

  void fetch("/api/chat/page-action-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {
    // Audit is best-effort; never surface to the user.
  });
}

/* ------------------------------------------------------------------ */
/*  CLE-15 — highlight from a Page Action result                        */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * CLE-15: coerce `result.data.highlight` (a single anchor, an array, or
 * undefined) into a list of validated anchors. Mirrors parseHighlightAnchor:
 * requires a non-empty string `entityId`, strips unknown keys, drops malformed
 * entries — NEVER throws.
 */
export function coerceAnchors(raw: unknown): HighlightAnchor[] {
  const candidates = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  const out: HighlightAnchor[] = [];
  for (const c of candidates) {
    if (!isRecord(c)) continue;
    const entityId = typeof c.entityId === "string" && c.entityId.trim().length > 0 ? c.entityId : null;
    if (!entityId) continue;
    const scope = typeof c.scope === "string" && c.scope.trim().length > 0 ? c.scope : undefined;
    const field = typeof c.field === "string" && c.field.trim().length > 0 ? c.field : undefined;
    out.push({
      entityId,
      ...(scope ? { scope } : {}),
      ...(field ? { field } : {}),
      ...(c.focus === true ? { focus: true } : {}),
    });
  }
  return out;
}

/**
 * CLE-15: after a SUCCESSFUL Page Action run, pulse the affected element(s) the
 * result names via the optional `result.data.highlight`. One read point shared
 * by both the run-now arm (below) and CLE-05's approve path. A failure pulses
 * nothing (a green flash on a failure would mislead). A result with no highlight
 * pulses nothing.
 */
export function maybeHighlightFromResult(
  result: PageActionResult,
  highlight: (a: HighlightAnchor | HighlightAnchor[]) => void,
): void {
  if (!result.ok) return;
  const h = (result.data as { highlight?: unknown } | undefined)?.highlight;
  const anchors = coerceAnchors(h);
  if (anchors.length) highlight(anchors);
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
    /** CLE-05: hand a confirm-needed directive to the card controller (no run). */
    enqueueConfirm: (d: InvokeActionDirective) => void;
    /**
     * CLE-15: pulse an element on the page. `afterNavigation` tells the impl to
     * wait for the target page's locator to mount (bounded poll); otherwise it
     * fires immediately. Always a no-op when no locator resolves the anchor.
     */
    highlight: (a: HighlightAnchor | HighlightAnchor[], opts?: { afterNavigation?: boolean }) => void;
  },
): void {
  if (d.kind === "navigate") {
    ctx.navigate(d.path);
    // CLE-15: when the navigate carries a highlight, pulse the target AFTER the
    // route settles (the dock impl polls for the page's locator).
    if (d.highlight) ctx.highlight(d.highlight, { afterNavigation: true });
  } else if (d.kind === "composeEmail") ctx.openComposer(d.draft);
  else if (d.kind === "invokeAction") {
    if (d.requireConfirm) {
      // CLE-05 (AC-1): do NOT run. Hand to the controller, which renders an
      // editable confirm card; the action runs only on the user's Approve.
      ctx.enqueueConfirm(d);
    } else {
      // CLE-03 path (AC-4): requireConfirm=false (read-only, or decideAction
      // returned execute) → run immediately and round-trip the result envelope.
      // Fire-and-forget: the dock owns the promise, so a page unmount mid-run
      // does not cancel it.
      void runRegisteredAction(d.actionId, d.params).then((result) => {
        // Model path: re-inject the tagged envelope so the model can chain.
        ctx.sendActionResult(encodeActionResult(d.invocationId, result));
        // Audit path (CLE-11): record the outcome + undo descriptor server-side.
        postPageActionLog(d, result);
        // CLE-15: pulse the affected element if the result named one. Immediate
        // (we are already on the page the action ran on).
        maybeHighlightFromResult(result, ctx.highlight);
      });
    }
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
