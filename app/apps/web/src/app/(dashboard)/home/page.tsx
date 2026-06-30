"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { z } from "zod";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { OnboardingV2Wrapper } from "@/components/onboarding-v2-wrapper";
import { useFlag } from "@/components/flags-provider";
import { WarmLeadPrompt } from "@/components/WarmLeadPrompt";
import { FollowUpsReadyCard } from "@/components/FollowUpsReadyCard";
import { TAMRevealNotification } from "@/components/TAMRevealNotification";
import { ScalingPathPrompt } from "@/components/ScalingPathPrompt";
import { VisitorIdCapBanner } from "@/components/visitor-id-cap-banner";
import { AutonomyNudgeBanner } from "@/components/autonomy-nudge-banner";
import { HotInboundsWidget } from "@/components/hot-inbounds-widget";
import { HotVisitorsWidget } from "@/components/hot-visitors-widget";
import { HOT_INBOUNDS_WIDGET_ENABLED } from "@/lib/inbound/widget-visibility";
import { UpNextView, type UpNextApi } from "@/components/up-next/up-next-view";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";

/* ── CLE-14: page-action helpers (pure, shared — mirrors CLE-06/09) ── */
const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });
/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

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

  // ── CLE-14: page-action registration. The /home page is mostly chrome; the
  //    actionable surface is two children. The run()s reuse the children's OWN
  //    handlers: <UpNextView> via an imperative handle (the reply composer +
  //    row navigation), <HotInboundsWidget>'s "not a lead" via a page-level
  //    second caller that posts the SAME request the widget's X button posts
  //    (CLE-08) — so the agent path and the button path are one network copy. ──
  const upNextApiRef = useRef<UpNextApi | null>(null);

  // Second REST caller for the widget's "not a lead" verdict (CLE-08): the
  // widget owns its optimistic row-drop + identical POST; this lets the chat
  // record the same verdict even when the widget is hidden (prod) or unmounted.
  const markNotALead = useCallback(async (contactId: string) => {
    const res = await fetch(`/api/contacts/${contactId}/lead-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLead: false }),
    });
    return res.ok ? { ok: true } : { ok: false, error: "Couldn't record the feedback." };
  }, []);

  const homeActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "home.replyNeedsYou",
        title: "Reply to a Needs-you item",
        description:
          "Open a pre-filled email reply for a reply-type item in the home \"Needs you\" list. " +
          "Use when the user wants to answer one of the people waiting on them on the home feed.",
        params: z.object({ todoId: z.string().min(1) }),
        mutating: false, cost: "free", confirm: "never",
        run: async ({ todoId }): Promise<PageActionResult> => {
          const api = upNextApiRef.current;
          if (!api) return errResult("The home feed isn't ready yet.");
          const r = api.replyTo(todoId);
          return r.ok
            ? okResult(`Opened a reply to ${r.subject ?? "the item"}.`)
            : errResult("That item isn't a reply item in your Needs-you list.");
        },
      }),
      definePageAction({
        id: "home.openItem",
        title: "Open a home-feed item",
        description:
          "Navigate to the underlying record for an item on the home feed — a \"Needs you\" todo or an Activity " +
          "entry. Use when the user asks to open or go to one of the items shown on the home page.",
        params: z.object({ id: z.string().min(1), kind: z.enum(["todo", "actualite"]) }),
        mutating: false, cost: "free", confirm: "never",
        run: async ({ id, kind }): Promise<PageActionResult> => {
          const api = upNextApiRef.current;
          if (!api) return errResult("The home feed isn't ready yet.");
          const r = api.openItem(id, kind);
          return r.ok
            ? okResult("Opened the item.")
            : errResult("That item isn't in your home feed (or has no link).");
        },
      }),
      definePageAction({
        id: "home.notALead",
        title: "Mark a hot inbound as not a lead",
        description:
          "Record the human verdict that a surfaced hot-inbound contact is NOT a real lead, so it stops being " +
          "surfaced. This verdict overrides the automatic qualification. Use when the user dismisses an inbound.",
        params: z.object({ contactId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ contactId }): Promise<PageActionResult> => {
          const r = await markNotALead(contactId);
          return r.ok ? okResult("Marked as not a lead.") : errResult(r.error ?? "Couldn't record the feedback.");
        },
      }),
    ],
    // Stable id set; run()s read live values via refs / stable useCallback,
    // so registration happens once (CLE-03).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(homeActions);

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader icon={<Clock size={15} />} title="Up next" subtitle={today} />

      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="mx-auto max-w-[1080px] space-y-4">
          <VisitorIdCapBanner />
          <AutonomyNudgeBanner />

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
          {!showOnboarding && <FollowUpsReadyCard />}
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
          <UpNextView apiRef={upNextApiRef} />
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
