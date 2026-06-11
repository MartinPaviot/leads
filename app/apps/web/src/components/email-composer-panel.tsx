"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Send, ChevronDown, ChevronUp, Mail, Save, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ContactCollisionNotice } from "@/components/collision/contact-collision-notice";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EmailComposerDraft {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  contactId?: string;
  dealId?: string;
}

interface EmailComposerPanelProps {
  draft: EmailComposerDraft;
  onClose: () => void;
  /** Called after a successful send with the messageId */
  onSent?: (messageId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Pill-style email tag                                               */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Editable email field with pill tags                                */
/* ------------------------------------------------------------------ */

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
          onBlur={() => {
            if (inputValue.trim()) addEmail(inputValue);
          }}
          className="min-w-[120px] flex-1 bg-transparent text-[13px] outline-none"
          style={{ color: "var(--color-text-primary)" }}
          placeholder={emails.length === 0 ? (placeholder || "email@example.com") : ""}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Draft persistence helpers (localStorage)                           */
/* ------------------------------------------------------------------ */

const DRAFT_KEY = "elevay:email-draft";

function saveDraftToStorage(data: {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  contactId?: string;
  dealId?: string;
}) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch {
    // localStorage may be full or unavailable
  }
}

function loadDraftFromStorage(): {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  contactId?: string;
  dealId?: string;
  savedAt?: string;
} | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearDraftFromStorage() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // noop
  }
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function EmailComposerPanel({ draft, onClose, onSent }: EmailComposerPanelProps) {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);

  // Form state
  const [toEmails, setToEmails] = useState<string[]>(
    draft.to ? draft.to.split(",").map((e) => e.trim()).filter(Boolean) : []
  );
  const [ccEmails, setCcEmails] = useState<string[]>(
    draft.cc ? draft.cc.split(",").map((e) => e.trim()).filter(Boolean) : []
  );
  const [showCc, setShowCc] = useState(false);
  const [editSubject, setEditSubject] = useState(draft.subject);
  const [editBody, setEditBody] = useState(draft.body);

  // Send state
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Refs
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus body on mount
  useEffect(() => {
    if (mounted) {
      setTimeout(() => bodyRef.current?.focus(), 100);
    }
  }, [mounted]);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const ta = bodyRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [editBody, autoResize]);

  /* ── Save draft ─────────────────────────────────────────────── */

  function handleSaveDraft() {
    saveDraftToStorage({
      to: toEmails,
      cc: ccEmails,
      subject: editSubject,
      body: editBody,
      contactId: draft.contactId,
      dealId: draft.dealId,
    });
    toast("Draft saved.", "success");
  }

  /* ── Send ───────────────────────────────────────────────────── */

  async function handleSend() {
    if (toEmails.length === 0) {
      toast("Add at least one recipient.", "warning");
      return;
    }
    if (!editSubject.trim()) {
      toast("Subject cannot be empty.", "warning");
      return;
    }
    if (!editBody.trim()) {
      toast("Email body cannot be empty.", "warning");
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmails[0],
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          subject: editSubject,
          body: editBody,
          contactId: draft.contactId || undefined,
          dealId: draft.dealId || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          (errorData as { error?: string }).error || `Send failed (${res.status})`
        );
      }

      const data = await res.json();
      const messageId = (data as { messageId?: string }).messageId || "";

      clearDraftFromStorage();
      setSent(true);
      toast("Email sent successfully.", "success");
      onSent?.(messageId);

      // Auto-close after brief confirmation
      setTimeout(onClose, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send email. Please try again.";
      setSendError(msg);
    } finally {
      setSending(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: "var(--color-bg-modal-overlay)",
          animation: "overlay-fade-in 200ms ease-out",
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="slide-in-right fixed right-0 top-0 z-50 flex h-full flex-col"
        style={{
          width: "min(var(--detail-panel-width, 480px), 100vw)",
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
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Collision heads-up: a teammate already emailed/called this contact
            recently (soft, non-blocking — informs, never gates Send). */}
        {draft.contactId && (
          <div className="px-4 pt-3">
            <ContactCollisionNotice contactId={draft.contactId} />
          </div>
        )}

        {/* Email fields */}
        <EmailField
          label="To"
          emails={toEmails}
          onChange={setToEmails}
          placeholder="recipient@example.com"
        />

        {/* Cc toggle */}
        {!showCc ? (
          <button
            onClick={() => setShowCc(true)}
            className="flex items-center gap-1 px-4 py-1.5 text-[11px]"
            style={{
              color: "var(--color-text-muted)",
              background: "none",
              border: "none",
              borderBottom: "0.5px solid var(--color-border-default)",
              cursor: "pointer",
            }}
          >
            <ChevronDown size={10} />
            Cc
          </button>
        ) : (
          <>
            <EmailField label="Cc" emails={ccEmails} onChange={setCcEmails} />
            <button
              onClick={() => setShowCc(false)}
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
              Hide Cc
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

        {/* Body — plain textarea, keeps markdown formatting */}
        <div className="flex-1 overflow-auto p-4">
          <textarea
            ref={bodyRef}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            onInput={autoResize}
            className="h-full w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none"
            style={{
              color: "var(--color-text-primary)",
              fontWeight: 400,
              minHeight: "200px",
              whiteSpace: "pre-wrap",
            }}
            placeholder="Write your email..."
          />
        </div>

        {/* Error banner */}
        {sendError && (
          <div
            className="mx-4 mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
            style={{
              background: "var(--color-error-soft, oklch(0.97 0.015 25))",
              border: "1px solid var(--color-error, oklch(0.85 0.06 25))",
              color: "var(--color-error, oklch(0.5 0.14 25))",
            }}
          >
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{sendError}</span>
            <button
              onClick={handleSend}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: "var(--color-bg-card)",
                color: "var(--color-error)",
                border: "1px solid var(--color-error)",
              }}
            >
              <RefreshCw size={10} />
              Retry
            </button>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: "1px solid var(--color-border-default)" }}
        >
          <div className="flex items-center gap-2">
            {/* Recipient count */}
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              {toEmails.length > 0
                ? `To: ${toEmails.join(", ")}`
                : "No recipients"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Save draft */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              icon={<Save size={12} />}
              disabled={sending || sent}
            >
              Save draft
            </Button>
            {/* Send */}
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
      </div>
    </>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/*  Convenience hook to manage composer open/close + draft state       */
/* ------------------------------------------------------------------ */

export function useEmailComposer() {
  const [composerDraft, setComposerDraft] = useState<EmailComposerDraft | null>(null);

  const openComposer = useCallback((draft: EmailComposerDraft) => {
    setComposerDraft(draft);
  }, []);

  const closeComposer = useCallback(() => {
    setComposerDraft(null);
  }, []);

  return { composerDraft, openComposer, closeComposer };
}
