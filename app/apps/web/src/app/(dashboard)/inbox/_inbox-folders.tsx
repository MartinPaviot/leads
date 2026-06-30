"use client";

/**
 * Inbox folder sidebar (shell-redesign) — the Upstream two-axis IA brought into
 * Elevay: a left vertical column of mailbox folders + intention/category Splits,
 * each with a live count, instead of the old horizontal tab bands. This is what
 * makes the inbox read like an email client (Superhuman/Upstream) rather than a
 * CRM list view. Self-contained: it drives the page's tab / customLane / split
 * state through callbacks; it owns no data.
 */

import { Inbox, AlarmClock, CheckCircle2, Bot, Send, Layers, Reply, Clock, Megaphone, Users, Plus, Mail, Star, FileText, SendHorizontal, Mails, Trash2, ShieldAlert, Target } from "lucide-react";
import type { InboxLane, MailboxSummary } from "./_types";
import type { SplitCount } from "@/lib/inbox/splits";
import { colorForMailbox } from "@/lib/inbox/mailbox-color";
import { useT } from "@/lib/i18n/locale";

type LaneId = InboxLane | "outbound" | "bundles" | "starred" | "drafts" | "scheduled" | "all" | "trash" | "spam";

const LANE_META: Record<LaneId, { labelKey: string; icon: React.ReactNode }> = {
  attention: { labelKey: "inbox.folder.attention", icon: <Inbox size={15} /> },
  snoozed: { labelKey: "inbox.folder.snoozed", icon: <AlarmClock size={15} /> },
  done: { labelKey: "inbox.folder.done", icon: <CheckCircle2 size={15} /> },
  handled: { labelKey: "inbox.folder.handled", icon: <Bot size={15} /> },
  outbound: { labelKey: "inbox.folder.outbound", icon: <Send size={15} /> },
  bundles: { labelKey: "inbox.folder.bundles", icon: <Layers size={15} /> },
  starred: { labelKey: "inbox.folder.starred", icon: <Star size={15} /> },
  drafts: { labelKey: "inbox.folder.drafts", icon: <FileText size={15} /> },
  scheduled: { labelKey: "inbox.folder.scheduled", icon: <SendHorizontal size={15} /> },
  all: { labelKey: "inbox.folder.all", icon: <Mails size={15} /> },
  trash: { labelKey: "inbox.folder.trash", icon: <Trash2 size={15} /> },
  spam: { labelKey: "inbox.folder.spam", icon: <ShieldAlert size={15} /> },
};

const SPLIT_ICON: Record<string, React.ReactNode> = {
  needs_reply: <Reply size={15} />,
  follow_ups: <Clock size={15} />,
  promotions: <Megaphone size={15} />,
  social: <Users size={15} />,
};

function FolderRow({
  icon,
  label,
  count,
  active,
  muted,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] transition-colors ${
        active ? "" : "hover:bg-[var(--color-bg-hover)]"
      }`}
      style={{
        background: active ? "var(--color-accent-soft)" : "transparent",
        color: active ? "var(--color-accent)" : muted ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
      }}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {count != null && count > 0 && (
        <span
          className="shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
          style={{
            background: active ? "var(--color-accent)" : "var(--color-bg-hover)",
            color: active ? "var(--color-bg-card)" : "var(--color-text-secondary)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
      {children}
    </div>
  );
}

export function InboxFolders({
  tab,
  customLaneId,
  activeSplit,
  counts,
  splitCounts,
  customLanes,
  dealLanes = [],
  bundleTotal,
  starredCount,
  draftsCount,
  scheduledCount,
  allMailCount,
  trashCount,
  spamCount,
  mailboxes,
  selectedMailbox,
  onSelectMailbox,
  onSelectLane,
  onSelectSplit,
  onSelectCustomLane,
  onNewLane,
  onNewSplit,
}: {
  tab: LaneId;
  customLaneId: string | null;
  activeSplit: string | null;
  counts: Record<InboxLane, number>;
  splitCounts: SplitCount[];
  customLanes: Array<{ id: string; name: string; count: number }>;
  /** P1 deal folders (id = `deal:<id>`), ordered hottest-stage-first by the route. */
  dealLanes?: Array<{ id: string; name: string; stage: string; count: number }>;
  bundleTotal: number;
  /** Count for the Starred folder (Upstream is:starred). */
  starredCount: number;
  /** Counts for the Drafts + Scheduled + All Mail folders. */
  draftsCount: number;
  scheduledCount: number;
  allMailCount: number;
  trashCount: number;
  spamCount: number;
  /** The user's connected mailboxes (the per-mailbox sub-segment shows with 2+). */
  mailboxes: MailboxSummary[];
  /** The focused mailbox id, or null for "All inboxes". */
  selectedMailbox: string | null;
  onSelectMailbox: (id: string | null) => void;
  /** Select a built-in lane (clears custom lane + split). */
  onSelectLane: (lane: LaneId) => void;
  /** Select an intention split (jumps to the attention lane). */
  onSelectSplit: (id: string) => void;
  onSelectCustomLane: (id: string) => void;
  onNewLane: () => void;
  onNewSplit: () => void;
}) {
  const t = useT();
  const onBuiltIn = customLaneId === null;
  const splitCount = (id: string) => splitCounts.find((s) => s.id === id)?.count ?? 0;
  const lane = (id: LaneId, count?: number) => (
    <FolderRow
      key={id}
      icon={LANE_META[id].icon}
      label={t(LANE_META[id].labelKey)}
      count={count}
      active={onBuiltIn && tab === id && (id !== "attention" || activeSplit === null)}
      muted={id === "done" || id === "handled"}
      onClick={() => onSelectLane(id)}
    />
  );

  return (
    <div
      className="inbox-rail flex w-[184px] shrink-0 flex-col overflow-y-auto border-r xl:w-[224px]"
      style={{ borderColor: "var(--color-border-default)" }}
    >
      <div className="h-2" />

      <div className="flex-1 px-1.5 pb-3">
        {/* Upstream order: Inbox, the intention folders, then the email folders.
            Promotions/Social/Noise live ONLY in the top split strip, not here. */}
        {lane("attention", counts.attention)}
        <FolderRow
          icon={SPLIT_ICON.needs_reply}
          label={t("inbox.split.needsReply")}
          count={splitCount("needs_reply")}
          active={onBuiltIn && tab === "attention" && activeSplit === "needs_reply"}
          onClick={() => onSelectSplit("needs_reply")}
        />
        <FolderRow
          icon={SPLIT_ICON.follow_ups}
          label={t("inbox.split.followUps")}
          count={splitCount("follow_ups")}
          active={onBuiltIn && tab === "attention" && activeSplit === "follow_ups"}
          onClick={() => onSelectSplit("follow_ups")}
        />

        <div className="my-1.5 border-t" style={{ borderColor: "var(--color-border-default)" }} />
        {lane("starred", starredCount)}
        {lane("snoozed", counts.snoozed)}
        {lane("outbound")}
        {lane("drafts", draftsCount)}
        {lane("scheduled", scheduledCount)}
        {lane("all", allMailCount)}
        {lane("spam", spamCount)}
        {lane("trash", trashCount)}

        {/* Per-mailbox view (multi-mailbox users): scope the whole inbox to one
            connected box, or All inboxes. A sidebar sub-segment, shown with 2+. */}
        {mailboxes.length >= 2 && (
          <>
            <GroupLabel>{t("inbox.folder.mailboxesGroup")}</GroupLabel>
            <FolderRow
              icon={<Mail size={15} />}
              label={t("inbox.folder.allInboxes")}
              active={selectedMailbox === null}
              onClick={() => onSelectMailbox(null)}
            />
            {mailboxes.map((m) => (
              <FolderRow
                key={m.id}
                icon={<span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorForMailbox(m.id) }} />}
                label={m.label || m.address}
                count={m.attention}
                active={selectedMailbox === m.id}
                onClick={() => onSelectMailbox(m.id)}
              />
            ))}
          </>
        )}

        <div className="my-1.5 border-t" style={{ borderColor: "var(--color-border-default)" }} />
        {lane("done", counts.done)}
        {lane("handled", counts.handled)}
        {bundleTotal > 0 && lane("bundles", bundleTotal)}

        {/* Deal folders (P1): one stable folder per active-open deal, hottest
            stage first, only the ones with mail. The main inbox is never reordered —
            this is a separate, stable navigation axis. */}
        {dealLanes.length > 0 && (
          <>
            <GroupLabel>{t("inbox.folder.dealsGroup")}</GroupLabel>
            {dealLanes.map((d) => (
              <FolderRow
                key={d.id}
                icon={<Target size={15} />}
                label={d.name}
                count={d.count}
                active={customLaneId === d.id}
                onClick={() => onSelectCustomLane(d.id)}
              />
            ))}
          </>
        )}

        {/* Custom lanes */}
        {customLanes.length > 0 && (
          <>
            <GroupLabel>{t("inbox.folder.lanesGroup")}</GroupLabel>
            {customLanes.map((l) => (
              <FolderRow
                key={l.id}
                icon={<Inbox size={15} />}
                label={l.name}
                count={l.count}
                active={customLaneId === l.id}
                onClick={() => onSelectCustomLane(l.id)}
              />
            ))}
          </>
        )}
        <button
          onClick={onNewLane}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-bg-hover)]"
          style={{ color: "var(--color-text-tertiary)" }}
          title={t("inbox.newLane.title")}
        >
          <Plus size={14} /> {t("inbox.newLane.label")}
        </button>
      </div>
    </div>
  );
}
