/**
 * Trigger the synchronous, Inngest-free full ICP fit recompute for Pilae so the
 * new size floor + institutions ICP take effect on the existing companies now
 * (otherwise it waits for the nightly cron). Deterministic (criteria eval, no LLM).
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-icp-recompute.ts
 */
import { runFullRecompute } from "../src/lib/icp/fit-recompute-core";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

async function main() {
  const summary = await runFullRecompute(TENANT);
  if (!summary) {
    console.log("Recompute skipped: no scorable criteria.");
  } else {
    console.log("Recompute done:", JSON.stringify(summary, null, 2));
  }
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
