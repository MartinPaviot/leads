/**
 * Cognism API probe (throwaway) — run ONCE you have COGNISM_API_KEY to dump the
 * REAL response shapes, so the client mapping is built right (not guessed).
 * Mirrors how we validated Lusha/Twilio live before trusting field names.
 *
 *   COGNISM_API_KEY=... NODE_EXTRA_CA_CERTS="C:/Users/marti/leads/.cacerts.pem" \
 *     npx tsx --env-file=.env.local scripts/_cognism-probe.ts
 *
 * Docs (gated): https://developers.cognism.com  + help.cognism.com (Search/Enrich/Redeem APIs)
 * Auth: Authorization: Bearer {key}. Base: https://app.cognism.com/api/search
 */
const BASE = "https://app.cognism.com/api/search";

async function call(path: string, body: unknown) {
  const key = process.env.COGNISM_API_KEY ?? "";
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  const rl: Record<string, string> = {};
  res.headers.forEach((v, k) => { if (/rate|limit|remain|reset/i.test(k)) rl[k] = v; });
  console.log(`\n### POST ${path} -> ${res.status}  rate=${JSON.stringify(rl)}`);
  console.log(text.slice(0, 1500));
}

async function main() {
  if (!process.env.COGNISM_API_KEY) {
    console.error("COGNISM_API_KEY not set — procure Cognism API access + generate a key first.");
    process.exit(1);
  }
  console.log(`cert=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "MISSING"}`);
  // Account search — romand ICP firmographics. Field names are GUESSES; the probe
  // reveals the real ones (location/region, employee size, industry). We try a few.
  await call("/account/search", {
    filters: {
      location: ["Switzerland"],
      region: ["Geneva", "Vaud", "Valais", "Fribourg", "Neuchâtel", "Jura"],
      employeeCount: { min: 100, max: 1000 },
    },
    size: 5,
  });
  // Contact search — decision-makers at an account/domain.
  await call("/contact/search", {
    filters: { companyDomain: "ifage.ch", seniority: ["c_suite", "vp", "director"] },
    size: 3,
  });
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
