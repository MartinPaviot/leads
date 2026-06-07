/**
 * Controlled Twilio dial test (throwaway). Proves the account can place an
 * outbound call + which caller-ID format Twilio accepts, WITHOUT needing the
 * app prod deploy or browser mic. Uses Twilio's public demo TwiML.
 *
 * Usage (with cert bundle):
 *   TEST_TO="+41…" TEST_FROM="+33638345231" \
 *     NODE_EXTRA_CA_CERTS="C:/Users/marti/leads/.cacerts.pem" \
 *     npx tsx --env-file=.env.local scripts/_voice-test.ts
 */
async function main() {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const tok = process.env.TWILIO_AUTH_TOKEN ?? "";
  const to = process.env.TEST_TO ?? "";
  const from = process.env.TEST_FROM ?? "";
  if (!to || !from) { console.error("Set TEST_TO and TEST_FROM env vars."); process.exit(1); }
  console.log(`cert=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "MISSING"}`);
  console.log(`Placing test call: from=${from} -> to=${to} (Twilio demo TwiML)`);

  const auth = Buffer.from(`${sid}:${tok}`).toString("base64");
  const form = new URLSearchParams({
    To: to,
    From: from,
    Url: "http://demo.twilio.com/docs/voice.xml", // public demo: speaks a short message
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(body); } catch { /* */ }
  console.log(`status=${res.status}`);
  if (res.ok) {
    console.log(`OK -> callSid=${json?.sid} status=${json?.status} from=${json?.from} to=${json?.to}`);
    console.log(`The test phone should ring now. Caller ID shown should be ${json?.from}.`);
  } else {
    console.log(`ERROR body: ${body.slice(0, 400)}`);
    console.log(`(code 21210/21211 = invalid From; we'll try the other format.)`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
