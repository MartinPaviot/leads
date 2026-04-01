"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { EmailComposer } from "@/components/email-composer";

export default function ChatPage() {
  const chat = useChat({
    transport: new TextStreamChatTransport({ api: "/api/chat" }),
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localInput, setLocalInput] = useState("");
  const [emailComposer, setEmailComposer] = useState<{
    to: string;
    subject: string;
    body: string;
  } | null>(null);

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

  function detectEmail(text: string): { to: string; subject: string; body: string } | null {
    // Detect "Subject:" and email-like patterns in AI responses
    const subjectMatch = text.match(/Subject:\s*(.+)/i);
    const toMatch = text.match(/To:\s*(.+@.+)/i);
    if (!subjectMatch) return null;
    const subject = subjectMatch[1].trim();
    // Extract body: everything after "Subject:" line, or after greeting
    const bodyStart = text.indexOf(subjectMatch[0]) + subjectMatch[0].length;
    let body = text.slice(bodyStart).trim();
    // Clean up any "---" separators
    body = body.replace(/^[-—]+\n?/, "").trim();
    if (!body || body.length < 20) return null;
    return {
      to: toMatch ? toMatch[1].trim() : "",
      subject,
      body,
    };
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
                <div className="mb-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#5a5a70]">
                    <span className="text-[#6366f1]">✦</span> LeadSens
                  </div>
                  {(() => {
                    const text = message.parts
                      .filter((p) => p.type === "text")
                      .map((p) => ("text" in p ? p.text : ""))
                      .join("");
                    const hasData = /\d+ (contact|deal|account|opportunit|task|meeting)/i.test(text);
                    const hasEmail = /Subject:/i.test(text);
                    const hasAnalysis = /(should|recommend|priorit|focus|risk|stall|prepare)/i.test(text);
                    const indicator = hasEmail ? "Drafted email" : hasData ? "Retrieved CRM data" : hasAnalysis ? "Analyzed data" : null;
                    if (!indicator) return null;
                    return (
                      <span className="ml-5 text-[10px] text-amber-400/70">{indicator}</span>
                    );
                  })()}
                </div>
              )}
              <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part, i) => (
                    <ReactMarkdown key={i}>{"text" in part ? part.text : ""}</ReactMarkdown>
                  ))}
              </div>
              {message.role === "assistant" && (() => {
                const fullText = message.parts
                  .filter((p) => p.type === "text")
                  .map((p) => ("text" in p ? p.text : ""))
                  .join("");
                const emailData = detectEmail(fullText);
                if (!emailData) return null;
                return (
                  <button
                    onClick={() => setEmailComposer(emailData)}
                    className="mt-2 flex items-center gap-1.5 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-1.5 text-xs text-[#6366f1] hover:border-[#6366f1]"
                  >
                    ✉️ Open in Composer
                  </button>
                );
              })()}
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
