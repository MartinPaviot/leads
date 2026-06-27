import type { ChannelAdapter, DispatchInput, DispatchResult } from "./types";
import { makeManualTaskAdapter } from "./task-adapter";

/**
 * LinkedIn message adapter.
 *
 * Two modes, chosen at dispatch time by `LINKEDIN_OUTREACH_PROVIDER`:
 *   - UNSET (today): manual-task mode — record a "Needs you" task so the founder
 *     sends the LinkedIn touch by hand. This makes the multi-channel cadence real
 *     now, with no provider dependency (Unipile / Expandi / PhantomBuster).
 *   - SET: the live send path — NOT implemented yet, so it fails loudly rather
 *     than silently doing nothing, signalling the provider client must be wired
 *     here before enabling real sends.
 *
 * Shape of channel_config expected once live:
 *   { provider, connectionNoteTemplate, messageTemplate, campaignId? }
 */
const manualTask = makeManualTaskAdapter("linkedin_message");

export const linkedinMessageAdapter: ChannelAdapter = {
  type: "linkedin_message",
  // Always available: manual-task mode needs no credentials; live mode is gated
  // inside dispatch by the provider env (and fails loudly until implemented).
  isAvailable(): boolean {
    return true;
  },
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const provider = process.env.LINKEDIN_OUTREACH_PROVIDER;
    if (provider && provider.trim().length > 0) {
      // Live provider declared but the client isn't built — fail loudly so a
      // half-wired integration never silently drops a step.
      return {
        ok: false,
        channel: "linkedin_message",
        error: `LinkedIn provider "${provider}" set but the live send client is not implemented — wire it in lib/sequence-dispatch/linkedin-adapter.ts before enabling live linkedin_message sends. step.id=${input.step.id}`,
      };
    }
    // No live provider → manual touch in the Needs-you lane.
    return manualTask.dispatch(input);
  },
};
