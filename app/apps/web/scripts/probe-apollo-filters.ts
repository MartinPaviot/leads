/**
 * Probes whether our current Apollo plan accepts the signal-grade
 * org-search filters that the new /api/tam/build depends on. Fails
 * fast if any filter returns 403 — catching the silent-degradation
 * scenario where the filter is ignored by the server and we ship a
 * TAM that looks signal-aware but isn't.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const KEY: string | undefined = process.env.APOLLO_API_KEY;
if (!KEY) {
  console.error("APOLLO_API_KEY not set.");
  process.exit(1);
}
const API_KEY: string = KEY;

const BASE = "https://api.apollo.io";

async function probe(label: string, body: Record<string, unknown>): Promise<{
  label: string;
  status: number;
  total: number | null;
  firstOrgName: string | null;
  error?: string;
}> {
  const res = await fetch(`${BASE}/api/v1/mixed_companies/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
    },
    body: JSON.stringify({ per_page: 1, page: 1, ...body }),
  });
  let total: number | null = null;
  let firstOrgName: string | null = null;
  let error: string | undefined;
  try {
    const json = await res.json() as {
      pagination?: { total_entries?: number };
      organizations?: Array<{ name?: string }>;
      error?: string;
    };
    total = json.pagination?.total_entries ?? null;
    firstOrgName = json.organizations?.[0]?.name ?? null;
    if (!res.ok) error = json.error ?? `HTTP ${res.status}`;
  } catch {
    error = `HTTP ${res.status} (non-JSON body)`;
  }
  return { label, status: res.status, total, firstOrgName, error };
}

async function main() {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["baseline — employees only", { organization_num_employees_ranges: ["51,200"] }],
    ["latest_funding_date_range", {
      organization_num_employees_ranges: ["51,200"],
      latest_funding_date_range: { min: "2025-01-01" },
    }],
    ["total_funding_range", {
      organization_num_employees_ranges: ["51,200"],
      total_funding_range: { min: 1_000_000 },
    }],
    ["organization_num_jobs_range", {
      organization_num_employees_ranges: ["51,200"],
      organization_num_jobs_range: { min: 1 },
    }],
    ["q_organization_job_titles", {
      organization_num_employees_ranges: ["51,200"],
      q_organization_job_titles: ["software engineer"],
    }],
    ["organization_job_locations", {
      organization_num_employees_ranges: ["51,200"],
      organization_num_jobs_range: { min: 1 },
      organization_job_locations: ["United States"],
    }],
    ["organization_job_posted_at_range", {
      organization_num_employees_ranges: ["51,200"],
      organization_job_posted_at_range: { min: "2026-01-01" },
    }],
    ["currently_using_any_of_technology_uids", {
      organization_num_employees_ranges: ["51,200"],
      currently_using_any_of_technology_uids: ["react"],
    }],
  ];

  console.log(`Probing ${cases.length} filter combinations against Apollo:`);
  let allOk = true;
  for (const [label, body] of cases) {
    const r = await probe(label, body);
    const flag = r.status >= 200 && r.status < 300 ? "OK  " : "FAIL";
    const tot = r.total === null ? "?" : r.total.toString();
    const head = r.firstOrgName ? ` • ${r.firstOrgName}` : "";
    const err = r.error ? ` ← ${r.error}` : "";
    console.log(`  ${flag} [${r.status}] ${label.padEnd(42)} total=${tot}${head}${err}`);
    if (r.status >= 400) allOk = false;
    // Small delay to dodge Apollo rate limits.
    await new Promise((res) => setTimeout(res, 200));
  }
  console.log(`\nresult: ${allOk ? "PASS — all filters accepted by current plan" : "FAIL — at least one filter gated or rejected"}`);
  process.exit(allOk ? 0 : 2);
}

main();
