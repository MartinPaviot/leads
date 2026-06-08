/**
 * Trigger a Twilio caller-ID verification (throwaway). Twilio calls the given
 * number and reads/expects a 6-digit code. Also re-lists current caller IDs +
 * FR/CH dialing permissions so we see the real state.
 *
 *   VERIFY_NUMBER="+33638345231" NODE_EXTRA_CA_CERTS=... \
 *     npx tsx --env-file=.env.local scripts/_voice-verify.ts
 */
async function tw(method: string, host: string, path: string, form?: Record<string, string>) {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const tok = process.env.TWILIO_AUTH_TOKEN ?? "";
  const auth = Buffer.from(`${sid}:${tok}`).toString("base64");
  const init: RequestInit = { method, headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(20_000) };
  if (form) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(form);
  }
  const res = await fetch(`https://${host}${path}`, init);
  const body = await res.text();
  try { return { status: res.status, json: JSON.parse(body) as Record<string, unknown> }; } catch { return { status: res.status, json: null, body }; }
}

async function main() {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const num = process.env.VERIFY_NUMBER ?? "";
  console.log(`cert=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "MISSING"}`);

  // Dialing permissions (can the account call FR / CH at all?)
  for (const cc of ["FR", "CH"]) {
    const p = await tw("GET", "voice.twilio.com", `/v1/DialingPermissions/Countries/${cc}`);
    console.log(`GEO ${cc}: status=${p.status} lowRisk=${p.json?.low_risk_numbers_enabled} highRisk=${p.json?.high_risk_special_numbers_enabled}`);
  }

  // Current verified caller IDs
  const list = await tw("GET", "api.twilio.com", `/2010-04-01/Accounts/${sid}/OutgoingCallerIds.json?PageSize=20`);
  const ids = (list.json?.outgoing_caller_ids ?? []) as Array<Record<string, unknown>>;
  console.log(`CALLER IDs: ${ids.map((v) => `${v.phone_number}[sid=${String(v.sid).slice(0,10)}]`).join(", ") || "(none)"}`);

  if (!num) { console.log("\nNo VERIFY_NUMBER set — skipping verification trigger."); return; }

  // Trigger verification — Twilio calls `num` and the callee enters the code.
  const v = await tw("POST", "api.twilio.com", `/2010-04-01/Accounts/${sid}/OutgoingCallerIds.json`, { PhoneNumber: num, FriendlyName: "Elevay caller ID" });
  console.log(`\nVERIFY status=${v.status}`);
  if (v.status >= 200 && v.status < 300) {
    console.log(`>>> Twilio is calling ${num} now. ENTER THIS CODE on the keypad: ${v.json?.validation_code}`);
  } else {
    console.log(`body: ${JSON.stringify(v.json) || (v as { body?: string }).body}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
