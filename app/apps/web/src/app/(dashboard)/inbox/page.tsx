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

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Inbox, Mail, AlertCircle, Search, X, PenSquare, ChevronLeft, Rows2, AlignJustify, MoveHorizontal } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";
import { ConversationList } from "./_conversation-list";
import { SortMenu } from "./_sort-menu";
import { isInboxSort, sortRows, type InboxSort } from "@/lib/inbox/inbox-sort";
import { resolveInboxView } from "@/lib/inbox/inbox-view";
import type { InboxDensity } from "./_inbox-row";
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

// Rep-adjustable list width (px) for the 3-column master-detail, persisted so the
// layout sticks across sessions. Mirrors Call Mode's resizable cockpit columns.
const LIST_W_KEY = "elevay.inbox.listWidth";
const LIST_W_MIN = 220;
const LIST_W_MAX = 560;
const LIST_W_DEFAULT = 300;
const clampPx = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Local-first windowing: the client holds the WHOLE lane and reveals it in chunks
// of this size, growing on "Load more" — no network per page (Superhuman/Upstream).
const LOCAL_PAGE = 30;

// Extract the fields the sort comparators read from a list item (shared by the
// sorted-view memo). Pure + module-scoped so it isn't re-created each render.
const sortFieldsOf = (c: ConversationListItem) => ({
  importanceTier: c.importanceTier,
  importanceScore: c.importanceScore,
  followupOverdue: !!c.followup?.overdue,
  lastInboundAt: c.lastInboundAt,
  lastMessageAt: c.lastMessageAt,
  unread: c.unread,
  sortName: (c.displayName || c.fromAddress || "").toLowerCase(),
});

/**
 * Draggable divider between the conversation list and the open mail (3-column
 * mode only) — drag left/right to resize the delta between the inbox and the
 * reading pane. Zero layout width: the visible line is the list column's
 * border-r; the handle overlays an invisible grab zone + a hover highlight.
 * Pointer listeners bind once and read the latest onDelta via a ref. Mirrors
 * Call Mode's ResizeHandle, on Elevay tokens (no raw palette colors).
 */
function ResizeHandle({ onDelta }: { onDelta: (dx: number) => void }) {
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;
  const startX = useRef<number | null>(null);
  useEffect(() => {
    function move(e: PointerEvent) {
      if (startX.current === null) return;
      const dx = e.clientX - startX.current;
      startX.current = e.clientX;
      onDeltaRef.current(dx);
    }
    function up() {
      if (startX.current === null) return;
      startX.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  return (
    <div
      onPointerDown={(e) => {
        startX.current = e.clientX;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
      }}
      className="group relative z-10 hidden w-0 shrink-0 select-none @min-[960px]:block"
      title="Glisser pour redimensionner"
      role="separator"
      aria-orientation="vertical"
    >
      <div className="absolute inset-y-0 -left-1 w-2 cursor-col-resize" />
      <div className="pointer-events-none absolute inset-y-0 -left-px w-px bg-transparent transition-colors group-hover:bg-[var(--color-accent)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-7 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}>
        <MoveHorizontal size={12} style={{ color: "var(--color-text-muted)" }} />
      </div>
    </div>
  );
}


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
  // Local-first: the held list is the WHOLE lane; `visibleCount` is the local
  // window (grows on Load more). No server pagination, so no page/loadingMore.
  const [visibleCount, setVisibleCount] = useState(LOCAL_PAGE);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
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
  // The header search field shrinks on narrow windows; only show the full
  // operator-hint placeholder where it actually fits (≥ lg), else "Search mail"
  // so it never clips. Starts false → matches SSR, set on mount (no hydration gap).
  const [wideSearch, setWideSearch] = useState(false);
  // Outlook-style display density: "comfortable" = 2-line rows (default),
  // "compact" = one dense single line. Starts comfortable → matches SSR, then a
  // mount effect reads the persisted choice (no hydration gap).
  const [density, setDensity] = useState<InboxDensity>("comfortable");
  // Email-client sort (Upstream/Outlook): the list defaults to date (newest
  // received first) like a real Inbox; "priority" keeps the AI importance
  // ranking for those who want it. Persisted; sent to the route as ?sort=.
  // Starts "date" → matches SSR, then a mount effect reads the persisted choice.
  const [sort, setSort] = useState<InboxSort>("date");
  // Resizable list width (3-column mode). Default on SSR → first paint matches;
  // a mount effect reads the persisted px, and a persist effect saves it.
  const [listW, setListW] = useState(LIST_W_DEFAULT);
  // F3: the last foreground load rejected — drives the list error state so a failed
  // load shows a Retry, not a misleading empty lane (only meaningful when count===0).
  const [listError, setListError] = useState(false);
  // Catch-me-up (INBOX-S03): new-since-last-seen count + a one-time init guard.
  const [catchUpCount, setCatchUpCount] = useState(0);
  const seenInitRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Last list scroll offset while no thread is open — so returning from a thread
  // lands back where you were instead of at the top. In single-pane mode the
  // list is display:none while reading, which zeroes its scrollTop; we restore it.
  const listScrollRef = useRef(0);
  // The inbox @container — its width decides single-pane (<960px) vs 3-column,
  // so the scroll-restore effect can tell the two apart precisely (not by proxy).
  const shellRef = useRef<HTMLDivElement>(null);
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
  // Local-first lane cache (stale-while-revalidate): the last payload per view
  // (lane + mailbox + split). Revisiting a loaded lane paints from cache INSTANTLY
  // — no skeleton, no wait — then a silent fetch revalidates. Any mutation clears
  // it (an item that moved lanes makes every cached lane potentially stale).
  // Search views are never cached (transient; the keyspace stays bounded to
  // lanes × mailboxes × splits).
  const laneCacheRef = useRef(new Map<string, { rows: ConversationListItem[]; total: number; truncated: boolean }>());

  const loadLane = useCallback(
    async (lane: string, silent = false) => {
      // Local-first: ONE fetch per lane returns the whole lane; the client sorts +
      // windows it. F2: each load mints a generation token and aborts the previous
      // in-flight fetch, so a slow earlier lane can't paint over a newer one.
      // `silent` = a background freshness refresh: refetch + swap, but show no
      // loading skeleton and surface no error toast (it fires every ~15s).
      const token = loadGuardRef.current.next();
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const live = () => loadGuardRef.current.isCurrent(token);

      // View identity + lane-cache key (pure, unit-tested). Inbox/Primary maps
      // attention → primary; a real split sub-segments; search views aren't cached.
      const { effLane, splitId, cacheKey, canCache } = resolveInboxView({
        lane,
        activeSplit,
        selectedMailbox,
        search: debouncedSearch,
      });

      if (!silent) {
        const cached = canCache ? laneCacheRef.current.get(cacheKey) : undefined;
        if (cached) {
          // Revisiting a loaded lane: paint from cache INSTANTLY (no skeleton), then
          // fall through to a silent revalidation below.
          setConversations(cached.rows);
          setTotal(cached.total);
          setTruncated(cached.truncated);
          setListError(false);
        } else {
          setLoading(true);
          setListError(false); // clear the foreground error as a fresh load begins
        }
      }
      try {
        if (pendingTriage.current) await pendingTriage.current.catch(() => {});
        const mailboxQuery = selectedMailbox ? `&mailbox=${encodeURIComponent(selectedMailbox)}` : "";
        const searchQuery = debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : "";
        const splitQuery = splitId ? `&split=${splitId}` : "";
        // No &sort: the client sorts locally (instant, any size). The server returns
        // its per-view default order; we re-sort on arrival, so first paint is correct.
        const res = await fetch(`/api/inbox/conversations?lane=${effLane}${mailboxQuery}${searchQuery}${splitQuery}`, {
          signal: abortRef.current?.signal,
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as {
          conversations: ConversationListItem[];
          counts: LaneCounts;
          pagination: { total: number; truncated?: boolean };
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
        setTruncated(data.pagination.truncated === true);
        setConversations(data.conversations);
        // Warm the cache for instant revisits (search views excluded).
        if (canCache) {
          laneCacheRef.current.set(cacheKey, {
            rows: data.conversations,
            total: data.pagination.total,
            truncated: data.pagination.truncated === true,
          });
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return; // superseded — silent, no error/toast
        if (silent) return; // a background freshness refresh fails quietly — keep the current list
        setListError(true); // a foreground load failed -> error state, not empty
        toast("Couldn't load the inbox.", "error");
      } finally {
        // Only the live load owns the loading flag; a stale finally must not clear
        // it out from under the newer load.
        if (live()) setLoading(false);
      }
    },
    [toast, selectedMailbox, debouncedSearch, activeSplit],
  );

  // Local-first ordering + windowing. The client holds the WHOLE lane, so changing
  // the sort is a pure in-memory re-sort (no fetch, instant at any size — the
  // Superhuman/Upstream feel), and "Load more" just grows the window. `sorted` is
  // the full lane in the chosen order; `displayed` is the visible slice.
  const sorted = useMemo(() => sortRows(conversations, sort, sortFieldsOf), [conversations, sort]);
  const displayed = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);

  // Debounce the search box so each keystroke doesn't refetch (INBOX-Q04).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Track whether the search field is wide enough (≥ lg) for the full hint.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setWideSearch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Restore the persisted display density once on mount (client-only — keeps SSR
  // = comfortable so first paint never mismatches).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("inbox-density");
      if (saved === "compact" || saved === "comfortable") setDensity(saved);
    } catch {
      /* localStorage unavailable — keep the default */
    }
  }, []);

  const toggleDensity = useCallback(() => {
    setDensity((d) => {
      const next: InboxDensity = d === "comfortable" ? "compact" : "comfortable";
      try {
        window.localStorage.setItem("inbox-density", next);
      } catch {
        /* ignore — persistence is best-effort */
      }
      return next;
    });
  }, []);

  // Restore the persisted sort once on mount (client-only — keeps SSR = "date"
  // so first paint never mismatches).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("inbox-sort");
      if (isInboxSort(saved)) setSort(saved);
    } catch {
      /* localStorage unavailable — keep the default */
    }
  }, []);

  const changeSort = useCallback((next: InboxSort) => {
    setSort(next);
    try {
      window.localStorage.setItem("inbox-sort", next);
    } catch {
      /* ignore — persistence is best-effort */
    }
    // Pure local re-sort (the `sorted` memo re-derives) — NO fetch, instant at any
    // size. Reset the window to the top so the new order starts from the first row.
    setVisibleCount(LOCAL_PAGE);
  }, []);

  // Restore the persisted list width once on mount, then persist on change.
  useEffect(() => {
    try {
      const v = Number(window.localStorage.getItem(LIST_W_KEY));
      if (Number.isFinite(v) && v > 0) setListW(clampPx(v, LIST_W_MIN, LIST_W_MAX));
    } catch {
      /* localStorage unavailable — keep the default */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(LIST_W_KEY, String(listW));
    } catch {
      /* ignore — persistence is best-effort */
    }
  }, [listW]);
  // The divider feeds dx here: drag right widens the list, narrows the reader.
  const handleResizeList = useCallback((dx: number) => {
    setListW((w) => clampPx(w + dx, LIST_W_MIN, LIST_W_MAX));
  }, []);

  // Return-to-list scroll restoration (the way real mail clients keep your place):
  // when a thread closes (selectedKey → null) and the list reappears reset to the
  // top — single-pane hides it with display:none, which zeroes scrollTop — put it
  // back where the user was. Gated to single-pane (container < 960px): in
  // 3-column mode the list is never hidden, stays scrollable, and must not be
  // yanked to a stale offset, so we bail there explicitly instead of inferring
  // the mode from scrollTop.
  useLayoutEffect(() => {
    if (selectedKey) return;
    if (shellRef.current && shellRef.current.clientWidth >= 960) return; // 3-column → no-op
    const el = listRef.current;
    if (el && listScrollRef.current > 0 && el.scrollTop === 0) {
      el.scrollTop = listScrollRef.current;
    }
  }, [selectedKey]);

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
      laneCacheRef.current.clear(); // bundle items marked done → cached lanes are stale
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
        void loadLane("bundles", false);
      } finally {
        setClearingBundle(null);
      }
    },
    [toast, loadLane],
  );

  useEffect(() => {
    const param = customLaneId ?? tab;
    if (param === "outbound") return;
    setVisibleCount(LOCAL_PAGE); // a new lane/filter starts at the top of the window
    setSelection(EMPTY_SELECTION);
    void loadLane(param, false);
  }, [tab, customLaneId, loadLane]);

  // Real-time freshness: the inbox has no server push, so without this the open
  // list never shows newly-arrived mail until a manual navigation/reload. Silently
  // refetch the live lane every 15s and whenever the tab regains focus. Local-first:
  // the refetch replaces the whole held lane but PRESERVES the local window
  // (visibleCount) + sort, so new mail just slots into its sorted position. Gated to
  // not-loading + not the outbound view so it never fights an in-flight optimistic
  // triage (loadLane awaits pendingTriage; `silent` suppresses the skeleton/toast).
  const freshRef = useRef({ lane: customLaneId ?? tab, loading });
  useEffect(() => {
    freshRef.current = { lane: customLaneId ?? tab, loading };
  });
  useEffect(() => {
    // Pull new mail from the connected mailbox(es) while the inbox is open, so it
    // stays fresh like a classic mail client instead of waiting for the */5 cron.
    // POST /api/email/sync only INGESTS inbound (Gmail rides its own push; IMAP/
    // custom + Outlook get a force pull) — it never sends. Debounced + gated to the
    // visible tab so it costs at most one pull per ~12s per active viewer; the 15s
    // DB refresh below then surfaces what the pull wrote → new mail shows in ~15s.
    let lastSync = 0;
    const triggerMailSync = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastSync < 12000) return;
      lastSync = now;
      void fetch("/api/email/sync", { method: "POST" }).catch(() => {});
    };
    const refresh = () => {
      const { lane, loading: l } = freshRef.current;
      if (lane === "outbound" || l) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void loadLane(lane, true);
    };
    triggerMailSync(); // sync on open
    const syncId = window.setInterval(triggerMailSync, 15000);
    const id = window.setInterval(refresh, 15000);
    const onFocus = () => {
      triggerMailSync();
      refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(syncId);
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
      // Optimistic: remove from the held lane and advance the selection over the
      // VISIBLE order (what the user sees), not the raw held array.
      laneCacheRef.current.clear(); // an item changed lanes → every cached lane is stale
      const visIdx = displayed.findIndex((c) => c.key === key);
      const nextVisible = displayed.filter((c) => c.key !== key);
      setConversations((prev) => prev.filter((c) => c.key !== key));
      setSelectedKey(nextVisible[Math.min(Math.max(visIdx, 0), nextVisible.length - 1)]?.key ?? null);
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
        if (tab !== "outbound") void loadLane(tab, false);
      } finally {
        pendingTriage.current = null;
      }
    },
    [tab, toast, loadLane, displayed],
  );

  // Multi-select (INBOX-T09): toggle a row, or shift-extend from the anchor over
  // the current visible ordering.
  const handleToggleSelect = useCallback(
    (key: string, shift: boolean) => {
      const ordered = displayed.map((c) => c.key);
      setSelection((sel) => (shift ? selRangeTo(sel, ordered, key) : selToggle(sel, key)));
    },
    [displayed],
  );

  // Star toggle (Upstream is:starred) — optimistic, owner-scoped persist. Stable so
  // it doesn't break InboxRow's React.memo.
  const handleToggleStar = useCallback((key: string, starred: boolean) => {
    laneCacheRef.current.clear(); // starred-lane membership changed
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
    laneCacheRef.current.clear(); // moved to/from Trash
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
    laneCacheRef.current.clear(); // moved to/from Spam
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
      laneCacheRef.current.clear(); // items changed lanes → cached lanes are stale
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
        if (tab !== "outbound") void loadLane(customLaneId ?? tab, false);
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
        if (displayed.length === 0) return;
        e.preventDefault();
        const idx = displayed.findIndex((c) => c.key === selectedKey);
        const nextIdx =
          e.key === "j" ? Math.min(idx + 1, displayed.length - 1) : Math.max(idx - 1, 0);
        const next = displayed[nextIdx]?.key ?? selectedKey;
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
  }, [tab, selectedKey, handleTriage, displayed, selection, handleToggleSelect, handleBulkTriage, mailboxes]);

  // Local windowing: more rows to reveal while the window is smaller than the held
  // lane. No network — "Load more" just grows visibleCount.
  const hasMore = tab !== "outbound" && visibleCount < sorted.length;
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
    if (!selectedKey || displayed.length === 0) return;
    const idx = displayed.findIndex((c) => c.key === selectedKey);
    if (idx < 0) return;
    for (const c of [displayed[idx + 1], displayed[idx - 1]]) {
      if (c) prefetchDetail(c.key);
    }
  }, [selectedKey, displayed]);

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
      >
        {/* Action buttons live in the top bar (Upstream): Compose + search,
            right of the title/conversation-count — frees the content column. */}
        {mailboxConnected && (
          <>
            <Button size="sm" onClick={() => setComposeOpen(true)} className="shrink-0 gap-1.5" title="Compose a new email">
              <PenSquare size={14} /> Compose
            </Button>
            {/* Width shrinks with the viewport so a half-screen window doesn't
                over-fill the 44px header and wrap the title (regression guard). */}
            <div className="relative w-40 min-w-0 sm:w-56 lg:w-80">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                // Stable accessible name: the placeholder swaps with width, so the
                // name can't depend on it (a11y — screen readers need a constant label).
                aria-label="Search mail"
                placeholder={wideSearch ? "Search mail — from: subject: is:unread" : "Search mail"}
                className="w-full rounded-md border py-1.5 pl-8 pr-8 text-[13px] outline-none"
                style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)", color: "var(--color-text-primary)" }}
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} title="Clear search">
                  <X size={13} />
                </button>
              )}
            </div>
            {/* Display density (Outlook): toggle comfortable 2-line ↔ compact
                single-line rows. Persisted to localStorage. */}
            <button
              onClick={toggleDensity}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors"
              style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)", color: "var(--color-text-secondary)" }}
              title={density === "comfortable" ? "Compact list — denser rows" : "Comfortable list — 2-line rows"}
              aria-label={density === "comfortable" ? "Switch to compact list density" : "Switch to comfortable list density"}
            >
              {density === "comfortable" ? <AlignJustify size={15} /> : <Rows2 size={15} />}
            </button>
            {/* Sort control (Upstream/Outlook): date by default, switchable to
                priority / unread-first / sender. Persisted. */}
            <SortMenu value={sort} onChange={changeSort} />
          </>
        )}
      </PageHeader>

      {/* @container: the single-pane breakpoint keys off the inbox area's OWN
          width (≈ viewport − global sidebar), not the viewport — so a thread
          stays 3-column only while the reading pane is actually comfortable
          (≥ ~600px) on any monitor, and collapses to single-pane otherwise. */}
      <div ref={shellRef} className="inbox-shell @container flex min-h-0 flex-1">
      {/* Left: mailbox folders + Splits (the Upstream IA). Collapses to single-pane
          only when a full-width reader is actually shown — i.e. a thread is open AND
          we're in the list/pane branch (not the outbound/bundles table, where a stale
          selectedKey would otherwise hide the rail with no way back). */}
      {mailboxConnected && (
        <div className={selectedKey && !((tab === "outbound" || tab === "bundles") && !customLaneId) ? "hidden shrink-0 @min-[960px]:flex" : "flex shrink-0"}>
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
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
      {/* Second nav axis: the split-tab strip (attention lane only). Hidden in
          the narrow single-pane reader so the open thread stands alone. */}
      {mailboxConnected && tab === "attention" && !customLaneId && (
        <div className={selectedKey ? "hidden @min-[960px]:block" : "block"}>
          <SplitStrip splits={splitCounts} noiseCount={noiseCount} active={activeSplit} onSelect={setActiveSplit} />
        </div>
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
            onScroll={(e) => {
              // Record the offset only while no thread is open, so reopening the
              // list (single-pane) restores it instead of jumping to the top.
              if (!selectedKey) listScrollRef.current = e.currentTarget.scrollTop;
            }}
            className={`overflow-y-auto ${selectedKey ? "hidden border-r @min-[960px]:block @min-[960px]:w-[var(--inbox-list-w)] @min-[960px]:shrink-0" : "flex-1"}`}
            style={{ borderColor: "var(--color-border-default)", "--inbox-list-w": `${listW}px` } as CSSProperties}
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
                  onClick={() => setSelection(selSelectAll(displayed.map((c) => c.key)))}
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
                count: displayed.length,
                hasQuery: !!debouncedSearch,
              });
              if (listState === "loading") return <InboxListSkeleton density={density} />;
              if (listState === "error")
                return (
                  <div className="flex h-full items-center justify-center p-6">
                    <EmptyState
                      icon={<AlertCircle size={28} />}
                      title="Couldn't load this lane"
                      description="Something went wrong reaching the inbox. Your conversations are safe — try again."
                      actionLabel="Retry"
                      onAction={() => void loadLane(customLaneId ?? tab, false)}
                    />
                  </div>
                );
              return (
                <ConversationList
                  lane={customLaneId ? "attention" : tab === "snoozed" || tab === "done" || tab === "handled" ? tab : "attention"}
                  conversations={displayed}
                  selectedKey={selectedKey}
                  onSelect={setSelectedKey}
                  selectedKeys={selection.keys}
                  onToggleSelect={handleToggleSelect}
                  hasMore={hasMore}
                  loadingMore={false}
                  onLoadMore={() => setVisibleCount((v) => v + LOCAL_PAGE)}
                  showMailbox={mailboxes.length >= 2 && selectedMailbox === null}
                  hasQuery={!!debouncedSearch}
                  onClearSearch={() => setSearch("")}
                  onToggleStar={handleToggleStar}
                  activeSplit={activeSplit}
                  density={density}
                />
              );
            })()}
            {/* No silent cap: a lane past the local-first ceiling tells the user the
                tail isn't shown, and how to reach it (search), once they hit the end. */}
            {truncated && !hasMore && conversations.length > 0 && (
              <div className="px-4 py-3 text-center text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                Showing the {sorted.length} most recent of {total} — refine with search to see the rest.
              </div>
            )}
          </div>
          {/* Draggable divider between the list and the open mail (3-column only). */}
          {selectedKey && <ResizeHandle onDelta={handleResizeList} />}
          {selectedKey && (
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Single-pane back control: shown only when the inbox area is too
                  narrow for the list (which is then hidden). In 3-column mode the
                  master-detail list is itself the way back. */}
              <button
                onClick={() => setSelectedKey(null)}
                className="flex shrink-0 items-center gap-1 border-b px-3 py-2 text-[13px] font-medium @min-[960px]:hidden"
                style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
              >
                <ChevronLeft size={15} /> Inbox
              </button>
              <div className="min-h-0 flex-1">
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
