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
  Trash2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/locale";
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
import { IntelligencePanel } from "./_intelligence-panel";
import { ThreadSummarySection } from "./_thread-summary";
import { ThreadAskSection } from "./_thread-ask";
import { ThreadNotes } from "./_thread-notes";
import { ThreadAssignment } from "./_thread-assignment";
import { AttachmentStrip } from "./_attachments";
import { ThreadLabels } from "./_thread-labels";
import { ThreadPresence } from "./_thread-presence";
import { MoreMenu, type MoreMenuItem } from "@/components/ui/more-menu";
import { shouldSummarize } from "@/lib/inbox/thread-summary-prep";
import { initialsFor, avatarColorIndex } from "@/lib/inbox/sender-auth";
import { parseWhen } from "@/lib/inbox/parse-when";
import { dirOf } from "@/lib/inbox/text-direction";
import { decodeDisplay } from "@/lib/inbox/text-decode";
import { type SendableMailbox } from "@/lib/inbox/pick-from-mailbox";
import { tomorrowMorning, inThreeDays, nextMonday } from "@/lib/inbox/snooze-presets";
import { pickPaneState } from "@/lib/inbox/list-state";

// The presets live in lib/inbox/snooze-presets (pure, unit-tested) so the popover
// and the `s` keyboard shortcut resolve to the SAME instant (B6.4).
const SNOOZE_OPTIONS: Array<{ key: string; until: () => Date }> = [
  { key: "inbox.snoozeTomorrowMorning", until: tomorrowMorning },
  { key: "inbox.snoozeIn3Days", until: inThreeDays },
  { key: "inbox.snoozeNextMonday", until: nextMonday },
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
  labelSignal,
  onTriage,
  onTrash,
  isTrashView,
  onSpam,
  isSpamView,
  apiRef,
}: {
  conversationKey: string | null;
  lane: InboxLane;
  /** Incremented by the page when the user presses `r`. */
  replySignal: number;
  /** B6: incremented by the page (`l` key / palette) to open the add-label input. */
  labelSignal?: number;
  onTriage: (key: string, action: "done" | "snooze" | "reopen", snoozeUntil?: string) => Promise<void>;
  /** Delete (→ Trash) or Restore the conversation (Upstream is:trash). */
  onTrash?: (key: string, trashed: boolean) => void;
  /** True when the open thread is being viewed from the Trash folder (→ Restore). */
  isTrashView?: boolean;
  /** Mark as spam (→ Spam) or "Not spam" (Upstream is:spam). */
  onSpam?: (key: string, spam: boolean) => void;
  /** True when the open thread is being viewed from the Spam folder (→ Not spam). */
  isSpamView?: boolean;
  /** CLE-14: set by the page to drive reply/book/stop from the chat. */
  apiRef?: Ref<ConversationPaneApi | null>;
}) {
  const { toast } = useToast();
  const t = useT();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  // F3: the detail fetch rejected (network/5xx) — distinct from a resolved-but-
  // absent thread, so the pane can offer Retry instead of "no longer available".
  const [paneError, setPaneError] = useState(false);
  const [detailRetry, setDetailRetry] = useState(0);
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
  const [autoDraftOn, setAutoDraftOn] = useState(false);
  // A2: the user's SENDABLE mailboxes for the composer From selector.
  const [sendableMailboxes, setSendableMailboxes] = useState<SendableMailbox[]>([]);
  const snoozeRef = useRef<HTMLDivElement>(null);
  // B1: at most one auto-draft per thread open (keyed by conversation key).
  const autoDraftedFor = useRef<string | null>(null);

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

  // Load the per-user auto-draft preference once (B1). Default OFF; governs
  // whether a reply-worthy thread pre-drafts on open — never overrides selectivity.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/auto-draft")
      .then((r) => (r.ok ? r.json() : { autoDraft: { enabled: false } }))
      .then((d: { autoDraft?: { enabled?: boolean } }) => {
        if (!cancelled) setAutoDraftOn(d.autoDraft?.enabled === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the user's SENDABLE mailboxes once (A2) — own + active only, for the
  // composer From selector. Created_at-ordered so [0] is the primary default.
  // A3: overlay the per-mailbox identity (display-name → label, signature) so the
  // From option shows the override and the composer can inject the signature.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/settings/mailboxes").then((r) => (r.ok ? r.json() : { mailboxes: [] })),
      fetch("/api/inbox/mailbox-identity").then((r) => (r.ok ? r.json() : { identities: {} })),
    ])
      .then(([boxes, ident]: [
        { mailboxes?: Array<{ id: string; emailAddress: string; displayName: string | null; status: string }> },
        { identities?: Record<string, { displayName?: string; signature?: string }> },
      ]) => {
        if (cancelled || !Array.isArray(boxes.mailboxes)) return;
        const identities = ident?.identities ?? {};
        setSendableMailboxes(
          boxes.mailboxes
            .filter((m) => m.status === "active")
            .map((m) => {
              const id = identities[m.id];
              return {
                id: m.id,
                address: m.emailAddress,
                label: id?.displayName?.trim() || m.displayName || m.emailAddress,
                signature: id?.signature,
              };
            }),
        );
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
    setPaneError(false); // clear the error as a new key (or a retry) begins
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
        // F3: a fetch failure is an ERROR (retryable), not a deleted thread.
        if (!cancelled) {
          setDetail(null);
          setPaneError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationKey, detailRetry]);

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
        contactId: detail.contact?.id, mailboxId: detail.conversation.mailboxId ?? undefined,
        threadId: conversationKey ?? undefined, draftId: detail.preparedDraft.id,
      });
      return;
    }
    const lastInbound = [...conv.messages].reverse().find((m) => m.direction === "inbound");
    if (!lastInbound?.body) {
      setComposer({ to: replyTo, subject: `Re: ${conv.subject}`, body: "", contactId: detail.contact?.id, mailboxId: detail.conversation.mailboxId ?? undefined, threadId: conversationKey ?? undefined });
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
        contactId: detail.contact?.id, mailboxId: detail.conversation.mailboxId ?? undefined,
        threadId: conversationKey ?? undefined,
      });
      if (!brief) toast(t("inbox.toastSuggestFailed"), "warning");
    } catch {
      setComposer({ to: replyTo, subject: `Re: ${conv.subject}`, body: "", contactId: detail.contact?.id, mailboxId: detail.conversation.mailboxId ?? undefined, threadId: conversationKey ?? undefined });
      toast(t("inbox.toastSuggestFailed"), "warning");
    } finally {
      setDrafting(false);
    }
  }, [detail, replyTo, toast]);

  // B1 primary draft: a complete, VOICE-MATCHED reply via /api/inbox/compose/reply
  // (folds the user's writing voice + standing memory server-side), landed in the
  // editable composer. Distinct from openReply's suggest-reply tone variants, which
  // stay as a secondary affordance (tone chips). Fail-closed: empty/error never
  // fabricates a draft — it leaves an open composer untouched, or opens a blank one.
  const generateDraft = useCallback(async () => {
    if (!detail || !conversationKey) return;
    const conv = detail.conversation;
    setReplyTones([]); // the voice-matched draft is the primary path, not tone variants
    setDrafting(true);
    try {
      const res = await fetch("/api/inbox/compose/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: conversationKey }),
      });
      const data = res.ok ? ((await res.json()) as { subject?: string; text?: string }) : {};
      const text = (data.text ?? "").trim();
      if (text) {
        setComposer((c) => ({
          to: c?.to ?? replyTo,
          subject: data.subject?.trim() || c?.subject || `Re: ${conv.subject}`,
          body: text,
          contactId: detail.contact?.id, mailboxId: detail.conversation.mailboxId ?? undefined,
          threadId: c?.threadId ?? conversationKey ?? undefined, draftId: c?.draftId,
        }));
      } else {
        // Fail-closed (R1.6): never fabricate. Leave an open composer's body
        // untouched; if none is open, open a blank one so the user can still write.
        setComposer((c) => c ?? { to: replyTo, subject: `Re: ${conv.subject}`, body: "", contactId: detail.contact?.id, mailboxId: detail.conversation.mailboxId ?? undefined, threadId: conversationKey ?? undefined });
        toast(t("inbox.toastDraftFailed"), "warning");
      }
    } catch {
      setComposer((c) => c ?? { to: replyTo, subject: `Re: ${conv.subject}`, body: "", contactId: detail.contact?.id, mailboxId: detail.conversation.mailboxId ?? undefined });
      toast(t("inbox.toastDraftFailed"), "warning");
    } finally {
      setDrafting(false);
    }
  }, [detail, conversationKey, replyTo, toast]);

  // B7 nudge: a gentle pre-drafted follow-up for an awaiting-their-reply thread,
  // via the SAME /api/inbox/compose/reply route with mode:"nudge" (one generator,
  // one fail-closed path). Lands in the editable composer; never auto-sent.
  const generateNudge = useCallback(async () => {
    if (!detail || !conversationKey) return;
    const conv = detail.conversation;
    setReplyTones([]);
    setDrafting(true);
    try {
      const res = await fetch("/api/inbox/compose/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: conversationKey, mode: "nudge" }),
      });
      const data = res.ok ? ((await res.json()) as { subject?: string; text?: string }) : {};
      const text = (data.text ?? "").trim();
      if (text) {
        setComposer((c) => ({
          to: c?.to ?? replyTo,
          subject: data.subject?.trim() || c?.subject || `Re: ${conv.subject}`,
          body: text,
          contactId: detail.contact?.id, mailboxId: detail.conversation.mailboxId ?? undefined,
        }));
      } else {
        // Fail-closed: never fabricate a nudge. Leave an open composer untouched.
        toast(t("inbox.toastNudgeFailed"), "warning");
      }
    } catch {
      toast(t("inbox.toastNudgeFailed"), "warning");
    } finally {
      setDrafting(false);
    }
  }, [detail, conversationKey, replyTo, toast]);

  // `r` pressed on the page.
  useEffect(() => {
    if (replySignal > 0 && detail && !composer) void openReply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replySignal]);

  // B1 Cmd/Ctrl+J: with no composer open, generate a voice-matched draft for a
  // reply-worthy thread (R2.1). When the composer IS open, it owns this key for
  // edit-with-AI (email-composer-panel), so the pane defers.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        if (composer) return; // composer handles edit-with-AI when open
        if (!detail || !detail.conversation.replyWorthy) return;
        e.preventDefault();
        void generateDraft();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [composer, detail, generateDraft]);

  // B1 auto-draft-on-open (R4.2/R4.4): when the pref is ON and the thread is
  // reply-worthy, pre-draft once on open. Never overrides selectivity (gated on
  // replyWorthy) and never clobbers an open composer or an agent-prepared draft.
  useEffect(() => {
    if (!autoDraftOn || !detail || !conversationKey) return;
    if (!detail.conversation.replyWorthy) return;
    if (composer || detail.preparedDraft) return;
    if (autoDraftedFor.current === conversationKey) return;
    autoDraftedFor.current = conversationKey;
    void generateDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDraftOn, detail, conversationKey]);

  async function handleSent() {
    if (usedDraftId) {
      await fetch(`/api/inbox/drafts/${usedDraftId}/consume`, { method: "POST" }).catch(() => {});
      setUsedDraftId(null);
      setDetail((d) => (d ? { ...d, preparedDraft: null } : d));
    }
    toast(t("inbox.toastReplySent"), "success");
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
        toast(data.error ?? t("inbox.toastStopFailed"), "error");
        return { ok: false, error: data.error ?? "Couldn't stop the sequence." };
      }
      toast(t("inbox.toastStopped", { name: detail.enrollment.sequenceName }), "success");
      setDetail((d) => (d ? { ...d, enrollment: null } : d));
      return { ok: true };
    } catch {
      toast(t("inbox.toastStopNetworkError"), "error");
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
          {t("inbox.emptySelect")}
        </p>
      </div>
    );
  }

  const paneState = pickPaneState({ hasSelection: !!conversationKey, loading, error: paneError, hasDetail: !!detail });
  if (paneState === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
      </div>
    );
  }
  if (paneState === "error") {
    // F3: a failed fetch is retryable — distinct from a deleted thread.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          {t("inbox.errorLoad")}
        </p>
        <Button variant="outline" size="sm" onClick={() => setDetailRetry((n) => n + 1)}>
          {t("inbox.retry")}
        </Button>
      </div>
    );
  }
  if (paneState !== "ready" || !detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          {t("inbox.gone")}
        </p>
      </div>
    );
  }

  const conv = detail.conversation;
  const intel = conv.intelligence;
  // LT-2: badge count for the collapsed Intelligence panel — how many high-signal
  // sections it holds (brief is contact-driven; the rest are pipeline data). The
  // panel stays collapsed by default so the email reads first (Upstream feel).
  const intelCount =
    (detail.contact ? 1 : 0) +
    (detail.freshSignals && detail.freshSignals.length > 0 ? 1 : 0) +
    (detail.actionItems.length > 0 ? 1 : 0) +
    (detail.entities.amounts.length + detail.entities.dates.length + detail.entities.phones.length > 0 ? 1 : 0) +
    (conv.handledNote ? 1 : 0) +
    (intel && ((intel.signals?.length ?? 0) > 0 || (intel.objections?.length ?? 0) > 0 || (intel.nextSteps?.length ?? 0) > 0) ? 1 : 0);
  const triageable = lane === "attention" || lane === "snoozed";

  // Secondary thread actions collapsed behind a "⋮ More" overflow (Upstream-clean
  // toolbar): the primary Generate-draft/Reply + Snooze/Done stay inline; Book
  // meeting, the gentle nudge, and Stop sequence move here. Assignee/labels/presence
  // are thread METADATA, not toolbar actions — they render in the header meta line.
  // "Book meeting" is a visible toolbar action (calendar icon) now, not buried
  // in ⋮ — see the action row below. Only the CONTEXTUAL "Book {proposed time}"
  // stays here, surfaced when the contact actually proposed a slot.
  const moreItems: MoreMenuItem[] = [];
  if (detail.contact && proposedTime && !schedOpen) {
    moreItems.push({
      label: t("inbox.bookProposed", { phrase: proposedTime.phrase }),
      icon: <CalendarPlus size={14} />,
      onClick: () => {
        setPrefillWhen(toDatetimeLocal(proposedTime.start));
        setSchedOpen(true);
      },
    });
  }
  if (detail.conversation.followup?.dueAt != null) {
    moreItems.push({ label: t("inbox.generateNudge"), icon: <AlarmClock size={14} />, onClick: () => void generateNudge(), disabled: drafting });
  }
  if (detail.enrollment) {
    moreItems.push({ label: t("inbox.stopSequence"), icon: <OctagonX size={14} />, onClick: () => void stopSequence(), disabled: stopping });
  }
  if (onSpam) {
    moreItems.push({
      label: isSpamView ? t("inbox.notSpam") : t("inbox.markSpam"),
      icon: isSpamView ? <RotateCcw size={14} /> : <ShieldAlert size={14} />,
      onClick: () => onSpam(conv.key, !isSpamView),
      divider: true,
    });
  }
  if (onTrash) {
    moreItems.push({
      label: isTrashView ? t("inbox.restoreToInbox") : t("inbox.delete"),
      icon: isTrashView ? <RotateCcw size={14} /> : <Trash2 size={14} />,
      onClick: () => onTrash(conv.key, !isTrashView),
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header: who, subject, actions ── */}
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border-default)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Subject leads (Upstream hierarchy): the thread title is the
                prominent element; the sender drops to a secondary line below. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[17px] font-semibold leading-tight" style={{ color: "var(--color-text-primary)" }} dir={dirOf(decodeDisplay(conv.subject))}>
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
            <div className="mt-1 flex items-center gap-2">
              {detail.contact ? (
                <Link
                  href={`/contacts/${detail.contact.id}`}
                  className="truncate text-[13px] font-medium hover:underline"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {detail.contact.name}
                </Link>
              ) : (
                <span className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  {conv.displayName}
                </span>
              )}
              {conv.fromAddress && (
                <span className="truncate text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {conv.fromAddress}
                </span>
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

        {/* Thread metadata (Upstream-clean: not toolbar actions): assignee, shared
            labels, live presence. Each renders only when it has something to show. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <ThreadAssignment conversationKey={conv.key} />
          <ThreadLabels conversationKey={conv.key} openSignal={labelSignal} />
          <ThreadPresence conversationKey={conv.key} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {/* B1: where the thread is reply-worthy, the primary affordance is the
              voice-matched Generate-draft (Cmd/Ctrl+J runs the same flow). Reply
              stays as the manual/agent-draft open. Non-reply-worthy threads show
              only Reply — the generate affordance is absent (selectivity). */}
          {conv.replyWorthy ? (
            <>
              <Button size="sm" onClick={generateDraft} disabled={drafting} className="gap-1.5" title={t("inbox.generateDraftTitle")}>
                {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {drafting ? t("inbox.drafting") : t("inbox.generateDraft")}
              </Button>
              <Button size="sm" variant="outline" onClick={openReply} disabled={drafting} className="gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {t("inbox.reply")}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={openReply} disabled={drafting} className="gap-1.5">
              {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {drafting ? t("inbox.drafting") : t("inbox.reply")}
            </Button>
          )}
          {/* Schedule a meeting straight from the open mail — a calm, visible
              calendar action (books on the connected calendar incl. Infomaniak). */}
          {detail.contact && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSchedOpen(true)}
              className="px-2"
              title="Planifier un RDV"
              aria-label="Planifier un RDV"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </Button>
          )}
          {/* Secondary actions behind the overflow (nudge / stop sequence /
              contextual proposed-time booking). Assignee/labels/presence are in
              the header meta line above. */}
          {moreItems.length > 0 && <MoreMenu label={t("inbox.more")} items={moreItems} />}
          <div className="ml-auto flex items-center gap-2">
            {triageable && (
              <div className="relative" ref={snoozeRef}>
                <Button variant="outline" size="sm" onClick={() => setSnoozeOpen((v) => !v)} className="gap-1.5">
                  <AlarmClock className="h-3.5 w-3.5" />
                  {t("inbox.snooze")}
                  <ChevronDown className="h-3 w-3" />
                </Button>
                {snoozeOpen && (() => {
                  const parsed = snoozeText.trim() ? parseWhen(snoozeText) : null;
                  return (
                    <div
                      className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border p-1"
                      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)", boxShadow: "var(--shadow-floating)" }}
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
                              : t("inbox.snoozeUnparseable")}
                          </div>
                        )}
                      </div>
                      <div className="my-1 border-t" style={{ borderColor: "var(--color-border-default)" }} />
                      {SNOOZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          className="block w-full rounded px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
                          style={{ color: "var(--color-text-primary)" }}
                          onClick={() => {
                            setSnoozeOpen(false);
                            void onTriage(conv.key, "snooze", opt.until().toISOString());
                          }}
                        >
                          {t(opt.key)}
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
                {t("inbox.done")}
              </Button>
            ) : lane === "done" ? (
              <Button size="sm" variant="outline" onClick={() => void onTriage(conv.key, "reopen")}>
                {t("inbox.reopen")}
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

        {/* ── Agent-prepared reply (condensed, actionable — stays above the email) ── */}
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

        {/* ── Messages FIRST (email-first, Upstream feel): the email reads before
             the intelligence stack, which is collapsed below. ── */}
        {conv.messages.map((m, i) => (
          <div
            key={m.id}
            id={`thread-msg-${i}`}
            className="mb-1 px-1 py-3"
            style={{
              // Open message (Upstream) — no bordered card; messages separated by a
              // hairline. Outbound keeps a subtle indent so sent ≠ received.
              borderBottom: i < conv.messages.length - 1 ? "1px solid var(--color-border-default)" : "none",
              background: "transparent",
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

        {/* ── Intelligence (collapsed by default — one click away from the email) ── */}
        <IntelligencePanel key={conversationKey ?? ""} count={intelCount}>
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
                  {o.category}{o.status === "unresolved" ? ` · ${t("inbox.unresolved")}` : ""}
                </Badge>
                <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{o.summary}</p>
              </div>
            ))}
            {(intel.nextSteps ?? []).length > 0 && (
              <div className="mt-2">
                <span className="text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>{t("inbox.nextStepsMentioned")}</span>
                <ul className="mt-0.5 list-inside list-disc">
                  {(intel.nextSteps ?? []).map((step, i) => (
                    <li key={i} className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{step}</li>
                  ))}
                </ul>
              </div>
            )}
            {(intel.competitors ?? []).length > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>{t("inbox.competitorsMentioned")}</span>
                {(intel.competitors ?? []).map((c) => (
                  <Badge key={c} variant="info" size="sm">{c}</Badge>
                ))}
              </div>
            )}
          </div>
        )}
        </IntelligencePanel>
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
            mailboxes={sendableMailboxes}
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
