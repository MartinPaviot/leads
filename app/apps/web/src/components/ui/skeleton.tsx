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
