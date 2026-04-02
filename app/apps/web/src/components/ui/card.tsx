interface CardProps {
  children: React.ReactNode;
  interactive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function Card({ children, interactive, className = "", style, onClick }: CardProps) {
  return (
    <div
      className={`rounded-lg ${interactive ? "cursor-pointer" : ""} ${className}`}
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
        transition: "border-color 0.15s, background 0.15s",
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={interactive ? (e) => {
        e.currentTarget.style.borderColor = "var(--color-border-hover)";
      } : undefined}
      onMouseLeave={interactive ? (e) => {
        e.currentTarget.style.borderColor = "var(--color-border-default)";
      } : undefined}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-4 py-3 ${className}`} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
