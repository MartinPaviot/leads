"use client";

/**
 * Pilae dogfood dashboard (D, _specs/pilae-machine R11.1).
 *
 * Three panels:
 *   1. Bookings — projet + plateforme NEVER blended, plus the legacy
 *      single-bag total surfaced separately so old deals don't hide.
 *   2. Funnel — deal count by stage with a horizontal bar.
 *   3. Deep-dive capacity — Paul's goulot state from the B7 weekly cron.
 *
 * Anti-ARR (R11.3): the page header and the totals card use "Bookings"
 * throughout. "Platform ARR" appears only as the sub-category label,
 * which is the actual field name (the recurring-revenue split), not
 * a reporting total. The DoD test enforces this by source-grep;
 * this page participates by never mixing $N + " ARR" in a headline.
 */

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { formatDealAmount } from "@/lib/deals/amount";
import { AlertTriangle, CheckCircle2, Circle, Target } from "lucide-react";

type PilaeData = {
  funnel: Array<{ stage: string; count: number }>;
  bookings: Array<{
    stage: string;
    projectBookings: number;
    platformArr: number;
    totalBookings: number;
    dealCount: number;
  }>;
  deepDive: {
    count: number;
    cap: number;
    level: "ok" | "tight" | "saturated";
    weekStart: string;
    weekEnd: string;
    computedAt: string;
  } | null;
  label: string;
};

const POLL_MS = 60_000;
const BOOKINGS_TARGET_CENTS = 100_000_000; // 1 000 000 € target (in cents)

export default function PilaeDashboardPage() {
  const [data, setData] = useState<PilaeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/pilae");
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Pilae bookings"
        subtitle="Dogfood track — funnel, bookings split, deep-dive capacity. Polls every 60s."
      />
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div
            className="mb-4 rounded border p-3 text-[12px]"
            style={{
              borderColor: "var(--color-error)",
              color: "var(--color-error)",
              background: "var(--color-bg-card)",
            }}
          >
            {error}
          </div>
        )}
        {data && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BookingsPanel bookings={data.bookings} />
            <FunnelPanel funnel={data.funnel} />
            <CapacityPanel deepDive={data.deepDive} />
          </div>
        )}
        {!data && loading && (
          <p
            className="text-[12px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Loading…
          </p>
        )}
      </div>
    </div>
  );
}

function BookingsPanel({
  bookings,
}: {
  bookings: PilaeData["bookings"];
}) {
  // Sum across stages keeping project and platform addressable so a
  // future panel can break them down further. NEVER silently blend.
  const projectTotal = bookings.reduce(
    (acc, b) => acc + b.projectBookings,
    0,
  );
  const platformTotal = bookings.reduce(
    (acc, b) => acc + b.platformArr,
    0,
  );
  // Legacy-bag bookings: contribute to "Bookings" total but called
  // out separately so the founder can chase deals that haven't been
  // re-tagged into the split.
  const legacyTotal =
    bookings.reduce((acc, b) => acc + b.totalBookings, 0) -
    projectTotal -
    platformTotal;
  const totalBookings = projectTotal + platformTotal + legacyTotal;
  const pctOfTarget = Math.min(
    100,
    Math.round((totalBookings / BOOKINGS_TARGET_CENTS) * 100),
  );

  return (
    <Card>
      <CardBody>
        <h3
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Bookings vs target
        </h3>
        <p
          className="mt-1 text-2xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {formatDealAmount(totalBookings)}
        </p>
        <p
          className="text-[11px]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {pctOfTarget}% of 1 M€ — never blended with ARR in reporting
        </p>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-bg-card)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pctOfTarget}%`,
              background: "var(--color-accent)",
            }}
          />
        </div>
        <div className="mt-4 space-y-2">
          <Row label="Project bookings" amount={projectTotal} />
          <Row label="Platform ARR (sub-category)" amount={platformTotal} />
          {legacyTotal > 0 && (
            <Row
              label="Legacy untagged (re-split needed)"
              amount={legacyTotal}
              muted
            />
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function Row({
  label,
  amount,
  muted,
}: {
  label: string;
  amount: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span
        style={{
          color: muted
            ? "var(--color-text-tertiary)"
            : "var(--color-text-secondary)",
        }}
      >
        {label}
      </span>
      <span
        className="font-medium"
        style={{
          color: muted
            ? "var(--color-text-tertiary)"
            : "var(--color-text-primary)",
        }}
      >
        {formatDealAmount(amount)}
      </span>
    </div>
  );
}

function FunnelPanel({
  funnel,
}: {
  funnel: PilaeData["funnel"];
}) {
  const max = funnel.reduce((acc, f) => Math.max(acc, f.count), 0);
  const total = funnel.reduce((acc, f) => acc + f.count, 0);

  return (
    <Card>
      <CardBody>
        <h3
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Funnel by stage
        </h3>
        <p
          className="mt-1 text-2xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {total}
        </p>
        <p
          className="text-[11px]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          deals across all stages
        </p>
        <div className="mt-4 space-y-2">
          {funnel.map((f) => (
            <div key={f.stage}>
              <div className="flex items-center justify-between text-[12px]">
                <span
                  className="capitalize"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {f.stage.replace(/_/g, " ")}
                </span>
                <span style={{ color: "var(--color-text-primary)" }}>
                  {f.count}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: "var(--color-bg-card)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${max > 0 ? (f.count / max) * 100 : 0}%`,
                    background: "var(--color-accent)",
                  }}
                />
              </div>
            </div>
          ))}
          {funnel.length === 0 && (
            <p
              className="text-[12px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              No deals yet.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function CapacityPanel({
  deepDive,
}: {
  deepDive: PilaeData["deepDive"];
}) {
  if (!deepDive) {
    return (
      <Card>
        <CardBody>
          <h3
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Deep-dive capacity (Paul)
          </h3>
          <div
            className="mt-4 flex items-center gap-2 text-[12px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <Circle size={14} />
            <span>No snapshot yet — capacity cron runs Monday 00:30 UTC.</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  const { count, cap, level } = deepDive;
  const pct = cap > 0 ? Math.round((count / cap) * 100) : 100;
  const color =
    level === "saturated"
      ? "var(--color-error)"
      : level === "tight"
        ? "var(--color-warning)"
        : "var(--color-success)";
  const Icon =
    level === "saturated"
      ? AlertTriangle
      : level === "tight"
        ? Target
        : CheckCircle2;
  const label =
    level === "saturated"
      ? "Goulot Paul saturé"
      : level === "tight"
        ? "Tight — booking with caution"
        : "Headroom available";

  return (
    <Card>
      <CardBody>
        <h3
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Deep-dive capacity (Paul)
        </h3>
        <p
          className="mt-1 text-2xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {count}
          <span
            className="text-base font-normal"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {" "}
            / {cap}
          </span>
        </p>
        <p
          className="text-[11px]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          this week
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Icon size={14} style={{ color }} />
          <span
            className="text-[12px] font-medium"
            style={{ color }}
          >
            {label}
          </span>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-bg-card)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: color,
            }}
          />
        </div>
      </CardBody>
    </Card>
  );
}
