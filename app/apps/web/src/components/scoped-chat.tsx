"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, Send } from "lucide-react";

interface ScopedChatProps {
  contextType: "account" | "contact" | "deal";
  contextId: string;
  contextLabel: string;
}

export function ScopedChat({ contextType, contextId, contextLabel }: ScopedChatProps) {
  const chat = useChat({
    transport: new TextStreamChatTransport({
      api: "/api/chat",
      body: { contextType, contextId },
    }),
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [localInput, setLocalInput] = useState("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = localInput.trim();
    if (!text) return;
    chat.sendMessage({ text });
    setLocalInput("");
  }

  return (
    <div className="rounded-lg" style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)" }}>
      {/* Context badge */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "0.5px solid var(--color-border-default)" }}>
        <span className="rounded px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
          {contextLabel}
        </span>
        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
          Scoped to this {contextType}
        </span>
      </div>

      {/* Messages */}
      {chat.messages.length > 0 && (
        <div className="max-h-60 space-y-2 overflow-auto px-3 py-2">
          {chat.messages.map((msg) => (
            <div key={msg.id} className={msg.role === "user" ? "text-right" : ""}>
              <div className="inline-block max-w-[90%] rounded-lg px-3 py-2 text-[12px]"
                style={{
                  background: msg.role === "user" ? "var(--color-bg-muted)" : "transparent",
                  color: msg.role === "user" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                }}>
                {msg.role === "assistant" && (
                  <Sparkles size={10} className="mr-1 inline" style={{ color: "var(--color-accent)" }} />
                )}
                <div className="prose prose-invert prose-xs max-w-none [&_p]:my-0.5">
                  {msg.parts
                    .filter((p) => p.type === "text")
                    .map((p, i) => (
                      <ReactMarkdown key={i}>{"text" in p ? p.text : ""}</ReactMarkdown>
                    ))}
                </div>
              </div>
            </div>
          ))}
          {chat.status === "streaming" && (
            <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
              <Sparkles size={10} className="animate-pulse" style={{ color: "var(--color-accent)" }} />
              Thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2"
        style={{ borderTop: chat.messages.length > 0 ? "0.5px solid var(--color-border-default)" : "none" }}>
        <input value={localInput} onChange={(e) => setLocalInput(e.target.value)}
          placeholder={`Ask about ${contextLabel}...`}
          className="flex-1 bg-transparent text-[13px] outline-none"
          style={{ color: "var(--color-text-primary)" }}
          disabled={chat.status === "streaming"} />
        <button type="submit" disabled={chat.status === "streaming" || !localInput.trim()}
          className="disabled:opacity-30"
          style={{ color: "var(--color-accent)" }}>
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
