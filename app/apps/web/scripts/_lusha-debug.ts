/**
 * LUSHA DEBUG (throwaway) — why does fetch to api.lusha.com fail while Apollo works?
 * Prints the real error cause (TLS? DNS? refused?) and tests a raw call.
 */
async function probe(label: string, url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    const body = await res.text().catch(() => "");
    const full = label === "lusha-person";
    console.log(`[${label}] status=${res.status} bodyLen=${body.length} ${full ? "FULL:\n" + body : "bodyHead=" + body.slice(0, 160)}`);
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    console.log(`[${label}] FAIL name=${err.name} msg=${err.message} causeCode=${err.cause?.code ?? "?"} causeMsg=${err.cause?.message ?? "?"}`);
  }
}

async function main() {
  console.log(`NODE_EXTRA_CA_CERTS=${process.env.NODE_EXTRA_CA_CERTS ?? "(unset)"}`);
  const key = process.env.LUSHA_API_KEY ?? "";
  console.log(`LUSHA key length: ${key.length}`);
  // 1) Apollo (known to work) — baseline egress check
  await probe("apollo", "https://api.apollo.io/healthz", { accept: "application/json" });
  // 2) Lusha root
  await probe("lusha-root", "https://api.lusha.com/", { accept: "application/json" });
  // 3) Lusha person endpoint with a real query
  const qs = new URLSearchParams({ firstName: "Carole", lastName: "Haddad", companyDomain: "ifage.ch" });
  await probe("lusha-person", `https://api.lusha.com/v2/person?${qs}`, { api_key: key, accept: "application/json" });
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
