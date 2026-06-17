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

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Mail } from "lucide-react";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { ConversationList } from "./_conversation-list";
import { ConversationPane } from "./_conversation-pane";
import { OutboundTable } from "./_outbound-table";
import { BundlesView } from "./_bundles-view";
import { CommandPalette, type PaletteCommand } from "./_command-palette";
import { MailboxRail } from "./_mailbox-rail";
import type { ConversationListItem, InboxLane, LaneCounts, MailboxSummary } from "./_types";
import type { BundleSource } from "@/lib/inbox/bundle";

type Tab = InboxLane | "outbound" | "bundles";

const TAB_LABELS: Record<Tab, string> = {
  attention: "Needs attention",
  snoozed: "Snoozed",
  done: "Done",
  handled: "Handled",
  outbound: "Outbound",
  bundles: "Bundles",
};

// Built-in lane tabs. "bundles" is rendered separately (only when non-empty),
// so it's excluded here — that keeps `counts[t]` exhaustively typed.
const TABS: Exclude<Tab, "bundles">[] = ["attention", "snoozed", "done", "handled", "outbound"];

export default function InboxPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("attention");
  // Custom smart lanes (INBOX-T01): when one is selected, customLaneId drives the
  // fetch (?lane=<id>) instead of the built-in tab.
  const [customLaneId, setCustomLaneId] = useState<string | null>(null);
  const [customLanes, setCustomLanes] = useState<Array<{ id: string; name: string; hideWhenEmpty: boolean; count: number }>>([]);
  // The inbox is personal; false once a lane load confirms the user has no
  // connected mailbox of their own. Defaults true to avoid flashing the
  // connect card before the first response.
  const [mailboxConnected, setMailboxConnected] = useState(true);
  // Unified inbox: the user's connected mailboxes + which one is focused
  // (null = "All inboxes"). The rail only renders when there are 2+.
  const [mailboxes, setMailboxes] = useState<MailboxSummary[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  // Newsletter/promo bundles (INBOX-T03) — always returned by the route, so the
  // tab count is live regardless of which lane is open.
  const [bundles, setBundles] = useState<BundleSource[]>([]);
  const [clearingBundle, setClearingBundle] = useState<string | null>(null);
  const [counts, setCounts] = useState<LaneCounts>({ attention: 0, snoozed: 0, done: 0, handled: 0, outbound: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [replySignal, setReplySignal] = useState(0);
  // Cmd/Ctrl+K command palette (INBOX-K01).
  const [paletteOpen, setPaletteOpen] = useState(false);
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
    async (lane: string, pageNum: number, append: boolean) => {
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
          customLanes?: Array<{ id: string; name: string; hideWhenEmpty: boolean; count: number }>;
          bundles?: BundleSource[];
        };
        setMailboxConnected(data.mailboxConnected !== false);
        if (data.mailboxes) setMailboxes(data.mailboxes);
        setCustomLanes(data.customLanes ?? []);
        setBundles(data.bundles ?? []);
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

  // Minimal lane creator (INBOX-T01): name + a sender-domain clause. Selecting the
  // new lane triggers the load effect, which refreshes customLanes from the route.
  const handleNewLane = useCallback(async () => {
    const name = window.prompt("New lane name?")?.trim();
    if (!name) return;
    const domain = window.prompt('Show mail from which sender domain? (e.g. "pilae.ch")')?.trim();
    if (!domain) return;
    try {
      const res = await fetch("/api/inbox/lanes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, clauses: [{ field: "from", op: "domain", value: domain }], join: "and" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { lane } = (await res.json()) as { lane: { id: string } };
      setCustomLaneId(lane.id);
    } catch {
      toast("Couldn't create the lane.", "error");
    }
  }, [toast]);

  // Clear a whole bundle (INBOX-T03): mark every message from that sender done
  // in one pass. Reuses the per-key triage verb (a dedicated bulk endpoint +
  // unsubscribe are residual). Optimistic — drop the source, then write.
  const handleClearBundle = useCallback(
    async (sender: string, keys: string[]) => {
      setClearingBundle(sender);
      setBundles((prev) => prev.filter((b) => b.sender !== sender));
      setCounts((c) => ({
        ...c,
        done: c.done + keys.length,
        handled: Math.max(0, c.handled - keys.length),
      }));
      try {
        await Promise.all(
          keys.map((key) =>
            fetch("/api/inbox/triage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversationKey: key, action: "done" }),
            }).then((r) => {
              if (!r.ok) throw new Error(`${r.status}`);
            }),
          ),
        );
        toast(`Cleared ${keys.length} message${keys.length === 1 ? "" : "s"} from ${sender}.`, "success");
      } catch {
        toast("Couldn't clear the bundle — reloading.", "error");
        void loadLane("bundles", 1, false);
      } finally {
        setClearingBundle(null);
      }
    },
    [toast, loadLane],
  );

  useEffect(() => {
    const param = customLaneId ?? tab;
    if (param === "outbound") return;
    setPage(1);
    void loadLane(param, 1, false);
  }, [tab, customLaneId, loadLane]);

  // The Bundles tab hides itself when empty; if it empties while open (all
  // cleared), fall back to attention so the user isn't stranded on a dead tab.
  useEffect(() => {
    if (tab === "bundles" && !customLaneId && bundles.length === 0 && !loading) {
      setTab("attention");
    }
  }, [tab, customLaneId, bundles.length, loading]);

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
        if (tab !== "outbound" && tab !== "bundles") updated[tab] = Math.max(0, updated[tab] - 1);
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
      if ((tab === "outbound" || tab === "bundles") && !customLaneId) return;

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
  const bundleTotal = bundles.reduce((n, b) => n + b.count, 0);

  // Cmd/Ctrl+K toggles the palette — registered separately from the j/k
  // handler (which ignores modifier keys) so it fires even from a text field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Palette commands: jump to a lane, act on the current conversation, or open
  // any loaded conversation by fuzzy name/subject. Rebuilt as those inputs move.
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = [];
    (["attention", "snoozed", "done", "handled", "outbound"] as const).forEach((t) =>
      cmds.push({
        id: `lane:${t}`,
        label: `Go to ${TAB_LABELS[t]}`,
        hint: "Lane",
        run: () => {
          setCustomLaneId(null);
          setTab(t);
        },
      }),
    );
    if (bundleTotal > 0) {
      cmds.push({
        id: "lane:bundles",
        label: "Go to Bundles",
        hint: "Lane",
        run: () => {
          setCustomLaneId(null);
          setTab("bundles");
        },
      });
    }
    customLanes.forEach((l) =>
      cmds.push({ id: `lane:${l.id}`, label: `Go to ${l.name}`, hint: "Lane", run: () => setCustomLaneId(l.id) }),
    );
    if (selectedKey && (tab === "attention" || tab === "snoozed")) {
      cmds.push({
        id: "act:done",
        label: "Mark current conversation done",
        hint: "Action",
        run: () => void handleTriage(selectedKey, "done"),
      });
      cmds.push({
        id: "act:snooze",
        label: "Snooze current conversation for 1 day",
        hint: "Action",
        run: () => void handleTriage(selectedKey, "snooze", new Date(Date.now() + 86_400_000).toISOString()),
      });
    }
    conversations.forEach((c) =>
      cmds.push({
        id: `conv:${c.key}`,
        label: `${c.displayName} — ${c.subject}`,
        hint: "Open",
        run: () => setSelectedKey(c.key),
      }),
    );
    return cmds;
  }, [conversations, customLanes, bundleTotal, selectedKey, tab, handleTriage]);

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
        <div className="flex flex-wrap gap-0.5">
          {TABS.map((t) => {
            const active = customLaneId === null && tab === t;
            return (
              <button
                key={t}
                onClick={() => {
                  setCustomLaneId(null);
                  setTab(t);
                }}
                className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
                style={{
                  background: active ? "var(--color-accent-soft)" : "transparent",
                  color: active ? "var(--color-accent)" : "var(--color-text-tertiary)",
                }}
              >
                {TAB_LABELS[t]} ({counts[t]})
              </button>
            );
          })}
          {customLanes.map((l) => (
            <button
              key={l.id}
              onClick={() => setCustomLaneId(l.id)}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: customLaneId === l.id ? "var(--color-accent-soft)" : "transparent",
                color: customLaneId === l.id ? "var(--color-accent)" : "var(--color-text-tertiary)",
              }}
            >
              {l.name} ({l.count})
            </button>
          ))}
          {bundleTotal > 0 && (
            <button
              onClick={() => {
                setCustomLaneId(null);
                setTab("bundles");
              }}
              className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: customLaneId === null && tab === "bundles" ? "var(--color-accent-soft)" : "transparent",
                color: customLaneId === null && tab === "bundles" ? "var(--color-accent)" : "var(--color-text-tertiary)",
              }}
            >
              Bundles ({bundleTotal})
            </button>
          )}
          <button
            onClick={() => void handleNewLane()}
            className="rounded-md px-2 py-1 text-[12px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Create a lane from a sender domain"
          >
            + New lane
          </button>
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
      ) : tab === "outbound" && !customLaneId ? (
        <div className="flex-1 overflow-hidden">
          <OutboundTable />
        </div>
      ) : tab === "bundles" && !customLaneId ? (
        <div className="flex flex-1 overflow-hidden">
          <BundlesView bundles={bundles} onClear={handleClearBundle} clearing={clearingBundle} />
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
                lane={customLaneId ? "attention" : tab === "outbound" || tab === "bundles" ? "attention" : tab}
                conversations={conversations}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={() => {
                  const next = page + 1;
                  setPage(next);
                  void loadLane(customLaneId ?? tab, next, true);
                }}
                showMailbox={selectedMailbox === null}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <ConversationPane
              conversationKey={selectedKey}
              lane={customLaneId ? "attention" : tab === "outbound" || tab === "bundles" ? "attention" : tab}
              replySignal={replySignal}
              onTriage={handleTriage}
            />
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={paletteCommands} />
    </div>
  );
}
