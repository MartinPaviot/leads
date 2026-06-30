import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-page)" }}>
      {/* Mirror the empty-chat hero: a vertically-centered column (mark, greeting,
          the composer as the focal point, then a starter-prompt LIST) — not a
          bottom-docked composer + a row of pills, which snap into place on mount. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:py-8">
        <div className="mx-auto flex min-h-[72vh] w-full max-w-[560px] flex-col items-center justify-center px-2">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <Skeleton className="mt-6 h-7 w-56 rounded" />
          <Skeleton className="mt-2 h-3.5 w-64 rounded" />

          {/* Composer — the focal point of the empty state */}
          <Skeleton className="mt-7 h-[52px] w-full rounded-xl" />

          {/* Starter prompts — a quiet command list (same row shape the page uses). */}
          <div
            className="mt-3 w-full overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex w-full items-center gap-3 px-4 py-3"
                style={{ borderTop: i ? "1px solid var(--color-border-default)" : undefined }}
              >
                <div className="h-4 w-4 shrink-0 animate-pulse rounded" style={{ background: "var(--color-bg-hover)" }} />
                <div
                  className="h-3.5 flex-1 animate-pulse rounded"
                  style={{ background: "var(--color-bg-hover)", maxWidth: `${72 - i * 10}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
