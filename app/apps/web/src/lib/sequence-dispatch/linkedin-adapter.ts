import type { ChannelAdapter, DispatchInput, DispatchResult } from "./types";

/**
 * LinkedIn message adapter — stub. No live credentials yet (Expandi /
 * PhantomBuster / Unipile integration is a follow-up), so the adapter
 * reports `isAvailable() === false` whenever `LINKEDIN_OUTREACH_PROVIDER`
 * isn't explicitly enabled in env. This lets the rest of the
 * dispatcher ship now and start persisting linkedin_message steps
 * without risk of accidentally firing a request to an integration that
 * doesn't exist.
 *
 * Shape of channel_config expected once live:
 *   {
 *     provider: "expandi" | "phantombuster" | "unipile",
 *     connectionNoteTemplate: string,  // used when not yet connected
 *     messageTemplate: string,         // used when already connected
 *     campaignId?: string,             // optional provider-side grouping
 *   }
 */
export const linkedinMessageAdapter: ChannelAdapter = {
  type: "linkedin_message",
  isAvailable(): boolean {
    const provider = process.env.LINKEDIN_OUTREACH_PROVIDER;
    return typeof provider === "string" && provider.trim().length > 0;
  },
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    // Intentionally unimplemented — should never be called while
    // `isAvailable()` is false. If someone wires credentials without
    // finishing the integration, we fail loudly rather than silently.
    const provider = process.env.LINKEDIN_OUTREACH_PROVIDER ?? "(unset)";
    return {
      ok: false,
      channel: "linkedin_message",
      error: `LinkedIn provider "${provider}" registered in env but adapter implementation is a stub — wire the provider client in lib/sequence-dispatch/linkedin-adapter.ts before enabling linkedin_message steps. input.step.id=${input.step.id}`,
    };
  },
};
