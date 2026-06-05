"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState } from "react";
import { ChatMarkdown } from "./chat-markdown";
import { ToolCallGroup, parseUiToolParts } from "./tool-call-panel";
import { Compass, Send, Building2, Users, TrendingUp, Calendar, List, X, Maximize2, Minimize2, Loader2 } from "lucide-react";

interface ScopedChatProps {
  /**
   * Surface kind. "account"/"contact"/"deal"/"meeting" seed the CHAT-02
   * resolver with the specific record; "list" seeds it with a list-view
   * resource (contextId = resource name, e.g. "deals", "contacts").
   */
  contextType: "account" | "contact" | "deal" | "meeting" | "list";
  contextId: string;
  contextLabel: string;
}

const contextIcons = {
  account: Building2,
  contact: Users,
  deal: TrendingUp,
  meeting: Calendar,
  list: List,
};

const contextColors = {
  account: "oklch(0.65 0.15 250)",
  contact: "oklch(0.65 0.15 145)",
  deal: "oklch(0.65 0.15 30)",
  meeting: "oklch(0.65 0.15 300)",
  list: "oklch(0.65 0.15 200)",
};

export function ScopedChat({ contextType, contextId, contextLabel }: ScopedChatProps) {
  const chat = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      credentials: "include",
      body: { contextType, contextId },
    }),
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [localInput, setLocalInput] = useState("");
  const [expanded, setExpanded] = useState(false);

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

  const Icon = contextIcons[contextType];
  const accentColor = contextColors[contextType];

  return (
    <div
      className="rounded-lg overflow-hidden transition-all"
      style={{
        background: "var(--color-bg-surface)",
        border: "0.5px solid var(--color-border-default)",
        maxHeight: expanded ? "80vh" : "400px",
      }}
    >
      {/* Context badge header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
      >
        <div
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ background: `color-mix(in oklch, ${accentColor} 12%, transparent)` }}
        >
          <Icon size={11} style={{ color: accentColor }} />
          <span
            className="text-[11px] font-medium"
            style={{ color: accentColor }}
          >
            {contextLabel}
          </span>
        </div>
        <span className="flex-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
          Context: {contextType}
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded p-1 transition-colors"
          style={{ color: "var(--color-text-tertiary)" }}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      {/* Messages */}
      <div
        className="space-y-3 overflow-auto px-3 py-2"
        style={{ maxHeight: expanded ? "calc(80vh - 90px)" : "280px" }}
      >
        {chat.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Compass size={16} style={{ color: "var(--color-text-tertiary)" }} />
            <span className="mt-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              Ask anything about {contextLabel}
            </span>
          </div>
        )}

        {chat.messages.map((msg) => (
          <div key={msg.id} className={msg.role === "user" ? "text-right" : ""}>
            {msg.role === "assistant" && (() => {
              const toolCalls = parseUiToolParts(msg.parts);
              if (toolCalls.length === 0) return null;
              return <ToolCallGroup calls={toolCalls} />;
            })()}
            <div
              className="inline-block max-w-[90%] rounded-lg px-3 py-2 text-[12px]"
              style={{
                background: msg.role === "user" ? "var(--color-bg-hover)" : "transparent",
                color: msg.role === "user" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              }}
            >
              {msg.role === "assistant" && (
                <div className="mb-1 flex items-center gap-1">
                  <Compass size={10} style={{ color: "var(--color-accent)" }} />
                  <span className="text-[10px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
                    Elevay
                  </span>
                </div>
              )}
              <div className="prose prose-xs max-w-none [&_p]:my-0.5">
                {msg.parts
                  .filter((p) => p.type === "text")
                  .map((p, i) => (
                    <ChatMarkdown key={i}>{"text" in p ? p.text : ""}</ChatMarkdown>
                  ))}
              </div>
            </div>
          </div>
        ))}

        {chat.status === "streaming" && (
          <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
            <Loader2 size={12} className="animate-spin" style={{ color: "var(--color-accent)" }} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative">
        {/* Fade gradient — messages dissolve behind the input */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-full h-6"
          style={{
            background: "linear-gradient(to bottom, transparent, var(--color-bg-surface))",
          }}
        />
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-3 py-2"
      >
        <Compass size={12} style={{ color: "var(--color-text-tertiary)" }} />
        <input
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          placeholder={`Ask about ${contextLabel}...`}
          className="flex-1 bg-transparent text-[13px] outline-none"
          style={{ color: "var(--color-text-primary)" }}
          disabled={chat.status === "streaming"}
        />
        <button
          type="submit"
          disabled={chat.status === "streaming" || !localInput.trim()}
          className="rounded-md p-1 transition-all disabled:opacity-30"
          style={{ color: "var(--color-accent)" }}
        >
          <Send size={14} />
        </button>
      </form>
      </div>
    </div>
  );
}
