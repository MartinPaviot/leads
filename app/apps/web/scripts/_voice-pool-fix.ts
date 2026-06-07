/**
 * Pool hygiene (throwaway): deactivate the stale US number the Twilio account
 * no longer owns. The working caller ID is added once the dial test confirms
 * which E.164 format Twilio accepts.
 */
import { db } from "@/db";
import { phoneNumberPool } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const STALE = "+18028086396";

async function main() {
  const res = await db.update(phoneNumberPool).set({ active: false })
    .where(and(eq(phoneNumberPool.tenantId, tid), eq(phoneNumberPool.e164, STALE)))
    .returning({ e164: phoneNumberPool.e164, active: phoneNumberPool.active });
  console.log(`deactivated stale: ${JSON.stringify(res)}`);
  const pool = await db.select({ e164: phoneNumberPool.e164, active: phoneNumberPool.active }).from(phoneNumberPool).where(eq(phoneNumberPool.tenantId, tid));
  console.log(`pool now: ${JSON.stringify(pool)}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
