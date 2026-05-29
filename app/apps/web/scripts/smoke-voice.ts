/**
 * Voice smoke test — no-cost verification that Twilio creds are set
 * and valid.
 *
 * What it checks:
 *   1. All 5 required env vars are present
 *   2. TWILIO_ACCOUNT_SID matches the canonical ACxxxxxxxx... pattern
 *   3. Authenticated GET on /Accounts/{ACCOUNT_SID} returns 200
 *      (Twilio's free, idempotent identity endpoint — confirms
 *      account_sid + auth_token are valid as a pair, no SMS/voice
 *      side-effects)
 *   4. TWILIO_APP_SID points at a real TwiML App
 *
 * Does NOT:
 *   - Place any call
 *   - Send any SMS
 *   - Consume any Twilio credit
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/smoke-voice.ts
 */

type Status = "ok" | "fail" | "skip";

function badge(s: Status): string {
  return s === "ok" ? "[OK]" : s === "fail" ? "[FAIL]" : "[SKIP]";
}

function fail(msg: string): never {
  console.log(`\n${badge("fail")} ${msg}`);
  process.exit(1);
}

async function main() {
  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const KEY_SID = process.env.TWILIO_API_KEY_SID;
  const KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;
  const APP_SID = process.env.TWILIO_APP_SID;

  console.log("\n=== 1. Env vars presence ===");
  const presence: Record<string, boolean> = {
    TWILIO_ACCOUNT_SID: !!SID,
    TWILIO_AUTH_TOKEN: !!TOKEN,
    TWILIO_API_KEY_SID: !!KEY_SID,
    TWILIO_API_KEY_SECRET: !!KEY_SECRET,
    TWILIO_APP_SID: !!APP_SID,
  };
  for (const [name, ok] of Object.entries(presence)) {
    console.log(`  ${badge(ok ? "ok" : "fail")} ${name}`);
  }
  if (Object.values(presence).some((v) => !v)) {
    fail(
      "Missing env vars. Edit .env.local — see Twilio Console > Account > Keys & Credentials.",
    );
  }

  console.log("\n=== 2. ACCOUNT_SID shape ===");
  if (!SID!.startsWith("AC") || SID!.length !== 34) {
    fail(
      `TWILIO_ACCOUNT_SID should match /AC[0-9a-f]{32}/ (got length ${SID!.length}, prefix ${SID!.slice(0, 2)}).`,
    );
  }
  console.log(`  ${badge("ok")} ACxx... pattern + 34 chars`);

  console.log("\n=== 3. Auth probe — GET /Accounts/{SID} ===");
  const basic = Buffer.from(`${SID}:${TOKEN}`).toString("base64");
  const accountUrl = `https://api.twilio.com/2010-04-01/Accounts/${SID}.json`;
  try {
    const res = await fetch(accountUrl, {
      method: "GET",
      headers: { Authorization: `Basic ${basic}` },
    });
    if (res.status === 401) {
      fail(
        "401 from Twilio — TWILIO_AUTH_TOKEN doesn't match the account. Regenerate in Console > Account > API keys & tokens > Auth Token.",
      );
    }
    if (!res.ok) {
      fail(`Twilio /Accounts returned ${res.status}.`);
    }
    const account = (await res.json()) as {
      sid: string;
      friendly_name: string;
      status: string;
      type: string;
    };
    console.log(`  ${badge("ok")} auth valid`);
    console.log(`       Account: ${account.friendly_name} (${account.type})`);
    console.log(`       Status:  ${account.status}`);
    if (account.status !== "active") {
      console.log(
        `       Note: status is '${account.status}' — Twilio account may be suspended.`,
      );
    }
  } catch (err) {
    fail(
      `Network or fetch error talking to Twilio: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  console.log("\n=== 4. TwiML App lookup — GET /Applications/{APP_SID} ===");
  if (!APP_SID!.startsWith("AP") || APP_SID!.length !== 34) {
    fail(
      `TWILIO_APP_SID should match /AP[0-9a-f]{32}/ (got length ${APP_SID!.length}, prefix ${APP_SID!.slice(0, 2)}).`,
    );
  }
  const appUrl = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Applications/${APP_SID}.json`;
  try {
    const res = await fetch(appUrl, {
      method: "GET",
      headers: { Authorization: `Basic ${basic}` },
    });
    if (res.status === 404) {
      fail(
        `TWILIO_APP_SID ${APP_SID} not found on this account. Create a TwiML App in Console > Develop > Voice > TwiML > TwiML Apps.`,
      );
    }
    if (!res.ok) {
      fail(`Twilio /Applications returned ${res.status}.`);
    }
    const app = (await res.json()) as {
      sid: string;
      friendly_name: string;
      voice_url: string | null;
    };
    console.log(`  ${badge("ok")} TwiML App exists`);
    console.log(`       Name:      ${app.friendly_name}`);
    console.log(`       VoiceUrl:  ${app.voice_url || "<not set>"}`);
    if (!app.voice_url) {
      console.log(
        "       Note: VoiceUrl is empty — Twilio won't know where to fetch TwiML when the app is dialed. Set it to your VOICE_PUBLIC_BASE_URL/api/calls/twiml.",
      );
    }
  } catch (err) {
    fail(
      `Network error on /Applications: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  console.log("\n=== 5. API Key check — Voice SDK signing ===");
  if (!KEY_SID!.startsWith("SK") || KEY_SID!.length !== 34) {
    fail(
      `TWILIO_API_KEY_SID should match /SK[0-9a-f]{32}/ (got length ${KEY_SID!.length}, prefix ${KEY_SID!.slice(0, 2)}).`,
    );
  }
  console.log(`  ${badge("ok")} SKxx... pattern + 34 chars`);
  console.log(
    "       Note: secret can't be re-verified after creation — if Voice SDK 401s, regenerate the key pair.",
  );

  console.log(
    "\n=== Smoke test passed. Open /insights/hot-to-call and click Call to actually dial. ===\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
