/**
 * Backfill company logos (+ a few firmographics) from Apollo for one tenant.
 *
 * Why: tenant fdf9b795 (Elevay) was sourced via LinkedIn/TAM, so its rows have
 * a domain but NO `properties.logo_url`. The logo resolver's tier-3 reads
 * `properties.logo_url`, and the accounts page reads it directly — so writing
 * it lights up BOTH render paths. Tier-2 Clearbit is dead (DNS gone), so Apollo
 * is the only real-brand-logo source.
 *
 * Cost: Apollo bulk_enrich = 1 lead credit per matched company. Capped by
 * CREDIT_BUDGET. Idempotent + resumable (only selects rows still lacking a logo),
 * prioritized by priority_score so the most important accounts get logos first.
 *
 * Run: npx tsx --env-file=.env.local scripts/backfill-apollo-logos.ts
 * Env knobs: CREDIT_BUDGET (default 1300), MAX_ROWS, DELAY_MS, DRY_RUN=1
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const TENANT = process.env.TENANT_ID ?? "fdf9b795-d0e3-4ca8-bb76-b298aa81e3b5";
const KEY = (process.env.APOLLO_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
const BATCH = 10;
const CREDIT_BUDGET = Number(process.env.CREDIT_BUDGET ?? 1300);
const MAX_ROWS = Number(process.env.MAX_ROWS ?? 100000);
const DELAY_MS = Number(process.env.DELAY_MS ?? 700);
const DRY_RUN = process.env.DRY_RUN === "1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (d: string | null | undefined) =>
  (d || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();

async function main() {
  if (!KEY) throw new Error("APOLLO_API_KEY missing");
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle({ client });

  const rows = (await db.execute(sql`
    SELECT id, domain FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL
      AND domain IS NOT NULL AND domain <> ''
      AND (properties->>'logo_url') IS NULL
    ORDER BY priority_score DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT ${MAX_ROWS}
  `)) as unknown as Array<{ id: string; domain: string }>;

  console.log(
    `Tenant ${TENANT}: ${rows.length} companies lacking logo_url | budget ${CREDIT_BUDGET} credits${DRY_RUN ? " | DRY_RUN" : ""}`,
  );

  let spent = 0,
    updated = 0,
    matchedNoLogo = 0,
    unmatched = 0,
    batches = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    if (spent >= CREDIT_BUDGET) {
      console.log(`Credit budget ${CREDIT_BUDGET} reached — stopping.`);
      break;
    }
    const chunk = rows.slice(i, i + BATCH);
    const byDom = new Map<string, string[]>();
    for (const r of chunk) {
      const n = norm(r.domain);
      if (!n) continue;
      const g = byDom.get(n);
      if (g) g.push(r.id);
      else byDom.set(n, [r.id]);
    }

    let resp: any;
    try {
      const res = await fetch(
        "https://api.apollo.io/api/v1/organizations/bulk_enrich",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": KEY,
          },
          body: JSON.stringify({ domains: chunk.map((r) => r.domain) }),
        },
      );
      if (res.status === 429) {
        console.log("429 — backing off 10s");
        await sleep(10_000);
        i -= BATCH;
        continue;
      }
      if (!res.ok) {
        console.log(`batch@${i}: HTTP ${res.status} — skip`);
        await sleep(DELAY_MS);
        continue;
      }
      resp = await res.json();
    } catch (e) {
      console.log(`batch@${i} error`, (e as Error).message);
      await sleep(DELAY_MS);
      continue;
    }

    const orgs: any[] = resp.organizations || [];
    spent += orgs.length; // 1 credit per matched org
    let matchedThisBatch = 0;
    for (const o of orgs) {
      const cands = [o.primary_domain, o.website_url].map(norm).filter(Boolean);
      let ids: string[] | undefined;
      for (const c of cands) {
        if (byDom.has(c)) {
          ids = byDom.get(c);
          break;
        }
      }
      if (!ids) continue;
      matchedThisBatch++;
      if (!o.logo_url) {
        matchedNoLogo++;
        continue;
      }
      if (!DRY_RUN) {
        for (const id of ids) {
          await db.execute(sql`
            UPDATE companies
            SET properties = COALESCE(properties,'{}'::jsonb) || jsonb_build_object(
                  'logo_url', ${o.logo_url}::text,
                  'logo_source', 'apollo_backfill_2026-06-28'),
                resolved_logo_url = ${o.logo_url},
                resolved_logo_tier = 3,
                logo_resolved_at = now()
            WHERE id=${id} AND tenant_id=${TENANT}
          `);
          updated++;
        }
      } else {
        updated += ids.length;
      }
    }
    unmatched += chunk.length - matchedThisBatch;
    batches++;
    if (batches % 10 === 0)
      console.log(
        `...${i + chunk.length}/${rows.length} | updated=${updated} | credits~${spent}`,
      );
    await sleep(DELAY_MS);
  }

  const [rem] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL
      AND domain IS NOT NULL AND domain <> '' AND (properties->>'logo_url') IS NULL
  `)) as unknown as Array<{ n: number }>;

  console.log(
    `\nDONE. updated=${updated} matchedNoLogo=${matchedNoLogo} unmatched=${unmatched} creditsSpent~${spent}`,
  );
  console.log(`Still lacking logo_url: ${rem.n}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
