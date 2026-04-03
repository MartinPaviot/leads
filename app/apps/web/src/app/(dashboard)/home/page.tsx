"use client";

import { useState, useEffect } from "react";
import { Clock, Calendar, CheckSquare, Zap, MessageSquare, TrendingUp } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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
  role: string | null;
  challenge: string | null;
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

const priorityVariants: Record<string, "error" | "warning" | "info" | "neutral"> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "neutral",
};

const severityVariants: Record<string, "error" | "warning" | "info" | "success"> = {
  critical: "error",
  high: "warning",
  medium: "info",
  info: "success",
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingActions, setLoadingActions] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingHasGoogle, setOnboardingHasGoogle] = useState(false);
  const [onboardingEmail, setOnboardingEmail] = useState<string | undefined>();
  const [emailComposer, setEmailComposer] = useState<{
    to: string;
    subject: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.needsOnboarding) {
          setShowOnboarding(true);
          setOnboardingHasGoogle(data.hasGoogle || data.hasMicrosoft || false);
          setOnboardingEmail(data.email);
        }
      })
      .catch(() => {});

    fetch("/api/dashboard/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSummary(data))
      .catch(() => {})
      .finally(() => setLoadingSummary(false));

    fetch("/api/actions")
      .then((res) => (res.ok ? res.json() : { actions: [] }))
      .then((data) => setActions(data.actions || []))
      .catch(() => {})
      .finally(() => setLoadingActions(false));

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

  const ws = summary?.weekSummary;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Clock size={15} />} title="Up next" subtitle={today} />

      <div className="flex-1 overflow-auto p-6">
        {/* Greeting */}
        <div className="mb-1">
          <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            {summary ? `${summary.greeting}, ${summary.firstName}` : "Welcome back"}
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            {summary?.challenge === "Finding the right leads"
              ? "Let\u2019s find your next best prospects."
              : summary?.challenge === "Getting responses"
                ? "Let\u2019s get more replies today."
                : summary?.challenge === "Closing deals"
                  ? "Let\u2019s move your deals forward."
                  : summary?.challenge === "Expanding accounts"
                    ? "Let\u2019s grow your accounts."
                    : today}
          </p>
        </div>

        {/* Weekly Summary */}
        {summary && (
          <Card className="mt-4">
            <CardBody>
              <div className="flex items-center gap-8">
                {[
                  { value: ws!.sequencesLaunched, label: "sequences", icon: <Zap size={14} /> },
                  { value: ws!.responsesReceived, label: "responses", icon: <MessageSquare size={14} /> },
                  { value: ws!.meetingsBooked, label: "meetings", icon: <Calendar size={14} /> },
                  { value: ws!.opportunitiesClosed, label: "closed", icon: <TrendingUp size={14} /> },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center gap-2">
                    <span style={{ color: "var(--color-text-tertiary)" }}>{stat.icon}</span>
                    <span className="text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>{stat.value}</span>
                    <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>{stat.label}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Two Column Layout */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left — Actions */}
          <div className="lg:col-span-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
              Your priorities today
            </h2>

            {loadingActions ? (
              <div className="mt-3 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardBody>
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="mt-2 h-3 w-1/2" />
                    </CardBody>
                  </Card>
                ))}
              </div>
            ) : actions.length > 0 ? (
              <div className="mt-3 space-y-2">
                {actions.slice(0, 5).map((action, i) => (
                  <Card
                    key={i}
                    interactive={!!(action.stalledDays && action.stalledDays >= 3)}
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
                    <CardBody className="!py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {action.action}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {action.stalledDays && action.stalledDays >= 3 && (
                            <Badge variant="error" size="sm">Stalled {action.stalledDays}d</Badge>
                          )}
                          <Badge variant={priorityVariants[action.priority] || "neutral"} size="sm">
                            {action.priority}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {action.why}
                      </p>
                      {action.dealName && (
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>
                            {action.dealName}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEmailComposer({
                                to: "",
                                subject: `Following up — ${action.dealName}`,
                                body: `Hi,\n\n${action.action}\n\n${action.why}\n\nWould you have time for a quick call this week?\n\nBest regards`,
                              });
                            }}
                            className="text-[11px] font-medium hover:underline"
                            style={{ color: "var(--color-accent)" }}
                          >
                            Draft email
                          </button>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                No actions right now. Your pipeline is clear.
              </p>
            )}

            {/* Insights */}
            {insights.length > 0 && (
              <div className="mt-6">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  Insights
                </h2>
                <div className="mt-3 space-y-2">
                  {insights.slice(0, 3).map((insight) => (
                    <Card key={insight.id}>
                      <CardBody className="!py-3">
                        <div className="flex items-start gap-2">
                          <Badge variant={severityVariants[insight.severity] || "info"} size="sm">
                            {insight.severity}
                          </Badge>
                          <div>
                            <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                              {insight.title}
                            </p>
                            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                              {insight.description}
                            </p>
                            <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>
                              {insight.suggestedAction}
                            </p>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right — Schedule */}
          <div className="lg:col-span-2">
            {/* Today's Meetings */}
            <div>
              <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                Today&apos;s meetings
              </h2>
              {loadingSummary ? (
                <Card className="mt-3">
                  <CardBody><Skeleton className="h-4 w-1/2" /></CardBody>
                </Card>
              ) : summary && summary.todayMeetings.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.todayMeetings.map((meeting) => (
                    <Card key={meeting.id}>
                      <CardBody className="!py-3">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} style={{ color: "var(--color-text-tertiary)" }} />
                          <div>
                            <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                              {meeting.title}
                            </p>
                            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                              {meeting.time}
                            </p>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                  No meetings today
                </p>
              )}
            </div>

            {/* Today's Tasks */}
            <div className="mt-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                Tasks due
              </h2>
              {loadingSummary ? (
                <Card className="mt-3">
                  <CardBody><Skeleton className="h-4 w-1/2" /></CardBody>
                </Card>
              ) : summary && summary.todayTasks.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.todayTasks.map((task) => (
                    <Card key={task.id}>
                      <CardBody className="!py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <CheckSquare size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
                            <div>
                              <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                                {task.title}
                              </p>
                              {task.account && (
                                <p className="text-[12px]" style={{ color: "var(--color-accent)" }}>
                                  {task.account}
                                </p>
                              )}
                            </div>
                          </div>
                          {task.overdue && <Badge variant="error" size="sm">Overdue</Badge>}
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                  No tasks due today
                </p>
              )}
            </div>
          </div>
        </div>
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
          userEmail={onboardingEmail}
          onComplete={() => {
            setShowOnboarding(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
