"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Check, Search, Users, Building2, TrendingUp, Activity } from "lucide-react";

interface ToolCallPanelProps {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

const toolDisplayNames: Record<string, { label: string; icon: typeof Search }> = {
  searchCRM: { label: "Searched CRM", icon: Search },
  queryContacts: { label: "Retrieved contacts", icon: Users },
  queryAccounts: { label: "Retrieved accounts", icon: Building2 },
  queryDeals: { label: "Retrieved deals", icon: TrendingUp },
  queryActivities: { label: "Retrieved activities", icon: Activity },
  createContact: { label: "Created contact", icon: Users },
  createAccount: { label: "Created account", icon: Building2 },
  createDeal: { label: "Created deal", icon: TrendingUp },
};

export function ToolCallPanel({ toolName, args, result }: ToolCallPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const display = toolDisplayNames[toolName] || { label: toolName, icon: Search };
  const Icon = display.icon;

  const resultSummary = summarizeResult(toolName, result);

  return (
    <div className="my-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[12px] transition-colors"
        style={{ color: "var(--color-text-tertiary)", cursor: "pointer", background: "none", border: "none", padding: 0 }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={12} />
        <span style={{ fontWeight: 475 }}>{display.label}</span>
        {resultSummary && (
          <span style={{ opacity: 0.7 }}> — {resultSummary}</span>
        )}
        <Check size={11} style={{ color: "oklch(0.6 0.15 145)", marginLeft: 4 }} />
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
  if (Array.isArray(r.results)) return `${r.results.length} result${r.results.length !== 1 ? "s" : ""}`;
  if (r.id) return "created";
  return null;
}

/** Wrapper for multiple tool calls in a message */
export function ToolCallGroup({ calls }: { calls: { toolName: string; args: Record<string, unknown>; result: unknown }[] }) {
  if (calls.length === 0) return null;
  return (
    <div className="mb-2" style={{ borderLeft: "2px solid var(--color-border-moderate)", paddingLeft: 8 }}>
      {calls.map((call, i) => (
        <ToolCallPanel key={i} toolName={call.toolName} args={call.args} result={call.result} />
      ))}
    </div>
  );
}
