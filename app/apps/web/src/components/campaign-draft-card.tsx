"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Pencil, X } from "lucide-react";
import { sanitizeHtml } from "@/lib/infra/sanitize-html";

export type ReviewEmail = {
  id: string;
  toAddress: string;
  subject: string;
  bodyHtml: string;
  status: string;
  stepNumber: number | null;
  contact: { firstName: string | null; lastName: string | null; title: string | null } | null;
};

/** Render the sequence draft's HTML body as plain text for editing. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Wrap edited plain text back into the <div>…<br>… shape the send path expects. */
export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div>${esc.replace(/\n/g, "<br>")}</div>`;
}

/**
 * A single draft in the campaign review list. Read-only by default (bulk
 * "Approve all" handles the accept-as-is case); "Edit" reveals inline subject +
 * body fields and a per-draft Approve that PUTs the EDITED final — which the
 * review route captures as a `user_edited` flywheel example (the strongest
 * teaching signal, previously with no UI entry point). If the founder opens
 * edit but changes nothing, the body is omitted so it stays a plain approval.
 */
export function DraftReviewCard({
  email,
  onApproved,
}: {
  email: ReviewEmail;
  onApproved: () => void;
}) {
  const originalBody = htmlToText(email.bodyHtml);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(originalBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactName = email.contact
    ? `${email.contact.firstName || ""} ${email.contact.lastName || ""}`.trim()
    : "";

  async function approve() {
    setBusy(true);
    setError(null);
    const changed = subject !== email.subject || body !== originalBody;
    const payload: Record<string, unknown> = { emailId: email.id, action: "approve" };
    if (changed) {
      payload.subject = subject;
      payload.bodyHtml = textToHtml(body);
    }
    try {
      const res = await fetch("/api/outbound/review", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError("Couldn't approve this draft. Please retry.");
        setBusy(false);
        return;
      }
      onApproved();
    } catch {
      setError("Couldn't approve this draft. Please retry.");
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {contactName || email.toAddress}
          </span>
          {email.contact?.title && (
            <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
              {email.contact.title}
            </span>
          )}
          {email.stepNumber && (
            <Badge variant="neutral" size="sm">
              Step {email.stepNumber}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            {email.toAddress}
          </span>
          {!editing && email.status === "draft" && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-[11px] transition-colors hover:opacity-70"
              style={{ color: "var(--color-text-tertiary)" }}
              aria-label="Edit draft"
            >
              <Pencil size={11} /> Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <input
            aria-label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-md px-2 py-1.5 text-[13px] font-medium"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-default)",
              color: "var(--color-text-primary)",
            }}
          />
          <textarea
            aria-label="Body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="w-full rounded-md px-2 py-1.5 text-[12px] leading-relaxed resize-y"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-default)",
              color: "var(--color-text-secondary)",
            }}
          />
          {error && (
            <p className="text-[11px]" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button variant="gradient" size="sm" onClick={approve} disabled={busy}>
              <Check size={13} /> Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setSubject(email.subject);
                setBody(originalBody);
                setError(null);
              }}
              disabled={busy}
            >
              <X size={13} /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[13px] font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
            {email.subject}
          </p>
          <div
            className="text-[12px] leading-relaxed line-clamp-3"
            style={{ color: "var(--color-text-secondary)" }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(email.bodyHtml.slice(0, 300)) }}
          />
        </>
      )}
    </div>
  );
}
