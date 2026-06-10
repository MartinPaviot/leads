"use client";

/**
 * Outbound monitoring tab — the previous Inbox table (sent emails with
 * delivery/engagement status), kept as a secondary view with working
 * pagination. Triage lives in the conversation lanes, not here.
 */

import { useState, useEffect } from "react";
import { Mail, MailCheck, Clock, Sparkles, Loader2, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmailComposerPanel } from "@/components/email-composer-panel";
import type { EmailComposerDraft } from "@/components/email-composer-panel";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { timeAgo } from "./_time-ago";

interface OutboundEmail {
  id: string;
  toAddress: string;
  fromAddress: string;
  subject: string;
  status?: string;
  sentAt?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  repliedAt?: string | null;
  bouncedAt?: string | null;
  replySnippet?: string | null;
  replyClassification?: string | null;
  bounceType?: string | null;
  contactId: string | null;
  stepNumber?: number | null;
  contact: { name: string; email: string | null } | null;
}

type OutboundFilter = "all" | "replied" | "awaiting" | "bounced";

export function OutboundTable() {
  const { toast } = useToast();
  const [emails, setEmails] = useState<OutboundEmail[]>([]);
  const [counts, setCounts] = useState({ total: 0, replied: 0, awaiting: 0, bounced: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OutboundFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [draftingFor, setDraftingFor] = useState<string | null>(null);
  const [composer, setComposer] = useState<EmailComposerDraft | null>(null);

  const pageSize = 30;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/inbox?filter=${filter}&page=${page}`)
      .then((r) => r.json())
      .then((data) => {
        setEmails(data.emails || []);
        setCounts(data.counts || { total: 0, replied: 0, awaiting: 0, bounced: 0 });
        setTotal(Number(data.pagination?.total || 0));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter, page]);

  async function draftAiReply(email: OutboundEmail) {
    if (!email.replySnippet) return;
    setDraftingFor(email.id);
    try {
      const res = await fetch("/api/emails/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailContent: email.replySnippet,
          senderName: email.contact?.name ?? null,
          senderEmail: email.toAddress,
        }),
      });
      if (!res.ok) {
        toast("Couldn't draft a reply right now", "error");
        return;
      }
      const data = (await res.json()) as { replies?: Array<{ tone: string; subject: string; body: string }> };
      const brief = data.replies?.find((r) => r.tone === "brief") ?? data.replies?.[0];
      setComposer({
        to: email.toAddress,
        subject: brief?.subject ?? `Re: ${email.subject}`,
        body: brief?.body ?? "",
        contactId: email.contactId ?? undefined,
      });
    } catch {
      toast("Couldn't draft a reply right now", "error");
    } finally {
      setDraftingFor(null);
    }
  }

  function statusBadge(email: OutboundEmail) {
    if (email.repliedAt) return <Badge variant="success" size="sm">Replied</Badge>;
    if (email.bouncedAt) return <Badge variant="error" size="sm">{email.bounceType === "complaint" ? "Spam" : "Bounced"}</Badge>;
    if (email.clickedAt) return <Badge variant="info" size="sm">Clicked</Badge>;
    if (email.openedAt) return <Badge variant="info" size="sm">Opened</Badge>;
    if (email.status === "delivered") return <Badge variant="neutral" size="sm">Delivered</Badge>;
    if (email.status === "sent") return <Badge variant="neutral" size="sm">Sent</Badge>;
    return <Badge variant="neutral" size="sm">{email.status}</Badge>;
  }

  const filters: Array<{ key: OutboundFilter; label: string; count: number }> = [
    { key: "all", label: "Sent", count: counts.total },
    { key: "replied", label: "Replied", count: counts.replied },
    { key: "awaiting", label: "Awaiting", count: counts.awaiting },
    { key: "bounced", label: "Bounced", count: counts.bounced },
  ];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-1.5" style={{ borderColor: "var(--color-border-default)" }}>
        <div className="flex gap-0.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(1); }}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: filter === f.key ? "var(--color-accent-soft)" : "transparent",
                color: filter === f.key ? "var(--color-accent)" : "var(--color-text-tertiary)",
              }}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : emails.length === 0 ? (
          <EmptyState
            icon={<Inbox size={28} />}
            title="No emails"
            description={filter === "all" ? "Send your first sequence to see emails here." : `No ${filter} emails.`}
          />
        ) : (
          <table className="ls-table">
            <thead>
              <tr>
                <th><span className="flex items-center gap-1.5"><Mail size={12} style={{ opacity: 0.5 }} /> To</span></th>
                <th>Subject</th>
                <th>Status</th>
                <th><span className="flex items-center gap-1.5"><Clock size={12} style={{ opacity: 0.5 }} /> Sent</span></th>
                <th><span className="flex items-center gap-1.5"><MailCheck size={12} style={{ opacity: 0.5 }} /> Reply</span></th>
                <th>Step</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => (
                <tr key={email.id}>
                  <td>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {email.contact?.name || email.toAddress}
                      </div>
                      {email.contact && (
                        <div className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{email.toAddress}</div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>{email.subject}</span>
                  </td>
                  <td>{statusBadge(email)}</td>
                  <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                    {email.sentAt ? timeAgo(email.sentAt) : "—"}
                  </td>
                  <td>
                    {email.repliedAt ? (
                      <div>
                        <div className="text-[12px]" style={{ color: "var(--color-success)" }}>
                          {timeAgo(email.repliedAt)}
                        </div>
                        {email.replySnippet && (
                          <p className="mt-0.5 max-w-[250px] truncate text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                            {email.replySnippet}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          {email.replyClassification && (
                            <Badge
                              variant={email.replyClassification.includes("interested") || email.replyClassification === "meeting_request" ? "success" : email.replyClassification.startsWith("objection") ? "warning" : "neutral"}
                              size="sm"
                            >
                              {email.replyClassification}
                            </Badge>
                          )}
                          {email.replySnippet && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void draftAiReply(email); }}
                              disabled={draftingFor === email.id}
                              className="inline-flex items-center gap-1 text-[11px] font-medium transition-opacity hover:underline disabled:opacity-60"
                              style={{ color: "var(--color-accent)" }}
                              title="Draft an AI-suggested reply"
                            >
                              {draftingFor === email.id ? (
                                <><Loader2 size={10} className="animate-spin" /> Drafting…</>
                              ) : (
                                <><Sparkles size={10} /> Draft AI reply</>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>
                    )}
                  </td>
                  <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                    {email.stepNumber ? `Step ${email.stepNumber}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {composer && <EmailComposerPanel draft={composer} onClose={() => setComposer(null)} />}
    </div>
  );
}
