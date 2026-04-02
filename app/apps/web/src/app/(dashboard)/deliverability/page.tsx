"use client";

import { useState, useEffect } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

interface DeliverabilityData {
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  totalBounced: number;
  spamComplaints: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
  spamRate: number;
  healthScore: number;
  healthLabel: string;
  warnings: string[];
  enrollmentsByStatus: Record<string, number>;
}

export default function DeliverabilityPage() {
  const [data, setData] = useState<DeliverabilityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deliverability")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function getHealthColor(label: string) {
    if (label === "excellent") return "text-emerald-400";
    if (label === "good") return "text-blue-400";
    if (label === "fair") return "text-amber-400";
    return "text-red-400";
  }

  function getHealthBadgeVariant(label: string): "success" | "warning" | "error" | "info" {
    if (label === "excellent") return "success";
    if (label === "good") return "info";
    if (label === "fair") return "warning";
    return "error";
  }

  function getRateColor(rate: number, goodThreshold: number, badThreshold: number, inverse = false) {
    if (inverse) {
      if (rate <= goodThreshold) return "text-emerald-400";
      if (rate <= badThreshold) return "text-amber-400";
      return "text-red-400";
    }
    if (rate >= goodThreshold) return "text-emerald-400";
    if (rate >= badThreshold) return "text-amber-400";
    return "text-red-400";
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Deliverability" subtitle="Email sending health and monitoring" />
        <div className="p-6">
          <p className="text-sm text-[var(--color-text-tertiary)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Deliverability" subtitle="Email sending health and monitoring" />
        <div className="p-6">
          <p className="text-sm text-[var(--color-text-tertiary)]">Failed to load deliverability data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Deliverability" subtitle="Email sending health and monitoring">
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Health Score</p>
            <p className={`text-2xl font-bold ${getHealthColor(data.healthLabel)}`}>
              {data.healthScore}
            </p>
          </div>
          <Badge variant={getHealthBadgeVariant(data.healthLabel)} size="md">
            {data.healthLabel.toUpperCase()}
          </Badge>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        {/* Warnings */}
        {data.warnings.length > 0 && (
          <div className="space-y-2">
            {data.warnings.map((w, i) => (
              <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
                {w}
              </div>
            ))}
          </div>
        )}

        {/* KPI Grid */}
        <div className={`${data.warnings.length > 0 ? "mt-6" : ""} grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3`}>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Sent</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">{data.totalSent}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Open Rate</p>
              <p className={`mt-1 text-2xl font-semibold ${getRateColor(data.openRate, 30, 15)}`}>
                {data.openRate}%
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Reply Rate</p>
              <p className={`mt-1 text-2xl font-semibold ${getRateColor(data.replyRate, 5, 2)}`}>
                {data.replyRate}%
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Bounce Rate</p>
              <p className={`mt-1 text-2xl font-semibold ${getRateColor(data.bounceRate, 2, 5, true)}`}>
                {data.bounceRate}%
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Spam Rate</p>
              <p className={`mt-1 text-2xl font-semibold ${getRateColor(data.spamRate, 0.05, 0.1, true)}`}>
                {data.spamRate}%
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Replied</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">{data.totalReplied}</p>
            </CardBody>
          </Card>
        </div>

        {/* Enrollment Status */}
        {Object.keys(data.enrollmentsByStatus).length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Sequence Enrollments
            </h2>
            <div className="mt-3 flex gap-3 flex-wrap">
              {Object.entries(data.enrollmentsByStatus).map(([status, count]) => (
                <Card key={status}>
                  <div className="px-4 py-2">
                    <span className="text-xs text-[var(--color-text-tertiary)] capitalize">{status}</span>
                    <span className="ml-2 text-sm font-semibold text-[var(--color-text-primary)]">{count}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {data.totalSent === 0 && (
          <div className="mt-8 flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-[var(--color-text-tertiary)]">No emails sent yet</p>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                Start sending sequences to see deliverability metrics.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
