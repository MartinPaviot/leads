/**
 * Twilio implementation of the VoiceProvider interface.
 *
 * The `twilio` npm package is loaded via dynamic import so the rest
 * of the app keeps building when the package isn't installed (early
 * dev environments). All envs are read lazily so tests can inject
 * fakes without polluting process.env.
 */

import {
  type VoiceProvider,
  type CreateCallInput,
  type CreatedCall,
  type WebRtcTokenInput,
  type WebRtcToken,
  type BuyNumberInput,
  type PurchasedNumber,
  type WebhookValidationInput,
  type RecordingInfo,
  VoiceProviderError,
} from "./provider";

type TwilioModule = typeof import("twilio");
type TwilioClient = ReturnType<TwilioModule>;

let cachedModule: TwilioModule | null = null;
let cachedClient: TwilioClient | null = null;

async function loadTwilio(): Promise<TwilioModule> {
  if (cachedModule) return cachedModule;
  try {
    cachedModule = (await import("twilio")).default as unknown as TwilioModule;
    return cachedModule;
  } catch (err) {
    throw new VoiceProviderError(
      "twilio package not installed — `pnpm add twilio` to enable voice",
      "not_configured",
      err,
    );
  }
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new VoiceProviderError(
      `Missing env ${name} — see docs/voice-bootstrap.md`,
      "not_configured",
    );
  }
  return value;
}

async function getClient(): Promise<TwilioClient> {
  if (cachedClient) return cachedClient;
  const twilio = await loadTwilio();
  const sid = readEnv("TWILIO_ACCOUNT_SID");
  const token = readEnv("TWILIO_AUTH_TOKEN");
  const region = process.env.TWILIO_REGION || undefined;
  cachedClient = twilio(sid, token, region ? { region } : undefined);
  return cachedClient;
}

export const twilioProvider: VoiceProvider = {
  name: "twilio",

  async createCall(input: CreateCallInput): Promise<CreatedCall> {
    const client = await getClient();
    try {
      // The TwiML URL receives the full call context and returns the
      // <Dial><Stream> instructions. The `callId` query param lets the
      // webhook handler look up our internal row in O(1).
      const twimlUrl = new URL(`${input.webhookBaseUrl}/api/calls/twiml`);
      twimlUrl.searchParams.set("callId", input.callId);
      twimlUrl.searchParams.set("tenantId", input.tenantId);
      if (input.recordingDisclosureUrl) {
        twimlUrl.searchParams.set(
          "disclosureUrl",
          input.recordingDisclosureUrl,
        );
      }
      const statusUrl = `${input.webhookBaseUrl}/api/calls/recording-status`;

      const call = await client.calls.create({
        from: input.fromNumber,
        to: input.toNumber,
        url: twimlUrl.toString(),
        statusCallback: statusUrl,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
        // Async recording — backup capture in case Media Streams drops.
        record: true,
        recordingStatusCallback: statusUrl,
        recordingStatusCallbackMethod: "POST",
        // Twilio's machine detection helps the post-call worker route
        // outcomes (machine → voicemail_left, human → connected).
        machineDetection: "DetectMessageEnd",
      });

      return { providerCallSid: call.sid };
    } catch (err) {
      throw new VoiceProviderError(
        "Twilio call creation failed",
        "provider_down",
        err,
      );
    }
  },

  async signWebRtcToken(input: WebRtcTokenInput): Promise<WebRtcToken> {
    const twilio = await loadTwilio();
    const accountSid = readEnv("TWILIO_ACCOUNT_SID");
    const apiKey = readEnv("TWILIO_API_KEY_SID");
    const apiSecret = readEnv("TWILIO_API_KEY_SECRET");
    const appSid = readEnv("TWILIO_APP_SID");

    const ttl = input.ttlSec ?? 3600;
    const identity = `tenant-${input.tenantId}-user-${input.userId}`;

    const AccessToken = (twilio as unknown as {
      jwt: {
        AccessToken: new (
          accountSid: string,
          apiKey: string,
          apiSecret: string,
          opts: { identity: string; ttl: number },
        ) => {
          addGrant: (grant: unknown) => void;
          toJwt: () => string;
        };
      };
    }).jwt.AccessToken;

    const VoiceGrant = (twilio as unknown as {
      jwt: {
        AccessToken: {
          VoiceGrant: new (opts: {
            outgoingApplicationSid: string;
            incomingAllow: boolean;
          }) => unknown;
        };
      };
    }).jwt.AccessToken.VoiceGrant;

    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity,
      ttl,
    });
    const grant = new VoiceGrant({
      outgoingApplicationSid: appSid,
      incomingAllow: false,
    });
    token.addGrant(grant);

    return {
      jwt: token.toJwt(),
      identity,
      expiresAt: new Date(Date.now() + ttl * 1000),
    };
  },

  validateWebhookSignature(input: WebhookValidationInput): boolean {
    // Sync path — validation runs on every webhook so we cannot await
    // the dynamic import lazily. We require the package to be loaded
    // by the time a webhook arrives; if it isn't, throw so the route
    // returns 503 rather than silently trusting the payload.
    if (!cachedModule) {
      throw new VoiceProviderError(
        "twilio module not loaded before validating webhook — call signWebRtcToken or createCall first",
        "not_configured",
      );
    }
    const authToken = readEnv("TWILIO_AUTH_TOKEN");
    return cachedModule.validateRequest(
      authToken,
      input.signature,
      input.url,
      input.params,
    );
  },

  async buyNumber(input: BuyNumberInput): Promise<PurchasedNumber> {
    const client = await getClient();
    try {
      const available = await client
        .availablePhoneNumbers(input.countryCode)
        .local.list({
          areaCode: input.areaCode ? Number(input.areaCode) : undefined,
          voiceEnabled: true,
          smsEnabled: input.smsCapability ?? false,
          limit: 1,
        });
      if (available.length === 0) {
        throw new VoiceProviderError(
          `No Twilio inventory for ${input.countryCode}${input.areaCode ? ` area ${input.areaCode}` : ""}`,
          "no_inventory",
        );
      }
      const target = available[0];
      const purchased = await client.incomingPhoneNumbers.create({
        phoneNumber: target.phoneNumber,
      });
      return {
        e164: purchased.phoneNumber,
        providerSid: purchased.sid,
        countryCode: input.countryCode,
        areaCode: input.areaCode ?? null,
        voiceCapability: true,
        smsCapability: input.smsCapability ?? false,
      };
    } catch (err) {
      if (err instanceof VoiceProviderError) throw err;
      throw new VoiceProviderError(
        "Twilio buyNumber failed",
        "provider_down",
        err,
      );
    }
  },

  async redirectCall(
    providerCallSid: string,
    twiml: string,
  ): Promise<void> {
    const client = await getClient();
    try {
      await client.calls(providerCallSid).update({ twiml });
    } catch (err) {
      throw new VoiceProviderError(
        "Twilio redirect failed",
        "provider_down",
        err,
      );
    }
  },

  async getRecording(providerCallSid: string): Promise<RecordingInfo | null> {
    const client = await getClient();
    try {
      const recordings = await client.recordings.list({
        callSid: providerCallSid,
        limit: 1,
      });
      if (recordings.length === 0) return null;
      const r = recordings[0];
      const accountSid = readEnv("TWILIO_ACCOUNT_SID");
      // Twilio media URLs require basic auth — we expose a proxied
      // endpoint that authenticates the user then streams the bytes.
      const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${r.sid}.mp3`;
      return {
        url: mediaUrl,
        durationSec: Number(r.duration ?? 0),
      };
    } catch (err) {
      throw new VoiceProviderError(
        "Twilio getRecording failed",
        "provider_down",
        err,
      );
    }
  },
};

// Helper used by the TwiML route to assemble the response. Kept here
// so the twilio package import stays scoped to this module.
export async function buildTwiml(opts: {
  toNumber: string;
  fromNumber: string;
  streamUrl: string;
  disclosureUrl?: string;
  recordingStatusUrl: string;
}): Promise<string> {
  const twilio = await loadTwilio();
  const VoiceResponse = (twilio as unknown as {
    twiml: {
      VoiceResponse: new () => {
        play: (url: string) => unknown;
        start: () => { stream: (opts: { url: string }) => unknown };
        dial: (
          opts: { callerId: string; record?: string; recordingStatusCallback?: string },
          to?: string,
        ) => { number: (n: string) => unknown };
        toString: () => string;
      };
    };
  }).twiml.VoiceResponse;

  const r = new VoiceResponse();
  if (opts.disclosureUrl) {
    // Disclosure plays once at connect — required by two-party-consent
    // regions (France + several US states). Pre-recorded MP3, ~5s.
    r.play(opts.disclosureUrl);
  }
  // Start Deepgram bidirectional stream BEFORE dial so we capture the
  // disclosure and any greeting on either side.
  r.start().stream({ url: opts.streamUrl });
  // Dial the prospect with the tenant's caller-id; record both legs.
  const dial = r.dial(
    {
      callerId: opts.fromNumber,
      record: "record-from-answer-dual",
      recordingStatusCallback: opts.recordingStatusUrl,
    },
    opts.toNumber,
  );
  dial.number(opts.toNumber);
  return r.toString();
}

/**
 * Build the TwiML used to drop a voicemail mid-call. Plays the
 * supplied MP3 once, then hangs up cleanly. Twilio updates the live
 * leg's instructions in-flight so the prospect hears the message
 * regardless of where in the greeting they are.
 */
export async function buildVoicemailDropTwiml(opts: {
  audioUrl: string;
}): Promise<string> {
  const twilio = await loadTwilio();
  const VoiceResponse = (twilio as unknown as {
    twiml: {
      VoiceResponse: new () => {
        play: (url: string) => unknown;
        hangup: () => unknown;
        toString: () => string;
      };
    };
  }).twiml.VoiceResponse;

  const r = new VoiceResponse();
  r.play(opts.audioUrl);
  r.hangup();
  return r.toString();
}

/**
 * Build the graceful fallback TwiML — served by /api/calls/twiml-fallback,
 * which Twilio's Voice "Fallback URL" hits ONLY when the primary TwiML
 * webhook errors or times out. Plays a short FR apology, then hangs up
 * cleanly, so a failure degrades politely instead of Twilio's default
 * error tone. Dependency-free on purpose (no DB, no signature) so it can
 * never itself fail the way the primary path might.
 */
export async function buildFallbackTwiml(opts?: { message?: string }): Promise<string> {
  const twilio = await loadTwilio();
  const VoiceResponse = (twilio as unknown as {
    twiml: {
      VoiceResponse: new () => {
        say: (attrs: { language?: string }, message: string) => unknown;
        hangup: () => unknown;
        toString: () => string;
      };
    };
  }).twiml.VoiceResponse;

  const r = new VoiceResponse();
  r.say(
    { language: "fr-FR" },
    opts?.message ??
      "Nous rencontrons un incident technique et ne pouvons pas poursuivre cet appel. Nous vous recontacterons rapidement. Merci et excusez-nous.",
  );
  r.hangup();
  return r.toString();
}
