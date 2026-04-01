"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

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
      const res = await fetch(`/api/outbound/review?status=${filter}`);
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
            className="text-sm text-[#6366f1] hover:text-[#5558e6]"
          >
            &larr; Back to sequence
          </Link>
          <h1 className="mt-1 text-xl font-semibold">Review Queue</h1>
          <p className="text-sm text-[#8b8ba0]">
            Review and approve outbound emails before sending.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-[#1e1f2a]">
            {(["draft", "queued", "sent"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs ${
                  filter === f
                    ? "bg-[#6366f1] text-white"
                    : "text-[#8b8ba0] hover:bg-[#1e1f2a]"
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
        <p className="text-[#8b8ba0]">Loading...</p>
      ) : emails.length === 0 ? (
        <div className="mt-8 text-center text-[#8b8ba0]">
          No {filter} emails in the queue.
        </div>
      ) : (
        <div className="space-y-3">
          {emails.map((email) => (
            <div
              key={email.id}
              className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs text-[#8b8ba0]">
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
                        className="w-full rounded border border-[#1e1f2a] bg-[#0a0b10] px-3 py-1.5 text-sm text-[#e8e8ed] focus:border-[#6366f1] focus:outline-none"
                      />
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={6}
                        className="w-full rounded border border-[#1e1f2a] bg-[#0a0b10] px-3 py-2 text-sm text-[#e8e8ed] focus:border-[#6366f1] focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(email.id)}
                          className="rounded bg-[#6366f1] px-3 py-1 text-xs text-white"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded border border-[#1e1f2a] px-3 py-1 text-xs text-[#8b8ba0]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mt-1 text-sm font-medium text-[#e8e8ed]">
                        {email.subject}
                      </p>
                      <div
                        className="mt-2 text-xs text-[#8b8ba0] line-clamp-3"
                        dangerouslySetInnerHTML={{
                          __html: email.bodyHtml.substring(0, 300),
                        }}
                      />
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
                      className="rounded bg-[#1e1f2a] px-2 py-1 text-xs text-[#8b8ba0] hover:bg-[#2a2b3a]"
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
