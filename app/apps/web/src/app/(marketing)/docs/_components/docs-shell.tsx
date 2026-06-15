import Link from "next/link";

/**
 * Light marketing chrome for the public /docs pages: same logo treatment
 * and palette as the landing page, without the full landing nav. Server
 * component, light-only by design (fixed grays, no theme vars).
 */
export function DocsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white" style={{ overflowX: "clip" }}>
      <nav aria-label="Docs" className="sticky top-0 z-50 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo-Elevay.svg?v=2" alt="Elevay" className="h-7 w-7" />
              <span
                className="text-xl font-bold"
                style={{
                  background: "linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)",
                  backgroundSize: "120% 100%",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Elevay
              </span>
            </Link>
            <span className="hidden rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:inline-block">
              Docs
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="hidden text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 sm:block">
              Home
            </Link>
            <Link href="/sign-in" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">
              Log in
            </Link>
            <a
              href="https://calendly.com/contact-elevay/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#2C6BED" }}
            >
              Book a demo
            </a>
          </div>
        </div>
      </nav>

      {children}

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo-Elevay.svg?v=2" alt="Elevay" className="h-5 w-5" />
            <span className="text-sm font-semibold text-gray-700">Elevay</span>
          </div>
          <p className="text-xs text-gray-400">&copy; 2026 Elevay. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
