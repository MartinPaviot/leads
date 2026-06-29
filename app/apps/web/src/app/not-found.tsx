import Link from "next/link";

export const metadata = { title: "Page not found | Elevay" };

/**
 * Branded global 404 (replaces the bare Next.js default the pre-launch
 * audit flagged — no branding, no way back). Server component.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
        background: "var(--color-bg-page)",
        color: "var(--color-text-primary)",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "-0.3px",
          color: "var(--color-accent)",
        }}
      >
        Elevay
      </span>
      <h1 style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>404</h1>
      <p style={{ fontSize: 15, color: "var(--color-text-secondary)", maxWidth: 360 }}>
        We couldn&apos;t find that page. It may have moved, or the link is out of date.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <Link
          href="/home"
          style={{
            fontSize: 14,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 8,
            background: "var(--color-accent)",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          Back to home
        </Link>
        <Link
          href="/chat"
          style={{
            fontSize: 14,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-primary)",
            textDecoration: "none",
          }}
        >
          Ask Elevay
        </Link>
      </div>
    </main>
  );
}
