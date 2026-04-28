"use client";

import { useEffect, useState } from "react";

/**
 * Determines which onboarding flow to render based on feature flags.
 *
 * Returns `"v2"` when ALL v2-gated flags are ON (confirmation card +
 * warm-lead prompt + async TAM reveal). If any flag is OFF, returns
 * `"v1"` so the full wizard is used instead.
 *
 * The `loading` state starts `true` and flips to `false` after the
 * flag fetch resolves. Callers should avoid rendering either version
 * until `loading` is `false` to prevent a flash of the wrong UI.
 *
 * Flag fetch failure defaults to `"v1"` (safe fallback — the wizard
 * has been stable since launch).
 */

export type OnboardingVersion = "v1" | "v2";

interface UseOnboardingVersionResult {
  version: OnboardingVersion;
  loading: boolean;
  /** Individual flags for components that need them (e.g. WarmLeadPrompt). */
  flags: {
    confirmationCard: boolean;
    warmLeadPrompt: boolean;
    tamRevealAsync: boolean;
  };
}

const V2_FLAGS = [
  "onboarding.v2.confirmation-card",
  "onboarding.v2.warm-lead-prompt",
  "onboarding.v2.tam-reveal-async",
] as const;

export function useOnboardingVersion(): UseOnboardingVersionResult {
  const [flagMap, setFlagMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/experiments")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const flags = (payload?.flags ?? {}) as Record<string, boolean>;
        setFlagMap(flags);
      })
      .catch(() => {
        // v1 default — flagMap stays empty → all flags false → version = "v1"
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const confirmationCard = !!flagMap["onboarding.v2.confirmation-card"];
  const warmLeadPrompt = !!flagMap["onboarding.v2.warm-lead-prompt"];
  const tamRevealAsync = !!flagMap["onboarding.v2.tam-reveal-async"];

  const allV2On = V2_FLAGS.every((f) => !!flagMap[f]);
  const version: OnboardingVersion = allV2On ? "v2" : "v1";

  return {
    version,
    loading,
    flags: {
      confirmationCard,
      warmLeadPrompt,
      tamRevealAsync,
    },
  };
}
