"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, ChevronDown, ChevronUp, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sanitizeHtml } from "@/lib/infra/sanitize-html";

interface EmailComposerProps {
  to: string;
  subject: string;
  body: string;
  onClose: () => void;
  onSend?: (data: { to: string; cc: string; bcc: string; subject: string; body: string }) => void;
}

/** Pill-style email tag */
function EmailPill({ email, onRemove }: { email: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px]"
      style={{
        background: "var(--color-bg-muted)",
        color: "var(--color-text-primary)",
        border: "0.5px solid var(--color-border-default)",
      }}
    >
      {email}
      <button
        onClick={onRemove}
        className="ml-0.5 flex items-center"
        style={{ color: "var(--color-text-muted)" }}
      >
        <X size={10} />
      </button>
    </span>
  );
}

/** Editable email field with pill tags */
function EmailField({
  label,
  emails,
  onChange,
  placeholder,
}: {
  label: string;
  emails: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addEmail(raw: string) {
    const trimmed = raw.trim();
    if (trimmed && trimmed.includes("@") && !emails.includes(trimmed)) {
      onChange([...emails, trimmed]);
    }
    setInputValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === "Backspace" && !inputValue && emails.length > 0) {
      onChange(emails.slice(0, -1));
    }
  }

  return (
    <div
      className="flex items-start gap-2 px-4 py-2"
      style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
      onClick={() => inputRef.current?.focus()}
    >
      <span
        className="mt-0.5 w-12 shrink-0 text-[12px] font-medium"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {emails.map((email, i) => (
          <EmailPill
            key={i}
            email={email}
            onRemove={() => onChange(emails.filter((_, idx) => idx !== i))}
          />
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (inputValue.trim()) addEmail(inputValue); }}
          className="min-w-[120px] flex-1 bg-transparent text-[13px] outline-none"
          style={{ color: "var(--color-text-primary)" }}
          placeholder={emails.length === 0 ? (placeholder || "email@example.com") : ""}
        />
      </div>
    </div>
  );
}

export function EmailComposer({ to, subject, body, onClose, onSend }: EmailComposerProps) {
  const [toEmails, setToEmails] = useState<string[]>(to ? [to] : []);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [bccEmails, setBccEmails] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [editSubject, setEditSubject] = useState(subject);
  const [editBody, setEditBody] = useState(body);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  async function handleSend() {
    if (toEmails.length === 0 || !editBody.trim()) return;
    setSending(true);
    try {
      const payload = {
        to: toEmails.join(", "),
        cc: ccEmails.join(", "),
        bcc: bccEmails.join(", "),
        subject: editSubject,
        body: editBody,
      };
      if (onSend) {
        onSend(payload);
      } else {
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Send failed");
      }
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      console.warn("email-composer: send failed", e);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "var(--color-bg-modal-overlay)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="slide-in-right fixed right-0 top-0 z-50 flex h-full flex-col"
        style={{
          width: "min(var(--detail-panel-width, 420px), 100vw)",
          background: "var(--color-bg-card)",
          borderLeft: "1px solid var(--color-border-default)",
          borderTopLeftRadius: "10px",
          borderBottomLeftRadius: "10px",
          boxShadow: "var(--shadow-panel)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <div className="flex items-center gap-2">
            <Mail size={15} style={{ color: "var(--color-accent)" }} />
            <h3
              className="truncate text-[14px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {editSubject || "New Email"}
            </h3>
          </div>
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

        {/* Email fields */}
        <EmailField label="To" emails={toEmails} onChange={setToEmails} placeholder="recipient@example.com" />

        {/* Cc/Bcc toggle */}
        {!showCcBcc ? (
          <button
            onClick={() => setShowCcBcc(true)}
            className="flex items-center gap-1 px-4 py-1.5 text-[11px]"
            style={{
              color: "var(--color-text-muted)",
              borderBottom: "0.5px solid var(--color-border-default)",
              background: "none",
              border: "none",
              borderBottomStyle: "solid",
              borderBottomWidth: "0.5px",
              borderBottomColor: "var(--color-border-default)",
              cursor: "pointer",
            }}
          >
            <ChevronDown size={10} />
            Cc / Bcc
          </button>
        ) : (
          <>
            <EmailField label="Cc" emails={ccEmails} onChange={setCcEmails} />
            <EmailField label="Bcc" emails={bccEmails} onChange={setBccEmails} />
            <button
              onClick={() => setShowCcBcc(false)}
              className="flex items-center gap-1 px-4 py-1 text-[11px]"
              style={{
                color: "var(--color-text-muted)",
                background: "none",
                border: "none",
                borderBottom: "0.5px solid var(--color-border-default)",
                cursor: "pointer",
              }}
            >
              <ChevronUp size={10} />
              Hide Cc / Bcc
            </button>
          </>
        )}

        {/* Subject */}
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
        >
          <span
            className="w-12 shrink-0 text-[12px] font-medium"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Subject
          </span>
          <input
            value={editSubject}
            onChange={(e) => setEditSubject(e.target.value)}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--color-text-primary)" }}
            placeholder="Subject line"
          />
        </div>

        {/* Formatting toolbar */}
        <div className="flex items-center gap-0.5 px-4 py-1.5" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
          {([
            { cmd: "bold", label: "B", style: { fontWeight: 700 } },
            { cmd: "italic", label: "I", style: { fontStyle: "italic" } },
            { cmd: "insertUnorderedList", label: "•", style: {} },
            { cmd: "insertOrderedList", label: "1.", style: {} },
          ] as const).map((btn) => (
            <button
              key={btn.cmd}
              onMouseDown={(e) => { e.preventDefault(); document.execCommand(btn.cmd, false); }}
              className="rounded px-2 py-0.5 text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ color: "var(--color-text-secondary)", ...btn.style }}
              title={btn.cmd.replace(/([A-Z])/g, " $1")}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Body — contentEditable for rich text */}
        <div className="flex-1 overflow-auto p-4">
          <div
            ref={bodyRef as any}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setEditBody((e.target as HTMLDivElement).innerHTML)}
            className="h-full w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none"
            style={{ color: "var(--color-text-primary)", fontWeight: 400, minHeight: "100%", whiteSpace: "pre-wrap" }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
          />
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: "1px solid var(--color-border-default)" }}
        >
          <div className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            {toEmails.length > 0 ? `To: ${toEmails.join(", ")}` : "No recipients"}
          </div>
          {sent ? (
            <span
              className="flex items-center gap-1 text-[13px] font-medium"
              style={{ color: "oklch(0.6 0.15 145)" }}
            >
              <Send size={13} />
              Sent
            </span>
          ) : (
            <Button
              variant="gradient"
              size="md"
              onClick={handleSend}
              disabled={sending || toEmails.length === 0}
              loading={sending}
              icon={!sending ? <Send size={13} /> : undefined}
            >
              Send
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
