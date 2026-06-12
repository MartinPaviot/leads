"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass, Send, X, Maximize2, Plus, Loader2, Mail, ArrowUpRight,
  Building2, User, TrendingUp, Calendar, List, Globe,
} from "lucide-react";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ElevayMark } from "@/components/ui/elevay-mark";
import { ToolCallGroup, parseUiToolParts } from "@/components/tool-call-panel";
import { useChatActionCards, MessageActionCards } from "@/components/chat/chat-action-cards";
import { FollowUpPills, extractFollowUps } from "@/components/chat/follow-up-pills";
import { StreamingSkeleton } from "@/components/chat/streaming-skeleton";
import { CopyButton } from "@/components/chat/copy-button";
import { EmailComposerPanel, type EmailComposerDraft } from "@/components/email-composer-panel";
import { trackEvent } from "@/components/posthog-provider";
import { deriveSurface, type SurfaceIcon } from "@/lib/chat/surface-from-path";
import { useUiDirectives, runUiDirective } from "@/components/chat/use-ui-directives";
import type { UiDirective } from "@/lib/chat/ui-directives";

const ICONS: Record<SurfaceIcon, typeof Compass> = {
  building: Building2,
  user: User,
  deal: TrendingUp,
  calendar: Calendar,
  list: List,
  globe: Globe,
};

/** Page-aware starter prompts keyed by the derived context type. */
function suggestionsFor(contextType?: string): string[] {
  switch (contextType) {
    case "account":
      return ["Summarize this account", "Who are the key contacts here?", "Draft an intro email"];
    case "contact":
      return ["What's the latest with this contact?", "Draft a follow-up email", "Prepare me for a call"];
    case "deal":
      return ["Coach me on this deal", "What's the risk here?", "Draft the next-step email"];
    case "meeting":
      return ["Summarize this meeting", "What were the action items?", "Draft a follow-up"];
    case "list":
      return ["What should I focus on?", "Which records need attention?", "Summarize this list"];
    default:
      return ["What should I focus on today?", "Which deals are at risk?", "Summarize my pipeline"];
  }
}

/** Detect an email draft inside an assistant message (To:/Subject:/body). */
function detectEmail(text: string): { to: string; subject: string; body: string } | null {
  const subjectMatch = text.match(/Subject:\s*(.+)/i);
  const toMatch = text.match(/To:\s*(.+@.+)/i);
  if (!subjectMatch) return null;
  const subject = subjectMatch[1].trim();
  const bodyStart = text.indexOf(subjectMatch[0]) + subjectMatch[0].length;
  let body = text.slice(bodyStart).trim();
  body = body.replace(/^[-—]+\n?/, "").trim();
  if (!body || body.length < 20) return null;
  return { to: toMatch ? toMatch[1].trim() : "", subject, body };
}

function partsToText(parts: readonly { type: string }[]): string {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => ("text" in p ? (p as { text: string }).text : ""))
    .join("");
}

export function ChatDock() {
  const pathname = usePathname();
  const router = useRouter();
  const surface = useMemo(() => deriveSurface(pathname), [pathname]);

  // Always-current surface for the transport body (the dock outlives any
  // single route — it's mounted in the dashboard layout — so the request
  // must read the live page context, not the one captured at mount).
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;

  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // drives the enter transition
  const [localInput, setLocalInput] = useState("");
  const [emailComposer, setEmailComposer] = useState<EmailComposerDraft | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        credentials: "include",
        // Resolvable body — re-evaluated on every request so the chat is
        // scoped to whatever page the user is on right now.
        body: () => {
          const s = surfaceRef.current;
          return s.contextType ? { contextType: s.contextType, contextId: s.contextId } : {};
        },
      }),
    [],
  );
  const chat = useChat({ transport });
  const actionCards = useChatActionCards(chat);

  // Command layer: when a tool result carries a UI directive (open a record /
  // view, or the composer), execute it once. Navigation keeps the dock mounted
  // (it lives in the dashboard layout), so the conversation persists.
  const onDirective = useCallback(
    (d: UiDirective) =>
      runUiDirective(d, {
        navigate: (p) => router.push(p),
        openComposer: (draft) => setEmailComposer(draft),
      }),
    [router],
  );
  useUiDirectives(chat, onDirective);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Toggle with Cmd/Ctrl+J (the global shortcut hook ignores meta/ctrl, so
  // there's no conflict with n / "/" / g-chords). Esc closes when open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Enter transition + focus on open.
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const raf = requestAnimationFrame(() => setShown(true));
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [open]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, open]);

  // Auto-grow the composer — grow in height first, only show a scrollbar once
  // we hit the cap (140px). Never a scrollbar on a one-liner.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const MAX = 140;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX)}px`;
    el.style.overflowY = el.scrollHeight > MAX ? "auto" : "hidden";
  }, [localInput]);

  function send(text: string) {
    const t = text.trim();
    if (!t || chat.status === "streaming") return;
    chat.sendMessage({ text: t });
    trackEvent("", "chat_dock_message_sent", {
      queryLength: t.length,
      surface: surfaceRef.current.contextType || "global",
    });
    setLocalInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(localInput);
  }

  function newChat() {
    chat.setMessages([]);
    setLocalInput("");
    inputRef.current?.focus();
  }

  // The full /chat page owns its own composer — never show the dock there.
  if (surface.hidden) return null;

  const ChipIcon = ICONS[surface.icon];
  const hasMessages = chat.messages.length > 0;

  // ── Closed: just the launcher ──────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Elevay chat (Ctrl+J)"
        title="Ask Elevay  ·  Ctrl+J"
        className="fixed bottom-5 right-5 flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
        style={{
          zIndex: 45,
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-panel, 0 8px 24px rgba(0,0,0,0.18))",
        }}
      >
        <ElevayMark size={22} />
      </button>
    );
  }

  // ── Open: the docked panel ─────────────────────────────────────
  return (
    <>
      <div
        className="fixed bottom-5 right-5 flex flex-col overflow-hidden rounded-2xl transition-all duration-150"
        style={{
          zIndex: 45,
          width: "min(400px, calc(100vw - 2rem))",
          height: "min(620px, calc(100vh - 6rem))",
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-panel, 0 12px 32px rgba(0,0,0,0.22))",
          opacity: shown ? 1 : 0,
          transform: shown ? "translateY(0) scale(1)" : "translateY(8px) scale(0.98)",
          transformOrigin: "bottom right",
        }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center gap-2 px-3 py-2.5"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <ElevayMark size={15} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Elevay
          </span>
          {/* Page-context chip */}
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
            style={{ background: "var(--color-bg-muted)", color: "var(--color-text-tertiary)" }}
            title={`Scoped to ${surface.label}`}
          >
            <ChipIcon size={10} />
            {surface.label}
          </span>

          <div className="ml-auto flex items-center gap-0.5">
            {hasMessages && (
              <button
                onClick={newChat}
                aria-label="New chat"
                title="New chat"
                className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-hover)]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <Plus size={15} />
              </button>
            )}
            <button
              onClick={() => router.push("/chat")}
              aria-label="Open full chat"
              title="Open full chat"
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <Maximize2 size={13} />
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              title="Close  ·  Esc"
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center px-2 text-center">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{
                  background: "var(--color-bg-surface)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                <ElevayMark size={20} />
              </div>
              <p className="mt-3 text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                Ask about {surface.scopeNoun}
              </p>
              <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                Or anything across your CRM.
              </p>

              <div className="mt-4 w-full space-y-1.5">
                {suggestionsFor(surface.contextType).map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors"
                    style={{
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border-default)",
                      background: "var(--color-bg-surface)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-bg-surface)"; }}
                  >
                    <ChipIcon size={13} className="shrink-0" style={{ color: "var(--color-accent)" }} />
                    <span className="flex-1 truncate">{s}</span>
                    <ArrowUpRight size={13} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {chat.messages.map((message) => {
                const text = partsToText(message.parts);
                if (message.role === "user") {
                  return (
                    <div key={message.id} className="mb-3 flex justify-end">
                      <div
                        className="max-w-[88%] rounded-[10px] px-3 py-2 text-[13.5px]"
                        style={{ background: "var(--color-bg-hover)", color: "var(--color-text-primary)", lineHeight: "20px" }}
                      >
                        {text}
                      </div>
                    </div>
                  );
                }
                const toolCalls = parseUiToolParts(message.parts);
                const isLast = chat.messages[chat.messages.length - 1]?.id === message.id;
                const emailData = detectEmail(text);
                return (
                  <div key={message.id} className="group/msg mb-4 min-w-0">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                      <ElevayMark size={11} />
                      <span style={{ fontWeight: 500 }}>Elevay</span>
                    </div>

                    {toolCalls.length > 0 && <ToolCallGroup calls={toolCalls} />}
                    <MessageActionCards message={message} controller={actionCards} />

                    <div
                      className="prose prose-sm max-w-none overflow-hidden break-words [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5"
                      style={{ fontSize: "13.5px", lineHeight: "20px", color: "var(--color-text-primary)", overflowWrap: "break-word" }}
                    >
                      <ChatMarkdown>{text}</ChatMarkdown>
                    </div>

                    <div className="mt-1.5 flex items-center gap-1.5">
                      {emailData && (
                        <button
                          onClick={() => setEmailComposer(emailData)}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors"
                          style={{ color: "var(--color-accent)", border: "1px solid var(--color-border-default)" }}
                        >
                          <Mail size={12} /> Open in Composer
                        </button>
                      )}
                      <div className="opacity-0 transition-opacity group-hover/msg:opacity-100">
                        <CopyButton text={text} />
                      </div>
                    </div>

                    {isLast && chat.status !== "streaming" && (
                      <FollowUpPills
                        suggestions={extractFollowUps(text)}
                        onSelect={(s) => send(s)}
                        disabled={chat.status !== "ready"}
                      />
                    )}
                  </div>
                );
              })}
              {chat.status === "streaming" && <StreamingSkeleton />}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error banner */}
        {chat.error && (
          <div className="shrink-0 px-3 pb-2">
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2 text-[12px]"
              style={{ background: "oklch(0.97 0.015 25)", border: "1px solid oklch(0.85 0.06 25)", color: "oklch(0.5 0.14 25)" }}
            >
              <span>Something went wrong.</span>
              <button
                onClick={() => {
                  const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
                  if (lastUser) {
                    const t = partsToText(lastUser.parts);
                    if (t) chat.sendMessage({ text: t });
                  }
                }}
                className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "oklch(0.92 0.04 25)", color: "oklch(0.45 0.14 25)" }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="relative shrink-0 px-3 pb-3 pt-1"
        >
          <textarea
            ref={inputRef}
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(localInput);
              }
            }}
            placeholder={`Ask about ${surface.scopeNoun}...`}
            rows={1}
            className="block w-full resize-none rounded-xl py-2.5 pl-3.5 pr-10 text-[13.5px] outline-none transition-all"
            style={{
              background: "var(--color-bg-surface)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
              maxHeight: 140,
              overflowY: "hidden",
              lineHeight: 1.5,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-default)"; }}
            disabled={chat.status === "streaming"}
          />
          {/* bottom-[18px] = pb-3 (12px) + (40px one-line field − 28px button)/2 —
              centers the button on one line; needs the `block` textarea above
              (inline-block would add a baseline gap and push it off-center). */}
          <button
            type="submit"
            disabled={!localInput.trim() || chat.status === "streaming"}
            aria-label="Send"
            className="absolute bottom-[18px] right-5 flex h-7 w-7 items-center justify-center rounded-lg transition-all disabled:opacity-30"
            style={{ background: localInput.trim() ? "var(--color-accent)" : "transparent", color: localInput.trim() ? "#fff" : "var(--color-text-tertiary)" }}
          >
            {chat.status === "streaming" ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
          </button>
        </form>
      </div>

      {emailComposer && (
        <EmailComposerPanel draft={emailComposer} onClose={() => setEmailComposer(null)} />
      )}
    </>
  );
}
