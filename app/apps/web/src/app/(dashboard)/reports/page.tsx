"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FileBarChart, TrendingUp, CalendarDays, Trophy, Loader2 } from "lucide-react";

interface ReportData {
  title: string;
  summary: string;
  sections: Array<{ heading: string; content: string }>;
  metrics: Array<{ label: string; value: string }>;
  recommendations: string[];
}

const reportTypes = [
  {
    type: "pipeline" as const,
    title: "Pipeline Report",
    description:
      "Executive overview of your pipeline health, key metrics, stalled deals, and risks.",
    icon: TrendingUp,
    badgeLabel: "Pipeline",
    badgeVariant: "info" as const,
  },
  {
    type: "weekly" as const,
    title: "Weekly Report",
    description:
      "Summary of the last 7 days: activities, deals created/won/lost, and priorities for next week.",
    icon: CalendarDays,
    badgeLabel: "Activity",
    badgeVariant: "success" as const,
  },
  {
    type: "winloss" as const,
    title: "Win/Loss Report",
    description:
      "Patterns in your won and lost deals with data-driven recommendations to improve close rates.",
    icon: Trophy,
    badgeLabel: "Analysis",
    badgeVariant: "warning" as const,
  },
];

export default function ReportsPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateReport(type: string) {
    setLoading(type);
    setError(null);
    setReport(null);

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to generate report (${res.status})`);
      }

      const data = await res.json();
      setReport(data.report);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<FileBarChart size={16} />}
        title="Reports"
        subtitle="AI-generated executive reports"
      />

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Report type cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reportTypes.map((rt) => {
            const Icon = rt.icon;
            const isLoading = loading === rt.type;
            return (
              <Card
                key={rt.type}
                interactive
                onClick={() => !loading && generateReport(rt.type)}
                className={loading && !isLoading ? "opacity-50 pointer-events-none" : ""}
              >
                <CardBody>
                  <div className="flex items-start justify-between">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-lg"
                      style={{ background: "var(--color-accent-soft)" }}
                    >
                      <Icon size={18} style={{ color: "var(--color-accent)" }} />
                    </div>
                    <Badge variant={rt.badgeVariant}>{rt.badgeLabel}</Badge>
                  </div>
                  <h3
                    className="mt-3 text-[14px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {rt.title}
                  </h3>
                  <p
                    className="mt-1 text-[12px] leading-relaxed"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {rt.description}
                  </p>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      loading={isLoading}
                      disabled={!!loading}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!loading) generateReport(rt.type);
                      }}
                    >
                      {isLoading ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <Loader2
              size={16}
              className="animate-spin"
              style={{ color: "var(--color-accent)" }}
            />
            <span
              className="text-[13px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Generating report... This may take a moment.
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <Card className="mt-6">
            <CardBody>
              <p className="text-[13px]" style={{ color: "var(--color-error)" }}>
                {error}
              </p>
            </CardBody>
          </Card>
        )}

        {/* Report display */}
        {report && !loading && (
          <div className="mt-8 space-y-6">
            {/* Title & summary */}
            <Card>
              <CardBody>
                <h2
                  className="text-[18px] font-bold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {report.title}
                </h2>
                <p
                  className="mt-2 text-[13px] leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {report.summary}
                </p>
              </CardBody>
            </Card>

            {/* Metrics grid */}
            {report.metrics.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {report.metrics.map((metric, i) => (
                  <Card key={i}>
                    <CardBody className="text-center">
                      <p
                        className="text-[11px] font-medium uppercase tracking-wider"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        {metric.label}
                      </p>
                      <p
                        className="mt-1 text-[20px] font-bold"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {metric.value}
                      </p>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}

            {/* Sections */}
            {report.sections.map((section, i) => (
              <Card key={i}>
                <CardBody>
                  <h3
                    className="text-[14px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {section.heading}
                  </h3>
                  <p
                    className="mt-2 whitespace-pre-line text-[13px] leading-relaxed"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {section.content}
                  </p>
                </CardBody>
              </Card>
            ))}

            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <Card>
                <CardBody>
                  <h3
                    className="text-[14px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Recommendations
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {report.recommendations.map((rec, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[13px] leading-relaxed"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: "var(--color-accent)" }}
                        />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
