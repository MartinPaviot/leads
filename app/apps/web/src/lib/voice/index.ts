/**
 * Voice provider factory.
 *
 * `getVoiceProvider()` returns the configured impl or `null` when no
 * provider creds are present. Routes use the null case to return 503
 * rather than throwing, so the rest of the app keeps running when the
 * tenant hasn't enabled Call Mode.
 */

import type { VoiceProvider } from "./provider";
import { twilioProvider } from "./twilio";

export function isVoiceConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_API_KEY_SID &&
      process.env.TWILIO_API_KEY_SECRET &&
      process.env.TWILIO_APP_SID,
  );
}

export function getVoiceProvider(): VoiceProvider | null {
  if (!isVoiceConfigured()) return null;
  return twilioProvider;
}

export { VoiceProviderError } from "./provider";
export type {
  VoiceProvider,
  CreateCallInput,
  CreatedCall,
  WebRtcToken,
  WebRtcTokenInput,
  BuyNumberInput,
  PurchasedNumber,
  WebhookValidationInput,
  RecordingInfo,
} from "./provider";
