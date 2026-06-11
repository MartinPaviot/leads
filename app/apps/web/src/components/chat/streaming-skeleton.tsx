"use client";

import { ElevayMark } from "@/components/ui/elevay-mark";

export function StreamingSkeleton() {
  return (
    <div className="mb-6">
      {/* Brand mark instead of a generic spinner — the pulsing lines below
          already carry the "working" signal (opacity-only, GPU-safe). */}
      <div
        className="mb-2 flex items-center gap-1.5 text-[12px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <ElevayMark size={13} className="animate-pulse" />
        <span style={{ fontWeight: 500 }}>Elevay</span>
      </div>
      <div className="space-y-2.5">
        <div
          className="h-3.5 animate-pulse rounded"
          style={{ background: "var(--color-bg-hover)", width: "85%" }}
        />
        <div
          className="h-3.5 animate-pulse rounded"
          style={{ background: "var(--color-bg-hover)", width: "65%", animationDelay: "150ms" }}
        />
        <div
          className="h-3.5 animate-pulse rounded"
          style={{ background: "var(--color-bg-hover)", width: "45%", animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
}
