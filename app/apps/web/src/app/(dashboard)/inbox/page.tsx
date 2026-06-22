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
import { z } from "zod";
import { Inbox, Mail, AlertCircle, Search, X, PenSquare } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";
import { ConversationList } from "./_conversation-list";
import { ConversationPane, type ConversationPaneApi } from "./_conversation-pane";
import { CaptureReviewDrawer } from "./_capture-review";
import { OutboundTable, type OutboundTableApi } from "./_outbound-table";
import { BundlesView } from "./_bundles-view";
import { CommandPalette } from "./_command-palette";
import { buildInboxPaletteCommands, type PaletteCommand } from "@/lib/inbox/palette-commands";
import { tomorrowMorning } from "@/lib/inbox/snooze-presets";
import { InboxFolders } from "./_inbox-folders";
import { EmailComposerPanel } from "@/components/email-composer-panel";
import { type SendableMailbox } from "@/lib/inbox/pick-from-mailbox";
import { SplitStrip } from "./_split-strip";
import { InboxListSkeleton } from "./_skeleton";
import { pickListState } from "@/lib/inbox/list-state";
import { createLoadGuard } from "@/lib/inbox/load-guard";
import type { ConversationListItem, InboxLane, LaneCounts, MailboxSummary, SplitCount } from "./_types";
import type { BundleSource } from "@/lib/inbox/bundle";
import { registerShortcut } from "@/lib/hotkey-registry";
import { INBOX_SHORTCUTS } from "@/lib/inbox/inbox-shortcuts";
import { prefetchDetail } from "@/lib/inbox/detail-cache";
import { resolveMailboxShortcut } from "@/lib/inbox/mailbox-switch";
import {
  EMPTY_SELECTION,
  toggle as selToggle,
  rangeTo as selRangeTo,
  selectAll as selSelectAll,
  summarizeBulk,
  type SelectionState,
} from "@/lib/inbox/selection";

type Tab = InboxLane | "outbound" | "bundles" | "starred" | "drafts" | "scheduled" | "all" | "trash" | "spam";

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
  bundles: "Bundles",
  starred: "Starred",
  drafts: "Drafts",
  scheduled: "Scheduled",
  all: "All Mail",
  trash: "Trash",
  spam: "Spam",
};


export default function InboxPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("attention");
  // Custom smart lanes (INBOX-T01): when one is selected, customLaneId drives the
  // fetch (?lane=<id>) instead of the built-in tab.
  const [customLaneId, setCustomLaneId] = useState<string | null>(null);
  const [customLanes, setCustomLanes] = useState<Array<{ id: string; name: string; hideWhenEmpty: boolean; count: number }>>([]);
  // B3 intention splits — sub-segment the attention lane. activeSplit drives
  // ?split= (a built-in id or a custom-split UUID).
  const [activeSplit, setActiveSplit] = useState<string | null>(null);
  const [splitCounts, setSplitCounts] = useState<SplitCount[]>([]);
  const [noiseCount, setNoiseCount] = useState(0);
  const [starredCount, setStarredCount] = useState(0);
  const [draftsCount, setDraftsCount] = useState(0);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [allMailCount, setAllMailCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [spamCount, setSpamCount] = useState(0);
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
  // Inbox/Primary count (Upstream email-client model: primary mail in the inbox).
  const [primaryCount, setPrimaryCount] = useState(0);
  // Unread primary mail — drives the Inbox folder badge (Upstream shows unread, not total).
  const [unreadCount, setUnreadCount] = useState(0);
  // Compose a NEW email (Upstream pencil) — overlay composer, blank draft.
  const [composeOpen, setComposeOpen] = useState(false);
  const [sendableMailboxes, setSendableMailboxes] = useState<SendableMailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [replySignal, setReplySignal] = useState(0);
  // B6: bump to open the focused thread's add-label input (mirrors replySignal).
  const [labelSignal, setLabelSignal] = useState(0);
  // Cmd/Ctrl+K command palette (INBOX-K01).
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Bulk multi-select (INBOX-T09): x toggles, Shift+x ranges, Esc clears.
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  // Search (INBOX-Q04): debounced so each keystroke doesn't refetch.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // F3: the last foreground load rejected — drives the list error state so a failed
  // load shows a Retry, not a misleading empty lane (only meaningful when count===0).
  const [listError, setListError] = useState(false);
  // Catch-me-up (INBOX-S03): new-since-last-seen count + a one-time init guard.
  const [catchUpCount, setCatchUpCount] = useState(0);
  const seenInitRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  // `m`-then-key mailbox quick-switch state machine (INBOX-K05).
  const mailboxAwaitRef = useRef(false);
  const mailboxAwaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // In-flight triage POST. Lane fetches await it so switching to Done/
  // Snoozed right after the verb never races the write (the GET would
  // otherwise read pre-commit state and show an empty lane).
  const pendingTriage = useRef<Promise<unknown> | null>(null);

  // ── URL ↔ active-view sync — shareable/bookmarkable folders + splits that
  // SURVIVE A RELOAD and respond to back/forward (the audit gap vs Upstream).
  // One page, synced via the History API (a route restructure would break the
  // sibling-relative imports). The ?conversation deep-link param is preserved. ──
  const urlInitRef = useRef(false);
  const applyUrlToState = useCallback((sp: URLSearchParams) => {
    const lane = sp.get("lane");
    const split = sp.get("split");
    const folder = sp.get("folder") as Tab | null;
    if (lane) { setCustomLaneId(lane); setActiveSplit(null); setTab("attention"); }
    else if (split) { setCustomLaneId(null); setActiveSplit(split); setTab("attention"); }
    else if (folder) { setCustomLaneId(null); setActiveSplit(null); setTab(folder); }
    else { setCustomLaneId(null); setActiveSplit(null); setTab("attention"); }
  }, []);
  // Read the initial view from the URL once (client-only — window is set in effects).
  useEffect(() => {
    if (urlInitRef.current) return;
    urlInitRef.current = true;
    applyUrlToState(new URLSearchParams(window.location.search));
  }, [applyUrlToState]);
  // Push the active view into the URL. The `url !== current` guard makes a
  // popstate-driven state change a no-op, so back/forward never loops.
  useEffect(() => {
    if (!urlInitRef.current) return;
    const sp = new URLSearchParams(window.location.search);
    sp.delete("folder");
    sp.delete("split");
    sp.delete("lane");
    if (customLaneId) sp.set("lane", customLaneId);
    else if (activeSplit) sp.set("split", activeSplit);
    else if (tab !== "attention") sp.set("folder", tab);
    const qs = sp.toString();
    const url = qs ? `/inbox?${qs}` : "/inbox";
    if (url !== window.location.pathname + window.location.search) {
      window.history.pushState(null, "", url);
    }
  }, [tab, activeSplit, customLaneId]);
  // Back / forward → re-read the URL into the active view.
  useEffect(() => {
    const onPop = () => applyUrlToState(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [applyUrlToState]);

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

  // F2: generation guard + abort controller for foreground loads (stale discard).
  const loadGuardRef = useRef(createLoadGuard());
  const abortRef = useRef<AbortController | null>(null);

  const loadLane = useCallback(
    async (lane: string, pageNum: number, append: boolean, silent = false) => {
      // F2: a foreground load mints a generation token and aborts the previous
      // in-flight foreground fetch, so a slow earlier lane can't paint over a
      // newer one. Appends are additive — they don't take a token or abort.
      // `silent` = a background freshness refresh: refetch + swap, but show no
      // loading skeleton and surface no error toast (it fires every ~25s).
      const token = append ? null : loadGuardRef.current.next();
      if (!append) {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
      }
      const live = () => token === null || loadGuardRef.current.isCurrent(token);
      if (append) setLoadingMore(true);
      else if (!silent) {
        setLoading(true);
        setListError(false); // clear the foreground error as a fresh load begins
      }
      try {
        if (pendingTriage.current) await pendingTriage.current.catch(() => {});
        const mailboxQuery = selectedMailbox ? `&mailbox=${encodeURIComponent(selectedMailbox)}` : "";
        const searchQuery = debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : "";
        // Inbox/Primary → the email-client primary view (lane=primary): the default
        // Inbox (no split) and the "Primary" split both show all primary-category mail
        // in the inbox, not just the triage attention subset (Upstream model).
        const isPrimaryView = lane === "attention" && (!activeSplit || activeSplit === "other");
        const effLane = isPrimaryView ? "primary" : lane;
        // B3: only sub-segment the attention lane (not a custom lane / the primary view).
        const splitQuery = activeSplit && lane === "attention" && !isPrimaryView ? `&split=${activeSplit}` : "";
        const res = await fetch(`/api/inbox/conversations?lane=${effLane}&page=${pageNum}${mailboxQuery}${searchQuery}${splitQuery}`, {
          signal: append ? undefined : abortRef.current?.signal,
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as {
          conversations: ConversationListItem[];
          counts: LaneCounts;
          pagination: { total: number };
          mailboxConnected?: boolean;
          mailboxes?: MailboxSummary[];
          selectedMailbox?: string | null;
          customLanes?: Array<{ id: string; name: string; hideWhenEmpty: boolean; count: number }>;
          splits?: SplitCount[];
          noiseCount?: number;
          starredCount?: number;
          draftsCount?: number;
          scheduledCount?: number;
          allMailCount?: number;
          trashCount?: number;
          spamCount?: number;
          primaryCount?: number;
          unreadCount?: number;
          bundles?: BundleSource[];
          catchUpCount?: number;
          lastSeen?: string | null;
        };
        if (!live()) return; // a newer foreground load superseded this one — discard
        setMailboxConnected(data.mailboxConnected !== false);
        if (data.mailboxes) setMailboxes(data.mailboxes);
        setCustomLanes(data.customLanes ?? []);
        setSplitCounts(data.splits ?? []);
        setNoiseCount(data.noiseCount ?? 0);
        setStarredCount(data.starredCount ?? 0);
        setDraftsCount(data.draftsCount ?? 0);
        setScheduledCount(data.scheduledCount ?? 0);
        setAllMailCount(data.allMailCount ?? 0);
        setTrashCount(data.trashCount ?? 0);
        setSpamCount(data.spamCount ?? 0);
        setBundles(data.bundles ?? []);
        setCatchUpCount(data.catchUpCount ?? 0);
        // First visit (no marker yet): stamp it once so future visits compute
        // "new since last here" — and the banner never floods on day one.
        if (data.lastSeen == null && !seenInitRef.current) {
          seenInitRef.current = true;
          void fetch("/api/inbox/seen", { method: "POST" }).catch(() => {});
        }
        setCounts(data.counts);
        setPrimaryCount(data.primaryCount ?? 0);
        setUnreadCount(data.unreadCount ?? 0);
        setTotal(data.pagination.total);
        setConversations((prev) => (append ? [...prev, ...data.conversations] : data.conversations));
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return; // superseded — silent, no error/toast
        if (silent) return; // a background freshness refresh fails quietly — keep the current list
        if (!append) setListError(true); // a foreground load failed -> error state, not empty
        toast("Couldn't load the inbox.", "error");
      } finally {
        // Only the live load owns the loading flags; a stale finally must not clear
        // them out from under the newer load.
        if (live()) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [toast, selectedMailbox, debouncedSearch, activeSplit],
  );

  // Debounce the search box so each keystroke doesn't refetch (INBOX-Q04).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

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

  // B3: a custom per-sender split (name + a sender domain/address). Selecting it
  // after creation refreshes the splits payload via loadLane.
  const handleNewSplit = useCallback(async () => {
    const name = window.prompt("New split name?")?.trim();
    if (!name) return;
    const sender = window.prompt('Group mail from which sender? (domain like "stripe.com" or an address)')?.trim();
    if (!sender) return;
    try {
      const res = await fetch("/api/inbox/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, senders: [sender] }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { split } = (await res.json()) as { split: { id: string } };
      setActiveSplit(split.id);
    } catch {
      toast("Couldn't create the split.", "error");
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
    setSelection(EMPTY_SELECTION);
    void loadLane(param, 1, false);
  }, [tab, customLaneId, loadLane]);

  // Real-time freshness: the inbox has no server push, so without this the open
  // list never shows newly-arrived mail until a manual navigation/reload. Silently
  // refetch page 1 of the live lane every 25s and whenever the tab regains focus.
  // Gated to page 1 + not-loading + not the outbound view so it never collapses a
  // "load more" or fights an in-flight optimistic triage (loadLane awaits
  // pendingTriage before refetching, and `silent` suppresses the skeleton/toast).
  const freshRef = useRef({ lane: customLaneId ?? tab, page, loading });
  useEffect(() => {
    freshRef.current = { lane: customLaneId ?? tab, page, loading };
  });
  useEffect(() => {
    const refresh = () => {
      const { lane, page: p, loading: l } = freshRef.current;
      if (lane === "outbound" || p !== 1 || l) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadLane(lane, 1, false, true);
    };
    const id = window.setInterval(refresh, 25000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loadLane]);

  // The Bundles tab hides itself when empty; if it empties while open (all
  // cleared), fall back to attention so the user isn't stranded on a dead tab.
  useEffect(() => {
    if (tab === "bundles" && !customLaneId && bundles.length === 0 && !loading) {
      setTab("attention");
    }
  }, [tab, customLaneId, bundles.length, loading]);

  // Mark a conversation read on open (Upstream): clear its unread dot in the list
  // optimistically + persist read-up-to its last message (a later reply re-marks it
  // unread server-side). Guarded on c.unread so it runs once per open, no loop.
  useEffect(() => {
    if (!selectedKey) return;
    const conv = conversations.find((c) => c.key === selectedKey);
    if (!conv || !conv.unread) return;
    setConversations((prev) => prev.map((c) => (c.key === selectedKey ? { ...c, unread: false } : c)));
    const at = conv.lastInboundAt ?? conv.lastMessageAt ?? undefined;
    void fetch("/api/inbox/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: selectedKey, at }),
    }).catch(() => {});
  }, [selectedKey, conversations]);

  // Load the user's sendable mailboxes once (for the compose-new From selector).
  // The route now degrades past the prod-schema gap, so this returns 200.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/mailboxes")
      .then((r) => (r.ok ? r.json() : { mailboxes: [] }))
      .then((d: { mailboxes?: Array<{ id: string; emailAddress: string; displayName: string | null; status: string }> }) => {
        if (cancelled || !Array.isArray(d.mailboxes)) return;
        setSendableMailboxes(
          d.mailboxes
            .filter((m) => m.status === "active")
            .map((m) => ({ id: m.id, address: m.emailAddress, label: m.displayName?.trim() || m.emailAddress })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Reconcile the selection whenever the list changes: a pending deep-link wins
  // when its thread is listed; otherwise keep the current selection if still
  // listed, else clear it. We do NOT auto-open the first row — Upstream (and every
  // real email client) lands on the FULL-WIDTH list, opening the reading pane only
  // on an explicit click. Auto-selecting cramped the list behind a half-empty pane.
  useEffect(() => {
    const wanted = wantedKeyRef.current;
    if (wanted && conversations.some((c) => c.key === wanted)) {
      wantedKeyRef.current = null;
      setSelectedKey(wanted);
      return;
    }
    setSelectedKey((sel) => (sel && conversations.some((c) => c.key === sel) ? sel : null));
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
        if (tab === "attention" || tab === "snoozed" || tab === "done" || tab === "handled") updated[tab] = Math.max(0, updated[tab] - 1);
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

  // Multi-select (INBOX-T09): toggle a row, or shift-extend from the anchor over
  // the current visible ordering.
  const handleToggleSelect = useCallback(
    (key: string, shift: boolean) => {
      const ordered = conversations.map((c) => c.key);
      setSelection((sel) => (shift ? selRangeTo(sel, ordered, key) : selToggle(sel, key)));
    },
    [conversations],
  );

  // Star toggle (Upstream is:starred) — optimistic, owner-scoped persist. Stable so
  // it doesn't break InboxRow's React.memo.
  const handleToggleStar = useCallback((key: string, starred: boolean) => {
    setConversations((prev) => prev.map((c) => (c.key === key ? { ...c, starred } : c)));
    setStarredCount((n) => Math.max(0, n + (starred ? 1 : -1)));
    void fetch("/api/inbox/star", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, starred }),
    }).catch(() => {});
  }, []);

  // Delete (→ Trash) or Restore a conversation. Soft-delete: optimistically pull it
  // from the current list + close the pane, then persist via /api/inbox/trash.
  const handleTrash = useCallback((key: string, trashed: boolean) => {
    setConversations((prev) => prev.filter((c) => c.key !== key));
    setSelectedKey((sel) => (sel === key ? null : sel));
    setTrashCount((n) => Math.max(0, n + (trashed ? 1 : -1)));
    void fetch("/api/inbox/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, trashed }),
    }).catch(() => {});
    toast(trashed ? "Moved to Trash." : "Restored to the inbox.", "success");
  }, [toast]);

  // Mark as spam (→ Spam) or "Not spam" (restore). Same soft-flag pattern as Trash.
  const handleSpam = useCallback((key: string, spam: boolean) => {
    setConversations((prev) => prev.filter((c) => c.key !== key));
    setSelectedKey((sel) => (sel === key ? null : sel));
    setSpamCount((n) => Math.max(0, n + (spam ? 1 : -1)));
    void fetch("/api/inbox/spam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, spam }),
    }).catch(() => {});
    toast(spam ? "Marked as spam." : "Moved out of spam.", "success");
  }, [toast]);

  // Bulk triage the whole selection — reuses the per-key verb (a dedicated
  // /triage/bulk fan-out is residual). Optimistic; reports any failures.
  const handleBulkTriage = useCallback(
    async (action: "done" | "snooze", snoozeUntil?: string) => {
      const keys = selection.keys;
      if (keys.length === 0) return;
      const keySet = new Set(keys);
      setConversations((prev) => prev.filter((c) => !keySet.has(c.key)));
      setSelection(EMPTY_SELECTION);
      setCounts((c) => {
        const updated = { ...c };
        if (tab === "attention" || tab === "snoozed" || tab === "done" || tab === "handled") updated[tab] = Math.max(0, updated[tab] - keys.length);
        if (action === "done") updated.done += keys.length;
        if (action === "snooze") updated.snoozed += keys.length;
        return updated;
      });
      const results = await Promise.all(
        keys.map(async (key) => {
          try {
            const r = await fetch("/api/inbox/triage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversationKey: key, action, snoozeUntil }),
            });
            return { key, ok: r.ok };
          } catch {
            return { key, ok: false };
          }
        }),
      );
      const { applied, failed } = summarizeBulk(results);
      if (failed.length > 0) {
        toast(`${applied} updated, ${failed.length} failed — reloading.`, "error");
        if (tab !== "outbound") void loadLane(customLaneId ?? tab, 1, false);
      } else {
        toast(`${applied} conversation${applied === 1 ? "" : "s"} marked ${action === "done" ? "done" : "snoozed"}.`, "success");
      }
    },
    [selection, tab, customLaneId, toast, loadLane],
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

      // Mailbox quick-switch (INBOX-K05): `m` arms a brief window; the next key
      // is consumed here (so it can't also trigger j/k) and resolved to a box.
      // Only meaningful with a chooser, i.e. 2+ connected mailboxes.
      if (mailboxAwaitRef.current) {
        mailboxAwaitRef.current = false;
        if (mailboxAwaitTimer.current) {
          clearTimeout(mailboxAwaitTimer.current);
          mailboxAwaitTimer.current = null;
        }
        const res = resolveMailboxShortcut(e.key, mailboxes.map((m) => m.id));
        if (res) {
          e.preventDefault();
          setSelectedMailbox(res.target);
        }
        return;
      }
      if (e.key === "m" && mailboxes.length >= 2) {
        e.preventDefault();
        mailboxAwaitRef.current = true;
        mailboxAwaitTimer.current = setTimeout(() => {
          mailboxAwaitRef.current = false;
        }, 1500);
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
        if ((tab === "attention" || tab === "snoozed")) {
          // With a selection, `e` clears the whole set; otherwise the focused one.
          if (selection.keys.length > 0) {
            e.preventDefault();
            void handleBulkTriage("done");
          } else if (selectedKey) {
            e.preventDefault();
            void handleTriage(selectedKey, "done");
          }
        }
      } else if (e.key === "x" || e.key === "X") {
        if (selectedKey) {
          e.preventDefault();
          handleToggleSelect(selectedKey, e.shiftKey);
        }
      } else if (e.key === "Escape") {
        if (selection.keys.length > 0) {
          e.preventDefault();
          setSelection(EMPTY_SELECTION);
        }
      } else if (e.key === "r") {
        if (selectedKey) {
          e.preventDefault();
          setReplySignal((n) => n + 1);
        }
      } else if (e.key === "s") {
        // Snooze the focused thread to tomorrow 09:00 (the pane's first option).
        if (selectedKey && (tab === "attention" || tab === "snoozed")) {
          e.preventDefault();
          void handleTriage(selectedKey, "snooze", tomorrowMorning().toISOString());
        }
      } else if (e.key === "b") {
        // Book a meeting on the open thread via the shared pane handler.
        if (selectedKey) {
          e.preventDefault();
          paneApiRef.current?.bookMeeting();
        }
      } else if (e.key === "l") {
        // Open the thread's add-label input (relayed through labelSignal).
        if (selectedKey) {
          e.preventDefault();
          setLabelSignal((n) => n + 1);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, selectedKey, handleTriage, conversations, selection, handleToggleSelect, handleBulkTriage, mailboxes]);

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

  // Surface the inbox shortcuts in the global `?` cheatsheet (INBOX-K02).
  // Display-only — the handlers are the keydown listeners above; this just
  // lists them under an "Inbox" group while the page is mounted.
  useEffect(() => {
    const unregs = INBOX_SHORTCUTS.map(registerShortcut);
    return () => unregs.forEach((u) => u());
  }, []);

  // Warm the neighbours of the selected thread (INBOX-K04) so pressing j/k
  // renders the next/previous pane from cache. Bounded to two requests; the
  // cache dedupes and expires them.
  useEffect(() => {
    if (!selectedKey || conversations.length === 0) return;
    const idx = conversations.findIndex((c) => c.key === selectedKey);
    if (idx < 0) return;
    for (const c of [conversations[idx + 1], conversations[idx - 1]]) {
      if (c) prefetchDetail(c.key);
    }
  }, [selectedKey, conversations]);

  // Palette commands: jump to a lane, act on the current conversation, or open
  // any loaded conversation by fuzzy name/subject. Rebuilt as those inputs move.
  const paletteCommands = useMemo<PaletteCommand[]>(
    () =>
      buildInboxPaletteCommands(
        {
          // Raw built-in tab — act:done/snooze gate on it exactly as before; the
          // split list is gated to the real attention lane at this call site.
          tab,
          selectedKey,
          conversations,
          customLanes,
          bundleTotal,
          mailboxes,
          splits: customLaneId === null && tab === "attention" ? splitCounts : [],
          mailboxConnected,
          tabLabels: TAB_LABELS,
        },
        {
          goToLane: (t) => {
            setCustomLaneId(null);
            setTab(t);
          },
          goToBundles: () => {
            setCustomLaneId(null);
            setTab("bundles");
          },
          goToCustomLane: (id) => setCustomLaneId(id),
          switchMailbox: (id) => setSelectedMailbox(id),
          openConversation: (key) => setSelectedKey(key),
          markDone: (key) => void handleTriage(key, "done"),
          snooze1Day: (key) =>
            void handleTriage(key, "snooze", new Date(Date.now() + 86_400_000).toISOString()),
          reply: () => setReplySignal((n) => n + 1),
          book: () => paneApiRef.current?.bookMeeting(),
          stop: () => {
            void (async () => {
              const api = paneApiRef.current;
              if (!api) return;
              const r = await api.stopSequence();
              toast(
                r.ok ? "Stopped the sequence for this contact." : r.error ?? "No active sequence on this conversation.",
                r.ok ? "success" : "error",
              );
            })();
          },
          label: () => setLabelSignal((n) => n + 1),
          goToSplit: (id) => setActiveSplit(id),
          connectMailbox: () => router.push("/settings/mail-calendar"),
        },
      ),
    [conversations, customLanes, customLaneId, bundleTotal, selectedKey, tab, handleTriage, mailboxes, splitCounts, mailboxConnected, toast, router],
  );

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader
        icon={<Inbox size={16} />}
        // Folder/title reflects the active folder (Upstream shows the folder name as
        // the header): Inbox / Starred / Sent / Drafts / Scheduled / All Mail / …
        title={
          customLaneId
            ? customLanes.find((l) => l.id === customLaneId)?.name ?? "Inbox"
            : tab === "attention"
              ? "Inbox"
              : tab === "outbound"
                ? "Sent"
                : TAB_LABELS[tab]
        }
        // The conversation-count subtitle only makes sense for the Inbox/Primary view.
        subtitle={
          tab === "attention" && !customLaneId
            ? primaryCount > 0
              ? `${primaryCount} conversation${primaryCount === 1 ? "" : "s"}`
              : "All caught up"
            : undefined
        }
      />

      <div className="inbox-shell flex min-h-0 flex-1">
      {/* Left: mailbox folders + Splits (the Upstream IA). */}
      {mailboxConnected && (
        <InboxFolders
          tab={customLaneId ? "attention" : tab}
          customLaneId={customLaneId}
          activeSplit={activeSplit}
          // The Inbox row badge = UNREAD primary mail (Upstream shows unread, not
          // total); other lane counts are unchanged.
          counts={{ ...counts, attention: unreadCount }}
          splitCounts={splitCounts}
          customLanes={customLanes}
          bundleTotal={bundleTotal}
          starredCount={starredCount}
          draftsCount={draftsCount}
          scheduledCount={scheduledCount}
          allMailCount={allMailCount}
          trashCount={trashCount}
          spamCount={spamCount}
          mailboxes={mailboxes}
          selectedMailbox={selectedMailbox}
          onSelectMailbox={setSelectedMailbox}
          onSelectLane={(l) => {
            setCustomLaneId(null);
            setActiveSplit(null);
            setTab(l);
          }}
          onSelectSplit={(id) => {
            setCustomLaneId(null);
            setTab("attention");
            setActiveSplit(id);
          }}
          onSelectCustomLane={(id) => {
            setActiveSplit(null);
            setCustomLaneId(id);
          }}
          onNewLane={() => void handleNewLane()}
          onNewSplit={handleNewSplit}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
      {/* Top full-width search bar (Upstream): spans the content area. */}
      {mailboxConnected && (
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--color-border-default)" }}>
          <Button size="sm" onClick={() => setComposeOpen(true)} className="shrink-0 gap-1.5" title="Compose a new email">
            <PenSquare size={14} /> Compose
          </Button>
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mail — from: subject: is:unread"
              className="w-full rounded-md border py-1.5 pl-8 pr-8 text-[13px] outline-none"
              style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)", color: "var(--color-text-primary)" }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} title="Clear search">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}
      {/* Second nav axis: the split-tab strip (attention lane only). */}
      {mailboxConnected && tab === "attention" && !customLaneId && (
        <SplitStrip splits={splitCounts} noiseCount={noiseCount} active={activeSplit} onSelect={setActiveSplit} />
      )}
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
          <OutboundTable apiRef={outboundApiRef} />
        </div>
      ) : tab === "bundles" && !customLaneId ? (
        <div className="flex flex-1 overflow-hidden">
          <BundlesView bundles={bundles} onClear={handleClearBundle} clearing={clearingBundle} />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* The per-mailbox switcher moved into the folder sidebar (Mailboxes
              sub-segment); the standalone rail is gone. */}
          <div
            ref={listRef}
            className={`overflow-y-auto ${selectedKey ? "w-[380px] shrink-0 border-r" : "flex-1"}`}
            style={{ borderColor: "var(--color-border-default)" }}
          >
            {/* Capture review (INBOX-G02) — auto-captured interactions awaiting approval. */}
            <CaptureReviewDrawer />

            {/* Catch-me-up (INBOX-S03) — new since you were last here. */}
            {catchUpCount > 0 && !debouncedSearch && selection.keys.length === 0 && (
              <div
                className="flex items-center gap-2 border-b px-3 py-1.5"
                style={{ borderColor: "var(--color-border-default)" }}
              >
                <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  <span className="font-medium" style={{ color: "var(--color-text-secondary)" }}>{catchUpCount}</span> new since you were last here
                </span>
                <button
                  onClick={() => {
                    setCatchUpCount(0);
                    void fetch("/api/inbox/seen", { method: "POST" }).catch(() => {});
                  }}
                  className="ml-auto text-[11px] font-medium hover:underline"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Mark all seen
                </button>
              </div>
            )}

            {/* Bulk action bar (INBOX-T09) — appears once a row is selected. */}
            {selection.keys.length > 0 && (
              <div
                className="sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-2"
                style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border-default)" }}
              >
                <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {selection.keys.length} selected
                </span>
                {(tab === "attention" || tab === "snoozed") && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void handleBulkTriage("done")}>
                      Done
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        d.setHours(9, 0, 0, 0);
                        void handleBulkTriage("snooze", d.toISOString());
                      }}
                    >
                      Snooze
                    </Button>
                  </>
                )}
                <button
                  onClick={() => setSelection(selSelectAll(conversations.map((c) => c.key)))}
                  className="text-[11px] font-medium hover:underline"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelection(EMPTY_SELECTION)}
                  className="ml-auto text-[11px] font-medium hover:underline"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Clear
                </button>
              </div>
            )}
            {(() => {
              // F3: one decision drives skeleton / error+Retry / list (empty &
              // no-results handled inside ConversationList). Rows win over a
              // background load, so a refetch never blanks live rows.
              const listState = pickListState({
                loading,
                error: listError,
                count: conversations.length,
                hasQuery: !!debouncedSearch,
              });
              if (listState === "loading") return <InboxListSkeleton />;
              if (listState === "error")
                return (
                  <div className="flex h-full items-center justify-center p-6">
                    <EmptyState
                      icon={<AlertCircle size={28} />}
                      title="Couldn't load this lane"
                      description="Something went wrong reaching the inbox. Your conversations are safe — try again."
                      actionLabel="Retry"
                      onAction={() => void loadLane(customLaneId ?? tab, 1, false)}
                    />
                  </div>
                );
              return (
                <ConversationList
                  lane={customLaneId ? "attention" : tab === "snoozed" || tab === "done" || tab === "handled" ? tab : "attention"}
                  conversations={conversations}
                  selectedKey={selectedKey}
                  onSelect={setSelectedKey}
                  selectedKeys={selection.keys}
                  onToggleSelect={handleToggleSelect}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={() => {
                    const next = page + 1;
                    setPage(next);
                    void loadLane(customLaneId ?? tab, next, true);
                  }}
                  showMailbox={mailboxes.length >= 2 && selectedMailbox === null}
                  hasQuery={!!debouncedSearch}
                  onClearSearch={() => setSearch("")}
                  onToggleStar={handleToggleStar}
                  activeSplit={activeSplit}
                />
              );
            })()}
          </div>
          {selectedKey && (
            <div className="min-w-0 flex-1">
              <ConversationPane
                conversationKey={selectedKey}
                lane={customLaneId ? "attention" : tab === "snoozed" || tab === "done" || tab === "handled" ? tab : "attention"}
                replySignal={replySignal}
                labelSignal={labelSignal}
                onTriage={handleTriage}
                onTrash={handleTrash}
                isTrashView={tab === "trash"}
                onSpam={handleSpam}
                isSpamView={tab === "spam"}
                apiRef={paneApiRef}
              />
            </div>
          )}
        </div>
      )}

      </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={paletteCommands} />

      {/* Compose a NEW email (Upstream pencil) — blank overlay composer. */}
      {composeOpen && (
        <EmailComposerPanel
          draft={{ to: "", subject: "", body: "", mailboxId: sendableMailboxes[0]?.id }}
          mailboxes={sendableMailboxes}
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setComposeOpen(false);
            toast("Email sent.", "success");
          }}
        />
      )}
    </div>
  );
}
