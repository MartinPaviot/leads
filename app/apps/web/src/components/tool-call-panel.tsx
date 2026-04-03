"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Check, Search, Users, Building2, TrendingUp, Activity, StickyNote, CheckSquare, Calendar, Mail, Zap, Layers } from "lucide-react";

interface ToolCallPanelProps {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  /** Show in-progress animation when tool is still executing */
  isStreaming?: boolean;
}

const toolDisplayNames: Record<string, { label: string; icon: typeof Search }> = {
  searchCRM: { label: "Searched CRM", icon: Search },
  queryContacts: { label: "Retrieved contacts", icon: Users },
  queryAccounts: { label: "Retrieved accounts", icon: Building2 },
  queryDeals: { label: "Retrieved deals", icon: TrendingUp },
  queryActivities: { label: "Retrieved activities", icon: Activity },
  queryNotes: { label: "Retrieved notes", icon: StickyNote },
  queryTasks: { label: "Retrieved tasks", icon: CheckSquare },
  createContact: { label: "Created contact", icon: Users },
  createAccount: { label: "Created account", icon: Building2 },
  createDeal: { label: "Created deal", icon: TrendingUp },
  createTask: { label: "Created task", icon: CheckSquare },
  updateDealStage: { label: "Updated deal stage", icon: TrendingUp },
  completeTask: { label: "Completed task", icon: CheckSquare },
  getDealCoaching: { label: "Analyzing deal", icon: TrendingUp },
  getAccountIntelligence: { label: "Analyzing account", icon: Building2 },
  draftEmail: { label: "Drafting email", icon: Mail },
  generateMeetingPrep: { label: "Preparing meeting brief", icon: Calendar },
  bulkUpdateDeals: { label: "Bulk updating deals", icon: Layers },
  bulkUpdateContacts: { label: "Bulk updating contacts", icon: Layers },
  generateWorldModel: { label: "Analyzing business context", icon: Zap },
};

export function ToolCallPanel({ toolName, args, result, isStreaming }: ToolCallPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const display = toolDisplayNames[toolName] || { label: toolName, icon: Search };
  const Icon = display.icon;

  const resultSummary = isStreaming ? null : summarizeResult(toolName, result);

  return (
    <div className="my-1.5">
      <button
        onClick={() => !isStreaming && setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[12px] transition-colors"
        style={{ color: "var(--color-text-tertiary)", cursor: isStreaming ? "default" : "pointer", background: "none", border: "none", padding: 0 }}
      >
        {isStreaming ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full"
            style={{ border: "1.5px solid var(--color-text-tertiary)", borderTopColor: "var(--color-accent)" }} />
        ) : expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={12} style={isStreaming ? { color: "var(--color-accent)" } : undefined} />
        <span style={{ fontWeight: 475 }}>{isStreaming ? display.label + "..." : display.label}</span>
        {resultSummary && (
          <span style={{ opacity: 0.7 }}> — {resultSummary}</span>
        )}
        {!isStreaming && <Check size={11} style={{ color: "oklch(0.6 0.15 145)", marginLeft: 4 }} />}
      </button>

      {expanded && (
        <div
          className="mt-1.5 ml-5 rounded-md p-3 text-[11px]"
          style={{
            background: "var(--color-bg-muted)",
            border: "0.5px solid var(--color-border-default)",
            color: "var(--color-text-secondary)",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            maxHeight: "200px",
            overflow: "auto",
          }}
        >
          {args && Object.keys(args).length > 0 && (
            <div className="mb-2">
              <span style={{ fontWeight: 600 }}>Query: </span>
              {JSON.stringify(args, null, 2)}
            </div>
          )}
          <div>
            <span style={{ fontWeight: 600 }}>Result: </span>
            {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}

function summarizeResult(toolName: string, result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  if (Array.isArray(r.contacts)) return `${r.contacts.length} contact${r.contacts.length !== 1 ? "s" : ""}`;
  if (Array.isArray(r.accounts)) return `${r.accounts.length} account${r.accounts.length !== 1 ? "s" : ""}`;
  if (Array.isArray(r.deals)) return `${r.deals.length} deal${r.deals.length !== 1 ? "s" : ""}`;
  if (Array.isArray(r.activities)) return `${r.activities.length} activit${r.activities.length !== 1 ? "ies" : "y"}`;
  if (Array.isArray(r.notes)) return `${r.notes.length} note${r.notes.length !== 1 ? "s" : ""}`;
  if (Array.isArray(r.tasks)) return `${r.tasks.length} task${r.tasks.length !== 1 ? "s" : ""}`;
  if (Array.isArray(r.results)) return `${r.results.length} result${r.results.length !== 1 ? "s" : ""}`;
  if (r.created) return "created";
  if (r.updated) return "updated";
  if (r.completed) return "completed";
  if (r.bulkUpdated) return `${(r.bulkUpdated as { count: number }).count} updated`;
  if (r.meetingPrepData) return "briefing ready";
  if (r.deal) return "analysis ready";
  if (r.account) return "intelligence ready";
  if (r.emailDraft) return "draft ready";
  return null;
}

/** Wrapper for multiple tool calls in a message */
export function ToolCallGroup({ calls }: { calls: { toolName: string; args: Record<string, unknown>; result: unknown; isStreaming?: boolean }[] }) {
  if (calls.length === 0) return null;
  return (
    <div className="mb-2" style={{ borderLeft: "2px solid var(--color-border-moderate)", paddingLeft: 8 }}>
      {calls.map((call, i) => (
        <ToolCallPanel key={i} toolName={call.toolName} args={call.args} result={call.result} isStreaming={call.isStreaming} />
      ))}
    </div>
  );
}
