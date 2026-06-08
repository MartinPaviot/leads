/** Voice/Twilio readiness audit (throwaway). Run with the cert bundle. */
import { db } from "@/db";
import { phoneNumberPool } from "@/db/schema";
import { eq } from "drizzle-orm";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";

async function tw(path: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const tok = process.env.TWILIO_AUTH_TOKEN ?? "";
  const auth = Buffer.from(`${sid}:${tok}`).toString("base64");
  const res = await fetch(`https://api.twilio.com${path}`, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) });
  const body = await res.text();
  try { return { status: res.status, json: JSON.parse(body) }; } catch { return { status: res.status, json: null, body }; }
}

async function main() {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
  console.log(`cert=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "MISSING"}  TWILIO_ACCOUNT_SID=${sid.slice(0, 8)}…`);
  console.log(`VOICE_PUBLIC_BASE_URL=${process.env.VOICE_PUBLIC_BASE_URL ?? "(unset)"}  AUTH_URL=${process.env.AUTH_URL ?? "(unset)"}`);
  console.log(`VOICE_DISCLOSURE_AUDIO_URL=${process.env.VOICE_DISCLOSURE_AUDIO_URL ?? "(unset)"}`);

  // Account status (Trial vs Full) + type
  const acct = await tw(`/2010-04-01/Accounts/${sid}.json`);
  console.log(`\nACCOUNT status=${acct.status} type=${acct.json?.type ?? "?"} accStatus=${acct.json?.status ?? "?"} name=${acct.json?.friendly_name ?? "?"}`);

  // Balance
  const bal = await tw(`/2010-04-01/Accounts/${sid}/Balance.json`);
  console.log(`BALANCE status=${bal.status} balance=${bal.json?.balance ?? "?"} ${bal.json?.currency ?? ""}`);

  // Owned numbers
  const nums = await tw(`/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=20`);
  const list = (nums.json?.incoming_phone_numbers ?? []) as Array<Record<string, unknown>>;
  console.log(`\nOWNED NUMBERS status=${nums.status} count=${list.length}`);
  for (const n of list) console.log(`  ${n.phone_number} (${n.friendly_name}) voice=${(n.capabilities as Record<string, unknown>)?.voice}`);

  // Trial accounts: verified caller IDs (the only numbers a trial can call)
  const vc = await tw(`/2010-04-01/Accounts/${sid}/OutgoingCallerIds.json?PageSize=20`);
  const vlist = (vc.json?.outgoing_caller_ids ?? []) as Array<Record<string, unknown>>;
  console.log(`\nVERIFIED CALLER IDs status=${vc.status} count=${vlist.length}`);
  for (const v of vlist) console.log(`  ${v.phone_number} (${v.friendly_name})`);

  // Our pool for the tenant
  const pool = await db.select().from(phoneNumberPool).where(eq(phoneNumberPool.tenantId, tid));
  console.log(`\nPHONE_NUMBER_POOL (tenant ${tid.slice(0, 8)}): ${pool.length} rows`);
  for (const p of pool) console.log(`  ${p.e164} active=${p.active} country=${p.countryCode} sid=${p.twilioSid}`);

  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
