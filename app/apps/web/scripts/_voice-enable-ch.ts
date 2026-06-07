/** Enable CH (Switzerland) low-risk voice dialing via Twilio API (throwaway). */
async function tw(method: string, path: string, form?: Record<string, string>) {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const tok = process.env.TWILIO_AUTH_TOKEN ?? "";
  const auth = Buffer.from(`${sid}:${tok}`).toString("base64");
  const init: RequestInit = { method, headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(20_000) };
  if (form) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(form);
  }
  const res = await fetch(`https://voice.twilio.com${path}`, init);
  const body = await res.text();
  try { return { status: res.status, json: JSON.parse(body) as Record<string, unknown> }; } catch { return { status: res.status, body }; }
}

async function main() {
  console.log(`cert=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "MISSING"}`);
  const before = await tw("GET", "/v1/DialingPermissions/Countries/CH");
  console.log(`CH before: lowRisk=${(before as { json?: Record<string, unknown> }).json?.low_risk_numbers_enabled}`);

  // Bulk country update — enable low-risk dialing for CH.
  const upd = await tw("POST", "/v1/DialingPermissions/BulkCountryUpdates", {
    UpdateRequest: JSON.stringify([
      { iso_code: "CH", low_risk_numbers_enabled: true, high_risk_special_numbers_enabled: false, high_risk_tollfraud_numbers_enabled: false },
    ]),
  });
  console.log(`BulkUpdate status=${upd.status} body=${JSON.stringify((upd as { json?: unknown }).json ?? (upd as { body?: string }).body).slice(0, 200)}`);

  const after = await tw("GET", "/v1/DialingPermissions/Countries/CH");
  console.log(`CH after: lowRisk=${(after as { json?: Record<string, unknown> }).json?.low_risk_numbers_enabled}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
