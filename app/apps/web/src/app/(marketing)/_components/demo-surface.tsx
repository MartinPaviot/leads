"use client";

/**
 * DemoSurface — renders the REAL product components on the public landing,
 * pixel-identical by construction, fed with demo data.
 *
 * How: the dashboard components fetch their data from `/api/*`. On the landing
 * there is no session, so those calls would 401/empty. DemoSurface installs a
 * `window.fetch` interceptor that answers the registered routes with demo JSON
 * and passes everything else through (RSC payloads, assets…). The dashboard's
 * light theme tokens already live in `:root` (globals.css) and `useTheme()`
 * defaults to light, so the components render exactly as in-app — no dashboard
 * ThemeProvider (which would mutate the global <html> class) is used here.
 *
 * Providers the surfaces consume by context are supplied (ToastProvider). Add
 * more here only if a surface throws for a missing provider.
 */

import { useEffect, useState } from "react";
import { ToastProvider } from "@/components/ui/toast";

type DemoHandler = (url: URL) => unknown;
type DemoRoutes = Record<string, unknown | DemoHandler>;

// Module-level registry so multiple surfaces share one fetch patch.
const registry: { prefix: string; handler: DemoHandler }[] = [];
let patched = false;

function ensurePatched() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const href =
        typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      const url = new URL(href, window.location.origin);
      // Longest prefix wins, so a specific route beats a generic one.
      const match = registry
        .filter((r) => url.pathname === r.prefix || url.pathname.startsWith(r.prefix))
        .sort((a, b) => b.prefix.length - a.prefix.length)[0];
      if (match) {
        const data = match.handler(url);
        return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    } catch {
      /* fall through to the real fetch */
    }
    return orig(input as RequestInfo | URL, init);
  };
}

export function DemoSurface({ routes, children }: { routes: DemoRoutes; children: React.ReactNode }) {
  // Register synchronously (useState initializer) so the patch + routes are in
  // place before any child effect fires its fetch.
  useState(() => {
    ensurePatched();
    for (const [prefix, v] of Object.entries(routes)) {
      const handler: DemoHandler = typeof v === "function" ? (v as DemoHandler) : () => v;
      const existing = registry.find((r) => r.prefix === prefix);
      if (existing) existing.handler = handler;
      else registry.push({ prefix, handler });
    }
    return null;
  });

  // Render client-only: the real dashboard components rely on localStorage,
  // timers and client fetches, so SSR-ing them risks a hydration mismatch.
  // SSR (and the first client render) emit nothing; content mounts after.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return <ToastProvider>{children}</ToastProvider>;
}
