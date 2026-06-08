/** Add the verified +33 caller ID to the tenant pool (throwaway, idempotent). */
import { db } from "@/db";
import { phoneNumberPool } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const E164 = "+33638345231";

async function main() {
  const [exists] = await db.select({ id: phoneNumberPool.id }).from(phoneNumberPool)
    .where(and(eq(phoneNumberPool.tenantId, tid), eq(phoneNumberPool.e164, E164))).limit(1);
  if (exists) {
    await db.update(phoneNumberPool).set({ active: true, countryCode: "FR" }).where(eq(phoneNumberPool.id, exists.id));
    console.log(`reactivated existing ${E164}`);
  } else {
    await db.insert(phoneNumberPool).values({
      tenantId: tid, e164: E164, twilioSid: "verified-caller-id", countryCode: "FR",
      areaCode: null, voiceCapability: true, smsCapability: false, active: true,
    });
    console.log(`inserted ${E164} (FR, verified caller id)`);
  }
  const pool = await db.select({ e164: phoneNumberPool.e164, active: phoneNumberPool.active, cc: phoneNumberPool.countryCode }).from(phoneNumberPool).where(eq(phoneNumberPool.tenantId, tid));
  console.log(`pool now: ${JSON.stringify(pool)}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
