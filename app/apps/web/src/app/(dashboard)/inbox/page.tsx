"use client";

import { useState, useEffect } from "react";
import { Inbox, Mail, MailCheck, MailX, Clock, ExternalLink } from "lucide-react";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";

interface InboxEmail {
  id: string;
  toAddress: string;
  fromAddress: string;
  subject: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
  replySnippet: string | null;
  replyClassification: string | null;
  bounceType: string | null;
  contactId: string | null;
  enrollmentId: string | null;
  stepNumber: number | null;
  contact: { name: string; email: string | null } | null;
}

interface InboxCounts {
  total: number;
  replied: number;
  awaiting: number;
  bounced: number;
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
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [counts, setCounts] = useState<InboxCounts>({ total: 0, replied: 0, awaiting: 0, bounced: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "replied" | "awaiting" | "bounced">("all");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/inbox?filter=${filter}`)
      .then((r) => r.json())
      .then((data) => {
        setEmails(data.emails || []);
        setCounts(data.counts || { total: 0, replied: 0, awaiting: 0, bounced: 0 });
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
    { key: "all" as const, label: "All", count: counts.total },
    { key: "replied" as const, label: "Replied", count: counts.replied },
    { key: "awaiting" as const, label: "Awaiting", count: counts.awaiting },
    { key: "bounced" as const, label: "Bounced", count: counts.bounced },
  ];

  return (
    <div className="flex h-full flex-col">
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
            title="No emails"
            description={filter === "all" ? "Send your first sequence to see emails here." : `No ${filter} emails.`}
          />
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
                        {email.replyClassification && (
                          <Badge
                            variant={email.replyClassification.includes("positive") ? "success" : email.replyClassification.includes("negative") ? "error" : "neutral"}
                            size="sm"
                            className="mt-1"
                          >
                            {email.replyClassification}
                          </Badge>
                        )}
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
    </div>
  );
}
