"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { EmailComposer } from "@/components/email-composer";
import { Sparkles, Send, Mail } from "lucide-react";

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

  return (
    <div className="flex h-full flex-col">
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

                  {/* Action indicator */}
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
                      <div
                        className="mb-2 text-[11px] font-medium"
                        style={{ color: "var(--color-warning)", opacity: 0.7 }}
                      >
                        {indicator}
                      </div>
                    );
                  })()}

                  {/* Message content */}
                  <div
                    className="prose prose-invert prose-sm max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5"
                    style={{
                      fontSize: "15px",
                      lineHeight: "22px",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {message.parts
                      .filter((part) => part.type === "text")
                      .map((part, i) => (
                        <ReactMarkdown key={i}>{"text" in part ? part.text : ""}</ReactMarkdown>
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
