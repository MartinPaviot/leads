"use client";

/**
 * Reading pane (detail). Full thread bodies, persisted thread intelligence
 * (signals with evidence quotes — rendered only when the pipeline actually
 * extracted them), the agent's prepared reply when one exists, and the
 * triage verbs: Reply, Book meeting, Stop sequence, Done, Snooze.
 */

import { useState, useEffect, useCallback, useRef, useMemo, useImperativeHandle } from "react";
import type { Ref } from "react";
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
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { EmailComposerPanel, type EmailComposerDraft } from "@/components/email-composer-panel";
import { ContactCollisionNotice } from "@/components/collision/contact-collision-notice";
import { MeetingSchedulerCard } from "@/components/meeting-scheduler";
import { timeAgo } from "./_time-ago";
import { reasonTooltip, type ConversationDetail, type InboxLane } from "./_types";
import { EmailBody } from "./_email-body";
import { EventCard } from "./_event-card";
import { injectMeetingLink } from "@/lib/inbox/meeting-link";
import { takeCachedDetail } from "@/lib/inbox/detail-cache";
import { extractProposedTime, toDatetimeLocal } from "@/lib/inbox/proposed-time";
import { type Snippet } from "@/lib/inbox/snippets";
import { SnippetBar } from "./_snippet-bar";
import { extractSenderEmail } from "@/lib/inbox/image-trust";
import { ProspectBriefSection } from "./_prospect-brief";
import { ThreadSummarySection } from "./_thread-summary";
import { ThreadAskSection } from "./_thread-ask";
import { ThreadNotes } from "./_thread-notes";
import { ThreadAssignment } from "./_thread-assignment";
import { AttachmentStrip } from "./_attachments";
import { ThreadLabels } from "./_thread-labels";
import { ThreadPresence } from "./_thread-presence";
import { shouldSummarize } from "@/lib/inbox/thread-summary-prep";
import { initialsFor, avatarColorIndex } from "@/lib/inbox/sender-auth";
import { parseWhen } from "@/lib/inbox/parse-when";
import { dirOf } from "@/lib/inbox/text-direction";
import { decodeDisplay } from "@/lib/inbox/text-decode";

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

/**
 * CLE-14 §lift: the imperative handle ConversationPane exposes to the Inbox
 * page so the registered reply/draft/book/stop actions run the SAME flows the
 * pane's buttons run (open the composer, open the scheduler, stop the
 * sequence). The page reads this via `apiRef`; it is non-null only while a
 * conversation is open (this pane mounted with detail loaded), so the actions
 * degrade cleanly when no conversation is selected.
 */
export interface ConversationPaneApi {
  /** Open the reply composer (prepared draft if present, else AI-suggested). Does NOT send. */
  openReply: () => Promise<void>;
  /** Open the meeting scheduler card. */
  bookMeeting: () => void;
  /** Stop the active sequence enrollment. ok:false when there is none. */
  stopSequence: () => Promise<{ ok: boolean; error?: string }>;
}

export function ConversationPane({
  conversationKey,
  lane,
  replySignal,
  onTriage,
  apiRef,
}: {
  conversationKey: string | null;
  lane: InboxLane;
  /** Incremented by the page when the user presses `r`. */
  replySignal: number;
  onTriage: (key: string, action: "done" | "snooze" | "reopen", snoozeUntil?: string) => Promise<void>;
  /** CLE-14: set by the page to drive reply/book/stop from the chat. */
  apiRef?: Ref<ConversationPaneApi | null>;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [composer, setComposer] = useState<EmailComposerDraft | null>(null);
  const [usedDraftId, setUsedDraftId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [prefillWhen, setPrefillWhen] = useState<string | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeText, setSnoozeText] = useState("");
  const [stopping, setStopping] = useState(false);
  const [trustedSenders, setTrustedSenders] = useState<string[]>([]);
  const [replyTones, setReplyTones] = useState<Array<{ tone: string; subject: string; body: string }>>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
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

  // Load the per-user "always show images" allowlist once (INBOX-R02).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/image-trust")
      .then((r) => (r.ok ? r.json() : { senders: [] }))
      .then((d: { senders?: string[] }) => {
        if (!cancelled && Array.isArray(d.senders)) setTrustedSenders(d.senders);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the user's personal reply snippets once (INBOX-X05).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/snippets")
      .then((r) => (r.ok ? r.json() : { snippets: [] }))
      .then((d: { snippets?: Snippet[] }) => {
        if (!cancelled && Array.isArray(d.snippets)) setSnippets(d.snippets);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setComposer(null);
    setReplyTones([]);
    setSchedOpen(false);
    setSnoozeOpen(false);
    setUsedDraftId(null);
    if (!conversationKey) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Drain the prefetch cache (INBOX-K04) — a hovered/neighbouring thread is
    // already in flight, so j/k renders instantly. Miss → authoritative fetch.
    const source =
      takeCachedDetail(conversationKey) ??
      fetch(`/api/inbox/conversations/detail?key=${encodeURIComponent(conversationKey)}`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)),
      );
    source
      .then((data) => {
        if (!cancelled) setDetail(data as ConversationDetail);
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

  // A meeting time the prospect proposed in their latest message (INBOX-CAL02) —
  // offered as a one-click prefill of the scheduler, never auto-booked.
  const proposedTime = useMemo(() => {
    const msgs = detail?.conversation.messages ?? [];
    const lastInbound = [...msgs].reverse().find((m) => m.direction === "inbound");
    return extractProposedTime(lastInbound?.body);
  }, [detail]);

  const openReply = useCallback(async () => {
    if (!detail) return;
    setReplyTones([]); // clear any tone chips from a prior thread (INBOX-C02)
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
      setReplyTones(data.replies ?? []); // one-tap tone switcher (INBOX-C02)
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

  // CLE-14 §lift: returns {ok,error?} so the chat action can report the outcome
  // while the existing toast/early-return behaviour is preserved for the button.
  // The Stop button is only rendered when detail.enrollment exists, so the
  // no-enrollment branch returning is harmless to the button (it ignores it).
  const stopSequence = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!detail?.enrollment) return { ok: false, error: "No active sequence on this conversation." };
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
        return { ok: false, error: data.error ?? "Couldn't stop the sequence." };
      }
      toast(`Stopped "${detail.enrollment.sequenceName}" for this contact.`, "success");
      setDetail((d) => (d ? { ...d, enrollment: null } : d));
      return { ok: true };
    } catch {
      toast("Network error while stopping the sequence.", "error");
      return { ok: false, error: "Network error while stopping the sequence." };
    } finally {
      setStopping(false);
    }
  }, [detail, toast]);

  // CLE-14 §lift: expose openReply/bookMeeting/stopSequence to the page so the
  // chat actions run the SAME flows as the buttons. Non-null only while a
  // conversation is open. openReply/stopSequence are useCallbacks; bookMeeting
  // just opens the scheduler (stable setState).
  useImperativeHandle(
    apiRef,
    (): ConversationPaneApi => ({
      openReply,
      bookMeeting: () => setSchedOpen(true),
      stopSequence,
    }),
    [openReply, stopSequence],
  );

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
              <span className="truncate text-[12px]" style={{ color: "var(--color-text-secondary)" }} dir={dirOf(decodeDisplay(conv.subject))}>
                {decodeDisplay(conv.subject)}
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
            {/* Last interaction of any channel (INBOX-G03) — recency beyond this thread. */}
            {detail.lastInteraction && (
              <div className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                Last interaction: {timeAgo(detail.lastInteraction.at)} · {detail.lastInteraction.type.replace(/_/g, " ")}
              </div>
            )}
            {/* Sequence-reply link (INBOX-G07): which of our steps they're answering,
                linking to the sequence. enrollment loaded in the detail route. */}
            {detail.enrollment && (() => {
              const step = Math.max(
                0,
                ...conv.messages
                  .filter((m) => m.direction === "outbound" && m.stepNumber)
                  .map((m) => m.stepNumber as number),
              );
              return (
                <div className="mt-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {step > 0 ? `Reply to step ${step} of ` : "In sequence "}
                  <Link
                    href={`/sequences/${detail.enrollment.sequenceId}`}
                    className="font-medium hover:underline"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {detail.enrollment.sequenceName}
                  </Link>
                </div>
              );
            })()}
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
          {detail.contact && proposedTime && !schedOpen && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPrefillWhen(toDatetimeLocal(proposedTime.start));
                setSchedOpen(true);
              }}
              className="gap-1.5"
              title={`They proposed ${proposedTime.phrase}`}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Book {proposedTime.phrase}
            </Button>
          )}
          {/* Assign to a teammate (INBOX-X01) — shows only when the workspace has 2+ members. */}
          <ThreadAssignment conversationKey={conv.key} />
          {/* Shared labels (INBOX-X04). */}
          <ThreadLabels conversationKey={conv.key} />
          {/* Live presence (INBOX-X03) — who else is on this thread. */}
          <ThreadPresence conversationKey={conv.key} />
          {detail.enrollment && (
            <Button variant="outline" size="sm" onClick={() => void stopSequence()} disabled={stopping} className="gap-1.5">
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
                {snoozeOpen && (() => {
                  const parsed = snoozeText.trim() ? parseWhen(snoozeText) : null;
                  return (
                    <div
                      className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border p-1 shadow-lg"
                      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
                    >
                      {/* Natural-language snooze (INBOX-T05): "2d", "monday", "tomorrow 9am". */}
                      <div className="px-1.5 pt-1 pb-1">
                        <input
                          autoFocus
                          value={snoozeText}
                          onChange={(e) => setSnoozeText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && parsed) {
                              setSnoozeOpen(false);
                              setSnoozeText("");
                              void onTriage(conv.key, "snooze", parsed.toISOString());
                            }
                          }}
                          placeholder='"2d", "monday", "tomorrow 9am"'
                          className="w-full rounded-md border px-2 py-1 text-[12px] outline-none"
                          style={{
                            borderColor: "var(--color-border-default)",
                            background: "var(--color-bg-page)",
                            color: "var(--color-text-primary)",
                          }}
                        />
                        {snoozeText.trim() && (
                          <div
                            className="mt-1 px-0.5 text-[11px]"
                            style={{ color: parsed ? "var(--color-text-secondary)" : "var(--color-warning)" }}
                          >
                            {parsed
                              ? `→ ${parsed.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                              : "couldn't read that time"}
                          </div>
                        )}
                      </div>
                      <div className="my-1 border-t" style={{ borderColor: "var(--color-border-default)" }} />
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
                  );
                })()}
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
            initialWhen={prefillWhen ?? undefined}
            onClose={() => {
              setSchedOpen(false);
              setPrefillWhen(null);
            }}
            // Drop the sovereign join link straight into an open reply draft (INBOX-G10).
            onBooked={(joinUrl) => {
              if (joinUrl) setComposer((c) => (c ? { ...c, body: injectMeetingLink(c.body, joinUrl) } : c));
            }}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* ── Collision heads-up (INBOX-G06): a teammate already touched this
             contact recently. Soft, non-blocking — informs, never gates. ── */}
        {detail.contact && (
          <div className="mb-3">
            <ContactCollisionNotice contactId={detail.contact.id} />
          </div>
        )}

        {/* ── Suggested next action (INBOX-G05): stage + situation → one cited
             prompt. Suggests, never auto-acts. ── */}
        {detail.nextAction && (
          <div
            className="mb-3 flex items-start gap-2 rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }}
          >
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
            <span className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
              <span className="font-medium">Next: {detail.nextAction.action}</span>
              <span style={{ color: "var(--color-text-secondary)" }}>
                {" — "}
                {detail.nextAction.stage ? `${detail.nextAction.stage} stage · ` : ""}
                {detail.nextAction.why}
              </span>
            </span>
          </div>
        )}

        {/* ── Fresh GTM signals (INBOX-G04): the contact's company-level buying
             signals (hiring / funding / …), past-shelf-life ones already dropped. ── */}
        {detail.freshSignals && detail.freshSignals.length > 0 && (
          <div
            className="mb-3 rounded-lg border p-3"
            style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
          >
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
              Fresh signals
            </span>
            {detail.freshSignals.map((s, i) => (
              <div key={`fs-${i}`} className="mt-2 flex items-start gap-2">
                <Badge variant="success" size="sm">{s.type.replace(/_/g, " ")}</Badge>
                <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                  {s.title}
                  {s.description ? ` — ${s.description}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Prospect brief (INBOX-G01): reuse the Call Mode brief endpoint,
             fetched on demand so opening a thread spends no credit. ── */}
        {detail.contact && <ProspectBriefSection contactId={detail.contact.id} />}

        {/* ── Thread summary (INBOX-S01/S08): on-demand TL;DR for long threads. ── */}
        {shouldSummarize(
          conv.messages.length,
          conv.messages.reduce((n, m) => n + (m.body?.length ?? 0), 0),
        ) && <ThreadSummarySection conversationKey={conv.key} />}

        {/* ── Ask about this thread (INBOX-Q07): on-demand, cited, thread-scoped Q&A. ── */}
        {conv.messages.length > 0 && <ThreadAskSection conversationKey={conv.key} />}

        {/* ── Private notes (INBOX-X06): the founder's internal scratchpad on this thread. ── */}
        <ThreadNotes conversationKey={conv.key} />

        {/* ── Action items (INBOX-S04): deterministic request/commitment cues. ── */}
        {detail.actionItems.length > 0 && (
          <div
            className="mb-3 rounded-lg border px-3 py-2.5"
            style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
              <ListChecks size={12} /> Action items
            </span>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              {detail.actionItems.map((a, i) => (
                <li key={i} className="text-[12px] leading-snug" style={{ color: "var(--color-text-secondary)" }} dir={dirOf(a.text)}>
                  {a.text}
                  {a.due && (
                    <span className="font-medium" style={{ color: "var(--color-accent)" }}>
                      {" · due "}
                      {a.due}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Key details (INBOX-S05): high-signal entities (money / dates / phones). ── */}
        {(detail.entities.amounts.length > 0 || detail.entities.dates.length > 0 || detail.entities.phones.length > 0) && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Key details
            </span>
            {[...detail.entities.amounts, ...detail.entities.dates, ...detail.entities.phones].map((e, i) => (
              <span
                key={i}
                className="rounded px-1.5 py-0.5 text-[11px]"
                style={{ background: "var(--color-badge-0-bg)", color: "var(--color-badge-0)" }}
              >
                {e}
              </span>
            ))}
          </div>
        )}

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
        {conv.messages.map((m, i) => (
          <div
            key={m.id}
            id={`thread-msg-${i}`}
            className="mb-2.5 rounded-lg border p-3"
            style={{
              borderColor: "var(--color-border-default)",
              background: m.direction === "inbound" ? "var(--color-bg-card)" : "transparent",
              marginLeft: m.direction === "outbound" ? "24px" : "0",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                {m.direction === "inbound" && (
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                    style={{
                      background: `var(--color-badge-${avatarColorIndex(m.from || conv.displayName)}-bg)`,
                      color: `var(--color-badge-${avatarColorIndex(m.from || conv.displayName)})`,
                    }}
                    aria-hidden
                  >
                    {initialsFor(m.from || conv.displayName)}
                  </span>
                )}
                <span className="truncate">
                  {m.direction === "inbound" ? m.from || conv.displayName : "You"}
                </span>
                {m.direction === "inbound" && m.senderVerified === "pass" && (
                  <ShieldCheck
                    size={13}
                    className="shrink-0"
                    style={{ color: "var(--color-success)" }}
                    aria-label="Sender domain verified (SPF/DKIM/DMARC)"
                  />
                )}
                {m.direction === "inbound" && m.senderVerified === "fail" && (
                  <ShieldAlert
                    size={13}
                    className="shrink-0"
                    style={{ color: "var(--color-warning)" }}
                    aria-label="Sender failed domain authentication"
                  />
                )}
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
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }} dir={dirOf(decodeDisplay(m.subject))}>{decodeDisplay(m.subject)}</div>
            )}
            <div className="mt-1.5">
              <EventCard ics={m.calendar} conversationKey={conv.key} />
              <EmailBody
                html={m.bodyHtml}
                text={m.body || "(empty message)"}
                senderEmail={extractSenderEmail(m.from)}
                trustedSenders={trustedSenders}
                onTrust={(email) => setTrustedSenders((s) => (s.includes(email) ? s : [...s, email]))}
              />
              <AttachmentStrip attachments={m.attachments} />
            </div>
          </div>
        ))}
      </div>

      {composer && (
        <div>
          {replyTones.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2">
              <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                Tone
              </span>
              {replyTones.map((r) => {
                const active = composer.body === r.body;
                return (
                  <button
                    key={r.tone}
                    type="button"
                    onClick={() =>
                      setComposer((c) => (c ? { ...c, subject: r.subject || c.subject, body: r.body } : c))
                    }
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      border: "1px solid var(--color-border-default)",
                      background: active ? "var(--color-accent-soft)" : "transparent",
                      color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
                    }}
                  >
                    {r.tone.charAt(0).toUpperCase() + r.tone.slice(1)}
                  </button>
                );
              })}
            </div>
          )}
          <SnippetBar
            snippets={snippets}
            onChange={setSnippets}
            currentBody={composer.body}
            contact={detail?.contact ?? null}
            onInsert={(text) =>
              setComposer((c) => (c ? { ...c, body: c.body.trim() ? `${c.body}\n\n${text}` : text } : c))
            }
          />
          <EmailComposerPanel
            draft={composer}
            onClose={() => {
              setComposer(null);
              setReplyTones([]);
            }}
            onSent={() => void handleSent()}
          />
        </div>
      )}
    </div>
  );
}
