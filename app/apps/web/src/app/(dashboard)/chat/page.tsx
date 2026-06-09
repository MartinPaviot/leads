"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ToolCallGroup, parseUiToolParts } from "@/components/tool-call-panel";
import { ActionCard, parseToolResultForCard } from "@/components/action-card";
import { EmailComposerPanel } from "@/components/email-composer-panel";
import type { EmailComposerDraft } from "@/components/email-composer-panel";
import { StreamingSkeleton } from "@/components/chat/streaming-skeleton";
import { FollowUpPills, extractFollowUps } from "@/components/chat/follow-up-pills";
import { CopyButton } from "@/components/chat/copy-button";
import { useUiDirectives, runUiDirective } from "@/components/chat/use-ui-directives";
import type { UiDirective } from "@/lib/chat/ui-directives";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Compass, Send, Mail, Check, Paperclip, Mic, MicOff, Loader2, Search, Target, AlertTriangle, ListChecks, Lightbulb, Sparkles, ArrowUpRight } from "lucide-react";
import { trackEvent } from "@/components/posthog-provider";

/** Pick a lucide icon for a starter suggestion by intent, so the empty
 *  state reads as a set of capabilities rather than a wall of grey text.
 *  Works for both the static fallbacks and the personalised strings from
 *  /api/chat/suggestions. */
function suggestionIcon(text: string): typeof Compass {
  const t = text.toLowerCase();
  if (/risk|stall|stuck|slipping|losing|attention|overdue|cold/.test(t)) return AlertTriangle;
  if (/email|outreach|follow.?up|follow up|followed|draft|reply|message|reach out|nudge/.test(t)) return Mail;
  if (/focus|today|priorit|plan\b|next|to.?do|agenda/.test(t)) return ListChecks;
  if (/pipeline|opportunit|deal|forecast|revenue|summar|quota|stage/.test(t)) return Target;
  if (/research|find|who\b|enrich|\bicp\b|account|compan|prospect|lead|market/.test(t)) return Search;
  if (/coach|improve|prepare|meeting|advice|practice|objection|pitch/.test(t)) return Lightbulb;
  return Sparkles;
}

export default function ChatPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [threadId, setThreadId] = useState<string | null>(searchParams.get("thread"));
  const [threadLoaded, setThreadLoaded] = useState(!searchParams.get("thread"));

  const chat = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      credentials: "include",
    }),
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [localInput, setLocalInput] = useState("");
  const [autoSent, setAutoSent] = useState(false);
  const [lastSavedCount, setLastSavedCount] = useState(0);
  // Guards saveMessages against double-invocation (see saveMessages).
  const savingRef = useRef(false);
  const [emailComposer, setEmailComposer] = useState<EmailComposerDraft | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Command layer: execute UI directives carried on tool results (open a
  // record/view, or the composer) exactly once per turn. Replayed thread
  // history has no tool parts, so loading an old chat never auto-navigates.
  const onDirective = useCallback(
    (d: UiDirective) =>
      runUiDirective(d, {
        navigate: (p) => router.push(p),
        openComposer: (draft) => setEmailComposer(draft),
      }),
    [router],
  );
  useUiDirectives(chat, onDirective);
  const [firstName, setFirstName] = useState<string>("");
  // Time-based greeting computed AFTER mount. new Date().getHours() differs
  // between the SSR render (server timezone) and the client (local tz), so
  // computing it inline during render produced a hydration mismatch
  // (React #418). Deferring to useEffect keeps SSR + the first client render
  // identical (empty), then fills the greeting in.
  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);

  // Action card approval state: keyed by "messageId-toolIdx"
  const [cardStatuses, setCardStatuses] = useState<Record<string, "pending" | "approved" | "dismissed">>({});
  const [cardExecuting, setCardExecuting] = useState<Record<string, boolean>>({});

  // Load existing thread messages on mount
  useEffect(() => {
    const tid = searchParams.get("thread");
    if (!tid || threadLoaded) return;

    (async () => {
      try {
        const res = await fetch(`/api/chat/threads/${tid}`);
        if (!res.ok) {
          setThreadLoaded(true);
          return;
        }
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          const msgs = data.messages.map((m: { id: string; role: string; content: string }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            parts: [{ type: "text" as const, text: m.content }],
          }));
          chat.setMessages(msgs);
          setLastSavedCount(msgs.length);
        }
        setThreadId(tid);
      } catch {
        // Thread load failed — start fresh
      }
      setThreadLoaded(true);
    })();
  }, [searchParams, threadLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch contextual suggestions based on onboarding data
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/chat/suggestions");
        if (!res.ok) return;
        const data = await res.json();
        if (data.suggestions) setSuggestions(data.suggestions);
        if (data.firstName) setFirstName(data.firstName);
      } catch {
        // Silent fail — static fallback will show if suggestions remain empty
      }
    })();
  }, []);

  // Auto-send query from persistent chat bar
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !autoSent && threadLoaded && chat.messages.length === 0) {
      setAutoSent(true);
      chat.sendMessage({ text: q });
    }
  }, [searchParams, autoSent, threadLoaded, chat]);

  // Pre-fill input when navigating from Skills page with ?skill= param
  useEffect(() => {
    const skill = searchParams.get("skill");
    if (skill && threadLoaded && chat.messages.length === 0 && !localInput) {
      const skillName = skill
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setLocalInput(`Run skill: ${skillName}`);
      inputRef.current?.focus();
    }
  }, [searchParams, threadLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  // Save messages to thread after AI finishes responding
  const saveMessages = useCallback(async () => {
    if (chat.status === "streaming") return;
    if (chat.messages.length <= lastSavedCount) return;
    // Re-entrancy guard — a double-invoked save (React StrictMode in dev, or a
    // rapid re-render before lastSavedCount commits) was persisting the same
    // exchange twice (4 rows for a 1-turn thread). Serialize saves so each turn
    // is written exactly once.
    if (savingRef.current) return;
    savingRef.current = true;
    try {

    const newMessages = chat.messages.slice(lastSavedCount);
    if (newMessages.length === 0) return;

    const messagesToSave = newMessages.map((m) => ({
      role: m.role,
      content: m.parts
        .filter((p) => p.type === "text")
        .map((p) => ("text" in p ? p.text : ""))
        .join(""),
    }));

    // Auto-generate title from first user message
    const firstUserMsg = chat.messages.find((m) => m.role === "user");
    const title = firstUserMsg?.parts
      .filter((p) => p.type === "text")
      .map((p) => ("text" in p ? p.text : ""))
      .join("")
      ?.slice(0, 100);

    if (!threadId) {
      // Create new thread
      try {
        const res = await fetch("/api/chat/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) {
          toast("Couldn't save this chat. It'll stay in this tab until reload.", "warning");
          console.warn("chat: create thread failed", { status: res.status });
          return;
        }
        const data = await res.json();
        const newThreadId = data.thread.id;
        setThreadId(newThreadId);

        // Save all messages to the new thread
        const appendRes = await fetch(`/api/chat/threads/${newThreadId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: messagesToSave, title }),
        });
        if (!appendRes.ok) {
          toast("Chat was started but messages didn't save. Reload may drop history.", "warning");
          console.warn("chat: append-to-new-thread failed", { status: appendRes.status });
          return;
        }

        // Update URL without navigation
        window.history.replaceState(null, "", `/chat?thread=${newThreadId}`);
      } catch (err) {
        toast("Couldn't save this chat. It'll stay in this tab until reload.", "warning");
        console.warn("chat: create thread threw", err);
      }
    } else {
      // Append to existing thread
      try {
        const res = await fetch(`/api/chat/threads/${threadId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: messagesToSave }),
        });
        if (!res.ok) {
          toast("New messages failed to save to this chat. Reload may drop them.", "warning");
          console.warn("chat: append-to-existing-thread failed", { status: res.status });
        }
      } catch (err) {
        toast("New messages failed to save to this chat. Reload may drop them.", "warning");
        console.warn("chat: append-to-existing-thread threw", err);
      }
    }

    setLastSavedCount(chat.messages.length);
    } finally {
      savingRef.current = false;
    }
  }, [chat.messages, chat.status, threadId, lastSavedCount]);

  // Trigger save when streaming completes
  useEffect(() => {
    if (chat.status === "ready" && chat.messages.length > lastSavedCount) {
      saveMessages();
    }
  }, [chat.status, chat.messages.length, lastSavedCount, saveMessages]);

  // Auto-grow the composer so the full message stays visible as it's typed
  // (and snap back to one line after sending / clearing). Standard chat
  // behaviour: grow in height first, and only show a scrollbar once we hit
  // the cap (200px) — never a scrollbar on a one-liner.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const MAX = 200;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX)}px`;
    el.style.overflowY = el.scrollHeight > MAX ? "auto" : "hidden";
  }, [localInput]);

  function handleLocalSubmit(e: React.FormEvent) {
    e.preventDefault();
    let text = localInput.trim() || inputRef.current?.value?.trim() || "";
    if (!text && !attachedFile) return;
    // Prepend file content as context if attached
    if (attachedFile) {
      text = `[Attached file: ${attachedFile.name}]\n\n${attachedFile.content.slice(0, 5000)}\n\n---\n\n${text || "Analyze this file."}`;
      setAttachedFile(null);
    }
    chat.sendMessage({ text });
    // PostHog autocapture sees the click but can't measure
    // queryLength or pair the message to the threadId — both are
    // load-bearing for funnel analysis (chat usage → conversions).
    trackEvent("", "chat_message_sent", {
      queryLength: text.length,
      threadId: threadId ?? null,
      hasAttachment: Boolean(attachedFile),
    });
    setLocalInput("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("File too large (max 2MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({ name: file.name, content: reader.result as string });
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset so same file can be re-selected
  }

  function toggleVoiceInput() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Voice input not supported in this browser.");
      return;
    }
    if (isListening) {
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setLocalInput((prev) => prev + (prev ? " " : "") + transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  }

  function useSuggestion(text: string) {
    chat.sendMessage({ text });
  }

  function detectEmail(text: string): { to: string; subject: string; body: string } | null {
    const subjectMatch = text.match(/Subject:\s*(.+)/i);
    const toMatch = text.match(/To:\s*(.+@.+)/i);
    if (!subjectMatch) return null;
    const subject = subjectMatch[1].trim();
    const bodyStart = text.indexOf(subjectMatch[0]) + subjectMatch[0].length;
    let body = text.slice(bodyStart).trim();
    body = body.replace(/^[-\u2014]+\n?/, "").trim();
    if (!body || body.length < 20) return null;
    return { to: toMatch ? toMatch[1].trim() : "", subject, body };
  }

  // Composer (input + attachments + voice). Rendered as the centred hero
  // when the thread is empty, then docked at the bottom once it has
  // messages — one definition so the two placements never drift.
  function renderComposer(maxW: number | null, big = false) {
    const widthStyle = maxW ? { maxWidth: maxW } : undefined;
    return (
      <>
        {attachedFile && (
          <div
            className="mx-auto mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[12px]"
            style={{ ...widthStyle, background: "var(--color-accent-soft)", border: "1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)" }}
          >
            <Paperclip size={12} style={{ color: "var(--color-accent)" }} />
            <span className="flex-1 truncate" style={{ color: "var(--color-text-primary)" }}>{attachedFile.name}</span>
            <button onClick={() => setAttachedFile(null)} className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Remove</button>
          </div>
        )}
        <form onSubmit={handleLocalSubmit} className="relative mx-auto w-full" style={widthStyle}>
          <input ref={fileInputRef} type="file" accept=".csv,.txt,.md,.json,.pdf" onChange={handleFileAttach} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute left-2 bottom-2 flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Attach file"
          >
            <Paperclip size={14} />
          </button>
          <textarea
            ref={inputRef}
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline (composer convention).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask Elevay..."
            autoFocus
            rows={1}
            className={`w-full resize-none rounded-xl pl-10 pr-20 outline-none transition-all ${big ? "py-3.5 text-[15px]" : "py-2.5 text-[14px]"}`}
            style={{
              background: "var(--color-bg-card)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
              boxShadow: "var(--shadow-card)",
              maxHeight: 200,
              overflowY: "hidden",
              lineHeight: 1.5,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-default)"; }}
            disabled={chat.status === "streaming"}
          />
          <button
            type="button"
            onClick={toggleVoiceInput}
            className="absolute bottom-2 flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ right: localInput.trim() ? 40 : 8, color: isListening ? "var(--color-error)" : "var(--color-text-tertiary)" }}
            title={isListening ? "Stop listening" : "Voice input"}
          >
            {isListening ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
          {localInput.trim() && (
            <Button
              type="submit"
              variant="solid"
              size="sm"
              disabled={chat.status === "streaming"}
              className="absolute right-2 bottom-2"
              icon={<Send size={13} />}
              style={{ borderRadius: "8px" }}
            />
          )}
        </form>
      </>
    );
  }

  // Don't render until thread is loaded (prevents flash of empty state)
  if (!threadLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-accent)" }} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden animate-content-in">
      {/* Thread header (when in a thread) */}
      {threadId && chat.messages.length > 0 && (
        <div
          className="flex shrink-0 items-center gap-2 px-4 py-2 sm:px-6"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <Compass size={14} style={{ color: "var(--color-accent)" }} />
          <span
            className="flex-1 truncate text-[13px] font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {chat.messages.find((m) => m.role === "user")?.parts
              .filter((p) => p.type === "text")
              .map((p) => ("text" in p ? p.text : ""))
              .join("")
              ?.slice(0, 80) || "Chat"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              router.push("/chat");
              setThreadId(null);
              setLastSavedCount(0);
            }}
            style={{ color: "var(--color-accent)" }}
          >
            + New chat
          </Button>
        </div>
      )}

      {/* Messages area */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:py-8">
        {chat.messages.length === 0 && threadLoaded && (
          <div className="mx-auto flex min-h-[72vh] w-full max-w-[560px] flex-col items-center justify-center px-2">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
                boxShadow: "var(--shadow-card)",
                color: "var(--color-accent)",
              }}
            >
              <Compass size={26} />
            </div>
            <h1
              className="mt-6 text-[30px] font-semibold"
              style={{ color: "var(--color-text-primary)", letterSpacing: "-0.5px" }}
            >
              {greeting ? (firstName ? `${greeting}, ${firstName}` : greeting) : "How can I help?"}
            </h1>
            <p
              className="mt-2 text-[14px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Ask about your pipeline, draft outreach, or research an account.
            </p>

            {/* Composer — the focal point of the empty state */}
            <div className="mt-7 w-full">{renderComposer(null, true)}</div>

            {/* Starter prompts — a quiet command list, not a wall of boxes */}
            <div
              className="mt-3 w-full overflow-hidden rounded-xl border"
              style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
            >
              {(suggestions.length > 0
                ? suggestions
                : [
                    "What should I focus on today?",
                    "Summarize my active opportunities",
                    "Which deals are at risk of stalling?",
                    "Research my top accounts to refine my ICP",
                  ]
              )
                .slice(0, 4)
                .map((suggestion, i) => {
                  const Icon = suggestionIcon(suggestion);
                  return (
                    <button
                      key={suggestion}
                      onClick={() => useSuggestion(suggestion)}
                      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                      style={{
                        color: "var(--color-text-secondary)",
                        borderTop: i ? "1px solid var(--color-border-default)" : undefined,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
                    >
                      <Icon size={16} className="shrink-0" style={{ color: "var(--color-accent)" }} />
                      <span className="flex-1 truncate text-[14px]">{suggestion}</span>
                      <ArrowUpRight size={14} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-[740px]">
          {chat.messages.map((message) => (
            <div
              key={message.id}
              className={`mb-6 ${message.role === "user" ? "flex justify-end" : ""}`}
            >
              {message.role === "user" ? (
                /* User message — right-aligned, bg-hover background, rounded-[10px] */
                <div
                  className="max-w-[85%] rounded-[10px] px-3.5 py-2.5"
                  style={{
                    background: "var(--color-bg-hover)",
                    color: "var(--color-text-primary)",
                    fontSize: "15px",
                    lineHeight: "22px",
                    fontWeight: 450,
                  }}
                >
                  {message.parts
                    .filter((part) => part.type === "text")
                    .map((part, i) => (
                      <span key={i}>{"text" in part ? part.text : ""}</span>
                    ))}
                </div>
              ) : (
                /* AI message — left-aligned, NO background, with "Elevay" sparkle label */
                <div className="group/msg min-w-0 max-w-full">
                  {/* AI label */}
                  <div
                    className="mb-2 flex items-center gap-1.5 text-[12px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    <Compass size={13} style={{ color: "var(--color-accent)" }} />
                    <span style={{ fontWeight: 500 }}>Elevay</span>
                  </div>

                  {/* Tool call transparency panels — show both in-progress and completed */}
                  {(() => {
                    const toolCalls = parseUiToolParts(message.parts);
                    if (toolCalls.length === 0) return null;
                    return (
                      <>
                        <ToolCallGroup calls={toolCalls} />
                        {/* Action cards for create/update tool calls (only completed ones) */}
                        {(() => {
                          const completedCalls = toolCalls.filter((call) => !call.isStreaming);
                          const cards = completedCalls
                            .map((call, idx) => {
                              const cardData = parseToolResultForCard(call.toolName, call.args, call.result);
                              if (!cardData) return null;
                              const cardKey = `${message.id}-${idx}`;
                              return { cardData, cardKey, idx };
                            })
                            .filter(Boolean) as { cardData: NonNullable<ReturnType<typeof parseToolResultForCard>>; cardKey: string; idx: number }[];

                          const pendingProposals = cards.filter(
                            (c) => c.cardData.isProposal && (cardStatuses[c.cardKey] || "pending") === "pending"
                          );

                          const approveCard = async (cardKey: string, proposalAction: string | undefined, editedFields: Record<string, string | number | null>, entityName?: string) => {
                            setCardExecuting((prev) => ({ ...prev, [cardKey]: true }));
                            try {
                              // Campaign approval: navigate to the sequence detail.
                              // SPA push instead of a full `window.location.href`
                              // so the user keeps their chat history in memory —
                              // they're likely to come back and continue the
                              // conversation after reviewing the sequence.
                              if (proposalAction === "campaign") {
                                setCardStatuses((prev) => ({ ...prev, [cardKey]: "approved" }));
                                const seqId = (editedFields as Record<string, unknown>).sequenceId;
                                if (typeof seqId === "string" && seqId) {
                                  router.push(`/sequences/${seqId}`);
                                }
                                return;
                              }

                              const endpoint = proposalAction === "createContact" ? "/api/contacts"
                                : proposalAction === "createAccount" ? "/api/accounts"
                                : proposalAction === "createDeal" ? "/api/opportunities"
                                : null;
                              if (endpoint) {
                                const entityType = proposalAction === "createContact" ? "contact"
                                  : proposalAction === "createAccount" ? "account"
                                  : proposalAction === "createDeal" ? "deal" : "record";
                                const res = await fetch(endpoint, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify(editedFields),
                                });
                                if (res.ok) {
                                  const created = await res.json();
                                  setCardStatuses((prev) => ({ ...prev, [cardKey]: "approved" }));

                                  // Trigger sequential workflow: notify LLM so it can propose linked records
                                  const createdId = created.id || created.contact?.id || created.account?.id || created.deal?.id || "";
                                  if (createdId) {
                                    chat.sendMessage({
                                      text: `[Approved: ${entityType} "${entityName || "record"}" created with id ${createdId}. If there are related records to create (e.g., a contact for a new account), propose them now.]`,
                                    });
                                  }
                                } else {
                                  // Surface server errors so the user knows the create didn't
                                  // happen and can either retry or fix the payload.
                                  const errorBody = (await res
                                    .json()
                                    .catch(() => ({}))) as { error?: string };
                                  const serverMsg = errorBody.error ?? null;
                                  if (res.status === 409) {
                                    toast(
                                      `A ${entityType} with this identifier already exists.`,
                                      "error"
                                    );
                                  } else if (res.status === 422 || res.status === 400) {
                                    toast(
                                      `Validation failed: ${serverMsg ?? "check required fields"}.`,
                                      "error"
                                    );
                                  } else {
                                    toast(
                                      `Failed to create ${entityType} (${res.status})${serverMsg ? `: ${serverMsg}` : ""}. Click Approve to retry.`,
                                      "error"
                                    );
                                  }
                                  console.warn("chat: approveCard server error", {
                                    cardKey,
                                    proposalAction,
                                    status: res.status,
                                    serverMsg,
                                  });
                                  // Keep state "pending" so the user can retry from the same card.
                                }
                              }
                            } catch (err) {
                              // Network or unexpected client-side failure.
                              const entityType = proposalAction === "createContact" ? "contact"
                                : proposalAction === "createAccount" ? "account"
                                : proposalAction === "createDeal" ? "deal" : "record";
                              toast(
                                err instanceof Error
                                  ? `Failed to create ${entityType}: ${err.message}`
                                  : `Failed to create ${entityType}. Please try again.`,
                                "error"
                              );
                              console.warn("chat: approveCard failed", {
                                cardKey,
                                proposalAction,
                                err,
                              });
                            } finally {
                              setCardExecuting((prev) => ({ ...prev, [cardKey]: false }));
                            }
                          };

                          return (
                            <>
                              {/* Batch controls when 2+ proposals are pending */}
                              {pendingProposals.length >= 2 && (
                                <div
                                  className="my-2 flex items-center justify-end gap-2 rounded-md px-3 py-1.5"
                                  style={{
                                    background: "var(--color-bg-muted)",
                                    border: "0.5px solid var(--color-border-default)",
                                  }}
                                >
                                  <span className="mr-auto text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                                    {pendingProposals.length} pending
                                  </span>
                                  <button
                                    onClick={() => {
                                      const updates: Record<string, "dismissed"> = {};
                                      for (const p of pendingProposals) updates[p.cardKey] = "dismissed";
                                      setCardStatuses((prev) => ({ ...prev, ...updates }));
                                    }}
                                    className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
                                    style={{ color: "var(--color-text-tertiary)" }}
                                  >
                                    Dismiss all
                                  </button>
                                  <button
                                    onClick={async () => {
                                      for (const p of pendingProposals) {
                                        await approveCard(p.cardKey, p.cardData.proposalAction, p.cardData.fields, p.cardData.entityName);
                                      }
                                    }}
                                    className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium text-white transition-colors"
                                    style={{ background: "var(--color-accent)" }}
                                  >
                                    <Check size={12} />
                                    Create all {pendingProposals.length}
                                  </button>
                                </div>
                              )}

                              {cards.map(({ cardData, cardKey, idx }) => {
                                const cardStatus = cardData.isProposal
                                  ? (cardStatuses[cardKey] || "pending")
                                  : "approved";
                                return (
                                  <ActionCard
                                    key={idx}
                                    actionType={cardData.actionType}
                                    entityType={cardData.entityType}
                                    entityName={cardData.entityName}
                                    fields={cardData.fields}
                                    status={cardStatus}
                                    proposalAction={cardData.proposalAction}
                                    onApprove={cardData.isProposal
                                      ? (editedFields) => approveCard(cardKey, cardData.proposalAction, editedFields, cardData.entityName)
                                      : undefined
                                    }
                                    onDismiss={cardData.isProposal
                                      ? () => setCardStatuses((prev) => ({ ...prev, [cardKey]: "dismissed" }))
                                      : undefined
                                    }
                                  />
                                );
                              })}
                            </>
                          );
                        })()}
                      </>
                    );
                  })()}

                  {/* Message content with entity links */}
                  <div
                    className="prose prose-sm max-w-none overflow-hidden break-words [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5"
                    style={{
                      fontSize: "15px",
                      lineHeight: "22px",
                      color: "var(--color-text-primary)",
                      overflowWrap: "break-word",
                    }}
                  >
                    {message.parts
                      .filter((part) => part.type === "text")
                      .map((part, i) => (
                        <ChatMarkdown key={i}>{"text" in part ? part.text : ""}</ChatMarkdown>
                      ))}
                  </div>

                  {/* Email composer button + copy button */}
                  {(() => {
                    const fullText = message.parts
                      .filter((p) => p.type === "text")
                      .map((p) => ("text" in p ? p.text : ""))
                      .join("");
                    const emailData = detectEmail(fullText);
                    return (
                      <div className="mt-2 flex items-center gap-1.5">
                        {emailData && (
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<Mail size={13} />}
                            onClick={() => setEmailComposer(emailData)}
                            style={{ color: "var(--color-accent)" }}
                          >
                            Open in Composer
                          </Button>
                        )}
                        <div className="opacity-0 transition-opacity group-hover/msg:opacity-100">
                          <CopyButton text={fullText} />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Follow-up suggestions after last assistant message */}
                  {(() => {
                    const isLastAssistant = chat.messages[chat.messages.length - 1]?.id === message.id;
                    if (!isLastAssistant || chat.status === "streaming") return null;
                    const fullText = message.parts
                      .filter((p) => p.type === "text")
                      .map((p) => ("text" in p ? p.text : ""))
                      .join("");
                    const followUps = extractFollowUps(fullText);
                    return (
                      <FollowUpPills
                        suggestions={followUps}
                        onSelect={(s) => useSuggestion(s)}
                        disabled={chat.status !== "ready"}
                      />
                    );
                  })()}
                </div>
              )}
            </div>
          ))}

          {/* Streaming skeleton */}
          {chat.status === "streaming" && <StreamingSkeleton />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error banner */}
      {chat.error && (
        <div className="shrink-0 px-4">
          <div
            className="mx-auto max-w-[740px] rounded-lg px-4 py-2.5 text-[13px] flex items-center justify-between"
            style={{
              background: "oklch(0.97 0.015 25)",
              border: "1px solid oklch(0.85 0.06 25)",
              color: "oklch(0.5 0.14 25)",
            }}
          >
            <span>Something went wrong. Please try again.</span>
            <button
              onClick={() => {
                // Re-send the last user message
                const lastUserMsg = chat.messages.filter(m => m.role === "user").pop();
                if (lastUserMsg) {
                  const text = lastUserMsg.parts.filter(p => p.type === "text").map(p => "text" in p ? p.text : "").join("");
                  if (text) chat.sendMessage({ text });
                }
              }}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{ background: "oklch(0.92 0.04 25)", color: "oklch(0.45 0.14 25)" }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Chat input bar — docked once the conversation has started. When the
          thread is empty the composer lives in the centred hero above. */}
      {chat.messages.length > 0 && (
        <div className="relative shrink-0 px-4 pb-4 pt-3">
          {/* Fade gradient so messages dissolve behind the input */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-full h-8"
            style={{ background: "linear-gradient(to bottom, transparent, var(--color-bg-base))" }}
          />
          {renderComposer(740)}
        </div>
      )}

      {emailComposer && (
        <EmailComposerPanel
          draft={emailComposer}
          onClose={() => setEmailComposer(null)}
        />
      )}
    </div>
  );
}
