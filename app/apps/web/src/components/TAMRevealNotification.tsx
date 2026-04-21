"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";

/**
 * WS-4 async TAM reveal notification.
 *
 * Replaces v1's blocking `building` step. The v2 wrapper fires TAM
 * build fire-and-forget on confirmation; this component surfaces the
 * live progress on the dashboard itself, so the user can start
 * browsing warm leads / chat while Apollo churns in the background.
 *
 * Data source: polls `/api/tam` GET (returns totalCompanies) every
 * 3 s until the count stops increasing for 2 consecutive polls OR
 * reaches a nonzero value after being zero for a minimum window.
 *
 * Why polling vs SSE: the existing `/api/tam/build` stream endpoint
 * Martin shipped is richer, but hooking the full event dispatcher
 * into this notification is a follow-up. For the brief's async
 * exit condition, a 3-second poll is sufficient — the user sees
 * the count tick up and the notification resolves to "N companies
 * ready" on completion.
 */

interface TamCount {
  totalCompanies: number;
  tamCompanies: number;
  apolloEnriched: number;
}

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 60; // 3 min max
const STABLE_POLLS_TO_CONCLUDE = 2;

export function TAMRevealNotification() {
  const [count, setCount] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const stableCountRef = useRef(0);
  const lastSeenRef = useRef<number | null>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/tam", { method: "GET" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TamCount;
        const n = data.totalCompanies ?? 0;
        setCount(n);

        if (lastSeenRef.current === n && n > 0) {
          stableCountRef.current += 1;
        } else {
          stableCountRef.current = 0;
        }
        lastSeenRef.current = n;

        if (
          stableCountRef.current >= STABLE_POLLS_TO_CONCLUDE ||
          pollCountRef.current >= MAX_POLLS
        ) {
          setDone(true);
          return;
        }

        pollCountRef.current += 1;
        setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch {
        // Poll failures are silent — we'll retry on the next tick.
        if (!cancelled) setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, []);

  // Hide completely once the build is done AND the user has had a
  // moment to see the final count. The parent controls the banner's
  // lifecycle by re-mounting or dismissing based on its own state.
  if (done && count && count > 0) {
    return (
      <Card
        style={{
          border: "1px solid var(--color-accent)",
          background: "var(--color-accent-soft)",
        }}
      >
        <CardBody>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} style={{ color: "rgb(22,163,74)" }} />
            <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              Your pipeline is ready — {count} companies found
            </div>
          </div>
          <div className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            <a href="/accounts?sort=score&dir=desc" style={{ color: "var(--color-accent)" }}>
              Review top accounts →
            </a>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (done) {
    // Build ended but no companies found — graceful fallback.
    return (
      <Card>
        <CardBody>
          <div className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Your TAM build finished but didn&apos;t return companies. Retry from{" "}
            <a href="/settings/icp" style={{ color: "var(--color-accent)" }}>
              Settings → ICP
            </a>{" "}
            with broader criteria.
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-accent)" }} />
          <div className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            Building your pipeline…
          </div>
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          <Sparkles size={10} style={{ display: "inline", marginRight: 4 }} />
          {count === null
            ? "Searching Apollo for companies matching your criteria"
            : `${count.toLocaleString()} companies so far`}
        </div>
      </CardBody>
    </Card>
  );
}
