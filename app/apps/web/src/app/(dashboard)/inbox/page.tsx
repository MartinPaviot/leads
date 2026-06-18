"use client";

/**
 * Inbox — conversation triage, not a delivery log (_specs/inbox-triage).
 *
 * Master-detail: lanes of conversations on the left (needs-attention first,
 * priority-ordered from persisted labels), full reading pane on the right.
 * The old sent-emails table lives on under the Outbound tab.
 *
 * Keyboard: j/k select, e done, r reply — ignored while typing.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Inbox, Mail } from "lucide-react";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";
import { ConversationList } from "./_conversation-list";
import { ConversationPane, type ConversationPaneApi } from "./_conversation-pane";
import { OutboundTable, type OutboundTableApi } from "./_outbound-table";
import { MailboxRail } from "./_mailbox-rail";
import type { ConversationListItem, InboxLane, LaneCounts, MailboxSummary } from "./_types";

type Tab = InboxLane | "outbound";

/* ── CLE-14: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

const TAB_LABELS: Record<Tab, string> = {
  attention: "Needs attention",
  snoozed: "Snoozed",
  done: "Done",
  handled: "Handled",
  outbound: "Outbound",
};

const TABS: Tab[] = ["attention", "snoozed", "done", "handled", "outbound"];

export default function InboxPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("attention");
  // The inbox is personal; false once a lane load confirms the user has no
  // connected mailbox of their own. Defaults true to avoid flashing the
  // connect card before the first response.
  const [mailboxConnected, setMailboxConnected] = useState(true);
  // Unified inbox: the user's connected mailboxes + which one is focused
  // (null = "All inboxes"). The rail only renders when there are 2+.
  const [mailboxes, setMailboxes] = useState<MailboxSummary[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [counts, setCounts] = useState<LaneCounts>({ attention: 0, snoozed: 0, done: 0, handled: 0, outbound: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [replySignal, setReplySignal] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // In-flight triage POST. Lane fetches await it so switching to Done/
  // Snoozed right after the verb never races the write (the GET would
  // otherwise read pre-commit state and show an empty lane).
  const pendingTriage = useRef<Promise<unknown> | null>(null);

  // Deep-link (?conversation=<key>, e.g. from the /home Activity feed):
  // select that thread on arrival. Consumed once — later triage flows are
  // never pinned to it, and the param is stripped from the URL immediately.
  const wantedKeyRef = useRef<string | null>(null);
  const probedHandledRef = useRef(false);
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("conversation");
    if (key) {
      wantedKeyRef.current = key;
      window.history.replaceState({}, "", "/inbox");
    }
  }, []);

  const loadLane = useCallback(
    async (lane: InboxLane, pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        if (pendingTriage.current) await pendingTriage.current.catch(() => {});
        const mailboxQuery = selectedMailbox ? `&mailbox=${encodeURIComponent(selectedMailbox)}` : "";
        const res = await fetch(`/api/inbox/conversations?lane=${lane}&page=${pageNum}${mailboxQuery}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as {
          conversations: ConversationListItem[];
          counts: LaneCounts;
          pagination: { total: number };
          mailboxConnected?: boolean;
          mailboxes?: MailboxSummary[];
          selectedMailbox?: string | null;
        };
        setMailboxConnected(data.mailboxConnected !== false);
        if (data.mailboxes) setMailboxes(data.mailboxes);
        setCounts(data.counts);
        setTotal(data.pagination.total);
        setConversations((prev) => (append ? [...prev, ...data.conversations] : data.conversations));
      } catch {
        toast("Couldn't load the inbox.", "error");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [toast, selectedMailbox],
  );

  useEffect(() => {
    if (tab === "outbound") return;
    setPage(1);
    void loadLane(tab, 1, false);
  }, [tab, loadLane]);

  // Reconcile the selection whenever the list changes: a pending deep-link
  // wins when its thread is listed; otherwise keep the current selection if
  // still listed, else fall back to the first row. (Single place — list
  // updaters stay side-effect free.)
  useEffect(() => {
    const wanted = wantedKeyRef.current;
    if (wanted && conversations.some((c) => c.key === wanted)) {
      wantedKeyRef.current = null;
      setSelectedKey(wanted);
      return;
    }
    setSelectedKey((sel) =>
      sel && conversations.some((c) => c.key === sel) ? sel : conversations[0]?.key ?? null,
    );
  }, [conversations]);

  // Deep-linked thread not in the attention lane (already triaged)? Probe the
  // handled lane once, then give up gracefully back on attention.
  useEffect(() => {
    const wanted = wantedKeyRef.current;
    if (!wanted || loading) return;
    if (conversations.some((c) => c.key === wanted)) return;
    if (!probedHandledRef.current && tab === "attention") {
      probedHandledRef.current = true;
      setTab("handled");
    } else {
      wantedKeyRef.current = null;
      if (tab !== "attention") setTab("attention");
    }
  }, [conversations, loading, tab]);

  const handleTriage = useCallback(
    async (key: string, action: "done" | "snooze" | "reopen", snoozeUntil?: string) => {
      // Optimistic: remove from the current lane and advance the selection.
      const idx = conversations.findIndex((c) => c.key === key);
      const next = conversations.filter((c) => c.key !== key);
      setConversations(next);
      setSelectedKey(next[Math.min(Math.max(idx, 0), next.length - 1)]?.key ?? null);
      setCounts((c) => {
        const updated = { ...c };
        if (tab !== "outbound") updated[tab] = Math.max(0, updated[tab] - 1);
        if (action === "done") updated.done += 1;
        if (action === "snooze") updated.snoozed += 1;
        if (action === "reopen") updated.attention += 1;
        return updated;
      });

      try {
        const post = fetch("/api/inbox/triage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationKey: key, action, snoozeUntil }),
        });
        pendingTriage.current = post;
        const res = await post;
        if (!res.ok) throw new Error(`${res.status}`);
      } catch {
        toast("Couldn't update the conversation — reloading.", "error");
        if (tab !== "outbound") void loadLane(tab, 1, false);
      } finally {
        pendingTriage.current = null;
      }
    },
    [tab, toast, loadLane, conversations],
  );

  // ── CLE-14: page-action registration ──────────────────────────
  // Live refs so a registered action's run() reads the LIVE inbox without
  // re-registering on every state change (CLE-06 §3.1 — stable id set +
  // ref-read). Imperative handles are null when the owning child is unmounted
  // (no conversation open / not on the outbound tab) -> graceful degradation.
  const selectedKeyRef = useRef(selectedKey); selectedKeyRef.current = selectedKey;
  const conversationsRef = useRef(conversations); conversationsRef.current = conversations;
  // handleTriage is recreated each render (it closes over `conversations`/`tab`);
  // hold it in a ref so the once-registered actions always call the LIVE one.
  const handleTriageRef = useRef(handleTriage); handleTriageRef.current = handleTriage;
  const paneApiRef = useRef<ConversationPaneApi | null>(null);
  const outboundApiRef = useRef<OutboundTableApi | null>(null);

  const inboxActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "inbox.triageDone",
        title: "Mark a conversation done",
        description:
          "Triage a conversation to Done — it leaves the needs-attention lane. Use when the user says a thread is " +
          "handled / done / archived. Pass the conversationKey from the current list.",
        params: z.object({ conversationKey: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ conversationKey }): Promise<PageActionResult> => {
          const conv = conversationsRef.current.find((c) => c.key === conversationKey);
          await handleTriageRef.current(conversationKey, "done");
          return okResult(`Marked the conversation${conv ? ` with ${conv.displayName}` : ""} as done.`);
        },
      }),
      definePageAction({
        id: "inbox.snooze",
        title: "Snooze a conversation",
        description:
          "Snooze a conversation until a future time — it leaves needs-attention and returns when the time arrives. " +
          "Pass conversationKey and `until` (an ISO date-time or any parseable date in the future).",
        params: z.object({ conversationKey: z.string().min(1), until: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ conversationKey, until }): Promise<PageActionResult> => {
          const t = new Date(until);
          if (Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) {
            return errResult("Pick a future time to snooze until.");
          }
          await handleTriageRef.current(conversationKey, "snooze", t.toISOString());
          return okResult(`Snoozed until ${until}.`);
        },
      }),
      definePageAction({
        id: "inbox.reopen",
        title: "Reopen a conversation",
        description: "Reopen a Done conversation — it returns to the needs-attention lane. Pass the conversationKey.",
        params: z.object({ conversationKey: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ conversationKey }): Promise<PageActionResult> => {
          await handleTriageRef.current(conversationKey, "reopen");
          return okResult("Reopened the conversation.");
        },
      }),
      definePageAction({
        id: "inbox.selectConversation",
        title: "Open a conversation",
        description:
          "Select and read a conversation from the current lane in the reading pane. Pass the conversationKey of a " +
          "thread that is in the list.",
        params: z.object({ conversationKey: z.string().min(1) }),
        mutating: false, reversible: false, cost: "free", confirm: "never",
        run: async ({ conversationKey }): Promise<PageActionResult> => {
          const conv = conversationsRef.current.find((c) => c.key === conversationKey);
          if (!conv) return errResult("That conversation is not in the current list.");
          setSelectedKey(conversationKey);
          return okResult(`Opened the conversation with ${conv.displayName}.`);
        },
      }),
      definePageAction({
        id: "inbox.setLane",
        title: "Switch the inbox lane",
        description:
          "Switch which lane is shown: attention (needs attention), snoozed, done, handled, or outbound (sent mail).",
        params: z.object({ lane: z.enum(["attention", "snoozed", "done", "handled", "outbound"]) }),
        mutating: false, reversible: false, cost: "free", confirm: "never",
        run: async ({ lane }): Promise<PageActionResult> => {
          setTab(lane);
          return okResult(`Showing the ${lane} lane.`);
        },
      }),
      definePageAction({
        id: "inbox.switchMailbox",
        title: "Switch the focused mailbox",
        description:
          "In the unified inbox, focus one connected mailbox (pass its mailboxId) or all inboxes (pass null).",
        params: z.object({ mailboxId: z.string().nullable() }),
        mutating: false, reversible: false, cost: "free", confirm: "never",
        run: async ({ mailboxId }): Promise<PageActionResult> => {
          setSelectedMailbox(mailboxId);
          return okResult(mailboxId ? "Focused that mailbox." : "Showing all inboxes.");
        },
      }),
      definePageAction({
        id: "inbox.reply",
        title: "Draft a reply",
        description:
          "Draft a reply to a conversation and open the composer for review. Uses the agent's prepared draft when one " +
          "exists, otherwise suggests one. Does NOT send — the user reviews and sends in the composer.",
        params: z.object({ conversationKey: z.string().min(1) }),
        mutating: false, outbound: false, cost: "credits", confirm: "never",
        run: async ({ conversationKey }): Promise<PageActionResult> => {
          if (selectedKeyRef.current !== conversationKey) setSelectedKey(conversationKey);
          const api = paneApiRef.current;
          if (!api) return errResult("Open the conversation first.");
          await api.openReply();
          return okResult("Drafted a reply - review and send it in the composer.");
        },
      }),
      definePageAction({
        id: "inbox.consumeDraft",
        title: "Open the prepared draft",
        description:
          "Open the agent's prepared reply for a conversation in the composer (falls back to suggesting one if there " +
          "is no prepared draft). Does NOT send — the user reviews and sends.",
        params: z.object({ conversationKey: z.string().min(1) }),
        mutating: false, outbound: false, cost: "free", confirm: "never",
        run: async ({ conversationKey }): Promise<PageActionResult> => {
          if (selectedKeyRef.current !== conversationKey) setSelectedKey(conversationKey);
          const api = paneApiRef.current;
          if (!api) return errResult("Open the conversation first.");
          await api.openReply();
          return okResult("Opened the draft - review and send it in the composer.");
        },
      }),
      definePageAction({
        id: "inbox.bookMeeting",
        title: "Book a meeting from a conversation",
        description:
          "Open the meeting scheduler for the contact on a conversation. Pass the conversationKey. The user picks the " +
          "slot and confirms in the scheduler.",
        params: z.object({ conversationKey: z.string().min(1) }),
        mutating: false, reversible: false, cost: "free", confirm: "never",
        run: async ({ conversationKey }): Promise<PageActionResult> => {
          if (selectedKeyRef.current !== conversationKey) setSelectedKey(conversationKey);
          const api = paneApiRef.current;
          if (!api) return errResult("Open the conversation first.");
          api.bookMeeting();
          return okResult("Opened the meeting scheduler.");
        },
      }),
      definePageAction({
        id: "inbox.stopSequence",
        title: "Stop the sequence on a conversation",
        description:
          "Stop the active outbound sequence enrollment for the contact on a conversation (no more steps will send). " +
          "Pass the conversationKey.",
        params: z.object({ conversationKey: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ conversationKey }): Promise<PageActionResult> => {
          if (selectedKeyRef.current !== conversationKey) setSelectedKey(conversationKey);
          const api = paneApiRef.current;
          if (!api) return errResult("Open the conversation first.");
          const r = await api.stopSequence();
          return r.ok
            ? okResult("Stopped the sequence for this contact.")
            : errResult(r.error ?? "No active sequence on this conversation.");
        },
      }),
      definePageAction({
        id: "inbox.setOutboundFilter",
        title: "Filter the outbound view",
        description:
          "On the Outbound lane, filter sent emails by status: all (sent), replied, awaiting, or bounced.",
        params: z.object({ filter: z.enum(["all", "replied", "awaiting", "bounced"]) }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ filter }): Promise<PageActionResult> => {
          const api = outboundApiRef.current;
          if (!api) return errResult("Switch to the outbound lane first.");
          api.setFilter(filter);
          return okResult(`Outbound filter: ${filter}.`);
        },
      }),
    ],
    // Stable id set; run() reads live values via refs and calls stable
    // setters/useCallback helpers — so registration happens once (CLE-06 §3.1).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(inboxActions);

  // Keyboard: j/k navigate, e done, r reply. Never while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (tab === "outbound") return;

      if (e.key === "j" || e.key === "k") {
        if (conversations.length === 0) return;
        e.preventDefault();
        const idx = conversations.findIndex((c) => c.key === selectedKey);
        const nextIdx =
          e.key === "j" ? Math.min(idx + 1, conversations.length - 1) : Math.max(idx - 1, 0);
        const next = conversations[nextIdx]?.key ?? selectedKey;
        setSelectedKey(next);
        listRef.current
          ?.querySelector(`[data-conversation-key="${CSS.escape(next ?? "")}"]`)
          ?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "e") {
        if ((tab === "attention" || tab === "snoozed") && selectedKey) {
          e.preventDefault();
          void handleTriage(selectedKey, "done");
        }
      } else if (e.key === "r") {
        if (selectedKey) {
          e.preventDefault();
          setReplySignal((n) => n + 1);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, selectedKey, handleTriage, conversations]);

  const hasMore = tab !== "outbound" && conversations.length < total;

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader
        icon={<Inbox size={16} />}
        title="Inbox"
        subtitle={
          counts.attention > 0
            ? `${counts.attention} conversation${counts.attention === 1 ? "" : "s"} need${counts.attention === 1 ? "s" : ""} your attention`
            : "All caught up"
        }
      />

      <FilterBar>
        <div className="flex gap-0.5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: tab === t ? "var(--color-accent-soft)" : "transparent",
                color: tab === t ? "var(--color-accent)" : "var(--color-text-tertiary)",
              }}
            >
              {TAB_LABELS[t]} ({counts[t]})
            </button>
          ))}
        </div>
      </FilterBar>

      {!mailboxConnected ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<Mail size={20} />}
            title="Connect your mailbox"
            description="Your inbox is personal — connect your own mailbox to read and reply to your conversations here. Other members can't see it, and you can't see theirs."
            actionLabel="Connect mailbox"
            onAction={() => router.push("/settings/mail-calendar")}
            actionVariant="gradient"
          />
        </div>
      ) : tab === "outbound" ? (
        <div className="flex-1 overflow-hidden">
          <OutboundTable apiRef={outboundApiRef} />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {mailboxes.length >= 2 && (
            <MailboxRail
              mailboxes={mailboxes}
              selected={selectedMailbox}
              onSelect={setSelectedMailbox}
            />
          )}
          <div
            ref={listRef}
            className="w-[360px] shrink-0 overflow-y-auto border-r"
            style={{ borderColor: "var(--color-border-default)" }}
          >
            {loading ? (
              <TableSkeleton rows={8} cols={1} />
            ) : (
              <ConversationList
                lane={tab}
                conversations={conversations}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={() => {
                  const next = page + 1;
                  setPage(next);
                  void loadLane(tab, next, true);
                }}
                showMailbox={selectedMailbox === null}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <ConversationPane
              conversationKey={selectedKey}
              lane={tab}
              replySignal={replySignal}
              onTriage={handleTriage}
              apiRef={paneApiRef}
            />
          </div>
        </div>
      )}
    </div>
  );
}
