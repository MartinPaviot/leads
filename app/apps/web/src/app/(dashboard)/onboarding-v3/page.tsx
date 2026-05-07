import { OnboardingWizard } from "@/components/onboarding-7phase/wizard";

/**
 * MONACO-PARITY-03 — entry route for the 7-phase wizard.
 *
 * Mounted at `/onboarding-v3` (parallel to the existing
 * `/components/onboarding-wizard.tsx` chat-based flow) so the new
 * structurally-rigorous flow can iterate without breaking anyone
 * already mid-onboarding on the old surface. Once the new flow is
 * proven, the route can be promoted to `/welcome` or the home page
 * can redirect new tenants to it directly.
 */
export default function OnboardingV3Page() {
  return <OnboardingWizard />;
}
