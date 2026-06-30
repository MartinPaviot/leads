import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";

// Route-level Suspense fallback for /outbound-mode ("Outbound du jour"). Mirrors
// the page's own loading branch EXACTLY: the real breadcrumb + title + intro
// chrome (static, rendered unconditionally by the page) above the bordered
// scroll area carrying the same five queue-row card skeletons (dot + kind label
// + two text lines + trailing badge). The counts row is omitted — the page only
// renders it once `data` resolves, so it is absent during loading too. Keeps the
// route-fallback → in-page-skeleton handoff seamless (no morph). No "use client".
export default function OutboundModeLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4">
        <Breadcrumbs items={[{ label: "Outbound" }, { label: "Outbound du jour" }]} />
        <h1
          className="mt-2 text-xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Outbound du jour
        </h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          One ordered queue: replies first, then due sequence touches, then drafts to approve
          ranked by quality. Work it top to bottom.
        </p>
      </div>

      <div
        className="mt-4 flex-1 overflow-y-auto border-t px-6 py-4"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <ul className="flex flex-col gap-2" aria-hidden>
          {[68, 80, 56, 72, 60].map((titleW, i) => (
            <li key={i}>
              <div
                className="flex items-center gap-3 rounded-lg border px-4 py-3"
                style={{
                  borderColor: "var(--color-border-default)",
                  background: "var(--color-bg-card)",
                }}
              >
                <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                <Skeleton className="h-2.5 w-[64px] shrink-0 rounded" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 rounded" style={{ width: `${titleW}%` }} />
                  <Skeleton className="h-2.5 rounded" style={{ width: `${titleW - 22}%` }} />
                </span>
                <Skeleton className="h-4 w-8 shrink-0 rounded" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
