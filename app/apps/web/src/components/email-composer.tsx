"use client";

import { useState } from "react";
import { X, Send, Bold, Italic } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmailComposerProps {
  to: string;
  subject: string;
  body: string;
  onClose: () => void;
  onSend?: (data: { to: string; subject: string; body: string }) => void;
}

export function EmailComposer({ to, subject, body, onClose, onSend }: EmailComposerProps) {
  const [editTo, setEditTo] = useState(to);
  const [editSubject, setEditSubject] = useState(subject);
  const [editBody, setEditBody] = useState(body);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!editTo.trim() || !editBody.trim()) return;
    setSending(true);
    try {
      if (onSend) {
        onSend({ to: editTo, subject: editSubject, body: editBody });
      } else {
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: editTo, subject: editSubject, body: editBody }),
        });
        if (!res.ok) throw new Error("Send failed");
      }
      setSent(true);
      setTimeout(onClose, 1500);
    } catch { /* */ } finally { setSending(false); }
  }

  return (
    <div
      className="slide-in-right fixed right-0 top-0 z-50 flex h-full flex-col"
      style={{
        width: "var(--detail-panel-width)",
        background: "var(--color-bg-card)",
        borderLeft: "1px solid var(--color-border-default)",
        boxShadow: "var(--shadow-panel)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border-default)" }}
      >
        <h3 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {editSubject || "New Email"}
        </h3>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
          style={{ color: "var(--color-text-tertiary)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Fields */}
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
        <div className="flex items-center gap-2">
          <span className="w-12 text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>To</span>
          <input
            value={editTo}
            onChange={(e) => setEditTo(e.target.value)}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--color-text-primary)" }}
            placeholder="recipient@example.com"
          />
        </div>
      </div>
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
        <div className="flex items-center gap-2">
          <span className="w-12 text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>Subject</span>
          <input
            value={editSubject}
            onChange={(e) => setEditSubject(e.target.value)}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--color-text-primary)" }}
            placeholder="Subject line"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        <textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          className="h-full w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none"
          style={{ color: "var(--color-text-primary)" }}
          placeholder="Write your email..."
        />
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: "1px solid var(--color-border-default)" }}
      >
        <div className="flex gap-1">
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Bold"
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Bold size={14} />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Italic"
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Italic size={14} />
          </button>
        </div>
        {sent ? (
          <span className="text-[13px] font-medium" style={{ color: "var(--color-success)" }}>Sent</span>
        ) : (
          <Button
            variant="gradient"
            size="md"
            onClick={handleSend}
            disabled={sending || !editTo.trim()}
            loading={sending}
            icon={!sending ? <Send size={13} /> : undefined}
          >
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
