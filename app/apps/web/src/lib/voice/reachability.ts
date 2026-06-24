/**
 * Reachability scoring shared by the call queue.
 *
 * The `?accounts=` buildQueue path (lib/voice/queue.ts) derives a per-contact
 * accessibility score from the phone type; the default campaign queue
 * (api/calls/campaign/route.ts) used to hardcode 0.7 for everyone, so the
 * reachability pill + summary ran off a constant. This is the single source of
 * truth for the mapping so both paths agree.
 */
export function accessibilityScoreFromPhoneType(
  phoneType: string | null | undefined,
): number {
  return phoneType === "mobile"
    ? 1.0
    : phoneType === "direct"
      ? 0.7
      : phoneType === "switchboard"
        ? 0.4
        : 0.5;
}
