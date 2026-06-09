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

// ISO country code -> English name, used to match an approved Regulatory
// Bundle by its friendly name (the Bundles list doesn't expose iso_country).
const COUNTRY_NAMES: Record<string, string> = {
  CH: "Switzerland",
  FR: "France",
  BE: "Belgium",
  GB: "United Kingdom",
  DE: "Germany",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  PT: "Portugal",
  IE: "Ireland",
};

/**
 * Find the account's validated local Address and approved Regulatory Bundle
 * for a country, needed to purchase regulated numbers (CH, FR, ...). Returns
 * empty SIDs when none exist so the caller can fail with a clear message.
 */
async function resolveRegulatory(
  client: TwilioClient,
  countryCode: string,
): Promise<{ addressSid?: string; bundleSid?: string }> {
  const out: { addressSid?: string; bundleSid?: string } = {};
  try {
    const addresses = await client.addresses.list({ limit: 50 });
    const match = addresses.find(
      (a) => a.isoCountry === countryCode && a.validated,
    ) ?? addresses.find((a) => a.isoCountry === countryCode);
    if (match) out.addressSid = match.sid;
  } catch {
    /* addresses unavailable — leave unset */
  }
  try {
    const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list({
      status: "twilio-approved",
      limit: 50,
    });
    const name = COUNTRY_NAMES[countryCode]?.toLowerCase();
    const match =
      (name &&
        bundles.find((b) =>
          (b.friendlyName ?? "").toLowerCase().includes(name),
        )) ||
      (bundles.length === 1 ? bundles[0] : undefined);
    if (match) out.bundleSid = match.sid;
  } catch {
    /* bundles unavailable — leave unset */
  }
  return out;
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

      // Recording is OFF by default. In two-party-consent regions (CH/FR)
      // recording without an audible disclosure is unlawful (CH art. 179bis is
      // criminal), so we never record silently. Set VOICE_RECORDING_ENABLED=true
      // ONLY once a disclosure is wired (VOICE_DISCLOSURE_AUDIO_URL), so the
      // disclosure plays before any capture.
      const recordingEnabled = process.env.VOICE_RECORDING_ENABLED === "true";

      const call = await client.calls.create({
        from: input.fromNumber,
        to: input.toNumber,
        url: twimlUrl.toString(),
        statusCallback: statusUrl,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
        ...(recordingEnabled
          ? {
              record: true,
              recordingStatusCallback: statusUrl,
              recordingStatusCallbackMethod: "POST" as const,
            }
          : {}),
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
      // `contains` (E.164 prefix) wins for locality search; areaCode is the
      // NANP-only fallback. CH/FR city numbers are only findable via contains.
      const available = await client
        .availablePhoneNumbers(input.countryCode)
        .local.list({
          contains: input.contains || undefined,
          areaCode:
            !input.contains && input.areaCode ? Number(input.areaCode) : undefined,
          voiceEnabled: true,
          smsEnabled: input.smsCapability ?? false,
          limit: 1,
        });
      if (available.length === 0) {
        throw new VoiceProviderError(
          `No Twilio inventory for ${input.countryCode}${input.contains ? ` (${input.contains})` : input.areaCode ? ` area ${input.areaCode}` : ""}`,
          "no_inventory",
        );
      }
      const target = available[0];

      // Many non-US countries (CH, FR, ...) require a validated local Address
      // and an approved Regulatory Bundle to purchase. Attach the account's
      // country-matched ones when the number demands them.
      const createParams: {
        phoneNumber: string;
        addressSid?: string;
        bundleSid?: string;
      } = { phoneNumber: target.phoneNumber };
      const addrReq = (target.addressRequirements || "none").toLowerCase();
      if (addrReq !== "none") {
        const reg = await resolveRegulatory(client, input.countryCode);
        if (!reg.addressSid) {
          throw new VoiceProviderError(
            `${input.countryCode} numbers need a validated local address on the Twilio account (none found). Add one in Twilio Console → Regulatory.`,
            "address_required",
          );
        }
        createParams.addressSid = reg.addressSid;
        if (reg.bundleSid) createParams.bundleSid = reg.bundleSid;
      }

      const purchased = await client.incomingPhoneNumbers.create(createParams);
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
  /** Webhook that Twilio POSTs live transcript events to (serverless). */
  transcriptionCallbackUrl: string;
  /** BCP-47 language for transcription (default fr-FR for the romand wedge). */
  languageCode?: string;
  disclosureUrl?: string;
  recordingStatusUrl: string;
}): Promise<string> {
  const twilio = await loadTwilio();
  const VoiceResponse = (twilio as unknown as {
    twiml: {
      VoiceResponse: new () => {
        play: (url: string) => unknown;
        start: () => { transcription: (opts: Record<string, unknown>) => unknown };
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
  // Twilio-native real-time transcription (Deepgram nova-3 under the hood).
  // It POSTs transcript events to our webhook → calls.transcript → SSE → UI.
  // Fully serverless: no Media Streams WS server/tunnel to host. For an
  // outbound call inbound_track = the called party (prospect), outbound_track
  // = our caller-id leg (agent). Started BEFORE dial to catch the greeting.
  r.start().transcription({
    statusCallbackUrl: opts.transcriptionCallbackUrl,
    track: "both_tracks",
    transcriptionEngine: "deepgram",
    speechModel: "nova-3",
    languageCode: opts.languageCode ?? "fr-FR",
    inboundTrackLabel: "prospect",
    outboundTrackLabel: "agent",
    partialResults: false,
  });
  // Dial the prospect with the tenant's caller-id. Recording is opt-in only
  // (VOICE_RECORDING_ENABLED) — we never capture silently, since CH/FR require
  // an audible disclosure and recording without it is unlawful (CH criminal).
  const recordingEnabled = process.env.VOICE_RECORDING_ENABLED === "true";
  const dialOpts: { callerId: string; record?: string; recordingStatusCallback?: string } = {
    callerId: opts.fromNumber,
  };
  if (recordingEnabled) {
    dialOpts.record = "record-from-answer-dual";
    dialOpts.recordingStatusCallback = opts.recordingStatusUrl;
  }
  const dial = r.dial(dialOpts, opts.toNumber);
  dial.number(opts.toNumber);
  return r.toString();
}

/**
 * Build the TwiML for the AGENT leg of a Call Mode call.
 *
 * This is the App-SID voiceUrl target: the rep's browser (Twilio Voice SDK
 * `device.connect`) becomes the agent leg, and THIS TwiML dials the prospect
 * and bridges the two — so the rep's mic reaches the prospect (the missing
 * two-way path). Live transcription runs on both tracks; the prospect leg
 * carries a status callback so we can stamp connectedAt / endedAt.
 *
 * `answerOnBridge` makes the agent hear real ringback and the call only counts
 * as connected when the prospect actually answers.
 */
export async function buildAgentTwiml(opts: {
  toNumber: string;
  fromNumber: string;
  transcriptionCallbackUrl: string;
  /** Status callback for the prospect (child) leg → connectedAt/endedAt. */
  dialStatusCallbackUrl: string;
  languageCode?: string;
  disclosureUrl?: string;
  recordingStatusUrl: string;
}): Promise<string> {
  const twilio = await loadTwilio();
  const VoiceResponse = (twilio as unknown as {
    twiml: {
      VoiceResponse: new () => {
        play: (url: string) => unknown;
        say: (opts: Record<string, unknown>, msg: string) => unknown;
        start: () => { transcription: (opts: Record<string, unknown>) => unknown };
        dial: (
          opts: {
            callerId: string;
            answerOnBridge?: boolean;
            record?: string;
            recordingStatusCallback?: string;
          },
          to?: string,
        ) => { number: (opts: Record<string, unknown>, n: string) => unknown };
        toString: () => string;
      };
    };
  }).twiml.VoiceResponse;

  const r = new VoiceResponse();
  if (opts.disclosureUrl) {
    r.play(opts.disclosureUrl);
  }
  r.start().transcription({
    statusCallbackUrl: opts.transcriptionCallbackUrl,
    track: "both_tracks",
    transcriptionEngine: "deepgram",
    speechModel: "nova-3",
    languageCode: opts.languageCode ?? "fr-FR",
    inboundTrackLabel: "prospect",
    outboundTrackLabel: "agent",
    partialResults: false,
  });
  const recordingEnabled = process.env.VOICE_RECORDING_ENABLED === "true";
  const dialOpts: {
    callerId: string;
    answerOnBridge?: boolean;
    record?: string;
    recordingStatusCallback?: string;
  } = { callerId: opts.fromNumber, answerOnBridge: true };
  if (recordingEnabled) {
    dialOpts.record = "record-from-answer-dual";
    dialOpts.recordingStatusCallback = opts.recordingStatusUrl;
  }
  const dial = r.dial(dialOpts);
  dial.number(
    {
      statusCallback: opts.dialStatusCallbackUrl,
      statusCallbackEvent: "initiated ringing answered completed",
      statusCallbackMethod: "POST",
    },
    opts.toNumber,
  );
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
