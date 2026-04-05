"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useRef, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ToolCallGroup } from "@/components/tool-call-panel";
import { ActionCard, parseToolResultForCard } from "@/components/action-card";
import { EmailComposer } from "@/components/email-composer";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Mail, Check } from "lucide-react";

export default function ChatPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | null>(searchParams.get("thread"));
  const [threadLoaded, setThreadLoaded] = useState(!searchParams.get("thread"));

  const chat = useChat({
    transport: new TextStreamChatTransport({
      api: "/api/chat",
      credentials: "include",
    }),
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localInput, setLocalInput] = useState("");
  const [autoSent, setAutoSent] = useState(false);
  const [lastSavedCount, setLastSavedCount] = useState(0);
  const [emailComposer, setEmailComposer] = useState<{
    to: string;
    subject: string;
    body: string;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  // Save messages to thread after AI finishes responding
  const saveMessages = useCallback(async () => {
    if (chat.status === "streaming") return;
    if (chat.messages.length <= lastSavedCount) return;

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
        if (res.ok) {
          const data = await res.json();
          const newThreadId = data.thread.id;
          setThreadId(newThreadId);

          // Save all messages to the new thread
          await fetch(`/api/chat/threads/${newThreadId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: messagesToSave, title }),
          });

          // Update URL without navigation
          window.history.replaceState(null, "", `/chat?thread=${newThreadId}`);
        }
      } catch {
        // Silent fail — messages stay in memory
      }
    } else {
      // Append to existing thread
      try {
        await fetch(`/api/chat/threads/${threadId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: messagesToSave }),
        });
      } catch {
        // Silent fail
      }
    }

    setLastSavedCount(chat.messages.length);
  }, [chat.messages, chat.status, threadId, lastSavedCount]);

  // Trigger save when streaming completes
  useEffect(() => {
    if (chat.status === "ready" && chat.messages.length > lastSavedCount) {
      saveMessages();
    }
  }, [chat.status, chat.messages.length, lastSavedCount, saveMessages]);

  function handleLocalSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = localInput.trim() || inputRef.current?.value?.trim() || "";
    if (!text) return;
    chat.sendMessage({ text });
    setLocalInput("");
    if (inputRef.current) inputRef.current.value = "";
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

  // Don't render until thread is loaded (prevents flash of empty state)
  if (!threadLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Sparkles size={20} className="animate-pulse" style={{ color: "var(--color-accent)" }} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Thread header (when in a thread) */}
      {threadId && chat.messages.length > 0 && (
        <div
          className="flex shrink-0 items-center gap-2 px-4 py-2 sm:px-6"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <Sparkles size={14} style={{ color: "var(--color-accent)" }} />
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
          <div className="mx-auto flex min-h-[60vh] max-w-[740px] flex-col items-center justify-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "var(--color-accent-soft)" }}
            >
              <Sparkles size={20} style={{ color: "var(--color-accent)" }} />
            </div>
            <h2
              className="mt-4 text-xl font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              What can I help you with?
            </h2>
            <p
              className="mt-1.5 text-[13px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Ask about your pipeline, accounts, or get help with outreach.
            </p>
            <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {(suggestions.length > 0
                ? suggestions
                : [
                    "What should I focus on today?",
                    "Summarize my active opportunities",
                    "Which deals are at risk of stalling?",
                    "Draft a follow-up email to my last meeting",
                    "Who haven't I followed up with?",
                    "Research my top accounts to refine my ICP",
                  ]
              ).map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => useSuggestion(suggestion)}
                  className="rounded-lg px-4 py-3 text-left text-[13px] transition-all hover:brightness-95"
                  style={{
                    background: "var(--color-bg-card)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border-default)",
                  }}
                >
                  {suggestion}
                </button>
              ))}
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
                /* AI message — left-aligned, NO background, with "LeadSens" sparkle label */
                <div className="min-w-0 max-w-full">
                  {/* AI label */}
                  <div
                    className="mb-2 flex items-center gap-1.5 text-[12px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    <Sparkles size={13} style={{ color: "var(--color-accent)" }} />
                    <span style={{ fontWeight: 500 }}>LeadSens</span>
                  </div>

                  {/* Tool call transparency panels — show both in-progress and completed */}
                  {(() => {
                    const toolCalls = message.parts
                      .filter((p) => p.type === "tool-invocation")
                      .map((p) => {
                        const inv = (p as unknown as { toolInvocation: { state: string; toolName: string; args: Record<string, unknown>; result: unknown } }).toolInvocation;
                        if (!inv) return null;
                        return {
                          toolName: inv.toolName,
                          args: inv.args || {},
                          result: inv.state === "result" ? inv.result : undefined,
                          isStreaming: inv.state !== "result",
                        };
                      })
                      .filter(Boolean) as { toolName: string; args: Record<string, unknown>; result: unknown; isStreaming: boolean }[];
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
                              const endpoint = proposalAction === "createContact" ? "/api/contacts"
                                : proposalAction === "createAccount" ? "/api/accounts"
                                : proposalAction === "createDeal" ? "/api/deals"
                                : null;
                              if (endpoint) {
                                const res = await fetch(endpoint, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify(editedFields),
                                });
                                if (res.ok) {
                                  const created = await res.json();
                                  setCardStatuses((prev) => ({ ...prev, [cardKey]: "approved" }));

                                  // Trigger sequential workflow: notify LLM so it can propose linked records
                                  const entityType = proposalAction === "createContact" ? "contact"
                                    : proposalAction === "createAccount" ? "account"
                                    : proposalAction === "createDeal" ? "deal" : "record";
                                  const createdId = created.id || created.contact?.id || created.account?.id || created.deal?.id || "";
                                  if (createdId) {
                                    chat.sendMessage({
                                      text: `[Approved: ${entityType} "${entityName || "record"}" created with id ${createdId}. If there are related records to create (e.g., a contact for a new account), propose them now.]`,
                                    });
                                  }
                                }
                              }
                            } catch {
                              // Silent fail
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

                  {/* Email composer button */}
                  {(() => {
                    const fullText = message.parts
                      .filter((p) => p.type === "text")
                      .map((p) => ("text" in p ? p.text : ""))
                      .join("");
                    const emailData = detectEmail(fullText);
                    if (!emailData) return null;
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Mail size={13} />}
                        onClick={() => setEmailComposer(emailData)}
                        className="mt-3"
                        style={{ color: "var(--color-accent)" }}
                      >
                        Open in Composer
                      </Button>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}

          {/* Streaming indicator */}
          {chat.status === "streaming" && (
            <div className="mb-6">
              <div
                className="flex items-center gap-1.5 text-[12px]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <Sparkles size={13} className="animate-pulse" style={{ color: "var(--color-accent)" }} />
                <span style={{ fontWeight: 500 }}>LeadSens is thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat input bar — bottom, same max-w as messages */}
      <div className="relative shrink-0 px-4 pb-4 pt-3">
        {/* Fade gradient so messages dissolve behind the input */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-full h-8"
          style={{
            background: "linear-gradient(to bottom, transparent, var(--color-bg-base))",
          }}
        />
        <form onSubmit={handleLocalSubmit} className="relative mx-auto max-w-[740px]">
          <Sparkles
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-text-tertiary)" }}
          />
          <input
            ref={inputRef}
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            placeholder="Ask LeadSens..."
            className="w-full rounded-xl py-2.5 pl-10 pr-12 text-[14px] outline-none transition-all"
            style={{
              background: "var(--color-bg-card)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
              boxShadow: "var(--shadow-card)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-focus)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-default)";
            }}
            disabled={chat.status === "streaming"}
          />
          {localInput.trim() && (
            <Button
              type="submit"
              variant="solid"
              size="sm"
              disabled={chat.status === "streaming"}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              icon={<Send size={13} />}
              style={{ borderRadius: "8px" }}
            />
          )}
        </form>
      </div>

      {emailComposer && (
        <EmailComposer
          to={emailComposer.to}
          subject={emailComposer.subject}
          body={emailComposer.body}
          onClose={() => setEmailComposer(null)}
        />
      )}
    </div>
  );
}
