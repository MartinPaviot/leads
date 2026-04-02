"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { EmailComposer } from "@/components/email-composer";
import { OnboardingWizard } from "@/components/onboarding-wizard";

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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingHasGoogle, setOnboardingHasGoogle] = useState(false);
  const [emailComposer, setEmailComposer] = useState<{
    to: string;
    subject: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    // Check onboarding status
    fetch("/api/onboarding/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.needsOnboarding) {
          setShowOnboarding(true);
          setOnboardingHasGoogle(data.hasGoogle);
        }
      })
      .catch(() => {});

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

  const priorityBorderColors: Record<string, string> = {
    critical: "var(--color-error)",
    high: "var(--color-warning)",
    medium: "var(--color-info)",
    low: "var(--color-text-tertiary)",
  };

  const prioritySoftBg: Record<string, string> = {
    critical: "var(--color-error-soft)",
    high: "var(--color-warning-soft)",
    medium: "var(--color-info-soft)",
    low: "var(--color-bg-muted)",
  };

  const priorityLabelColors: Record<string, string> = {
    critical: "var(--color-error)",
    high: "var(--color-warning)",
    medium: "var(--color-info)",
    low: "var(--color-text-tertiary)",
  };

  const severityBorderColors: Record<string, string> = {
    critical: "var(--color-error)",
    high: "var(--color-warning)",
    medium: "var(--color-info)",
    info: "var(--color-success)",
  };

  const severitySoftBg: Record<string, string> = {
    critical: "var(--color-error-soft)",
    high: "var(--color-warning-soft)",
    medium: "var(--color-info-soft)",
    info: "var(--color-success-soft)",
  };

  const ws = summary?.weekSummary;

  return (
    <div className="flex h-full flex-col">
      {/* Page Header Bar */}
      <div
        className="flex items-center gap-2 px-8"
        style={{
          height: "var(--header-height)",
          borderBottom: "0.5px solid var(--color-border-default)",
          background: "var(--color-bg-surface)",
        }}
      >
        <Clock
          size={14}
          style={{ color: "var(--color-text-secondary)" }}
        />
        <span
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Up next
        </span>
        <span
          className="text-sm"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {today}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {/* Greeting */}
        <div className="mb-2">
          <h1
            className="text-2xl font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {summary ? `${summary.greeting}, ${summary.firstName}` : "Welcome back"}
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {today}
          </p>
        </div>

        {/* Weekly Summary Banner */}
        {summary && (
          <div
            className="mt-4 rounded-md p-4"
            style={{
              background: "var(--color-bg-surface)",
              border: "0.5px solid var(--color-border-default)",
              borderRadius: "6px",
            }}
          >
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>{ws!.sequencesLaunched}</span>
                <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>sequences</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>{ws!.responsesReceived}</span>
                <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>responses</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>{ws!.meetingsBooked}</span>
                <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>meetings</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>{ws!.opportunitiesClosed}</span>
                <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>closed</span>
              </div>
            </div>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left Column — Actions (3/5 width) */}
          <div className="lg:col-span-3">
            <h2
              className="font-semibold uppercase tracking-wider"
              style={{
                fontSize: "11px",
                color: "var(--color-text-muted)",
                letterSpacing: "0.05em",
              }}
            >
              Your priorities today
            </h2>

            {loadingActions ? (
              <div className="mt-3 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-md p-4"
                    style={{
                      border: "0.5px solid var(--color-border-default)",
                      borderRadius: "6px",
                    }}
                  >
                    <div
                      className="skeleton h-4 w-3/4 rounded"
                    />
                    <div
                      className="skeleton mt-2 h-3 w-1/2 rounded"
                    />
                  </div>
                ))}
              </div>
            ) : actions.length > 0 ? (
              <div className="mt-3 space-y-2">
                {actions.slice(0, 5).map((action, i) => (
                  <div
                    key={i}
                    className={`rounded-md p-4 ${action.stalledDays && action.stalledDays >= 3 ? "cursor-pointer" : ""}`}
                    style={{
                      background: prioritySoftBg[action.priority] || "transparent",
                      border: "0.5px solid var(--color-border-default)",
                      borderLeft: `2px solid ${priorityBorderColors[action.priority] || "var(--color-border-default)"}`,
                      borderRadius: "6px",
                    }}
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
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {action.action}
                      </p>
                      <div className="flex items-center gap-2">
                        {action.stalledDays && action.stalledDays >= 3 && (
                          <span
                            className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{
                              background: "var(--color-error-soft)",
                              color: "var(--color-error)",
                            }}
                          >
                            Stalled {action.stalledDays}d
                          </span>
                        )}
                        <span
                          className="whitespace-nowrap text-[10px] font-semibold uppercase"
                          style={{
                            color: priorityLabelColors[action.priority] || "var(--color-text-tertiary)",
                          }}
                        >
                          {action.priority}
                        </span>
                      </div>
                    </div>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {action.why}
                    </p>
                    {action.dealName && (
                      <div className="mt-1 flex items-center justify-between">
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-accent)" }}
                        >
                          {action.dealName}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEmailComposer({
                              to: "",
                              subject: `Following up — ${action.dealName}`,
                              body: `Hi,\n\n${action.action}\n\n${action.why}\n\nWould you have time for a quick call this week?\n\nBest regards`,
                            });
                          }}
                          className="text-[10px] hover:underline"
                          style={{ color: "var(--color-accent)" }}
                        >
                          ✉️ Draft email
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {actions.length > 5 && (
                  <button
                    className="w-full rounded-md p-2 text-xs"
                    style={{
                      border: "0.5px solid var(--color-border-default)",
                      borderRadius: "6px",
                      color: "var(--color-text-tertiary)",
                      background: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg-muted)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                  >
                    Show {actions.length - 5} more
                  </button>
                )}
              </div>
            ) : (
              <p
                className="mt-3 text-sm"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                No actions right now. Your pipeline is clear.
              </p>
            )}

            {/* Insights */}
            {insights.length > 0 && (
              <div className="mt-6">
                <h2
                  className="font-semibold uppercase tracking-wider"
                  style={{
                    fontSize: "11px",
                    color: "var(--color-text-muted)",
                    letterSpacing: "0.05em",
                  }}
                >
                  Insights
                </h2>
                <div className="mt-3 space-y-2">
                  {insights.slice(0, 3).map((insight) => (
                    <div
                      key={insight.id}
                      className="rounded-md p-3"
                      style={{
                        background: severitySoftBg[insight.severity] || "transparent",
                        border: "0.5px solid var(--color-border-default)",
                        borderLeft: `2px solid ${severityBorderColors[insight.severity] || "var(--color-border-default)"}`,
                        borderRadius: "6px",
                      }}
                    >
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {insight.title}
                      </p>
                      <p
                        className="mt-0.5 text-xs"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        {insight.description}
                      </p>
                      <p
                        className="mt-1 text-xs"
                        style={{ color: "var(--color-accent)" }}
                      >
                        {insight.suggestedAction}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column — Schedule (2/5 width) */}
          <div className="lg:col-span-2">
            {/* Today's Meetings */}
            <div>
              <h2
                className="font-semibold uppercase tracking-wider"
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.05em",
                }}
              >
                Today&apos;s meetings
              </h2>
              {loadingSummary ? (
                <div
                  className="mt-3 rounded-md p-3"
                  style={{
                    border: "0.5px solid var(--color-border-default)",
                    borderRadius: "6px",
                  }}
                >
                  <div className="skeleton h-4 w-1/2 rounded" />
                </div>
              ) : summary && summary.todayMeetings.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.todayMeetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className="rounded-md p-3"
                      style={{
                        border: "0.5px solid var(--color-border-default)",
                        borderRadius: "6px",
                        background: "var(--color-bg-surface)",
                      }}
                    >
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {meeting.title}
                      </p>
                      <p
                        className="mt-0.5 text-xs"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        {meeting.time}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  className="mt-3 text-sm"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  No meetings today
                </p>
              )}
            </div>

            {/* Today's Tasks */}
            <div className="mt-6">
              <h2
                className="font-semibold uppercase tracking-wider"
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.05em",
                }}
              >
                Tasks due
              </h2>
              {loadingSummary ? (
                <div
                  className="mt-3 rounded-md p-3"
                  style={{
                    border: "0.5px solid var(--color-border-default)",
                    borderRadius: "6px",
                  }}
                >
                  <div className="skeleton h-4 w-1/2 rounded" />
                </div>
              ) : summary && summary.todayTasks.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.todayTasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-md p-3"
                      style={{
                        border: "0.5px solid var(--color-border-default)",
                        borderRadius: "6px",
                        background: "var(--color-bg-surface)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className="text-sm font-medium"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {task.title}
                        </p>
                        {task.overdue && (
                          <span
                            className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{
                              background: "var(--color-error-soft)",
                              color: "var(--color-error)",
                            }}
                          >
                            Overdue
                          </span>
                        )}
                      </div>
                      {task.account && (
                        <p
                          className="mt-0.5 text-xs"
                          style={{ color: "var(--color-accent)" }}
                        >
                          {task.account}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  className="mt-3 text-sm"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  No tasks due today
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Chat Bar */}
      <div
        className="p-4"
        style={{ borderTop: "0.5px solid var(--color-border-default)" }}
      >
        <Link
          href="/chat"
          className="flex w-full items-center rounded-md px-4 py-2.5 text-sm transition-colors"
          style={{
            border: "0.5px solid var(--color-border-default)",
            borderRadius: "6px",
            background: "var(--color-bg-surface)",
            color: "var(--color-text-tertiary)",
          }}
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

      {showOnboarding && (
        <OnboardingWizard
          hasGoogle={onboardingHasGoogle}
          onComplete={() => {
            setShowOnboarding(false);
            // Reload dashboard data
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
