"use client";

/**
 * AutonomyNudgeBanner — surfaces the progressive-autonomy nudge the
 * trust-score engine has already earned but that nothing rendered.
 *
 * The backend (lib/guardrails/trust-score.ts) raises the tenant's trust
 * score on every clean approval and, past a threshold, computes an offer
 * to relax the approval mode (review-each → batch-daily → auto-high-
 * confidence). `GET /api/nudges/autonomy` returns that offer; until now
 * no client polled it, so the earned autonomy never reached the founder
 * and the mode behaved as static config. This is the missing consumer.
 *
 * Self-contained, mirrors VisitorIdCapBanner: fetches once on mount,
 * renders null when there's no nudge (the overwhelming common case —
 * the offer also stays null until the founder has visited the Agent
 * Memory panel, which flips the discovery gate), and never blocks the
 * dashboard on a network error.
 */

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

type NudgeKind = "batch-daily" | "auto-high-confidence";

interface NudgeResponse {
  nudge: NudgeKind | null;
  currentMode: string | null;
  trustScore: number;
}

const COPY: Record<NudgeKind, { title: string; body: string; cta: string }> = {
  "batch-daily": {
    title: "Your agent is ready for daily batch review",
    body: "It's built a clean approval track record. Switch from approving each action to reviewing a prepared batch once a day — faster, same control.",
    cta: "Switch to daily review",
  },
  "auto-high-confidence": {
    title: "Let your agent auto-run the easy calls",
    body: "Its track record is strong enough to run high-confidence actions on its own and only stop to ask on the uncertain ones. Outbound sends still always ask.",
    cta: "Enable auto for high-confidence",
  },
};

const ACCENT = "var(--color-accent, #3d99f5)";

export function AutonomyNudgeBanner() {
  // undefined = loading, null = no nudge, NudgeKind = show it.
  const [nudge, setNudge] = useState<NudgeKind | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/nudges/autonomy");
        if (!res.ok) {
          if (!cancelled) setNudge(null);
          return;
        }
        const data = (await res.json()) as NudgeResponse;
        if (!cancelled) setNudge(data.nudge);
      } catch {
        // Silent — banner stays hidden on network failure.
        if (!cancelled) setNudge(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function respond(response: "accepted" | "dismissed") {
    if (!nudge || busy) return;
    setBusy(true);
    // Optimistically hide — the decision is recorded server-side and the
    // banner shouldn't linger after a click.
    const chosen = nudge;
    setNudge(null);
    try {
      await fetch("/api/nudges/autonomy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nudge: chosen, response }),
      });
    } catch {
      // The choice is best-effort; never resurrect the banner on failure.
    } finally {
      setBusy(false);
    }
  }

  if (!nudge) return null;

  const copy = COPY[nudge];

  return (
    <div
      role="status"
      className="rounded-xl p-4 flex items-start gap-3"
      style={{
        background: "var(--color-accent-soft, rgba(61,153,245,0.06))",
        border: `1px solid var(--color-accent-border, rgba(61,153,245,0.28))`,
      }}
    >
      <Sparkles
        size={16}
        className="mt-0.5 shrink-0"
        style={{ color: ACCENT }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {copy.title}
        </p>
        <p
          className="mt-0.5 text-[12px]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {copy.body}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => respond("accepted")}
            disabled={busy}
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {copy.cta}
          </button>
          <button
            type="button"
            onClick={() => respond("dismissed")}
            disabled={busy}
            className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-[12px] font-medium disabled:opacity-60"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Not yet
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => respond("dismissed")}
        disabled={busy}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 disabled:opacity-60"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <X size={13} />
      </button>
    </div>
  );
}
