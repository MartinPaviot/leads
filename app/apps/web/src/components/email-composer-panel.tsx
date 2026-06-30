"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Send, ChevronDown, ChevronUp, Mail, Save, AlertCircle, RefreshCw, Sparkles, Undo2, Languages, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ContactCollisionNotice } from "@/components/collision/contact-collision-notice";
import { parseRecipients } from "@/lib/inbox/template-vars";
import { REWRITE_PRESETS } from "@/lib/inbox/rewrite-presets";
import { TRANSLATE_LANGUAGES } from "@/lib/inbox/translate-languages";
import { pickDefaultFrom, mailboxDisplay, type SendableMailbox } from "@/lib/inbox/pick-from-mailbox";
import { applySignature } from "@/lib/inbox/mailbox-signature";
import { useT } from "@/lib/i18n/locale";
import {
  draftStorageKey,
  saveDraftToStorage,
  loadDraftFromStorage,
  clearDraftFromStorage,
} from "@/lib/inbox/draft-storage";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EmailComposerDraft {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  contactId?: string;
  dealId?: string;
  /** A2: the seeded send-from mailbox (the thread's own box on a reply). */
  mailboxId?: string;
  /** Conversation key/threadId — attaches a DB draft to the thread so it shows
   *  in the Drafts folder + reloads on reopen. */
  threadId?: string;
  /** Existing DB draft id when opened from a prepared/saved draft — so auto-save
   *  UPDATES that row instead of creating a new one. */
  draftId?: string;
}

interface EmailComposerPanelProps {
  draft: EmailComposerDraft;
  onClose: () => void;
  /** Called after a successful send with the messageId */
  onSent?: (messageId: string) => void;
  /** A2: the user's SENDABLE mailboxes for the From selector (empty hides it). */
  mailboxes?: SendableMailbox[];
  /** Render in the document flow (Gmail/Outlook-style reply pinned under the
   *  thread) instead of the right-edge slide-over drawer. The drawer (default)
   *  stays for standalone "new email" compose; the inbox reply passes inline. */
  inline?: boolean;
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
    // parseRecipients handles "Name <email>", comma/semicolon lists and dedupe,
    // so a pasted "a@b.c, d@e.f" becomes two pills in one go.
    const { valid } = parseRecipients(raw);
    if (valid.length > 0) {
      const merged = [...emails];
      for (const addr of valid) if (!merged.includes(addr)) merged.push(addr);
      onChange(merged);
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

// Draft auto-save persistence lives in a pure, testable module.

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function EmailComposerPanel({ draft, onClose, onSent, mailboxes = [], inline = false }: EmailComposerPanelProps) {
  const { toast } = useToast();
  const t = useT();
  const [mounted, setMounted] = useState(false);

  // A2: send-from selector. Seeded to the thread's box when still sendable, else
  // the primary. Server re-resolves + refuses a non-owned/inactive box (403).
  const [fromMailboxId, setFromMailboxId] = useState<string | undefined>(() => pickDefaultFrom(draft.mailboxId, mailboxes));
  const [fromOpen, setFromOpen] = useState(false);

  // Form state — parseRecipients keeps "Name <email>" and lists tidy.
  const [toEmails, setToEmails] = useState<string[]>(parseRecipients(draft.to || "").valid);
  const [ccEmails, setCcEmails] = useState<string[]>(parseRecipients(draft.cc || "").valid);
  const [bccEmails, setBccEmails] = useState<string[]>(parseRecipients(draft.bcc || "").valid);
  const [showCc, setShowCc] = useState(Boolean(draft.cc));
  const [showBcc, setShowBcc] = useState(Boolean(draft.bcc));
  const [editSubject, setEditSubject] = useState(draft.subject);
  const [editBody, setEditBody] = useState(draft.body);

  // Auto-save (per-context localStorage). storageKey is frozen for the panel's
  // life from the OPENING draft, so editing recipients doesn't move the slot.
  const storageKeyRef = useRef(draftStorageKey(draft));
  const storageKey = storageKeyRef.current;
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const restoredRef = useRef(false);
  // DB-backed draft (Drafts folder, cross-device). Only when there's a contact
  // to scope by — a blank/contact-less compose stays localStorage-only. Seeded
  // from a reopened prepared/saved draft so auto-save UPDATES that row.
  const serverDraftIdRef = useRef<string | null>(draft.draftId ?? null);
  // True once the USER actually edits (not the AI suggestion / signature /
  // restore). Gates the DB upsert so the Drafts folder isn't flooded with
  // untouched auto-suggested replies. A reopened existing draft counts as edited.
  const userEditedRef = useRef(Boolean(draft.draftId));
  const markEdited = useCallback(() => {
    userEditedRef.current = true;
  }, []);

  // Send state
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Compose-AI (INBOX-C04/C07/C08): rewrite / translate / draft-from-bullets.
  // All keep the prior body in rewriteUndo for a one-tap Undo.
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteUndo, setRewriteUndo] = useState<string | null>(null);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftBullets, setDraftBullets] = useState("");
  const [drafting, setDrafting] = useState(false);

  // Refs
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // B1: the always-visible "edit with AI" instruction field (Cmd/Ctrl+J target).
  const aiInstructionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Restore a previously auto-saved draft for this context (run once, client
  // only — avoids an SSR/hydration mismatch by restoring AFTER the first paint).
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadDraftFromStorage(storageKey);
    if (!saved) return;
    if (saved.body != null) setEditBody(saved.body);
    if (saved.subject != null) setEditSubject(saved.subject);
    if (saved.to?.length) setToEmails(saved.to);
    if (saved.cc?.length) {
      setCcEmails(saved.cc);
      setShowCc(true);
    }
    if (saved.bcc?.length) {
      setBccEmails(saved.bcc);
      setShowBcc(true);
    }
    if (saved.savedAt) setDraftSavedAt(saved.savedAt);
  }, [storageKey]);

  // Debounced auto-save: persist the in-progress draft ~0.8s after the last
  // edit so a refresh / navigate-away / the inbox's periodic re-render never
  // loses typed text. An emptied draft clears its slot. Cleared on send.
  useEffect(() => {
    if (sent) return;
    const hasContent = Boolean(editBody.trim() || editSubject.trim() || toEmails.length);
    setDraftSaving(true);
    const timer = setTimeout(() => {
      if (hasContent) {
        saveDraftToStorage(storageKey, {
          to: toEmails,
          cc: ccEmails,
          bcc: bccEmails,
          subject: editSubject,
          body: editBody,
          contactId: draft.contactId,
          dealId: draft.dealId,
        });
        setDraftSavedAt(new Date().toISOString());
        // Mirror to the DB so the draft lands in the Drafts folder + survives
        // across devices — but only once the user actually edited (not a raw AI
        // suggestion), and only with a contact to scope by. localStorage above
        // is the instant cache for the contact-less / untouched cases.
        if (draft.contactId && userEditedRef.current) {
          void fetch("/api/inbox/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: serverDraftIdRef.current,
              contactId: draft.contactId,
              threadId: draft.threadId ?? null,
              to: toEmails.join(", "),
              subject: editSubject,
              bodyHtml: editBody,
              bodyText: editBody,
              mailboxId: fromMailboxId ?? null,
            }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { id?: string } | null) => {
              if (d?.id) serverDraftIdRef.current = d.id;
            })
            .catch(() => {});
        }
      } else {
        clearDraftFromStorage(storageKey);
        setDraftSavedAt(null);
        // Emptied → discard the DB draft too.
        if (serverDraftIdRef.current) {
          const id = serverDraftIdRef.current;
          serverDraftIdRef.current = null;
          void fetch(`/api/inbox/drafts/${id}`, { method: "DELETE" }).catch(() => {});
        }
      }
      setDraftSaving(false);
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toEmails, ccEmails, bccEmails, editSubject, editBody, sent, storageKey, fromMailboxId]);

  // Flush-on-unmount: the auto-save above is debounced 800ms and its cleanup just
  // clears the timer, so closing the composer right after typing (e.g. clicking
  // another thread, which unmounts it) would drop the last keystrokes. Keep a ref
  // to the current draft and persist it synchronously on unmount. localStorage is
  // the source the restore-on-open reads, so this alone preserves the text.
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    if (sent) return;
    const hasContent = Boolean(editBody.trim() || editSubject.trim() || toEmails.length);
    if (!hasContent) return;
    saveDraftToStorage(storageKey, {
      to: toEmails,
      cc: ccEmails,
      bcc: bccEmails,
      subject: editSubject,
      body: editBody,
      contactId: draft.contactId,
      dealId: draft.dealId,
    });
  };
  useEffect(() => () => flushRef.current(), []);

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

  // A3: apply the From mailbox's signature on open + on From change. Idempotent
  // (strip the prior "-- " block, append the new one once) so it is never
  // duplicated and swaps cleanly when the From box changes.
  useEffect(() => {
    const sig = mailboxes.find((m) => m.id === fromMailboxId)?.signature;
    setEditBody((b) => applySignature(b, sig));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMailboxId, mailboxes]);

  // B1 Cmd/Ctrl+J inside the composer = edit-with-AI (R2.1). With an instruction
  // typed (and a body to act on), submit it through the EXISTING handleRewrite;
  // otherwise focus the always-visible AI-instructions field so the user can type.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        if (rewriteInstruction.trim() && editBody.trim() && !rewriting) {
          void handleRewrite(rewriteInstruction);
        } else {
          aiInstructionRef.current?.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewriteInstruction, editBody, rewriting]);

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
  // Drafts now auto-save (debounced, per-context localStorage above); the
  // explicit button is replaced by a passive "Draft saved" status. A manual
  // flush stays available for the keyboard path / immediate feedback.

  function handleSaveDraft() {
    saveDraftToStorage(storageKey, {
      to: toEmails,
      cc: ccEmails,
      bcc: bccEmails,
      subject: editSubject,
      body: editBody,
      contactId: draft.contactId,
      dealId: draft.dealId,
    });
    setDraftSavedAt(new Date().toISOString());
  }

  /* ── Rewrite (INBOX-C04) ─────────────────────────────────────── */

  async function handleRewrite(instruction: string) {
    if (!editBody.trim() || !instruction.trim() || rewriting) return;
    setRewriting(true);
    setRewriteOpen(false);
    try {
      const res = await fetch("/api/inbox/compose/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody, instruction }),
      });
      const data = res.ok ? ((await res.json()) as { text?: string }) : {};
      if (data.text && data.text.trim()) {
        setRewriteUndo(editBody); // keep the original for one-tap undo
        setEditBody(data.text.trim());
        setRewriteInstruction("");
        toast(t("inbox.compose.rewrittenToast"), "success");
      } else {
        toast(t("inbox.compose.rewriteFailedToast"), "warning");
      }
    } catch {
      toast(t("inbox.compose.rewriteFailedToast"), "warning");
    } finally {
      setRewriting(false);
    }
  }

  async function handleTranslate(lang: string) {
    if (!editBody.trim() || translating) return;
    setTranslating(true);
    setTranslateOpen(false);
    try {
      const res = await fetch("/api/inbox/compose/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody, targetLang: lang }),
      });
      const data = res.ok ? ((await res.json()) as { text?: string }) : {};
      if (data.text && data.text.trim()) {
        setRewriteUndo(editBody);
        setEditBody(data.text.trim());
        toast(t("inbox.compose.translatedToast", { lang }), "success");
      } else {
        toast(t("inbox.compose.translateFailedToast"), "warning");
      }
    } catch {
      toast(t("inbox.compose.translateFailedToast"), "warning");
    } finally {
      setTranslating(false);
    }
  }

  async function handleDraft() {
    if (!draftBullets.trim() || drafting) return;
    setDrafting(true);
    try {
      const res = await fetch("/api/inbox/compose/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bullets: draftBullets }),
      });
      const data = res.ok ? ((await res.json()) as { subject?: string; text?: string }) : {};
      if (data.text && data.text.trim()) {
        setRewriteUndo(editBody);
        // Fill the subject only when it's still empty — never clobber a "Re:".
        if (data.subject && data.subject.trim() && !editSubject.trim()) setEditSubject(data.subject.trim());
        setEditBody(data.text.trim());
        setDraftOpen(false);
        setDraftBullets("");
        toast(t("inbox.compose.draftedToast"), "success");
      } else {
        toast(t("inbox.compose.draftFailedDetailToast"), "warning");
      }
    } catch {
      toast(t("inbox.compose.draftFailedRetryToast"), "warning");
    } finally {
      setDrafting(false);
    }
  }

  /* ── Send ───────────────────────────────────────────────────── */

  async function handleSend() {
    if (toEmails.length === 0) {
      toast(t("inbox.compose.needRecipientToast"), "warning");
      return;
    }
    if (!editSubject.trim()) {
      toast(t("inbox.compose.subjectEmptyToast"), "warning");
      return;
    }
    if (!editBody.trim()) {
      toast(t("inbox.compose.bodyEmptyToast"), "warning");
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
          bcc: bccEmails.length > 0 ? bccEmails : undefined,
          subject: editSubject,
          body: editBody,
          contactId: draft.contactId || undefined,
          dealId: draft.dealId || undefined,
          mailboxId: fromMailboxId || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          (errorData as { error?: string }).error || t("inbox.compose.sendFailedStatus", { status: res.status })
        );
      }

      const data = await res.json();
      const messageId = (data as { messageId?: string }).messageId || "";

      clearDraftFromStorage(storageKey);
      // Consume the DB draft so it leaves the Drafts folder (the send wrote its
      // own 'sent' row). Idempotent + best-effort.
      if (serverDraftIdRef.current) {
        const id = serverDraftIdRef.current;
        serverDraftIdRef.current = null;
        void fetch(`/api/inbox/drafts/${id}/consume`, { method: "POST" }).catch(() => {});
      }
      setSent(true);
      toast(t("inbox.compose.sentToast"), "success");
      onSent?.(messageId);

      // Auto-close after brief confirmation
      setTimeout(onClose, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("inbox.compose.sendFailedGeneric");
      setSendError(msg);
    } finally {
      setSending(false);
    }
  }

  if (!mounted) return null;

  // Inline (Gmail/Outlook reply): an in-flow block under the thread. `flex-1 min-h-0`
  // shares the pane height with the message list; `overflow-y-auto` makes the WHOLE
  // composer (its tall To/Cc/Subject chrome + body + Send footer) scroll as one unit
  // when squeezed — so Send is always reachable, even on the founder's half-screen +
  // 200% zoom viewport where the chrome alone exceeds the composer's share and a
  // body-only scroll would push Send off-screen. Drawer (default): the right-edge
  // slide-over for standalone compose.
  const panel = (
      <div
        className={inline
          ? "flex min-h-0 flex-1 flex-col overflow-y-auto"
          : "slide-in-right fixed right-0 top-0 z-50 flex h-full flex-col"}
        style={inline
          ? {
              background: "var(--color-bg-card)",
              borderTop: "1px solid var(--color-border-default)",
            }
          : {
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
              {editSubject || t("inbox.compose.newEmail")}
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
        {/* A2: From selector — which connected mailbox this leaves from. Default
            = the thread's own box. One box → static label; many → a menu. */}
        {mailboxes.length > 0 && (() => {
          const selected = mailboxes.find((m) => m.id === fromMailboxId) ?? mailboxes[0];
          return (
            <div
              className="flex items-center gap-2 px-4 py-2"
              style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
            >
              <span className="w-12 shrink-0 text-[12px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
                {t("inbox.compose.from")}
              </span>
              {mailboxes.length === 1 ? (
                <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                  {mailboxDisplay(selected)}
                </span>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setFromOpen((v) => !v)}
                    className="flex items-center gap-1 text-[13px]"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {mailboxDisplay(selected)}
                    <ChevronDown size={12} style={{ color: "var(--color-text-tertiary)" }} />
                  </button>
                  {fromOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setFromOpen(false)} />
                      <div
                        className="absolute left-0 top-full z-20 mt-1 min-w-[220px] rounded-lg border p-1 shadow-lg"
                        style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
                      >
                        {mailboxes.map((m) => {
                          const active = m.id === selected.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => { setFromMailboxId(m.id); setFromOpen(false); }}
                              className="block w-full rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
                              style={{ color: active ? "var(--color-accent)" : "var(--color-text-primary)" }}
                            >
                              {m.label && m.label !== m.address ? `${m.label} <${m.address}>` : m.address}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        <EmailField
          label={t("inbox.compose.to")}
          emails={toEmails}
          onChange={(v) => { markEdited(); setToEmails(v); }}
          placeholder={t("inbox.compose.recipientPlaceholder")}
        />

        {/* Cc / Bcc — fields when open, compact toggles otherwise */}
        {showCc && <EmailField label="Cc" emails={ccEmails} onChange={(v) => { markEdited(); setCcEmails(v); }} />}
        {showBcc && <EmailField label={t("inbox.compose.bcc")} emails={bccEmails} onChange={(v) => { markEdited(); setBccEmails(v); }} />}
        <div
          className="flex items-center gap-3 px-4 py-1.5"
          style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
        >
          <button
            onClick={() => setShowCc((v) => !v)}
            className="flex items-center gap-1 text-[11px]"
            style={{ color: "var(--color-text-muted)", cursor: "pointer" }}
          >
            {showCc ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {showCc ? t("inbox.compose.hideCc") : "Cc"}
          </button>
          <button
            onClick={() => setShowBcc((v) => !v)}
            className="flex items-center gap-1 text-[11px]"
            style={{ color: "var(--color-text-muted)", cursor: "pointer" }}
          >
            {showBcc ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {showBcc ? t("inbox.compose.hideBcc") : t("inbox.compose.bcc")}
          </button>
        </div>

        {/* Subject */}
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
        >
          <span
            className="w-12 shrink-0 text-[12px] font-medium"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {t("inbox.compose.subject")}
          </span>
          <input
            value={editSubject}
            onChange={(e) => { markEdited(); setEditSubject(e.target.value); }}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--color-text-primary)" }}
            placeholder={t("inbox.compose.subjectPlaceholder")}
          />
        </div>

        {/* Body — plain textarea, keeps markdown formatting */}
        <div className={inline ? "p-4" : "flex-1 overflow-auto p-4"}>
          {/* Rewrite toolbar (INBOX-C04): GTM presets + free-form, with undo. */}
          <div className="mb-2 flex items-center gap-2">
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRewriteOpen((v) => !v)}
                disabled={rewriting || !editBody.trim()}
                className="gap-1.5"
              >
                {rewriting ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {t("inbox.compose.rewrite")}
              </Button>
              {rewriteOpen && (
                <div
                  className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border p-1 shadow-lg"
                  style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
                >
                  {REWRITE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => void handleRewrite(p.instruction)}
                      className="block w-full rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {t(p.labelKey)}
                    </button>
                  ))}
                  <div className="my-1 border-t" style={{ borderColor: "var(--color-border-default)" }} />
                  <div className="flex items-center gap-1 p-1">
                    <input
                      value={rewriteInstruction}
                      onChange={(e) => setRewriteInstruction(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && rewriteInstruction.trim()) {
                          e.preventDefault();
                          void handleRewrite(rewriteInstruction);
                        }
                      }}
                      placeholder={t("inbox.compose.rewriteInstructionPlaceholder")}
                      className="min-w-0 flex-1 rounded border px-2 py-1 text-[12px] outline-none"
                      style={{
                        borderColor: "var(--color-border-default)",
                        background: "var(--color-bg-page)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    <Button size="sm" onClick={() => void handleRewrite(rewriteInstruction)} disabled={!rewriteInstruction.trim()}>
                      {t("inbox.compose.go")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Translate (INBOX-C08) */}
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTranslateOpen((v) => !v)}
                disabled={translating || !editBody.trim()}
                className="gap-1.5"
              >
                {translating ? <RefreshCw size={12} className="animate-spin" /> : <Languages size={12} />}
                {t("inbox.compose.translate")}
              </Button>
              {translateOpen && (
                <div
                  className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border p-1 shadow-lg"
                  style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
                >
                  {TRANSLATE_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => void handleTranslate(l.label)}
                      className="block w-full rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {t(`inbox.compose.lang.${l.code}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Draft from bullets (INBOX-C07) */}
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDraftOpen((v) => !v)}
                disabled={drafting}
                className="gap-1.5"
              >
                {drafting ? <RefreshCw size={12} className="animate-spin" /> : <ListPlus size={12} />}
                {t("inbox.compose.draftFromBullets")}
              </Button>
              {draftOpen && (
                <div
                  className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border p-2 shadow-lg"
                  style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
                >
                  <textarea
                    value={draftBullets}
                    onChange={(e) => setDraftBullets(e.target.value)}
                    rows={4}
                    placeholder={t("inbox.compose.bulletsPlaceholder")}
                    className="w-full resize-none rounded border px-2 py-1 text-[12px] outline-none"
                    style={{
                      borderColor: "var(--color-border-default)",
                      background: "var(--color-bg-page)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  <div className="mt-1.5 flex justify-end">
                    <Button size="sm" onClick={() => void handleDraft()} disabled={!draftBullets.trim() || drafting} loading={drafting}>
                      {t("inbox.compose.generate")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {rewriteUndo != null && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditBody(rewriteUndo);
                  setRewriteUndo(null);
                }}
                className="gap-1"
              >
                <Undo2 size={12} /> {t("inbox.compose.undo")}
              </Button>
            )}
          </div>
          {/* B1 edit-with-AI (Upstream canonical position): an always-visible
              instruction field directly above the body. Submits to the SAME
              handleRewrite (no new endpoint); Cmd/Ctrl+J focuses or submits it. */}
          <div
            className="mb-2 flex items-center gap-1.5 rounded-lg border px-2 py-1"
            style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)" }}
          >
            <Sparkles size={13} className="shrink-0" style={{ color: "var(--color-accent)" }} aria-hidden />
            <input
              ref={aiInstructionRef}
              value={rewriteInstruction}
              onChange={(e) => setRewriteInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && rewriteInstruction.trim() && editBody.trim() && !rewriting) {
                  e.preventDefault();
                  void handleRewrite(rewriteInstruction);
                }
              }}
              disabled={rewriting || !editBody.trim()}
              placeholder={t("inbox.compose.aiInstructionPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none disabled:opacity-60"
              style={{ color: "var(--color-text-primary)" }}
            />
            {rewriting && (
              <RefreshCw size={12} className="shrink-0 animate-spin" style={{ color: "var(--color-text-tertiary)" }} aria-hidden />
            )}
          </div>
          <textarea
            ref={bodyRef}
            value={editBody}
            onChange={(e) => { markEdited(); setEditBody(e.target.value); }}
            onInput={autoResize}
            className="h-full w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none"
            style={{
              color: "var(--color-text-primary)",
              fontWeight: 400,
              // Lower floor inline so the in-flow reply doesn't reserve a tall
              // body on short viewports (it autoResizes + scrolls as you type);
              // the drawer keeps the roomier 200px.
              minHeight: inline ? "88px" : "200px",
              whiteSpace: "pre-wrap",
            }}
            placeholder={t("inbox.compose.bodyPlaceholder")}
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
              {t("common.retry")}
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
                ? t("inbox.compose.toRecipients", { list: toEmails.join(", ") })
                : t("inbox.compose.noRecipients")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto-save status (drafts persist automatically; click = save now) */}
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={sending || sent}
              title={t("inbox.compose.draftAutoSaveTitle")}
              className="flex items-center gap-1 text-[11px] disabled:opacity-50"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Save size={12} />
              {draftSaving ? t("inbox.compose.draftSaving") : draftSavedAt ? t("inbox.compose.draftSaved") : t("inbox.compose.draft")}
            </button>
            {/* Send */}
            {sent ? (
              <span
                className="flex items-center gap-1 text-[13px] font-medium"
                style={{ color: "oklch(0.6 0.15 145)" }}
              >
                <Send size={13} />
                {t("inbox.compose.sent")}
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
                {t("inbox.compose.send")}
              </Button>
            )}
          </div>
        </div>
      </div>
  );

  // Inline: render in place, no portal, no page-dimming backdrop (the thread
  // stays interactive behind the reply, like Gmail/Outlook).
  if (inline) return panel;

  // Drawer: a dimming backdrop + the slide-over, portalled to <body>.
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        style={{
          background: "var(--color-bg-modal-overlay)",
          animation: "overlay-fade-in 200ms ease-out",
        }}
        onClick={onClose}
      />
      {panel}
    </>,
    document.body,
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
