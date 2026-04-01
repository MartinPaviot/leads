export default function DashboardLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Header skeleton */}
      <div
        className="flex items-center gap-3 px-6"
        style={{
          height: "var(--header-height)",
          borderBottom: "0.5px solid var(--color-border-default)",
        }}
      >
        <div className="skeleton h-4 w-4 rounded" />
        <div className="skeleton h-4 w-24 rounded" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 space-y-3 p-6">
        <div className="skeleton h-10 w-full rounded-md" />
        <div className="skeleton h-10 w-full rounded-md" />
        <div className="skeleton h-10 w-full rounded-md" />
        <div className="skeleton h-10 w-full rounded-md" />
        <div className="skeleton h-10 w-full rounded-md" />
      </div>
    </div>
  );
}
