/** Probe prod endpoints (throwaway, import-free). Run with cert bundle. */
async function hit(path: string) {
  try {
    const res = await fetch(`https://www.elevay.dev${path}`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const loc = res.headers.get("location");
    console.log(`${path} -> ${res.status}${loc ? ` (redirect ${loc.slice(0, 60)})` : ""}`);
  } catch (e) {
    console.log(`${path} -> FAIL ${(e as Error).message}`);
  }
}
async function main() {
  console.log(`cert=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "MISSING"}`);
  await hit("/api/health");
  await hit("/api/calls/config");   // 401/redirect = route deployed; 404 = not deployed
  await hit("/api/calls/twiml");    // GET on a POST route: 405 = exists; 404 = missing
  await hit("/call-mode");          // page
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
