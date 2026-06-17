"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { OnboardingV2Wrapper } from "@/components/onboarding-v2-wrapper";
import { useFlag } from "@/components/flags-provider";
import { WarmLeadPrompt } from "@/components/WarmLeadPrompt";
import { TAMRevealNotification } from "@/components/TAMRevealNotification";
import { ScalingPathPrompt } from "@/components/ScalingPathPrompt";
import { VisitorIdCapBanner } from "@/components/visitor-id-cap-banner";
import { HotInboundsWidget } from "@/components/hot-inbounds-widget";
import { HotVisitorsWidget } from "@/components/hot-visitors-widget";
import { HOT_INBOUNDS_WIDGET_ENABLED } from "@/lib/inbound/widget-visibility";
import { UpNextView } from "@/components/up-next/up-next-view";

/**
 * "Up next" — the founder's morning briefing.
 *
 * The briefing itself (Hero + "Needs you" queue + "Handled for you" ledger +
 * engine line) lives in <UpNextView/>, which reads /api/home/up-next. This page
 * keeps only the surrounding chrome: the onboarding gate (a single confirmation
 * card), the speed-to-lead Hot widgets, and the conditional prompts.
 * See _specs/up-next-redesign/.
 */
export default function DashboardPage() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingEmail, setOnboardingEmail] = useState<string | undefined>();
  const [onboardingName, setOnboardingName] = useState<string | undefined>();
  // Warm-lead prompt flag comes from the tenant flags the layout already
  // provides via <FlagsProvider>, so no extra round-trip is needed.
  const warmLeadPrompt = useFlag("onboarding.v2.warm-lead-prompt");
  const [scalingPathReason, setScalingPathReason] = useState<
    "cold-on-primary-blocked" | "primary-cap-hit" | null
  >(null);
  const [isFirstTime, setIsFirstTime] = useState(false);

  // Locale-aware header date — computed after mount to avoid an SSR/CSR
  // hydration mismatch (server tz/locale ≠ browser). App chrome is en-US.
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    );
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("firstTime") === "true") {
      setIsFirstTime(true);
      if (!localStorage.getItem("leadsens_welcomed")) {
        localStorage.setItem("leadsens_welcomed", "1");
      }
      window.history.replaceState({}, "", "/");
    }
    const scaling = params.get("scalingPath");
    if (scaling === "cold-on-primary-blocked" || scaling === "primary-cap-hit") {
      setScalingPathReason(scaling);
    }

    let cancelled = false;

    type OnboardingPayload = {
      needsOnboarding?: boolean;
      email?: string;
      name?: string;
    };
    function applyOnboarding(onb: OnboardingPayload | null) {
      if (!onb?.needsOnboarding) return;
      try {
        if (localStorage.getItem("elevay_onboarding_dismissed") === "1") return;
      } catch {}
      setShowOnboarding(true);
      setOnboardingEmail(onb.email);
      setOnboardingName(onb.name);
    }

    // Keep hitting /api/home/hydrate: it gates onboarding AND fires the TTFAA
    // telemetry side-effect. We only read `onboarding` here — the briefing data
    // is owned by <UpNextView/> via /api/home/up-next.
    fetch("/api/home/hydrate")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (!payload) {
          void fetch("/api/onboarding/status")
            .then((r) => (r.ok ? r.json() : null))
            .then((onb) => !cancelled && applyOnboarding(onb as OnboardingPayload | null));
          return;
        }
        applyOnboarding(payload.onboarding as OnboardingPayload | null);
      })
      .catch(() => {
        if (cancelled) return;
        void fetch("/api/onboarding/status")
          .then((r) => (r.ok ? r.json() : null))
          .then((onb) => !cancelled && applyOnboarding(onb as OnboardingPayload | null));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader icon={<Clock size={15} />} title="Up next" subtitle={today} />

      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="mx-auto max-w-[1080px] space-y-4">
          <VisitorIdCapBanner />

          {/* Speed-to-lead: hot inbounds + visitors. Each self-hides when empty,
              so this row vanishes on a quiet day. Hot inbounds is hidden in
              production (subscription/no-reply noise on real mailboxes — see
              lib/inbound/widget-visibility.ts). */}
          {!showOnboarding && (
            <div className="grid gap-4 md:grid-cols-2 empty:hidden">
              {HOT_INBOUNDS_WIDGET_ENABLED && <HotInboundsWidget />}
              <HotVisitorsWidget />
            </div>
          )}

          {/* Conditional prompts (gated so they don't race the card). */}
          {warmLeadPrompt && !showOnboarding && <WarmLeadPrompt />}
          {scalingPathReason && !showOnboarding && (
            <ScalingPathPrompt
              reason={scalingPathReason}
              onDismiss={() => setScalingPathReason(null)}
              onResolved={() => setScalingPathReason(null)}
            />
          )}
          {isFirstTime && !showOnboarding && <TAMRevealNotification />}
        </div>

        {/* The briefing */}
        <div className="mt-2">
          <UpNextView />
        </div>
      </div>

      {/* Onboarding — single confirmation card. Shown only when the tenant
          isn't established (no accounts, no usable ICP) and hasn't completed
          or dismissed it. The card seeds from the tenant's existing config
          (see OnboardingV2Wrapper) so it confirms rather than re-collects. */}
      {showOnboarding && (
        <OnboardingV2Wrapper
          userEmail={onboardingEmail}
          userName={onboardingName}
          onComplete={() => {
            setShowOnboarding(false);
            try { localStorage.removeItem("elevay_onboarding_dismissed"); } catch {}
            window.location.href = "/?firstTime=true";
          }}
          onDismiss={() => {
            setShowOnboarding(false);
            try { localStorage.setItem("elevay_onboarding_dismissed", "1"); } catch {}
          }}
        />
      )}
    </div>
  );
}
