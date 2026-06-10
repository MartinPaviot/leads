"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { OnboardingChat } from "@/components/onboarding-chat";
import { OnboardingV2Wrapper } from "@/components/onboarding-v2-wrapper";
import { useOnboardingVersion } from "@/hooks/use-onboarding-version";
import { WarmLeadPrompt } from "@/components/WarmLeadPrompt";
import { TAMRevealNotification } from "@/components/TAMRevealNotification";
import { ScalingPathPrompt } from "@/components/ScalingPathPrompt";
import { VisitorIdCapBanner } from "@/components/visitor-id-cap-banner";
import { HotInboundsWidget } from "@/components/hot-inbounds-widget";
import { HotVisitorsWidget } from "@/components/hot-visitors-widget";
import { UpNextView } from "@/components/up-next/up-next-view";

/**
 * "Up next" — the founder's morning briefing.
 *
 * The briefing itself (Hero + "Needs you" queue + "Handled for you" ledger +
 * engine line) lives in <UpNextView/>, which reads /api/home/up-next. This page
 * keeps only the surrounding chrome: onboarding gate, speed-to-lead Hot widgets,
 * and the conditional prompts. See _specs/up-next-redesign/.
 */
export default function DashboardPage() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingHasGoogle, setOnboardingHasGoogle] = useState(false);
  const [onboardingHasMicrosoft, setOnboardingHasMicrosoft] = useState(false);
  const [onboardingEmail, setOnboardingEmail] = useState<string | undefined>();
  const [onboardingName, setOnboardingName] = useState<string | undefined>();
  const [onboardingUserId, setOnboardingUserId] = useState<string | undefined>();
  const [onboardingInitialStep, setOnboardingInitialStep] = useState<string | null>(null);
  const { version: onboardingVersion, flags: onboardingFlags } = useOnboardingVersion();
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
      hasGoogle?: boolean;
      hasMicrosoft?: boolean;
      email?: string;
      name?: string;
      userId?: string;
      onboardingCurrentStep?: string | null;
    };
    function applyOnboarding(onb: OnboardingPayload | null) {
      if (!onb?.needsOnboarding) return;
      try {
        if (localStorage.getItem("elevay_onboarding_dismissed") === "1") return;
      } catch {}
      setShowOnboarding(true);
      setOnboardingHasGoogle(onb.hasGoogle || false);
      setOnboardingHasMicrosoft(onb.hasMicrosoft || false);
      setOnboardingEmail(onb.email);
      setOnboardingName(onb.name);
      setOnboardingUserId(onb.userId);
      setOnboardingInitialStep(
        typeof onb.onboardingCurrentStep === "string" ? onb.onboardingCurrentStep : null,
      );
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
              so this row vanishes on a quiet day. */}
          {!showOnboarding && (
            <div className="grid gap-4 md:grid-cols-2 empty:hidden">
              <HotInboundsWidget />
              <HotVisitorsWidget />
            </div>
          )}

          {/* Conditional prompts (gated so they don't race the wizard). */}
          {onboardingFlags.warmLeadPrompt && !showOnboarding && <WarmLeadPrompt />}
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

      {/* Onboarding — single confirmation modal, version-routed. */}
      {showOnboarding &&
        (onboardingVersion === "v3" ? (
          <OnboardingChat
            hasGoogle={onboardingHasGoogle}
            hasMicrosoft={onboardingHasMicrosoft}
            userEmail={onboardingEmail}
            userName={onboardingName}
            companyDomain={undefined}
            onComplete={() => {
              setShowOnboarding(false);
              window.location.href = "/?firstTime=true";
            }}
          />
        ) : onboardingVersion === "v2" ? (
          <OnboardingV2Wrapper
            userId={onboardingUserId}
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
        ) : (
          <OnboardingWizard
            hasGoogle={onboardingHasGoogle}
            hasMicrosoft={onboardingHasMicrosoft}
            userEmail={onboardingEmail}
            userName={onboardingName}
            userId={onboardingUserId}
            initialStep={onboardingInitialStep as never}
            onComplete={() => {
              setShowOnboarding(false);
              window.location.href = "/?firstTime=true";
            }}
          />
        ))}
    </div>
  );
}
