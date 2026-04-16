"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { checkSpamSignals, type SpamCheckResult } from "@/lib/email-spam-check";

interface OutboundEmail {
  id: string;
  toAddress: string;
  fromAddress: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  status: string;
  stepNumber: number | null;
  createdAt: string;
  contact: {
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    email: string | null;
    properties: Record<string, unknown> | null;
  } | null;
}

export default function ReviewQueuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [emails, setEmails] = useState<OutboundEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [filter, setFilter] = useState<"draft" | "queued" | "sent">("draft");

  async function loadEmails() {
    try {
      const res = await fetch(`/api/outbound/review?sequenceId=${id}&status=${filter}`);
      const data = await res.json();
      setEmails(data.emails || []);
    } catch {
      console.error("Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmails();
  }, [filter]);

  async function approve(emailId: string) {
    await fetch("/api/outbound/review", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailId, action: "approve" }),
    });
    loadEmails();
  }

  async function skip(emailId: string) {
    await fetch("/api/outbound/review", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailId, action: "skip" }),
    });
    loadEmails();
  }

  async function saveEdit(emailId: string) {
    await fetch("/api/outbound/review", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailId,
        action: "edit",
        subject: editSubject,
        bodyHtml: editBody,
      }),
    });
    setEditingId(null);
    loadEmails();
  }

  async function approveAll() {
    const draftIds = emails.filter((e) => e.status === "draft").map((e) => e.id);
    if (draftIds.length === 0) return;
    await fetch("/api/outbound/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailIds: draftIds, action: "approve_all" }),
    });
    loadEmails();
  }

  function startEdit(email: OutboundEmail) {
    setEditingId(email.id);
    setEditSubject(email.subject);
    setEditBody(email.bodyHtml);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/sequences/${id}`}
            className="text-sm text-[var(--color-accent)] hover:opacity-90"
          >
            &larr; Back to sequence
          </Link>
          <h1 className="mt-1 text-xl font-semibold">Review Queue</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Review and approve outbound emails before sending.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-[rgba(255,255,255,0.08)]">
            {(["draft", "queued", "sent"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs ${
                  filter === f
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {filter === "draft" && emails.length > 0 && (
            <button
              onClick={approveAll}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
            >
              Approve All ({emails.length})
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-[var(--color-text-secondary)]">Loading...</p>
      ) : emails.length === 0 ? (
        <div className="mt-8 text-center text-[var(--color-text-secondary)]">
          No {filter} emails in the queue.
        </div>
      ) : (
        <div className="space-y-3">
          {emails.map((email) => (
            <div
              key={email.id}
              className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    <span>To: {email.toAddress}</span>
                    {email.contact && (
                      <span>
                        ({[email.contact.firstName, email.contact.lastName].filter(Boolean).join(" ")}
                        {email.contact.title ? ` — ${email.contact.title}` : ""})
                      </span>
                    )}
                    {email.stepNumber && <span>Step {email.stepNumber}</span>}
                  </div>

                  {editingId === email.id ? (
                    <div className="mt-2 space-y-2">
                      <input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        className="w-full rounded border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-base)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                      />
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={6}
                        className="w-full rounded border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-base)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(email.id)}
                          className="rounded bg-[var(--color-accent)] px-3 py-1 text-xs text-white"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded border border-[rgba(255,255,255,0.08)] px-3 py-1 text-xs text-[var(--color-text-secondary)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
                        {email.subject}
                      </p>
                      <div
                        className="mt-2 text-xs text-[var(--color-text-secondary)] line-clamp-3"
                        dangerouslySetInnerHTML={{
                          __html: email.bodyHtml.substring(0, 300),
                        }}
                      />
                      {/* Q10 — inline spam-trigger warnings. Computed
                          client-side per draft so the user sees the
                          severity at a glance before clicking Approve.
                          Severity colours: medium = amber, high = red.
                          We deliberately do NOT block submission — the
                          user can still approve a flagged draft, but
                          they did so with eyes open. */}
                      <SpamWarnings subject={email.subject} bodyHtml={email.bodyHtml} bodyText={email.bodyText} />
                    </>
                  )}
                </div>

                {filter === "draft" && editingId !== email.id && (
                  <div className="ml-4 flex gap-1">
                    <button
                      onClick={() => approve(email.id)}
                      className="rounded bg-green-600/20 px-2 py-1 text-xs text-green-400 hover:bg-green-600/30"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => startEdit(email)}
                      className="rounded bg-[var(--color-bg-muted)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => skip(email.id)}
                      className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/30"
                    >
                      Skip
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Q10 — render the spam-check result for a single draft.
 *
 * Strips HTML tags out of `bodyHtml` for the heuristic so we don't
 * count <a href> attributes as personalisation tokens or spammy text.
 * Falls back to `bodyText` when present (cleaner) so the score reflects
 * what the recipient actually reads.
 *
 * Returns null when the draft is clean — no UI noise on good emails.
 */
function SpamWarnings({
  subject,
  bodyHtml,
  bodyText,
}: {
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
}): React.ReactElement | null {
  const plain =
    bodyText && bodyText.trim().length > 0
      ? bodyText
      : bodyHtml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  const result: SpamCheckResult = checkSpamSignals(subject, plain);
  if (result.severity === "clean") return null;

  const palette = {
    low: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: "#92400e" },
    medium: { bg: "rgba(234,88,12,0.10)", border: "rgba(234,88,12,0.30)", text: "#9a3412" },
    high: { bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.30)", text: "#991b1b" },
  } as const;
  const c = palette[result.severity];

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 rounded px-2 py-1.5 text-[11px]"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <div className="font-medium">
        Spam risk: {result.severity} · {result.score}/100
      </div>
      <ul className="mt-1 list-disc pl-4 space-y-0.5">
        {result.warnings.map((w) => (
          <li key={w.code}>{w.message}</li>
        ))}
      </ul>
    </div>
  );
}
