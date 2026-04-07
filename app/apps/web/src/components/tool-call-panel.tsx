"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Check,
  Search,
  Users,
  Building2,
  TrendingUp,
  Activity,
  StickyNote,
  CheckSquare,
  Calendar,
  Mail,
  Zap,
  Layers,
  Database,
  BarChart3,
} from "lucide-react";

interface ToolCallPanelProps {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  isStreaming?: boolean;
}

const toolDisplayNames: Record<string, { label: string; pastLabel: string; icon: typeof Search; category: "retrieve" | "analyze" | "action" }> = {
  searchCRM:              { label: "Searching CRM",         pastLabel: "Retrieved data",      icon: Search,      category: "retrieve" },
  queryContacts:          { label: "Retrieving contacts",   pastLabel: "Retrieved contacts",  icon: Users,       category: "retrieve" },
  queryAccounts:          { label: "Retrieving accounts",   pastLabel: "Retrieved accounts",  icon: Building2,   category: "retrieve" },
  queryDeals:             { label: "Retrieving deals",      pastLabel: "Retrieved deals",     icon: TrendingUp,  category: "retrieve" },
  queryActivities:        { label: "Retrieving activities", pastLabel: "Retrieved activities", icon: Activity,    category: "retrieve" },
  queryNotes:             { label: "Retrieving notes",      pastLabel: "Retrieved notes",     icon: StickyNote,  category: "retrieve" },
  queryTasks:             { label: "Retrieving tasks",      pastLabel: "Retrieved tasks",     icon: CheckSquare, category: "retrieve" },
  createContact:          { label: "Creating contact",      pastLabel: "Created contact",     icon: Users,       category: "action" },
  createAccount:          { label: "Creating account",      pastLabel: "Created account",     icon: Building2,   category: "action" },
  createDeal:             { label: "Creating deal",         pastLabel: "Created deal",        icon: TrendingUp,  category: "action" },
  createTask:             { label: "Creating task",         pastLabel: "Created task",        icon: CheckSquare, category: "action" },
  updateDealStage:        { label: "Updating deal stage",   pastLabel: "Updated deal stage",  icon: TrendingUp,  category: "action" },
  completeTask:           { label: "Completing task",       pastLabel: "Completed task",      icon: CheckSquare, category: "action" },
  getDealCoaching:        { label: "Analyzing deal",        pastLabel: "Analyzed deal",       icon: BarChart3,   category: "analyze" },
  getAccountIntelligence: { label: "Analyzing account",     pastLabel: "Analyzed account",    icon: BarChart3,   category: "analyze" },
  draftEmail:             { label: "Drafting email",        pastLabel: "Drafted email",       icon: Mail,        category: "action" },
  generateMeetingPrep:    { label: "Preparing briefing",    pastLabel: "Prepared briefing",   icon: Calendar,    category: "analyze" },
  bulkUpdateDeals:        { label: "Updating deals",        pastLabel: "Updated deals",       icon: Layers,      category: "action" },
  bulkUpdateContacts:     { label: "Updating contacts",     pastLabel: "Updated contacts",    icon: Layers,      category: "action" },
  generateWorldModel:     { label: "Analyzing context",     pastLabel: "Analyzed context",    icon: Zap,         category: "analyze" },
  rememberContext:        { label: "Saving memory",         pastLabel: "Saved memory",        icon: Database,    category: "action" },
  recallMemories:         { label: "Recalling memories",    pastLabel: "Recalled memories",   icon: Database,    category: "retrieve" },
  exploreGraph:           { label: "Exploring graph",       pastLabel: "Explored graph",      icon: Zap,         category: "retrieve" },
  getMeetingNotes:        { label: "Retrieving notes",      pastLabel: "Retrieved notes",     icon: Calendar,    category: "retrieve" },
};

/** Human-readable description of the query args */
function describeQuery(toolName: string, args: Record<string, unknown>): string | null {
  const search = args.search as string | undefined;
  const query = args.query as string | undefined;
  const term = search || query;

  if (toolName === "searchCRM" && term) return `Semantic search: "${term}"`;
  if (toolName === "queryContacts") return term ? `Contacts matching "${term}"` : "All recent contacts";
  if (toolName === "queryAccounts") return term ? `Accounts matching "${term}"` : "All recent accounts";
  if (toolName === "queryDeals") {
    const stage = args.stage as string | undefined;
    if (term && stage) return `Deals matching "${term}" in ${stage} stage`;
    if (term) return `Deals matching "${term}"`;
    if (stage) return `Deals in ${stage} stage`;
    return "All active deals";
  }
  if (toolName === "queryActivities") {
    const entityType = args.entityType as string | undefined;
    const activityType = args.activityType as string | undefined;
    const parts: string[] = [];
    if (activityType) parts.push(activityType.replace(/_/g, " "));
    if (entityType) parts.push(`for ${entityType}`);
    return parts.length > 0 ? parts.join(" ") : "Recent activities";
  }
  if (toolName === "queryNotes") return term ? `Notes matching "${term}"` : "Recent notes";
  if (toolName === "queryTasks") return term ? `Tasks matching "${term}"` : "Pending tasks";
  if (toolName === "getDealCoaching") return "Deal context + risk assessment";
  if (toolName === "getAccountIntelligence") return "Account analysis + score breakdown";
  if (toolName === "generateMeetingPrep") return "Meeting briefing + context";
  return null;
}

/** Extract array data from result for table display */
function extractRecords(result: unknown): { records: Record<string, unknown>[]; label: string } | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  for (const [key, label] of [
    ["contacts", "contacts"], ["accounts", "accounts"], ["deals", "deals"],
    ["activities", "activities"], ["notes", "notes"], ["tasks", "tasks"], ["results", "results"],
  ] as [string, string][]) {
    if (Array.isArray(r[key]) && r[key].length > 0) {
      return { records: r[key] as Record<string, unknown>[], label };
    }
  }
  return null;
}

/** Pick best columns for a compact table view */
function pickColumns(records: Record<string, unknown>[], maxCols = 4): string[] {
  if (records.length === 0) return [];
  const allKeys = Object.keys(records[0]);
  // Prioritize human-readable columns, skip IDs and internal fields
  const priority = ["name", "firstName", "lastName", "email", "title", "domain", "stage", "value", "industry", "score", "status", "priority", "content", "summary", "subject", "type", "occurredAt", "dueDate"];
  const skip = new Set(["id", "tenantId", "companyId", "contactId", "entityId", "entityType", "createdAt", "updatedAt", "_sourceLink"]);

  const selected: string[] = [];
  for (const p of priority) {
    if (allKeys.includes(p) && !skip.has(p)) selected.push(p);
    if (selected.length >= maxCols) break;
  }
  // Fill remaining slots with non-skipped keys
  if (selected.length < maxCols) {
    for (const k of allKeys) {
      if (!skip.has(k) && !selected.includes(k)) selected.push(k);
      if (selected.length >= maxCols) break;
    }
  }
  return selected;
}

function formatColName(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "number") return val.toLocaleString();
  if (typeof val === "string" && val.length > 60) return val.slice(0, 57) + "...";
  return String(val);
}

export function ToolCallPanel({ toolName, args, result, isStreaming }: ToolCallPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const display = toolDisplayNames[toolName] || { label: toolName, pastLabel: toolName, icon: Search, category: "retrieve" as const };
  const Icon = display.icon;

  const resultSummary = isStreaming ? null : summarizeResult(toolName, result);
  const queryDesc = describeQuery(toolName, args);
  const tableData = !isStreaming ? extractRecords(result) : null;
  const columns = tableData ? pickColumns(tableData.records) : [];

  return (
    <div className="my-1">
      <button
        onClick={() => !isStreaming && setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[12px] transition-colors"
        style={{ color: "var(--color-text-tertiary)", cursor: isStreaming ? "default" : "pointer", background: "none", border: "none", padding: "2px 0" }}
      >
        {isStreaming ? (
          <span
            className="inline-block h-2 w-2 rounded-full animate-pulse"
            style={{ background: "var(--color-accent)" }}
          />
        ) : expanded ? (
          <ChevronDown size={12} />
        ) : (
          <ChevronRight size={12} />
        )}
        <Icon size={12} style={isStreaming ? { color: "var(--color-accent)" } : undefined} />
        <span style={{ fontWeight: 475 }}>
          {isStreaming ? display.label + "..." : display.pastLabel}
        </span>
        {resultSummary && (
          <span style={{ opacity: 0.6, fontWeight: 400 }}> — {resultSummary}</span>
        )}
        {!isStreaming && <Check size={11} style={{ color: "oklch(0.6 0.15 145)", marginLeft: 4 }} />}
      </button>

      {expanded && (
        <div
          className="mt-1 ml-5 overflow-hidden rounded-md"
          style={{
            border: "0.5px solid var(--color-border-default)",
            background: "var(--color-bg-surface)",
          }}
        >
          {/* Query description */}
          {queryDesc && (
            <div
              className="px-3 py-1.5 text-[11px]"
              style={{
                color: "var(--color-text-secondary)",
                borderBottom: "0.5px solid var(--color-border-default)",
                background: "var(--color-bg-muted)",
              }}
            >
              <span style={{ fontWeight: 550 }}>Query:</span> {queryDesc}
              {tableData && (
                <span style={{ marginLeft: 8, opacity: 0.6 }}>
                  {tableData.records.length} {tableData.label}
                </span>
              )}
            </div>
          )}

          {/* Data table for array results */}
          {tableData && columns.length > 0 ? (
            <div className="overflow-auto" style={{ maxHeight: 240 }}>
              <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-1.5 text-left"
                        style={{
                          fontWeight: 550,
                          color: "var(--color-text-tertiary)",
                          borderBottom: "0.5px solid var(--color-border-default)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatColName(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.records.map((record, i) => (
                    <tr
                      key={i}
                      style={{ borderBottom: i < tableData.records.length - 1 ? "0.5px solid var(--color-border-default)" : "none" }}
                    >
                      {columns.map((col) => (
                        <td
                          key={col}
                          className="px-3 py-1.5"
                          style={{
                            color: "var(--color-text-primary)",
                            fontWeight: 400,
                            whiteSpace: "nowrap",
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {formatCellValue(record[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Fallback: formatted key-value for non-array results */
            <div
              className="px-3 py-2 text-[11px]"
              style={{
                color: "var(--color-text-secondary)",
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {result && typeof result === "object" ? (
                <FormattedResult data={result as Record<string, unknown>} />
              ) : (
                <span style={{ opacity: 0.7 }}>No data</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Render a key-value result in a readable format */
function FormattedResult({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-1">
      {Object.entries(data).map(([key, value]) => {
        if (value === null || value === undefined) return null;
        // Skip internal fields
        if (key.startsWith("_")) return null;

        if (typeof value === "object" && !Array.isArray(value)) {
          return (
            <div key={key}>
              <span style={{ fontWeight: 550, color: "var(--color-text-tertiary)" }}>
                {formatColName(key)}:
              </span>
              <div className="ml-3 mt-0.5">
                <FormattedResult data={value as Record<string, unknown>} />
              </div>
            </div>
          );
        }

        return (
          <div key={key} className="flex gap-2">
            <span style={{ fontWeight: 550, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
              {formatColName(key)}:
            </span>
            <span style={{ color: "var(--color-text-primary)" }}>
              {formatCellValue(value)}
            </span>
          </div>
        );
      })}
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
  if (r.proposal) return "awaiting approval";
  if (r.created) return "created";
  if (r.updated) return "updated";
  if (r.completed) return "completed";
  if (r.bulkUpdated) return `${(r.bulkUpdated as { count: number }).count} updated`;
  if (r.meetingPrepData) return "briefing ready";
  if (r.deal) return "analysis ready";
  if (r.account) return "intelligence ready";
  if (r.emailDraft) return "draft ready";
  if (r.saved) return "saved";
  return null;
}

/** Wrapper for multiple tool calls — groups by category */
export function ToolCallGroup({ calls }: { calls: { toolName: string; args: Record<string, unknown>; result: unknown; isStreaming?: boolean }[] }) {
  if (calls.length === 0) return null;

  // Group consecutive calls by category
  const groups: { category: string; calls: typeof calls }[] = [];
  for (const call of calls) {
    const display = toolDisplayNames[call.toolName];
    const cat = display?.category || "retrieve";
    const last = groups[groups.length - 1];
    if (last && last.category === cat) {
      last.calls.push(call);
    } else {
      groups.push({ category: cat, calls: [call] });
    }
  }

  const categoryLabels: Record<string, { streaming: string; done: string; icon: typeof Search }> = {
    retrieve: { streaming: "Retrieving data", done: "Retrieved data", icon: Database },
    analyze: { streaming: "Analyzing data", done: "Analyzed data", icon: BarChart3 },
    action: { streaming: "Executing", done: "Actions", icon: Zap },
  };

  return (
    <div className="mb-2">
      {groups.map((group, gi) => {
        const catDisplay = categoryLabels[group.category] || categoryLabels.retrieve;
        const anyStreaming = group.calls.some((c) => c.isStreaming);
        const totalRecords = group.calls.reduce((sum, c) => {
          if (c.isStreaming || !c.result) return sum;
          const data = extractRecords(c.result);
          return sum + (data?.records.length || 0);
        }, 0);

        return (
          <div
            key={gi}
            className="my-1"
            style={{
              borderLeft: "2px solid var(--color-border-moderate)",
              paddingLeft: 8,
            }}
          >
            {/* Group header — only show if more than 1 call in group */}
            {group.calls.length > 1 && (
              <div
                className="mb-0.5 flex items-center gap-1.5 text-[11px]"
                style={{ color: "var(--color-text-muted)", fontWeight: 475 }}
              >
                <catDisplay.icon size={11} />
                <span>{anyStreaming ? catDisplay.streaming : catDisplay.done}</span>
                {totalRecords > 0 && (
                  <span style={{ opacity: 0.6 }}>({totalRecords} records)</span>
                )}
                {!anyStreaming && <Check size={10} style={{ color: "oklch(0.6 0.15 145)" }} />}
              </div>
            )}
            {group.calls.map((call, i) => (
              <ToolCallPanel
                key={i}
                toolName={call.toolName}
                args={call.args}
                result={call.result}
                isStreaming={call.isStreaming}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
