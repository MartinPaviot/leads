"use client";

/**
 * Reading pane (detail). Full thread bodies, persisted thread intelligence
 * (signals with evidence quotes — rendered only when the pipeline actually
 * extracted them), the agent's prepared reply when one exists, and the
 * triage verbs: Reply, Book meeting, Stop sequence, Done, Snooze.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Mail,
  CalendarPlus,
  CheckCircle2,
  AlarmClock,
  OctagonX,
  Sparkles,
  Loader2,
  ChevronDown,
  Bot,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { EmailComposerPanel, type EmailComposerDraft } from "@/components/email-composer-panel";
import { MeetingSchedulerCard } from "@/components/meeting-scheduler";
import { timeAgo } from "./_time-ago";
import { reasonTooltip, type ConversationDetail, type InboxLane } from "./_types";

const SNOOZE_OPTIONS: Array<{ label: string; until: () => Date }> = [
  {
    label: "Tomorrow morning",
    until: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: "In 3 days",
    until: () => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: "Next Monday",
    until: () => {
      const d = new Date();
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

export function ConversationPane({
  conversationKey,
  lane,
  replySignal,
  onTriage,
}: {
  conversationKey: string | null;
  lane: InboxLane;
  /** Incremented by the page when the user presses `r`. */
  replySignal: number;
  onTriage: (key: string, action: "done" | "snooze" | "reopen", snoozeUntil?: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [composer, setComposer] = useState<EmailComposerDraft | null>(null);
  const [usedDraftId, setUsedDraftId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const snoozeRef = useRef<HTMLDivElement>(null);

  // Dismiss the snooze popover on Escape or outside click.
  useEffect(() => {
    if (!snoozeOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSnoozeOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) setSnoozeOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [snoozeOpen]);

  useEffect(() => {
    setComposer(null);
    setSchedOpen(false);
    setSnoozeOpen(false);
    setUsedDraftId(null);
    if (!conversationKey) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/inbox/conversations/detail?key=${encodeURIComponent(conversationKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationKey]);

  const replyTo =
    detail?.conversation.fromAddress || detail?.contact?.email || "";

  const openReply = useCallback(async () => {
    if (!detail) return;
    const conv = detail.conversation;
    if (detail.preparedDraft) {
      setUsedDraftId(detail.preparedDraft.id);
      setComposer({
        to: replyTo,
        subject: detail.preparedDraft.subject || `Re: ${conv.subject}`,
        body: detail.preparedDraft.body,
        contactId: detail.contact?.id,
      });
      return;
    }
    const lastInbound = [...conv.messages].reverse().find((m) => m.direction === "inbound");
    if (!lastInbound?.body) {
      setComposer({ to: replyTo, subject: `Re: ${conv.subject}`, body: "", contactId: detail.contact?.id });
      return;
    }
    setDrafting(true);
    try {
      const res = await fetch("/api/emails/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailContent: lastInbound.body,
          senderName: detail.contact?.name ?? null,
          senderEmail: lastInbound.from || replyTo,
        }),
      });
      const data = res.ok
        ? ((await res.json()) as { replies?: Array<{ tone: string; subject: string; body: string }> })
        : {};
      const brief = data.replies?.find((r) => r.tone === "brief") ?? data.replies?.[0];
      setComposer({
        to: replyTo,
        subject: brief?.subject ?? `Re: ${conv.subject}`,
        body: brief?.body ?? "",
        contactId: detail.contact?.id,
      });
      if (!brief) toast("Couldn't suggest a reply — opening a blank composer.", "warning");
    } catch {
      setComposer({ to: replyTo, subject: `Re: ${conv.subject}`, body: "", contactId: detail.contact?.id });
      toast("Couldn't suggest a reply — opening a blank composer.", "warning");
    } finally {
      setDrafting(false);
    }
  }, [detail, replyTo, toast]);

  // `r` pressed on the page.
  useEffect(() => {
    if (replySignal > 0 && detail && !composer) void openReply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replySignal]);

  async function handleSent() {
    if (usedDraftId) {
      await fetch(`/api/inbox/drafts/${usedDraftId}/consume`, { method: "POST" }).catch(() => {});
      setUsedDraftId(null);
      setDetail((d) => (d ? { ...d, preparedDraft: null } : d));
    }
    toast("Reply sent. Mark the conversation done when you're finished.", "success");
  }

  async function stopSequence() {
    if (!detail?.enrollment) return;
    setStopping(true);
    try {
      const res = await fetch(`/api/sequences/${detail.enrollment.sequenceId}/enroll`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId: detail.enrollment.id, status: "completed" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast(data.error ?? "Couldn't stop the sequence.", "error");
        return;
      }
      toast(`Stopped "${detail.enrollment.sequenceName}" for this contact.`, "success");
      setDetail((d) => (d ? { ...d, enrollment: null } : d));
    } catch {
      toast("Network error while stopping the sequence.", "error");
    } finally {
      setStopping(false);
    }
  }

  if (!conversationKey) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          Select a conversation to read it.
        </p>
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="flex h-full items-center justify-center">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
        ) : (
          <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            This conversation is no longer available.
          </p>
        )}
      </div>
    );
  }

  const conv = detail.conversation;
  const intel = conv.intelligence;
  const triageable = lane === "attention" || lane === "snoozed";

  return (
    <div className="flex h-full flex-col">
      {/* ── Header: who, subject, actions ── */}
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border-default)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {detail.contact ? (
                <Link
                  href={`/contacts/${detail.contact.id}`}
                  className="truncate text-[14px] font-semibold hover:underline"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {detail.contact.name}
                </Link>
              ) : (
                <span className="truncate text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {conv.displayName}
                </span>
              )}
              {conv.fromAddress && (
                <span className="truncate text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {conv.fromAddress}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                {conv.subject}
              </span>
              {conv.reason && (
                <span
                  className="text-[11px] font-medium"
                  style={{ color: "var(--color-accent)" }}
                  title={reasonTooltip(conv.reasonSource)}
                >
                  {conv.reason}
                </span>
              )}
              {intel?.urgencyLevel && intel.urgencyLevel !== "none" && (
                <Badge variant={intel.urgencyLevel === "high" ? "error" : "warning"} size="sm">
                  {intel.urgencyLevel === "high" ? "High urgency" : `Urgency: ${intel.urgencyLevel}`}
                </Badge>
              )}
              {intel?.sentimentTrend === "declining" && (
                <Badge variant="warning" size="sm">Sentiment declining</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={openReply} disabled={drafting} className="gap-1.5">
            {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            {drafting ? "Drafting…" : "Reply"}
          </Button>
          {detail.contact && (
            <Button
              variant={schedOpen ? "solid" : "outline"}
              size="sm"
              onClick={() => setSchedOpen((v) => !v)}
              className="gap-1.5"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Book meeting
            </Button>
          )}
          {detail.enrollment && (
            <Button variant="outline" size="sm" onClick={stopSequence} disabled={stopping} className="gap-1.5">
              {stopping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <OctagonX className="h-3.5 w-3.5" />}
              Stop sequence
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {triageable && (
              <div className="relative" ref={snoozeRef}>
                <Button variant="outline" size="sm" onClick={() => setSnoozeOpen((v) => !v)} className="gap-1.5">
                  <AlarmClock className="h-3.5 w-3.5" />
                  Snooze
                  <ChevronDown className="h-3 w-3" />
                </Button>
                {snoozeOpen && (
                  <div
                    className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border py-1 shadow-lg"
                    style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
                  >
                    {SNOOZE_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        className="block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:underline"
                        style={{ color: "var(--color-text-primary)" }}
                        onClick={() => {
                          setSnoozeOpen(false);
                          void onTriage(conv.key, "snooze", opt.until().toISOString());
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {triageable ? (
              <Button size="sm" variant="outline" onClick={() => void onTriage(conv.key, "done")} className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </Button>
            ) : lane === "done" ? (
              <Button size="sm" variant="outline" onClick={() => void onTriage(conv.key, "reopen")}>
                Reopen
              </Button>
            ) : null}
          </div>
        </div>

        {schedOpen && detail.contact && (
          <MeetingSchedulerCard
            contactId={detail.contact.id}
            firstName={detail.contact.name.split(" ")[0] || ""}
            onClose={() => setSchedOpen(false)}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* ── Handled note: what the agent already did ── */}
        {conv.handledNote && (
          <div
            className="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
          >
            <Bot className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
            <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              {conv.handledNote}
            </span>
          </div>
        )}

        {/* ── Agent-prepared reply ── */}
        {detail.preparedDraft && (
          <div
            className="mb-3 rounded-lg border p-3"
            style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
                <Sparkles size={12} /> Prepared reply
              </span>
              <Button size="sm" onClick={openReply}>Edit &amp; send</Button>
            </div>
            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
              {detail.preparedDraft.body}
            </p>
          </div>
        )}

        {/* ── Thread intelligence (only what the pipeline persisted) ── */}
        {intel && ((intel.signals?.length ?? 0) > 0 || (intel.objections?.length ?? 0) > 0 || (intel.nextSteps?.length ?? 0) > 0) && (
          <div
            className="mb-3 rounded-lg border p-3"
            style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
          >
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
              What this thread tells us
            </span>
            {(intel.signals ?? []).map((s, i) => (
              <div key={`s-${i}`} className="mt-2 flex items-start gap-2">
                <Badge variant="success" size="sm">{s.type}</Badge>
                <p className="flex items-start gap-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                  <Quote size={10} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} />
                  {s.evidence}
                </p>
              </div>
            ))}
            {(intel.objections ?? []).map((o, i) => (
              <div key={`o-${i}`} className="mt-2 flex items-start gap-2">
                <Badge variant={o.status === "unresolved" ? "warning" : "neutral"} size="sm">
                  {o.category}{o.status === "unresolved" ? " · unresolved" : ""}
                </Badge>
                <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{o.summary}</p>
              </div>
            ))}
            {(intel.nextSteps ?? []).length > 0 && (
              <div className="mt-2">
                <span className="text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>Next steps mentioned</span>
                <ul className="mt-0.5 list-inside list-disc">
                  {(intel.nextSteps ?? []).map((step, i) => (
                    <li key={i} className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{step}</li>
                  ))}
                </ul>
              </div>
            )}
            {(intel.competitors ?? []).length > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>Competitors mentioned</span>
                {(intel.competitors ?? []).map((c) => (
                  <Badge key={c} variant="info" size="sm">{c}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Messages, chronological, full bodies ── */}
        {conv.messages.map((m) => (
          <div
            key={m.id}
            className="mb-2.5 rounded-lg border p-3"
            style={{
              borderColor: "var(--color-border-default)",
              background: m.direction === "inbound" ? "var(--color-bg-card)" : "transparent",
              marginLeft: m.direction === "outbound" ? "24px" : "0",
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                {m.direction === "inbound" ? m.from || conv.displayName : "You"}
                {m.direction === "outbound" && m.stepNumber ? (
                  <span className="ml-1.5 font-normal" style={{ color: "var(--color-text-tertiary)" }}>
                    Step {m.stepNumber}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {m.at ? timeAgo(m.at) : ""}
              </span>
            </div>
            {m.subject && m.subject !== conv.subject && (
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{m.subject}</div>
            )}
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              {m.body || "(empty message)"}
            </p>
          </div>
        ))}
      </div>

      {composer && (
        <EmailComposerPanel
          draft={composer}
          onClose={() => setComposer(null)}
          onSent={() => void handleSent()}
        />
      )}
    </div>
  );
}
