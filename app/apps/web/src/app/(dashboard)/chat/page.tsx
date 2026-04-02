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
import { Sparkles, Send, Mail } from "lucide-react";

export default function ChatPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | null>(searchParams.get("thread"));
  const [threadLoaded, setThreadLoaded] = useState(!searchParams.get("thread"));

  const chat = useChat({
    transport: new TextStreamChatTransport({ api: "/api/chat" }),
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
    body = body.replace(/^[-—]+\n?/, "").trim();
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
    <div className="flex h-full flex-col">
      {/* Thread header (when in a thread) */}
      {threadId && chat.messages.length > 0 && (
        <div
          className="flex items-center gap-2 px-6 py-2"
          style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
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
          <button
            onClick={() => {
              router.push("/chat");
              setThreadId(null);
              setLastSavedCount(0);
            }}
            className="text-[12px] font-medium"
            style={{ color: "var(--color-accent)" }}
          >
            + New chat
          </button>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-auto px-6 py-8">
        {chat.messages.length === 0 && (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center">
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
              Ask LeadSens
            </h2>
            <p
              className="mt-1.5 text-[13px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Ask about your pipeline, accounts, or get help with outreach.
            </p>
            <div className="mt-8 grid w-full max-w-lg gap-2">
              {[
                "What should I focus on today?",
                "Summarize my active opportunities",
                "Which deals are at risk of stalling?",
                "Draft a follow-up email to my last meeting",
                "Who haven't I followed up with?",
                "What's my pipeline value by stage?",
                "Help me prepare for my next meeting",
                "Research my top accounts to refine my ICP",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => useSuggestion(suggestion)}
                  className="rounded-md px-4 py-2.5 text-left text-[13px] transition-colors"
                  style={{
                    color: "var(--color-text-secondary)",
                    border: "0.5px solid var(--color-border-moderate)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-accent)";
                    e.currentTarget.style.color = "var(--color-text-primary)";
                    e.currentTarget.style.background = "var(--color-accent-muted)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-moderate)";
                    e.currentTarget.style.color = "var(--color-text-secondary)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-2xl">
          {chat.messages.map((message) => (
            <div
              key={message.id}
              className={`mb-6 ${message.role === "user" ? "flex justify-end" : ""}`}
            >
              {message.role === "user" ? (
                /* User message — right-aligned, subtle bg, rounded */
                <div
                  className="max-w-[85%] rounded-[10px] px-3.5 py-2.5"
                  style={{
                    background: "var(--color-bg-muted)",
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
                /* AI message — left-aligned, no bg, with label */
                <div className="max-w-[90%]">
                  {/* AI label */}
                  <div
                    className="mb-2 flex items-center gap-1.5 text-[12px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    <Sparkles size={13} style={{ color: "var(--color-accent)" }} />
                    <span style={{ fontWeight: 500 }}>LeadSens</span>
                  </div>

                  {/* Tool call transparency panels */}
                  {(() => {
                    const toolCalls = message.parts
                      .filter((p) => p.type === "tool-invocation")
                      .map((p) => {
                        const inv = (p as unknown as { toolInvocation: { state: string; toolName: string; args: Record<string, unknown>; result: unknown } }).toolInvocation;
                        if (!inv || inv.state !== "result") return null;
                        return { toolName: inv.toolName, args: inv.args, result: inv.result };
                      })
                      .filter(Boolean) as { toolName: string; args: Record<string, unknown>; result: unknown }[];
                    if (toolCalls.length === 0) return null;
                    return (
                      <>
                        <ToolCallGroup calls={toolCalls} />
                        {/* Action cards for create/update tool calls */}
                        {toolCalls.map((call, idx) => {
                          const cardData = parseToolResultForCard(call.toolName, call.args, call.result);
                          if (!cardData) return null;
                          return (
                            <ActionCard
                              key={idx}
                              actionType={cardData.actionType}
                              entityType={cardData.entityType}
                              entityName={cardData.entityName}
                              fields={cardData.fields}
                              status="approved"
                            />
                          );
                        })}
                      </>
                    );
                  })()}

                  {/* Message content with entity links */}
                  <div
                    className="prose prose-sm max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5"
                    style={{
                      fontSize: "15px",
                      lineHeight: "22px",
                      color: "var(--color-text-primary)",
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
                      <button
                        onClick={() => setEmailComposer(emailData)}
                        className="mt-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors"
                        style={{
                          color: "var(--color-accent)",
                          background: "var(--color-bg-surface)",
                          border: "0.5px solid var(--color-border-moderate)",
                        }}
                      >
                        <Mail size={13} />
                        Open in Composer
                      </button>
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

      {/* Chat input bar — bottom fixed */}
      <div
        className="px-6 pb-4 pt-3"
        style={{ borderTop: "0.5px solid var(--color-border-default)" }}
      >
        <form onSubmit={handleLocalSubmit} className="mx-auto flex max-w-2xl gap-2">
          <input
            ref={inputRef}
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            placeholder="Ask LeadSens..."
            className="flex-1 rounded-md px-4 py-2.5 text-[15px] outline-none transition-colors"
            style={{
              background: "var(--color-bg-surface)",
              color: "var(--color-text-primary)",
              border: "0.5px solid var(--color-border-moderate)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-moderate)";
            }}
            disabled={chat.status === "streaming"}
          />
          <button
            type="submit"
            disabled={chat.status === "streaming" || !localInput.trim()}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-md text-white transition-colors disabled:opacity-40"
            style={{ background: "var(--color-accent)" }}
          >
            <Send size={16} />
          </button>
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
