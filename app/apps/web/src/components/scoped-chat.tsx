"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

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
    <div className="rounded-lg border border-[#1e1f2a] bg-[#12131a]">
      {/* Context badge */}
      <div className="flex items-center gap-2 border-b border-[#1e1f2a] px-3 py-2">
        <span className="rounded bg-[#6366f1]/10 px-2 py-0.5 text-[10px] font-medium text-[#6366f1]">
          {contextLabel}
        </span>
        <span className="text-[10px] text-[#5a5a70]">Chat is scoped to this {contextType}</span>
      </div>

      {/* Messages */}
      {chat.messages.length > 0 && (
        <div className="max-h-60 overflow-auto px-3 py-2 space-y-2">
          {chat.messages.map((msg) => (
            <div key={msg.id} className={msg.role === "user" ? "text-right" : ""}>
              <div className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-xs ${
                msg.role === "user"
                  ? "bg-[#1a1b24] text-[#e8e8ed]"
                  : "text-[#8b8ba0]"
              }`}>
                {msg.role === "assistant" && (
                  <span className="text-[#6366f1] mr-1">✦</span>
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
            <div className="text-[10px] text-[#5a5a70]">
              <span className="text-[#6366f1]">✦</span> Thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2">
        <input
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          placeholder={`Ask about ${contextLabel}...`}
          className="flex-1 bg-transparent text-sm text-[#e8e8ed] outline-none placeholder-[#5a5a70]"
          disabled={chat.status === "streaming"}
        />
        <button
          type="submit"
          disabled={chat.status === "streaming" || !localInput.trim()}
          className="text-[#6366f1] hover:text-[#5558e6] disabled:opacity-30 text-sm"
        >
          ↑
        </button>
      </form>
    </div>
  );
}
