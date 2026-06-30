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
 *
 * LEAK GUARD: the fetch patch is global. Next.js navigates client-side, so once
 * the landing patched fetch, navigating into the authenticated app WITHOUT a
 * full reload would otherwise leave the patch live and serve `/api/accounts`
 * demo JSON to the real, logged-in /accounts page. Two defenses: (1) the
 * interceptor only answers while the document is still on the path the surfaces
 * mounted on (`demoPath`) — once the SPA navigates to /accounts the path differs
 * and real `/api/*` calls hit the server; (2) the patch is fully torn down (real
 * fetch restored, registry cleared) when the last surface unmounts.
 */

import { useEffect, useState } from "react";
import { ToastProvider } from "@/components/ui/toast";

type DemoHandler = (url: URL) => unknown;
type DemoRoutes = Record<string, unknown | DemoHandler>;

// Module-level registry so multiple surfaces share one fetch patch.
const registry: { prefix: string; handler: DemoHandler }[] = [];
let patched = false;
let origFetch: typeof window.fetch | null = null;
let mountedSurfaces = 0;
// The document path the surfaces are mounted on (the public landing). The
// interceptor ONLY serves demo data while the page is still here — so after the
// app SPA-navigates to a different path (the authenticated dashboard), the real
// server answers. Captured at render time from window.location.pathname.
let demoPath: string | null = null;

function ensurePatched() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const orig = window.fetch.bind(window);
  origFetch = orig;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      // Guard: only intercept while still on the path the demo mounted on.
      // Once we've navigated away (e.g. into /accounts) real calls pass through.
      if (demoPath !== null && window.location.pathname === demoPath) {
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
      }
    } catch {
      /* fall through to the real fetch */
    }
    return orig(input as RequestInfo | URL, init);
  };
}

function teardown() {
  if (typeof window === "undefined") return;
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
  patched = false;
  registry.length = 0;
  demoPath = null;
}

export function DemoSurface({ routes, children }: { routes: DemoRoutes; children: React.ReactNode }) {
  // Register synchronously (useState initializer) so the patch + routes are in
  // place before any child effect fires its fetch.
  useState(() => {
    ensurePatched();
    if (typeof window !== "undefined") demoPath = window.location.pathname;
    for (const [prefix, v] of Object.entries(routes)) {
      const handler: DemoHandler = typeof v === "function" ? (v as DemoHandler) : () => v;
      const existing = registry.find((r) => r.prefix === prefix);
      if (existing) existing.handler = handler;
      else registry.push({ prefix, handler });
    }
    return null;
  });

  // Tear the global patch down when the last surface unmounts (e.g. navigating
  // off the landing) so it can never serve demo data to the authenticated app.
  // Counting in an effect is fine: interception is gated by the render-time
  // registry + demoPath, not by this count, so the landing still works on first
  // paint even though child fetch-effects run before this parent effect.
  useEffect(() => {
    mountedSurfaces++;
    return () => {
      mountedSurfaces--;
      if (mountedSurfaces <= 0) {
        mountedSurfaces = 0;
        teardown();
      }
    };
  }, []);

  // Render client-only: the real dashboard components rely on localStorage,
  // timers and client fetches, so SSR-ing them risks a hydration mismatch.
  // SSR (and the first client render) emit nothing; content mounts after.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return <ToastProvider>{children}</ToastProvider>;
}
