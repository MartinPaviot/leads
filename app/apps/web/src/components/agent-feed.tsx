"use client";

/**
 * F010 — Agent Activity Feed
 *
 * The primary view of the app. Shows what the agent did and what it
 * recommends. Replaces passive dashboards with an actionable feed.
 *
 * Layout is a compact briefing, not three full-width lists:
 *   1. Pulse band  — a computed synthesis (the one insight that matters +
 *      counts + strategy mix) so the feed teaches the shape of the pipeline.
 *   2. Needs approval — action-required, kept prominent.
 *   3. What I'm tracking — a dense, urgency-sorted, navigable card grid.
 *   4. Recent activity — a compact grid that surfaces the agent's reasoning
 *      (the part that teaches the user how the agent thinks), time-stamped.
 */

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import {
  Mail, Target, AlertTriangle, Zap, Search, CheckCircle2,
  Clock, ArrowRight, Loader2, Compass, Activity,
} from "lucide-react";

interface Reaction {
  id: string;
  trigger: string;
  entityType: string;
  entityId: string;
  contextSnapshot: { entityLabel?: string };
  decision: { actions: Array<{ type: string; expectedOutcome: string }>; reasoning: string; confidence: number };
  actionsTaken: number;
  actionsDeferred: number;
  processingTimeMs: number;
  createdAt: string;
}

interface PendingAction {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
  reversibleUntil: string | null;
}

interface WorkItem {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  strategy: string;
  priority: string;
  nextAction: string | null;
  nextActionDetail: string | null;
  nextActionAt: string | null;
}

interface FeedData {
  reactions: Reaction[];
  pendingActions: PendingAction[];
  workItems: WorkItem[];
}

const TRIGGER_LABELS: Record<string, { label: string; icon: typeof Mail }> = {
  email_opened: { label: "Email opened", icon: Mail },
  email_replied: { label: "Reply received", icon: Mail },
  email_bounced: { label: "Email bounced", icon: AlertTriangle },
  email_clicked: { label: "Link clicked", icon: Mail },
  signal_detected: { label: "Signal detected", icon: Zap },
  deal_stale: { label: "Deal stalling", icon: Clock },
  meeting_completed: { label: "Meeting ended", icon: CheckCircle2 },
  contact_enriched: { label: "Contact enriched", icon: Search },
  sequence_completed: { label: "Sequence done", icon: CheckCircle2 },
  inbound_email: { label: "New email", icon: Mail },
  deal_stage_changed: { label: "Deal progressed", icon: Target },
  daily_sweep: { label: "Daily review", icon: Clock },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "var(--color-error)",
  high: "var(--color-warning)",
  medium: "var(--color-text-secondary)",
  low: "var(--color-text-tertiary)",
};

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const STRATEGY_META: Record<string, { label: string; color: string }> = {
  push: { label: "Pushing", color: "var(--color-accent)" },
  nurture: { label: "Nurturing", color: "var(--color-info)" },
  re_engage: { label: "Re-engaging", color: "var(--color-warning)" },
  research: { label: "Researching", color: "var(--color-info)" },
  monitor: { label: "Monitoring", color: "var(--color-text-tertiary)" },
  close: { label: "Closing", color: "var(--color-success)" },
};

function strategyMeta(s: string) {
  return STRATEGY_META[s] ?? { label: s.replace(/_/g, " "), color: "var(--color-text-tertiary)" };
}

function entityHref(entityType: string, entityId: string): string {
  if (entityType === "contact") return `/contacts/${entityId}`;
  if (entityType === "deal") return `/opportunities/${entityId}`;
  return "/accounts";
}

function isOverdue(w: WorkItem): boolean {
  return !!w.nextActionAt && new Date(w.nextActionAt).getTime() < Date.now();
}

function humanizeAction(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AgentFeed() {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/agent-feed");
      if (res.ok) {
        const feedData = await res.json();
        setData(feedData);
        setLoadError(false);
      } else {
        // Was silently swallowed: a 500 left data null → the "No agent activity
        // yet" empty state, masking a backend failure. (Keep any prior polled
        // data on screen; only the no-data case shows the error.)
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 15000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  async function handleApprove(actionId: string) {
    const res = await fetch(`/api/agent-actions/${actionId}/approve`, { method: "POST" });
    if (!res.ok) {
      // Was fire-and-forget: a failed approval silently refetched, so the user
      // thought they'd approved the action when they hadn't.
      toast("Couldn't approve the action. Please retry.", "error");
      return;
    }
    fetchFeed();
  }

  async function handleDismiss(actionId: string) {
    const res = await fetch(`/api/agent-actions/${actionId}/reverse`, { method: "POST" });
    if (!res.ok) {
      toast("Couldn't dismiss the action. Please retry.", "error");
      return;
    }
    fetchFeed();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
      </div>
    );
  }

  const hasContent = data && (data.reactions.length > 0 || data.pendingActions.length > 0 || data.workItems.length > 0);

  if (!hasContent && loadError) {
    return (
      <div role="alert" className="py-12 text-center">
        <Compass className="mx-auto h-10 w-10 mb-3" style={{ color: "var(--color-error, #b91c1c)" }} />
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Couldn&apos;t load the agent feed. This is not the same as no activity.
        </p>
        <button onClick={() => { setLoading(true); fetchFeed(); }} className="mt-2 text-xs font-medium" style={{ color: "var(--color-accent)" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div className="py-12 text-center">
        <Compass className="mx-auto h-10 w-10 mb-3" style={{ color: "var(--color-text-tertiary)" }} />
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No agent activity yet.
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
          Elevay posts here when it acts on a reply, a signal, or a stalling deal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FeedPulse data={data!} />

      {data!.pendingActions.length > 0 && (
        <section>
          <SectionHeader icon={AlertTriangle} title="Needs your approval" count={data!.pendingActions.length} tone="warning" />
          <div className="grid gap-2 sm:grid-cols-2">
            {data!.pendingActions.map((action) => (
              <PendingActionCard
                key={action.id}
                action={action}
                onApprove={() => handleApprove(action.id)}
                onDismiss={() => handleDismiss(action.id)}
              />
            ))}
          </div>
        </section>
      )}

      {data!.workItems.length > 0 && (
        <TrackingSection items={data!.workItems} onOpen={(it) => router.push(entityHref(it.entityType, it.entityId))} />
      )}

      {data!.reactions.length > 0 && (
        <ActivitySection reactions={data!.reactions} onOpen={(r) => router.push(entityHref(r.entityType, r.entityId))} />
      )}
    </div>
  );
}

// ── Section header (matches the home-page section convention) ──

function SectionHeader({
  icon: Icon, title, count, action, tone = "default",
}: {
  icon: typeof Mail;
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void };
  tone?: "default" | "warning";
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
        <Icon size={12} style={{ color: tone === "warning" ? "var(--color-warning)" : "var(--color-text-tertiary)" }} />
        <span>{title}</span>
        {typeof count === "number" && (
          <span className="font-normal" style={{ color: "var(--color-text-muted)" }}>{count}</span>
        )}
      </h2>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-[11px] font-medium normal-case tracking-normal hover:underline"
          style={{ color: "var(--color-accent)" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── Pulse band: the computed synthesis ──

function FeedPulse({ data }: { data: FeedData }) {
  const wi = data.workItems;
  const rx = data.reactions;
  const pending = data.pendingActions.length;

  const overdue = wi.filter(isOverdue);
  const highPri = wi.filter((w) => w.priority === "critical" || w.priority === "high");
  // Count every action the agent initiated — executed AND deferred-for-approval.
  // In review-each mode almost everything is deferred, so counting only
  // actionsTaken would read "0 agent actions" even on a busy day.
  const agentActions = rx.reduce((s, r) => s + (r.actionsTaken || 0) + (r.actionsDeferred || 0), 0);

  // Strategy distribution — teaches the shape of the book of work.
  const byStrategy = new Map<string, number>();
  for (const w of wi) byStrategy.set(w.strategy, (byStrategy.get(w.strategy) || 0) + 1);
  const strategyMix = [...byStrategy.entries()].sort((a, b) => b[1] - a[1]);
  const topStrategy = strategyMix[0];

  // The single most actionable line.
  let insight: string;
  if (overdue.length > 0) {
    insight = `${overdue.length} overdue — ${overdue[0].entityLabel} is waiting on you`;
  } else if (pending > 0) {
    insight = `${pending} action${pending > 1 ? "s" : ""} ready for your approval`;
  } else if (highPri.length > 0) {
    insight = `${highPri.length} high-priority thread${highPri.length > 1 ? "s" : ""} to push today`;
  } else if (topStrategy) {
    insight = `Mostly ${strategyMeta(topStrategy[0]).label.toLowerCase()} — ${topStrategy[1]} of ${wi.length} threads`;
  } else {
    insight = `${rx.length} recent event${rx.length > 1 ? "s" : ""} reviewed`;
  }

  const stats: Array<{ label: string; value: number; color?: string }> = [
    { label: "tracked", value: wi.length },
    { label: "overdue", value: overdue.length, color: overdue.length > 0 ? "var(--color-error)" : undefined },
    { label: "high priority", value: highPri.length, color: highPri.length > 0 ? "var(--color-warning)" : undefined },
    { label: "agent actions", value: agentActions, color: agentActions > 0 ? "var(--color-success)" : undefined },
  ];

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-panel)" }}
    >
      {/* Brand gradient ribbon — the one place the full teal→blue→orange runs. */}
      <div style={{ height: "3px", background: "var(--gradient-brand)" }} />
      <div className="flex items-start gap-3 p-4">
        <div className="rounded-xl p-2.5 shrink-0" style={{ background: "var(--gradient-brand)", boxShadow: "var(--shadow-button)" }}>
          <Compass size={16} style={{ color: "#FFFFFF" }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
            Today&apos;s focus
          </p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug" style={{ color: "var(--color-text-primary)" }}>
            {insight}
          </p>

          {/* Stat row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {stats.map((s) => (
              <div key={s.label} className="flex items-baseline gap-1.5">
                <span className="text-[20px] font-bold tabular-nums leading-none" style={{ color: s.color ?? "var(--color-text-primary)" }}>
                  {s.value}
                </span>
                <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Strategy mix — what kind of work is in flight */}
          {strategyMix.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {strategyMix.map(([s, n]) => {
                const m = strategyMeta(s);
                return (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                    style={{
                      color: m.color,
                      background: `color-mix(in srgb, ${m.color} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${m.color} 22%, transparent)`,
                    }}
                  >
                    {m.label}
                    <span className="tabular-nums" style={{ opacity: 0.7 }}>{n}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── What I'm tracking: dense, urgency-sorted, navigable grid ──

function TrackingSection({ items, onOpen }: { items: WorkItem[]; onOpen: (it: WorkItem) => void }) {
  const sorted = [...items].sort((a, b) => {
    const ao = isOverdue(a) ? 0 : 1;
    const bo = isOverdue(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const ap = PRIORITY_RANK[a.priority] ?? 9;
    const bp = PRIORITY_RANK[b.priority] ?? 9;
    if (ap !== bp) return ap - bp;
    const at = a.nextActionAt ? new Date(a.nextActionAt).getTime() : Infinity;
    const bt = b.nextActionAt ? new Date(b.nextActionAt).getTime() : Infinity;
    return at - bt;
  });

  return (
    <section>
      <SectionHeader icon={Target} title="What I'm tracking" count={items.length} />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((item) => (
          <TrackingCard key={item.id} item={item} onOpen={() => onOpen(item)} />
        ))}
      </div>
    </section>
  );
}

function TrackingCard({ item, onOpen }: { item: WorkItem; onOpen: () => void }) {
  const overdue = isOverdue(item);
  const m = strategyMeta(item.strategy);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col rounded-lg p-3 text-left"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
        borderLeft: `3px solid ${PRIORITY_COLORS[item.priority] || "var(--color-text-tertiary)"}`,
        boxShadow: "var(--shadow-card)",
        transition: "box-shadow .18s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-floating)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-card)"; }}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {item.entityLabel}
        </span>
        <ArrowRight size={13} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--color-accent)" }} />
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 12%, transparent)` }}
        >
          {m.label}
        </span>
        {overdue && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium" style={{ color: "var(--color-error)" }}>
            <Clock size={9} /> Overdue
          </span>
        )}
      </div>

      {item.nextActionDetail && (
        <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug" style={{ color: "var(--color-text-tertiary)" }}>
          {item.nextActionDetail}
        </p>
      )}
    </button>
  );
}

// ── Recent activity: compact grid that surfaces the agent's reasoning ──

const ACTIVITY_PREVIEW = 6;

function ActivitySection({ reactions, onOpen }: { reactions: Reaction[]; onOpen: (r: Reaction) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? reactions : reactions.slice(0, ACTIVITY_PREVIEW);

  return (
    <section>
      <SectionHeader
        icon={Activity}
        title="Recent activity"
        count={reactions.length}
        action={reactions.length > ACTIVITY_PREVIEW ? { label: expanded ? "Show less" : `Show all ${reactions.length}`, onClick: () => setExpanded((v) => !v) } : undefined}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((reaction) => (
          <ActivityCard key={reaction.id} reaction={reaction} onOpen={() => onOpen(reaction)} />
        ))}
      </div>
    </section>
  );
}

function ActivityCard({ reaction, onOpen }: { reaction: Reaction; onOpen: () => void }) {
  const trigger = TRIGGER_LABELS[reaction.trigger] || { label: reaction.trigger.replace(/_/g, " "), icon: Compass };
  const TriggerIcon = trigger.icon;
  const entityLabel = reaction.contextSnapshot?.entityLabel || reaction.entityId;
  const actions = (reaction.decision?.actions || []).filter((a) => a.type !== "hold");
  const reasoning = reaction.decision?.reasoning;
  const timeAgo = formatTimeAgo(reaction.createdAt);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col rounded-lg p-3 text-left"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-card)", transition: "box-shadow .18s ease, border-color .18s ease" }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-floating)"; e.currentTarget.style.borderColor = "var(--color-border-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-card)"; e.currentTarget.style.borderColor = "var(--color-border-default)"; }}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-md p-1 shrink-0" style={{ background: "var(--color-accent-soft)" }}>
          <TriggerIcon size={11} style={{ color: "var(--color-accent)" }} />
        </span>
        <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{trigger.label}</span>
        <span className="ml-auto shrink-0 text-[10.5px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>{timeAgo}</span>
      </div>

      <p className="mt-1.5 truncate text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{entityLabel}</p>

      {reasoning && (
        <p className="mt-1 line-clamp-2 text-[11px] italic leading-snug" style={{ color: "var(--color-text-tertiary)" }}>
          {reasoning}
        </p>
      )}

      {actions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {reaction.actionsTaken > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "var(--color-success)" }}>
              <CheckCircle2 size={10} /> {actions.map((a) => humanizeAction(a.type)).join(", ")}
            </span>
          )}
          {reaction.actionsDeferred > 0 && (
            <span className="text-[10px] font-medium" style={{ color: "var(--color-warning)" }}>
              {reaction.actionsDeferred} awaiting approval
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ── Needs approval ──

function PendingActionCard({
  action,
  onApprove,
  onDismiss,
}: {
  action: PendingAction;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const payload = action.payload as Record<string, unknown>;
  const reasoning = (payload.reasoning as string) || "";
  const entityType = (payload.entityType as string) || "";
  const confidence = payload.confidence as number | undefined;

  return (
    <div
      className="flex flex-col rounded-lg p-3"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {humanizeAction(action.actionType)}
        </span>
        {entityType && (
          <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>on {entityType}</span>
        )}
        {confidence !== undefined && (
          <span className="ml-auto text-[10.5px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
            {(confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>
      {reasoning && (
        <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          {reasoning}
        </p>
      )}
      <div className="mt-2.5 flex gap-1.5">
        <button
          onClick={onApprove}
          className="gradient-brand cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white"
          style={{ boxShadow: "var(--shadow-button)" }}
        >
          Approve
        </button>
        <button
          onClick={onDismiss}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
