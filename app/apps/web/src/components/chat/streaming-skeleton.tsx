"use client";

import { Sparkles } from "lucide-react";

export function StreamingSkeleton() {
  return (
    <div className="mb-6">
      <div
        className="mb-2 flex items-center gap-1.5 text-[12px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <Sparkles size={13} className="animate-pulse" style={{ color: "var(--color-accent)" }} />
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
