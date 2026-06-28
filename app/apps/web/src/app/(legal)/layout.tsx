import Link from "next/link";

const legalLinks = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Sub-processors", href: "/sub-processors" },
  { label: "Security", href: "/security" },
  { label: "Acceptable Use", href: "/acceptable-use" },
];

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-base)]">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Back link */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to Orion
        </Link>

        {/* Page content */}
        <article className="prose-invert prose-headings:text-[var(--color-text-primary)] prose-p:text-[var(--color-text-secondary)] prose-li:text-[var(--color-text-secondary)] prose-strong:text-[var(--color-text-primary)] prose-a:text-[var(--color-accent)] prose-a:no-underline hover:prose-a:underline">
          {children}
        </article>

        {/* Footer */}
        <footer className="mt-16 border-t border-[var(--color-border-default)] pt-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--color-text-muted)]">
            &copy; {new Date().getFullYear()} Elevay. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
