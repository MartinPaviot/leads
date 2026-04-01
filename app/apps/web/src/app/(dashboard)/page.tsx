"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { EmailComposer } from "@/components/email-composer";

interface Action {
  action: string;
  why: string;
  dealName: string | null;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  stalledDays?: number;
}

interface Insight {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "info";
  category: "alert" | "trend" | "pattern" | "opportunity";
  suggestedAction: string;
}

interface DashboardSummary {
  greeting: string;
  firstName: string;
  weekSummary: {
    sequencesLaunched: number;
    responsesReceived: number;
    meetingsBooked: number;
    opportunitiesClosed: number;
  };
  todayTasks: Array<{
    id: string;
    title: string;
    dueDate: string | null;
    priority: string;
    account: string | null;
    overdue: boolean;
  }>;
  todayMeetings: Array<{
    id: string;
    title: string;
    time: string;
  }>;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingActions, setLoadingActions] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [emailComposer, setEmailComposer] = useState<{
    to: string;
    subject: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    // Load summary
    fetch("/api/dashboard/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSummary(data))
      .catch(() => {})
      .finally(() => setLoadingSummary(false));

    // Load actions automatically
    fetch("/api/actions")
      .then((res) => (res.ok ? res.json() : { actions: [] }))
      .then((data) => setActions(data.actions || []))
      .catch(() => {})
      .finally(() => setLoadingActions(false));

    // Load insights
    fetch("/api/insights")
      .then((res) => (res.ok ? res.json() : { insights: [] }))
      .then((data) => setInsights(data.insights || []))
      .catch(() => {});
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const priorityColors: Record<string, string> = {
    critical: "border-l-red-500 bg-red-500/5",
    high: "border-l-amber-500 bg-amber-500/5",
    medium: "border-l-blue-500 bg-blue-500/5",
    low: "border-l-[#5a5a70] bg-[#1e1f2a]/30",
  };

  const priorityLabels: Record<string, string> = {
    critical: "text-red-400",
    high: "text-amber-400",
    medium: "text-blue-400",
    low: "text-[#5a5a70]",
  };

  const ws = summary?.weekSummary;
  const hasActivity = ws && (ws.sequencesLaunched + ws.responsesReceived + ws.meetingsBooked + ws.opportunitiesClosed > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-8">
        {/* Greeting */}
        <div className="mb-2">
          <h1 className="text-2xl font-semibold text-[#e8e8ed]">
            {summary ? `${summary.greeting}, ${summary.firstName}` : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-[#5a5a70]">{today}</p>
        </div>

        {/* Weekly Summary Banner */}
        {summary && (
          <div className="mt-4 rounded-lg border border-[#1e1f2a] bg-[#12131a] p-4">
            {hasActivity ? (
              <p className="text-sm text-[#8b8ba0]">
                This week, you&apos;ve launched{" "}
                <span className="font-semibold text-[#e8e8ed]">{ws!.sequencesLaunched} sequences</span>,
                received{" "}
                <span className="font-semibold text-[#e8e8ed]">{ws!.responsesReceived} responses</span>,
                booked{" "}
                <span className="font-semibold text-[#e8e8ed]">{ws!.meetingsBooked} meetings</span>,
                and closed{" "}
                <span className="font-semibold text-[#e8e8ed]">{ws!.opportunitiesClosed} opportunities</span>.
              </p>
            ) : (
              <p className="text-sm text-[#5a5a70]">
                No activity this week yet. Let&apos;s change that.
              </p>
            )}
          </div>
        )}

        {/* Two Column Layout */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left Column — Actions (3/5 width) */}
          <div className="lg:col-span-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
              Your priorities today
            </h2>

            {loadingActions ? (
              <div className="mt-3 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-lg border border-[#1e1f2a] p-4">
                    <div className="h-4 w-3/4 rounded bg-[#1e1f2a]" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-[#1e1f2a]" />
                  </div>
                ))}
              </div>
            ) : actions.length > 0 ? (
              <div className="mt-3 space-y-2">
                {actions.slice(0, 5).map((action, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border border-[#1e1f2a] border-l-2 p-4 ${priorityColors[action.priority] || ""} ${action.stalledDays && action.stalledDays >= 3 ? "cursor-pointer hover:border-[#6366f1]/50" : ""}`}
                    onClick={() => {
                      if (action.stalledDays && action.stalledDays >= 3 && action.dealName) {
                        setEmailComposer({
                          to: "",
                          subject: `Following up — ${action.dealName}`,
                          body: `Hi,\n\nI wanted to follow up on our conversation about ${action.dealName}. ${action.why}\n\nWould you have time for a quick call this week?\n\nBest regards`,
                        });
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-[#e8e8ed]">{action.action}</p>
                      <div className="flex items-center gap-2">
                        {action.stalledDays && action.stalledDays >= 3 && (
                          <span className="whitespace-nowrap rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                            Stalled {action.stalledDays}d
                          </span>
                        )}
                        <span className={`whitespace-nowrap text-[10px] font-semibold uppercase ${priorityLabels[action.priority] || ""}`}>
                          {action.priority}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-[#5a5a70]">{action.why}</p>
                    {action.dealName && (
                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-xs text-[#6366f1]">{action.dealName}</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEmailComposer({
                              to: "",
                              subject: `Following up — ${action.dealName}`,
                              body: `Hi,\n\n${action.action}\n\n${action.why}\n\nWould you have time for a quick call this week?\n\nBest regards`,
                            });
                          }}
                          className="text-[10px] text-[#6366f1] hover:underline"
                        >
                          ✉️ Draft email
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {actions.length > 5 && (
                  <button className="w-full rounded-lg border border-[#1e1f2a] p-2 text-xs text-[#5a5a70] hover:bg-[#1e1f2a]">
                    Show {actions.length - 5} more
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#5a5a70]">
                No actions right now. Your pipeline is clear.
              </p>
            )}

            {/* Insights */}
            {insights.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
                  Insights
                </h2>
                <div className="mt-3 space-y-2">
                  {insights.slice(0, 3).map((insight) => {
                    const severityStyles: Record<string, string> = {
                      critical: "border-l-red-500 bg-red-500/5",
                      high: "border-l-amber-500 bg-amber-500/5",
                      medium: "border-l-blue-500 bg-blue-500/5",
                      info: "border-l-emerald-500 bg-emerald-500/5",
                    };
                    return (
                      <div
                        key={insight.id}
                        className={`rounded-lg border border-[#1e1f2a] border-l-2 p-3 ${severityStyles[insight.severity] || ""}`}
                      >
                        <p className="text-sm font-medium text-[#e8e8ed]">{insight.title}</p>
                        <p className="mt-0.5 text-xs text-[#5a5a70]">{insight.description}</p>
                        <p className="mt-1 text-xs text-[#6366f1]">{insight.suggestedAction}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column — Schedule (2/5 width) */}
          <div className="lg:col-span-2">
            {/* Today's Meetings */}
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
                Today&apos;s meetings
              </h2>
              {loadingSummary ? (
                <div className="mt-3 animate-pulse rounded-lg border border-[#1e1f2a] p-3">
                  <div className="h-4 w-1/2 rounded bg-[#1e1f2a]" />
                </div>
              ) : summary && summary.todayMeetings.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.todayMeetings.map((meeting) => (
                    <div key={meeting.id} className="rounded-lg border border-[#1e1f2a] p-3">
                      <p className="text-sm font-medium text-[#e8e8ed]">{meeting.title}</p>
                      <p className="mt-0.5 text-xs text-[#5a5a70]">{meeting.time}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#5a5a70]">No meetings today</p>
              )}
            </div>

            {/* Today's Tasks */}
            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
                Tasks due
              </h2>
              {loadingSummary ? (
                <div className="mt-3 animate-pulse rounded-lg border border-[#1e1f2a] p-3">
                  <div className="h-4 w-1/2 rounded bg-[#1e1f2a]" />
                </div>
              ) : summary && summary.todayTasks.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.todayTasks.map((task) => (
                    <div key={task.id} className="rounded-lg border border-[#1e1f2a] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-[#e8e8ed]">{task.title}</p>
                        {task.overdue && (
                          <span className="whitespace-nowrap rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                            Overdue
                          </span>
                        )}
                      </div>
                      {task.account && (
                        <p className="mt-0.5 text-xs text-[#6366f1]">{task.account}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#5a5a70]">No tasks due today</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Chat Bar */}
      <div className="border-t border-[#1e1f2a] p-4">
        <Link
          href="/chat"
          className="flex w-full items-center rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-2.5 text-sm text-[#5a5a70] hover:border-[#6366f1]"
        >
          Ask LeadSens...
        </Link>
      </div>

      {emailComposer && (
        <EmailComposer
          to={emailComposer.to}
          subject={emailComposer.subject}
          body={emailComposer.body}
          onClose={() => setEmailComposer(null)}
        />
      )}
    </div>
  );
}
