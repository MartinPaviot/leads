"use client";

/**
 * Elevay PostHog client integration.
 *
 * Wraps the official `posthog-js` SDK so the WHOLE app benefits from :
 *   - Autocapture (clicks, inputs, form submits) — no per-element wiring.
 *   - Session replay — config-driven, sensitive inputs masked.
 *   - Heatmaps + scrollmaps — derived from autocapture, free with the SDK.
 *   - $pageview / $pageleave — fired manually on Next.js App Router
 *     transitions (the built-in tracker assumes pages router).
 *
 * Two mount points :
 *   1. `<PostHogProvider>` at the root layout — runs init + autocapture
 *      + pageview tracking for every visitor (anonymous traffic too).
 *   2. `<PostHogIdentify userId traits>` inside the authenticated layout
 *      — promotes the anonymous distinct id into a real person profile
 *      with traits (email, tenant, plan).
 *
 * `trackEvent(userId, event, props)` keeps the legacy three-arg
 * signature so existing call sites compile unchanged ; under the
 * hood every event now flows through `posthog.capture()` and inherits
 * the SDK's user id, session id, and replay context.
 *
 * Failure-safety : if `NEXT_PUBLIC_POSTHOG_KEY` is missing (local dev,
 * preview previews, etc.) the SDK is never initialised and every helper
 * is a no-op. Nothing crashes, nothing fetches.
 */

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let initialised = false;

/**
 * Idempotent SDK init. Safe to call from multiple components ; the
 * second call is a no-op. Skipped entirely SSR-side and when the key
 * is unset.
 */
function initOnce(): void {
  if (initialised) return;
  if (typeof window === "undefined") return;
  if (!POSTHOG_KEY) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // We fire $pageview manually below so the App Router's client-side
    // navigations are picked up. The SDK's built-in tracker hooks the
    // pages router which we don't use.
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      // Masks every <input>, <textarea>, and any element marked with
      // `data-sensitive` or `.ph-no-capture`. Replays still show the
      // surrounding interaction (clicks, scrolls) so the recordings
      // are useful for debugging UX without leaking PII or secrets.
      maskAllInputs: true,
      maskTextSelector: "[data-sensitive], .ph-no-capture",
    },
    // Only build a person profile once we identify() — keeps the
    // anonymous-traffic events from inflating the MAU bill.
    person_profiles: "identified_only",
    // Forward exceptions so we get a unified UX-error view that ties
    // back into the same session-replay timeline.
    capture_exceptions: true,
    loaded: () => {
      // No console noise in prod ; useful in dev to confirm the key
      // resolved and the first event is on its way.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.debug("[posthog] SDK ready", { host: POSTHOG_HOST });
      }
    },
  });
  initialised = true;
}

export interface UserTraits {
  email?: string;
  name?: string;
  tenantId?: string;
  tenantName?: string;
  role?: string;
  plan?: string;
}

/**
 * Top-level provider. Mount once at the root layout. Initialises the
 * SDK on first client render and tracks Next.js App Router
 * navigations as $pageview events.
 */
export function PostHogProvider({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedUrl = useRef("");

  useEffect(() => {
    initOnce();
  }, []);

  // App Router navigations don't trigger a full reload, so the SDK's
  // pageview heuristic misses them. We fire manually whenever the
  // pathname or query string changes.
  useEffect(() => {
    if (!initialised) return;
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (url === lastTrackedUrl.current) return;
    lastTrackedUrl.current = url;
    posthog.capture("$pageview", {
      $current_url: url,
      $pathname: pathname,
    });
  }, [pathname, searchParams]);

  return <>{children}</>;
}

/**
 * Promote the anonymous distinct id into a real person profile.
 * Mount inside the authenticated tree once the user id is known.
 *
 * Resets PostHog when the user id flips back to null/undefined
 * (logout) so the next visitor starts anonymous instead of
 * inheriting the previous identity.
 */
export function PostHogIdentify({
  userId,
  traits,
}: {
  userId?: string | null;
  traits?: UserTraits;
}): null {
  const identifiedFor = useRef<string | null>(null);

  useEffect(() => {
    // React commits child effects before parent effects, so when this
    // identify effect first runs, the parent <PostHogProvider> may not
    // yet have called initOnce(). Without this defensive call we'd
    // silently miss the very first identify on every page load —
    // every event would land as anonymous distinct_id, and PostHog
    // would never see the founder's email/name/tenant traits.
    initOnce();
    if (!initialised || typeof window === "undefined") return;
    if (userId) {
      if (identifiedFor.current !== userId) {
        posthog.identify(userId, traits);
        identifiedFor.current = userId;
      } else if (traits) {
        // Same user, but traits may have changed (plan upgrade, role
        // promotion). `people.set` updates without re-identifying.
        posthog.people.set(traits);
      }
      // Tenant grouping unlocks per-tenant dashboards in PostHog
      // (cohort by `tenantId` without re-identifying every event).
      if (traits?.tenantId) {
        posthog.group("tenant", traits.tenantId, {
          name: traits.tenantName,
          plan: traits.plan,
        });
      }
    } else if (identifiedFor.current) {
      posthog.reset();
      identifiedFor.current = null;
    }
  }, [userId, traits]);

  return null;
}

/**
 * Backwards-compatible single-event helper. Existing call sites that
 * import `trackEvent(userId, event, props)` keep working unchanged ;
 * the userId argument is now redundant (the SDK's identified user
 * wins) but we keep it for the legacy signature.
 *
 * When the SDK isn't initialised (no key, SSR), the call is a no-op
 * — same contract as before.
 */
export function trackEvent(
  userId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!initialised) return;
  if (typeof window === "undefined") return;
  // The SDK has already identified this user via PostHogIdentify, but
  // we belt-and-brace by passing distinct_id_hint on the rare path
  // where a component dispatches an event before the identify effect
  // has run (e.g. instant click after sign-in redirect).
  posthog.capture(event, { ...properties, distinct_id_hint: userId });
}

/**
 * Legacy shim. Page-tracking now lives inside `PostHogProvider`
 * itself ; this stays so dashboard layout's existing import keeps
 * compiling — pure no-op until the dashboard moves to PostHogIdentify.
 *
 * @deprecated Mount `<PostHogProvider>` at the root layout and
 *   `<PostHogIdentify userId traits />` in the authenticated tree.
 */
export function PostHogPageTracker(_props: { userId?: string }): null {
  return null;
}
