"use client";

/**
 * F009 — Conversational Onboarding
 *
 * Replaces the 7-step wizard with a chat interface. The agent extracts
 * all onboarding data from a natural conversation and configures the
 * workspace using tools.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Mail, ArrowRight } from "lucide-react";

interface OnboardingChatProps {
  onComplete: () => void;
  hasGoogle: boolean;
  hasMicrosoft?: boolean;
  userEmail?: string;
  userName?: string;
  companyDomain?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function OnboardingChat({
  onComplete,
  hasGoogle,
  hasMicrosoft,
  userEmail,
  userName,
  companyDomain,
}: OnboardingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailConnect, setShowEmailConnect] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasInitialized = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    sendInitialMessage();
  }, []);

  async function sendInitialMessage() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [],
          userName,
          companyDomain,
          hasEmailConnected: hasGoogle || hasMicrosoft,
        }),
      });

      if (!res.ok) throw new Error("Failed to start onboarding chat");

      const data = await res.json();
      setMessages([{
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message,
      }]);

      if (data.showEmailConnect) setShowEmailConnect(true);
      if (data.isComplete) handleComplete();
    } catch {
      setMessages([{
        id: crypto.randomUUID(),
        role: "assistant",
        content: userName
          ? `Hi ${userName}! Tell me about your business — what do you sell and who are your ideal customers?`
          : "Hi! Tell me about your business — what do you sell and who are your ideal customers?",
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          userName,
          companyDomain,
          hasEmailConnected: hasGoogle || hasMicrosoft,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const data = await res.json();

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message,
      }]);

      if (data.showEmailConnect) setShowEmailConnect(true);
      if (data.isComplete) handleComplete();
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Something went wrong. Could you try again?",
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleComplete() {
    setIsComplete(true);
    setTimeout(() => onComplete(), 3000);
  }

  async function handleConnectGoogle() {
    window.location.href = "/api/auth/google/connect?redirect=/";
  }

  async function handleConnectMicrosoft() {
    window.location.href = "/api/auth/microsoft/connect?redirect=/";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "var(--color-bg-app)" }}>
      <div className="flex w-full max-w-2xl flex-col" style={{ height: "min(80vh, 700px)" }}>
        {/* Header */}
        <div className="px-6 py-4 text-center">
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Set up your workspace
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-tertiary)" }}>
            Tell me about your business and I'll configure everything
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"
                }`}
                style={{
                  background: msg.role === "user"
                    ? "var(--color-bg-brand)"
                    : "var(--color-bg-card)",
                  color: msg.role === "user"
                    ? "var(--color-text-on-brand)"
                    : "var(--color-text-primary)",
                  border: msg.role === "assistant" ? "1px solid var(--color-border-default)" : "none",
                }}
              >
                {msg.content.split("\n").map((line, i) => (
                  <p key={i} className={i > 0 ? "mt-2" : ""}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div
                className="rounded-2xl rounded-bl-md px-4 py-3"
                style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
              >
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
              </div>
            </div>
          )}

          {/* Email connect prompt */}
          {showEmailConnect && !hasGoogle && !hasMicrosoft && (
            <div
              className="rounded-xl p-4"
              style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
            >
              <p className="mb-3 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                Connect your email to get started
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConnectGoogle}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                  style={{ background: "var(--color-bg-brand)", color: "var(--color-text-on-brand)" }}
                >
                  <Mail className="h-4 w-4" />
                  Google
                </button>
                <button
                  onClick={handleConnectMicrosoft}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                  style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)" }}
                >
                  <Mail className="h-4 w-4" />
                  Microsoft
                </button>
              </div>
            </div>
          )}

          {/* Complete state */}
          {isComplete && (
            <div
              className="rounded-xl p-4 text-center"
              style={{ background: "var(--color-bg-success-subtle)", border: "1px solid var(--color-border-success)" }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--color-text-success)" }}>
                Workspace configured. Building your target accounts...
              </p>
              <div className="mt-2 flex items-center justify-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--color-text-success)" }} />
                <span className="text-xs" style={{ color: "var(--color-text-success)" }}>Redirecting</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {!isComplete && (
          <form onSubmit={handleSubmit} className="px-6 pb-6">
            <div
              className="flex items-center gap-2 rounded-xl px-4 py-2.5"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe your business..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--color-text-primary)" }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="rounded-lg p-1.5 transition-colors disabled:opacity-30"
                style={{ background: input.trim() ? "var(--color-bg-brand)" : "transparent" }}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
                ) : (
                  <ArrowRight className="h-4 w-4" style={{ color: input.trim() ? "var(--color-text-on-brand)" : "var(--color-text-tertiary)" }} />
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
