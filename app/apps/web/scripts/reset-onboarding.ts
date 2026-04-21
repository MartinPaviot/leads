/**
 * Dev helper: reset the onboarding flow for a given tenant so the
 * wizard re-opens on next navigation. Used to validate the two
 * onboarding wow effects (narrative streaming, TAM estimate live)
 * end-to-end in a browser without creating a brand-new signup.
 *
 * Run: `npx tsx scripts/reset-onboarding.ts <tenantId>`
 */

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const tenantId = process.argv[2];
if (!tenantId) {
  console.error("usage: npx tsx scripts/reset-onboarding.ts <tenantId>");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, prepare: false });

async function main() {
  const before = await sql<Array<{ id: string; settings: Record<string, unknown> }>>`
    SELECT id, settings FROM tenants WHERE id = ${tenantId} LIMIT 1
  `;
  if (before.length === 0) {
    console.error(`tenant not found: ${tenantId}`);
    await sql.end({ timeout: 1 });
    process.exit(2);
  }
  const row = before[0];
  const settings = { ...(row.settings ?? {}) };
  console.log(
    `before: onboardingCompleted=${settings.onboardingCompleted} currentStep=${settings.onboardingCurrentStep}`,
  );

  // Wipe the flags the wizard checks on mount. Leave the captured
  // company profile (fullName, companyName, domain, productDesc…)
  // alone so re-entering the wizard isn't a total do-over; the
  // narrative + estimate effects only care about `domain`.
  delete settings.onboardingCompleted;
  delete settings.onboardingCompletedAt;
  delete settings.onboardingCurrentStep;

  await sql`
    UPDATE tenants SET settings = ${JSON.stringify(settings)}::jsonb, updated_at = now()
    WHERE id = ${tenantId}
  `;
  console.log(`after:  onboardingCompleted=undefined currentStep=undefined`);
  await sql.end({ timeout: 1 });
  process.exit(0);
}

main();
