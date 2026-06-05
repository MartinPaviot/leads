/**
 * Canonical page header for the Settings section.
 *
 * Settings pages render inside a narrow centred column (max-w-2xl, see
 * settings-sidebar.tsx), so they use a stacked title + subtitle — NOT the
 * full-width `<PageHeader>` app-bar (which is for top-level pages). This
 * component is the single source of truth for that header so the ~30
 * settings pages stop drifting into 5 different title sizes/weights.
 *
 * Title: 24px / 600 / -0.3px tracking, primary text.
 * Subtitle: 13px, tertiary text, 6px below.
 * Optional `actions` render right-aligned, vertically centred on the title.
 */
export function SettingsHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1
          className="text-[24px] font-semibold"
          style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
