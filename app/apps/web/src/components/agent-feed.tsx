"use client";

/**
 * F010 — Agent Activity Feed
 *
 * The primary view of the app. Shows what the agent did and what it
 * recommends. Replaces passive dashboards with an actionable feed.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Mail, Target, AlertTriangle, Zap, Search, CheckCircle2,
  Clock, ArrowRight, XCircle, Loader2, Compass, ChevronRight,
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
  critical: "var(--color-text-danger)",
  high: "var(--color-text-warning)",
  medium: "var(--color-text-secondary)",
  low: "var(--color-text-tertiary)",
};

const STRATEGY_LABELS: Record<string, string> = {
  push: "Pushing",
  nurture: "Nurturing",
  re_engage: "Re-engaging",
  research: "Researching",
  monitor: "Monitoring",
  close: "Closing",
};

export function AgentFeed() {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/agent-feed");
      if (res.ok) {
        const feedData = await res.json();
        setData(feedData);
      }
    } catch {
      // silently fail
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
    await fetch(`/api/agent-actions/${actionId}/approve`, { method: "POST" });
    fetchFeed();
  }

  async function handleDismiss(actionId: string) {
    await fetch(`/api/agent-actions/${actionId}/reverse`, { method: "POST" });
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

  return (
    <div className="space-y-6">
      {/* Pending Actions (needs approval) */}
      {data && data.pendingActions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Needs your approval
          </h2>
          <div className="space-y-2">
            {data.pendingActions.map((action) => (
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

      {/* Active Work Queue */}
      {data && data.workItems.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
            What I'm tracking
          </h2>
          <div className="space-y-2">
            {data.workItems.map((item) => (
              <WorkItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Agent Activity */}
      {data && data.reactions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Recent activity
          </h2>
          <div className="space-y-2">
            {data.reactions.map((reaction) => (
              <ReactionCard key={reaction.id} reaction={reaction} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!hasContent && (
        <div className="py-12 text-center">
          <Compass className="mx-auto h-10 w-10 mb-3" style={{ color: "var(--color-text-tertiary)" }} />
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            I'll start showing activity here as events come in.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            Connect your email and build your TAM to get started.
          </p>
        </div>
      )}
    </div>
  );
}

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
      className="rounded-xl p-4"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            {action.actionType.replace(/_/g, " ")}
            {entityType && (
              <span className="ml-1 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                on {entityType}
              </span>
            )}
          </p>
          {reasoning && (
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              {reasoning}
            </p>
          )}
          {confidence !== undefined && (
            <span className="mt-1 inline-block text-xs" style={{ color: "var(--color-text-tertiary)" }}>
              {(confidence * 100).toFixed(0)}% confidence
            </span>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={onApprove}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ background: "var(--color-bg-brand)", color: "var(--color-text-on-brand)" }}
          >
            Approve
          </button>
          <button
            onClick={onDismiss}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-secondary)" }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkItemCard({ item }: { item: WorkItem }) {
  const isOverdue = item.nextActionAt && new Date(item.nextActionAt) < new Date();
  const strategyLabel = STRATEGY_LABELS[item.strategy] || item.strategy;

  return (
    <div
      className="flex items-center gap-3 rounded-xl p-3"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
    >
      <div
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: PRIORITY_COLORS[item.priority] || "var(--color-text-tertiary)" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
          <span className="font-medium">{item.entityLabel}</span>
          <span className="mx-1.5" style={{ color: "var(--color-text-tertiary)" }}>&middot;</span>
          <span style={{ color: "var(--color-text-secondary)" }}>{strategyLabel}</span>
        </p>
        {item.nextActionDetail && (
          <p className="text-xs truncate mt-0.5" style={{
            color: isOverdue ? "var(--color-text-danger)" : "var(--color-text-tertiary)",
          }}>
            {isOverdue ? "Overdue: " : "Next: "}{item.nextActionDetail}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
    </div>
  );
}

function ReactionCard({ reaction }: { reaction: Reaction }) {
  const trigger = TRIGGER_LABELS[reaction.trigger] || { label: reaction.trigger, icon: Compass };
  const TriggerIcon = trigger.icon;
  const entityLabel = reaction.contextSnapshot?.entityLabel || reaction.entityId;
  const actions = reaction.decision?.actions || [];
  const timeAgo = formatTimeAgo(reaction.createdAt);

  return (
    <div
      className="flex items-start gap-3 rounded-xl p-3"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
    >
      <div
        className="rounded-lg p-1.5 shrink-0"
        style={{ background: "var(--color-bg-secondary)" }}
      >
        <TriggerIcon className="h-3.5 w-3.5" style={{ color: "var(--color-text-secondary)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
          <span className="font-medium">{trigger.label}</span>
          <span className="mx-1" style={{ color: "var(--color-text-tertiary)" }}>on</span>
          <span>{entityLabel}</span>
        </p>
        {actions.length > 0 && actions[0].type !== "hold" && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
            {reaction.actionsTaken > 0 && `Executed: ${actions.map(a => a.type.replace(/_/g, " ")).join(", ")}`}
            {reaction.actionsDeferred > 0 && ` (${reaction.actionsDeferred} pending approval)`}
          </p>
        )}
        <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>{timeAgo}</span>
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
