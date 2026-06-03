import { recomputeTenant } from "../src/inngest/icp-fit-recompute";
async function main() {
  const t = process.argv[2] ?? "47dca783-dac0-45a5-85cb-d217b2a3174d";
  const r = await recomputeTenant(t);
  console.log(`Recompute: companies=${r.companies} icps=${r.icps} cells=${r.cells}`);
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
