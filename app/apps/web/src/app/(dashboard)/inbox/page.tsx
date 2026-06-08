"use client";

import { useState, useEffect } from "react";
import { Inbox, Mail, MailCheck, MailX, Clock, ExternalLink, Sparkles, Loader2 } from "lucide-react";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmailComposerPanel } from "@/components/email-composer-panel";
import type { EmailComposerDraft } from "@/components/email-composer-panel";
import { useToast } from "@/components/ui/toast";

interface InboxEmail {
  id: string;
  direction?: "inbound" | "outbound";
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
  enrollmentId?: string | null;
  stepNumber?: number | null;
  contact: { name: string; email: string | null } | null;
  // Inbound-only (filter === "inbound")
  body?: string | null;
  receivedAt?: string | null;
  sentiment?: "positive" | "neutral" | "negative" | null;
}

interface InboxCounts {
  total: number;
  replied: number;
  awaiting: number;
  bounced: number;
  inbound: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function InboxPage() {
  const { toast } = useToast();
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [counts, setCounts] = useState<InboxCounts>({ total: 0, replied: 0, awaiting: 0, bounced: 0, inbound: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "replied" | "awaiting" | "bounced" | "inbound">("all");
  // Inline "Draft AI reply" flow. Monaco surfaces a suggested reply
  // right on the email thread; we mirror that pattern from the inbox
  // list so users don't have to jump to the contact detail page.
  const [draftingFor, setDraftingFor] = useState<string | null>(null);
  const [composer, setComposer] = useState<EmailComposerDraft | null>(null);

  async function draftAiReply(email: InboxEmail) {
    const sourceContent = email.body || email.replySnippet;
    if (!sourceContent) return;
    setDraftingFor(email.id);
    try {
      const res = await fetch("/api/emails/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailContent: sourceContent,
          senderName: email.contact?.name ?? null,
          senderEmail: email.fromAddress,
        }),
      });
      if (!res.ok) {
        toast("Couldn't draft a reply right now", "error");
        return;
      }
      const data = await res.json() as { replies?: Array<{ tone: string; subject: string; body: string }> };
      const brief = data.replies?.find((r) => r.tone === "brief") ?? data.replies?.[0];
      if (!brief) {
        toast("No reply generated — falling back to blank composer", "warning");
      }
      setComposer({
        to: email.fromAddress,
        subject: brief?.subject ?? `Re: ${email.subject}`,
        body: brief?.body ?? "",
      });
    } catch (err) {
      console.warn("inbox: suggest-reply failed", err);
      toast("Couldn't draft a reply right now", "error");
    } finally {
      setDraftingFor(null);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/inbox?filter=${filter}`)
      .then((r) => r.json())
      .then((data) => {
        setEmails(data.emails || []);
        setCounts(data.counts || { total: 0, replied: 0, awaiting: 0, bounced: 0, inbound: 0 });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  function statusBadge(email: InboxEmail) {
    if (email.repliedAt) return <Badge variant="success" size="sm">Replied</Badge>;
    if (email.bouncedAt) return <Badge variant="error" size="sm">{email.bounceType === "complaint" ? "Spam" : "Bounced"}</Badge>;
    if (email.clickedAt) return <Badge variant="info" size="sm">Clicked</Badge>;
    if (email.openedAt) return <Badge variant="info" size="sm">Opened</Badge>;
    if (email.status === "delivered") return <Badge variant="neutral" size="sm">Delivered</Badge>;
    if (email.status === "sent") return <Badge variant="neutral" size="sm">Sent</Badge>;
    return <Badge variant="neutral" size="sm">{email.status}</Badge>;
  }

  const filters = [
    { key: "all" as const, label: "Sent", count: counts.total },
    { key: "inbound" as const, label: "Inbound", count: counts.inbound },
    { key: "replied" as const, label: "Replied", count: counts.replied },
    { key: "awaiting" as const, label: "Awaiting", count: counts.awaiting },
    { key: "bounced" as const, label: "Bounced", count: counts.bounced },
  ];

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader icon={<Inbox size={16} />} title="Inbox" subtitle={`${counts.total} emails`} />

      <FilterBar>
        <div className="flex gap-0.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
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
      </FilterBar>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : emails.length === 0 ? (
          <EmptyState
            icon={<Inbox size={28} />}
            title={filter === "inbound" ? "No inbound messages" : "No emails"}
            description={
              filter === "inbound"
                ? "Incoming email and replies land here once a mailbox is connected and your contacts write back."
                : filter === "all"
                  ? "Send your first sequence to see emails here."
                  : `No ${filter} emails.`
            }
          />
        ) : filter === "inbound" ? (
          /* ── Inbound view: the actual incoming messages, full body ── */
          <table className="ls-table">
            <thead>
              <tr>
                <th><span className="flex items-center gap-1.5"><Mail size={12} style={{ opacity: 0.5 }} /> From</span></th>
                <th><span className="flex items-center gap-1.5">Subject</span></th>
                <th><span className="flex items-center gap-1.5"><Clock size={12} style={{ opacity: 0.5 }} /> Received</span></th>
                <th><span className="flex items-center gap-1.5">Message</span></th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => (
                <tr key={email.id}>
                  {/* From */}
                  <td>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {email.contact?.name || email.fromAddress || "Unknown sender"}
                      </div>
                      {email.fromAddress && (
                        <div className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{email.fromAddress}</div>
                      )}
                    </div>
                  </td>

                  {/* Subject */}
                  <td>
                    <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                      {email.subject}
                    </span>
                  </td>

                  {/* Received */}
                  <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                    {email.receivedAt ? timeAgo(email.receivedAt) : "—"}
                  </td>

                  {/* Message */}
                  <td>
                    <div>
                      {email.body && (
                        <p className="line-clamp-2 max-w-[420px] text-[12px]" style={{ color: "var(--color-text-secondary)" }} title={email.body}>
                          {email.body}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        {email.sentiment && (
                          <Badge
                            variant={email.sentiment === "positive" ? "success" : email.sentiment === "negative" ? "error" : "neutral"}
                            size="sm"
                          >
                            {email.sentiment}
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void draftAiReply(email); }}
                          disabled={draftingFor === email.id}
                          className="inline-flex items-center gap-1 text-[11px] font-medium transition-opacity hover:underline disabled:opacity-60"
                          style={{ color: "var(--color-accent)" }}
                          title="Draft an AI-suggested reply"
                        >
                          {draftingFor === email.id ? (
                            <>
                              <Loader2 size={10} className="animate-spin" /> Drafting…
                            </>
                          ) : (
                            <>
                              <Sparkles size={10} /> Draft AI reply
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="ls-table">
            <thead>
              <tr>
                <th><span className="flex items-center gap-1.5"><Mail size={12} style={{ opacity: 0.5 }} /> To</span></th>
                <th><span className="flex items-center gap-1.5">Subject</span></th>
                <th><span className="flex items-center gap-1.5">Status</span></th>
                <th><span className="flex items-center gap-1.5"><Clock size={12} style={{ opacity: 0.5 }} /> Sent</span></th>
                <th><span className="flex items-center gap-1.5"><MailCheck size={12} style={{ opacity: 0.5 }} /> Reply</span></th>
                <th><span className="flex items-center gap-1.5">Step</span></th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => (
                <tr key={email.id}>
                  {/* To */}
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

                  {/* Subject */}
                  <td>
                    <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                      {email.subject}
                    </span>
                  </td>

                  {/* Status */}
                  <td>{statusBadge(email)}</td>

                  {/* Sent */}
                  <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                    {email.sentAt ? timeAgo(email.sentAt) : "—"}
                  </td>

                  {/* Reply */}
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
                              variant={email.replyClassification.includes("positive") ? "success" : email.replyClassification.includes("negative") ? "error" : "neutral"}
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
                                <>
                                  <Loader2 size={10} className="animate-spin" /> Drafting…
                                </>
                              ) : (
                                <>
                                  <Sparkles size={10} /> Draft AI reply
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>
                    )}
                  </td>

                  {/* Step */}
                  <td className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                    {email.stepNumber ? `Step ${email.stepNumber}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {composer && (
        <EmailComposerPanel
          draft={composer}
          onClose={() => setComposer(null)}
        />
      )}
    </div>
  );
}
