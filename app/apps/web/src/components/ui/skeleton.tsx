interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} />;
}

// Deterministic pseudo-random widths to avoid hydration mismatch
const SKELETON_WIDTHS = [72, 55, 83, 64, 48, 77, 60, 90, 52, 68];

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex gap-3 px-3 py-2" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 rounded" style={{ width: `${100 / cols}%` }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-3" style={{ height: "var(--table-row-height)" }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-3 rounded"
              style={{ width: `${SKELETON_WIDTHS[(r * cols + c) % SKELETON_WIDTHS.length]}%`, maxWidth: `${100 / cols}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
    >
      <Skeleton className="h-4 w-3/4 rounded" />
      <Skeleton className="mt-3 h-3 w-1/2 rounded" />
      <Skeleton className="mt-2 h-3 w-2/3 rounded" />
    </div>
  );
}

export function HeaderSkeleton({ actions = 0, subtitle = true }: { actions?: number; subtitle?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-3 px-6" style={{ height: "var(--header-height)", borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}>
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-4 w-20 rounded" />
      {subtitle && <Skeleton className="h-3 w-8 rounded" />}
      {actions > 0 && (
        <div className="ml-auto flex items-center gap-2">
          {Array.from({ length: actions }).map((_, i) => (
            <Skeleton key={i} className="h-7 rounded-md" style={{ width: 60 + (i * 19) % 40 }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterBarSkeleton({ tabs = 0, search = false, children }: { tabs?: number; search?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-3 px-6" style={{ height: "var(--filter-bar-height)", borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}>
      {tabs > 0 && (
        <div className="flex gap-0.5">
          {Array.from({ length: tabs }).map((_, i) => (
            <Skeleton key={i} className="h-6 rounded-md" style={{ width: 36 + (i * 13) % 28 }} />
          ))}
        </div>
      )}
      {search && !children && (
        <div className="ml-auto">
          <Skeleton className="h-7 w-48 rounded-md" />
        </div>
      )}
      {children}
    </div>
  );
}

export function TableRowSkeleton({ cells, index = 0 }: { cells: Array<{ width: number | string; circle?: boolean; pill?: boolean }>; index?: number }) {
  return (
    <div className="skeleton-row flex items-center gap-3 px-4" style={{ height: "var(--table-row-height)", borderBottom: "1px solid var(--color-border-default)" }}>
      {cells.map((cell, c) => {
        const w = typeof cell.width === "number" ? cell.width + ((index * 13 + c * 7) % 20) : cell.width;
        if (cell.circle) return <Skeleton key={c} className="rounded-full" style={{ width: w, height: w }} />;
        if (cell.pill) return <Skeleton key={c} className="h-5 rounded-full" style={{ width: w }} />;
        return <Skeleton key={c} className="h-3 rounded" style={{ width: w }} />;
      })}
    </div>
  );
}

export function KanbanColumnSkeleton({ name, cards = 2, index = 0 }: { name: string; cards?: number; index?: number }) {
  return (
    <div className="flex w-[280px] flex-shrink-0 flex-col skeleton-row">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-3.5 rounded-full" />
          <Skeleton className="h-3.5 rounded" style={{ width: 40 + name.length * 5 }} />
          <Skeleton className="h-3 w-4 rounded" />
        </div>
        <Skeleton className="h-5 w-5 rounded-md" />
      </div>
      <div className="flex-1 space-y-2 p-2">
        {Array.from({ length: cards }).map((_, c) => (
          <div key={c} className="rounded-lg p-3" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", borderLeft: "3px solid var(--color-border-default)" }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 rounded" style={{ width: `${50 + ((index + c) * 17) % 40}%` }} />
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-3 rounded" style={{ width: `${60 + ((index + c) * 13) % 30}%` }} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-3 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
            </div>
          </div>
        ))}
        {cards === 0 && (
          <div className="flex w-full items-center justify-center rounded-lg py-4" style={{ border: "1px dashed var(--color-border-default)" }}>
            <Skeleton className="h-3 w-28 rounded" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-1 px-3 py-2">
        <Skeleton className="h-3 w-3 rounded" />
        <Skeleton className="h-3 w-12 rounded" />
      </div>
    </div>
  );
}

export function DetailPageSkeleton({ avatar = "square" }: { avatar?: "square" | "circle" }) {
  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex-1 overflow-auto p-6">
        <Skeleton className="h-3 w-32 rounded" />
        <div className="mt-4 flex items-center gap-4">
          <Skeleton className={avatar === "circle" ? "rounded-full" : "rounded-lg"} style={{ height: 48, width: 48 }} />
          <div>
            <Skeleton className="h-5 w-44 rounded" />
            <Skeleton className="mt-1.5 h-3 w-28 rounded" />
          </div>
        </div>
        {/* No 4-stat KPI grid here — none of the three detail consumers
            (accounts/[id], contacts/[id], opportunities/[id]) render one below
            the header (they show a targeting panel / activity timeline /
            suggestion banner), so it was four phantom cards that vanished on
            load. A single generic content block matches all three. */}
        <div className="skeleton-row mt-6 rounded-lg p-4" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="mt-3 h-3 w-full rounded" />
          <Skeleton className="mt-2 h-3 w-3/4 rounded" />
          <Skeleton className="mt-2 h-3 w-1/2 rounded" />
        </div>
      </div>
      <div className="w-full border-l lg:w-[300px]" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)" }}>
        <div className="p-6 space-y-3">
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function KpiRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 md:grid-cols-6" style={count !== 6 ? { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` } : undefined}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row rounded-lg px-2.5 py-2" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
          <Skeleton className="h-2 w-12 rounded" />
          <Skeleton className="mt-1.5 h-4 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}
