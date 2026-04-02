import { Button } from "./button";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: "gradient" | "solid" | "outline";
}

export function EmptyState({ icon, title, description, actionLabel, onAction, actionVariant = "solid" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: "var(--color-bg-hover)", color: "var(--color-text-tertiary)" }}
      >
        {icon}
      </div>
      <h3 className="mt-4 text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-center text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button variant={actionVariant} onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
