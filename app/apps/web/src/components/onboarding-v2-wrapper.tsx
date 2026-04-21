"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  OnboardingConfirmationCard,
  type ConfirmationCardInferred,
  type ConfirmationCardTargeting,
  type ConfirmationCardGuardrails,
} from "@/components/onboarding-confirmation-card";

/**
 * WS-2 PR C wrapper — the v2 onboarding entry point, gated behind the
 * `onboarding.v2.confirmation-card` experiment. Renders the
 * confirmation card in a fullscreen shell, wires onConfirm to save
 * everything and fire the TAM build, and redirects to /home on
 * completion.
 *
 * Intentionally minimal compared to the v1 wizard: no progress bar,
 * no step-by-step nav, no resume banner. The card is a single
 * confirmation surface — not a multi-step flow. WS-3 later adds the
 * warm-lead prompt that appears after the confirmation.
 *
 * When the flag is OFF, the home page renders the v1 wizard instead
 * and this component is never mounted.
 */

export interface OnboardingV2WrapperProps {
  userId?: string;
  userEmail?: string;
  userName?: string;
  onComplete: () => void;
}

interface BootstrapData {
  inferred: ConfirmationCardInferred;
  targeting: ConfirmationCardTargeting;
  guardrails: ConfirmationCardGuardrails;
}

export function OnboardingV2Wrapper({
  userEmail,
  userName,
  onComplete,
}: OnboardingV2WrapperProps) {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bootstrap: fetch the inferred values + current settings. Uses
  // existing endpoints so no new backend surface is required:
  //   /api/onboarding/status       → profile basics
  //   /api/settings/workspace      → aiTone, approval mode
  //   /api/settings/sending-infra  → sending mode + cap
  //   /api/settings/llm-budget     → cap
  // Inferred ICP values come from the existing /api/onboarding/analyze-website
  // — kicked off after the user enters their domain on the card. For the
  // initial render we start with empty targeting and let the user pick
  // presets; a follow-up polish pass adds pre-filled inference here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [workspaceRes, sendingRes, budgetRes] = await Promise.all([
          fetch("/api/settings/workspace"),
          fetch("/api/settings/sending-infra"),
          fetch("/api/settings/llm-budget"),
        ]);
        if (cancelled) return;

        const workspace = workspaceRes.ok
          ? ((await workspaceRes.json()) as {
              name?: string;
              companyDomain?: string;
              agentApprovalMode?:
                | "review-each"
                | "batch-daily"
                | "auto-high-confidence";
            })
          : {};
        const sending = sendingRes.ok
          ? ((await sendingRes.json()) as {
              mode?: string;
              sendingDailyCapPrimary?: number;
            })
          : {};
        const budget = budgetRes.ok
          ? ((await budgetRes.json()) as {
              status?: { capUsd?: number };
            })
          : {};

        const emailDomain = userEmail?.split("@")[1] ?? "";
        const inferredDomain =
          workspace.companyDomain ||
          (/gmail|yahoo|hotmail|outlook|icloud|aol|proton/i.test(emailDomain)
            ? ""
            : emailDomain);

        setData({
          inferred: {
            fullName: userName ?? "",
            companyName: workspace.name ?? "",
            domain: inferredDomain,
            productDescription: "",
            suggestedTone: null,
            aiTone: "Direct",
            language: navigator.language.split("-")[0] ?? "en",
            timezone:
              Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
            overallConfidence: 1,
            lowConfidenceFields: [],
          },
          targeting: {
            industries: [],
            companySizes: [],
            geographies: [],
            targetSeniorities: [],
            targetDepartments: [],
          },
          guardrails: {
            approvalMode: workspace.agentApprovalMode ?? "review-each",
            llmMonthlyCostCapUsd: budget.status?.capUsd ?? 50,
            sendingMailboxMode: sending.mode ?? "primary-with-caps",
            sendingDailyCapPrimary: sending.sendingDailyCapPrimary ?? 20,
          },
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userEmail, userName]);

  const handleConfirm = useCallback(
    async (next: {
      identity: ConfirmationCardInferred;
      targeting: ConfirmationCardTargeting;
    }) => {
      // Persist identity + targeting via existing save endpoints.
      // The v1 wizard uses a multi-call pattern; we collapse to two
      // save calls so the server sees a coherent "welcome" +
      // "product" + "icp" snapshot.
      await fetch("/api/onboarding/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "welcome",
          fullName: next.identity.fullName,
          companyName: next.identity.companyName,
          domain: next.identity.domain,
          role: "Founder",
        }),
      });
      await fetch("/api/onboarding/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "product",
          productDesc: next.identity.productDescription,
          salesMotion: "Founder-led sales",
          challenge: "Finding leads",
        }),
      });
      await fetch("/api/onboarding/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "icp",
          industries: next.targeting.industries,
          companySizes: next.targeting.companySizes,
          geographies: next.targeting.geographies,
          targetSeniorities: next.targeting.targetSeniorities,
          targetDepartments: next.targeting.targetDepartments,
          aiTone: next.identity.aiTone,
        }),
      });

      // WS-4 — fire TAM build fire-and-forget. The user lands on the
      // dashboard immediately; <TAMRevealNotification> surfaces the
      // live count there. Blocking here would recreate the v1
      // "building" step we deliberately deleted.
      void fetch("/api/tam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industries: next.targeting.industries,
          companySizes: next.targeting.companySizes,
          geographies: next.targeting.geographies,
          productDescription: next.identity.productDescription,
        }),
      }).catch((err) =>
        console.warn("ws-4: async TAM kickoff failed — will surface via notification poll", err),
      );

      // Mark onboarding complete. Synchronous — the user should land
      // on the dashboard as the onboarded state, not the onboarding
      // state.
      await fetch("/api/onboarding/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "complete",
          onboardingCompleted: true,
        }),
      });

      onComplete();
    },
    [onComplete],
  );

  if (loading) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg-page)",
        }}
      >
        <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          <Loader2 size={14} className="animate-spin" />
          Getting ready…
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg-page)",
        }}
      >
        <div className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
          Couldn&apos;t set up onboarding: {error ?? "unknown error"}
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        overflowY: "auto",
        background: "var(--color-bg-page)",
      }}
    >
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="gradient-text text-lg font-bold tracking-tight">Elevay</h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          One screen. Confirm what I picked up, or edit anything that doesn&apos;t match.
        </p>
        <div className="mt-4">
          <OnboardingConfirmationCard
            inferred={data.inferred}
            targeting={data.targeting}
            guardrails={data.guardrails}
            onConfirm={handleConfirm}
            onEdit={(nextData) => {
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      inferred: nextData.identity,
                      targeting: nextData.targeting,
                    }
                  : prev,
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
