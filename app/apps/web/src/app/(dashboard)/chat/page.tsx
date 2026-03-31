"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useRef, useEffect, useState } from "react";

export default function ChatPage() {
  const chat = useChat({
    transport: new TextStreamChatTransport({ api: "/api/chat" }),
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localInput, setLocalInput] = useState("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  function handleLocalSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Use localInput state, or fall back to DOM value for Playwright compatibility
    const text = localInput.trim() || inputRef.current?.value?.trim() || "";
    if (!text) return;
    chat.sendMessage({ text });
    setLocalInput("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function useSuggestion(text: string) {
    setLocalInput(text);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-6">
        {chat.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center">
            <h2 className="text-lg font-semibold text-[#e8e8ed]">
              Ask LeadSens
            </h2>
            <p className="mt-1 text-sm text-[#5a5a70]">
              Ask about your pipeline, accounts, or get help with outreach.
            </p>
            <div className="mt-6 grid gap-2">
              {[
                "How many contacts do I have?",
                "Show me my active opportunities",
                "Draft a follow-up email to my last meeting",
                "Which accounts need attention?",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => useSuggestion(suggestion)}
                  className="rounded-lg border border-[#1e1f2a] px-4 py-2 text-left text-sm text-[#8b8ba0] hover:border-[#6366f1] hover:text-[#e8e8ed]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.messages.map((message) => (
          <div
            key={message.id}
            className={`mb-4 ${message.role === "user" ? "flex justify-end" : ""}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 ${
                message.role === "user"
                  ? "bg-[#1a1b24] text-[#e8e8ed]"
                  : "text-[#e8e8ed]"
              }`}
            >
              {message.role === "assistant" && (
                <div className="mb-1 flex items-center gap-1.5 text-xs text-[#5a5a70]">
                  <span className="text-[#6366f1]">✦</span> LeadSens
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part, i) => (
                    <span key={i}>{"text" in part ? part.text : ""}</span>
                  ))}
              </div>
            </div>
          </div>
        ))}

        {chat.status === "streaming" && (
          <div className="mb-4">
            <div className="text-sm text-[#5a5a70]">
              <span className="text-[#6366f1]">✦</span> LeadSens is thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[#1e1f2a] p-4">
        <form onSubmit={handleLocalSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            placeholder="Ask LeadSens..."
            className="flex-1 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-2.5 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
            disabled={chat.status === "streaming"}
          />
          <button
            type="submit"
            disabled={chat.status === "streaming" || !localInput.trim()}
            className="rounded-lg bg-[#6366f1] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
