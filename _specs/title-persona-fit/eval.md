# Eval — title-persona-fit (2026-06-12, live tenant 47dca783)

## R7 — dormant regression (no persona configured)

`loadActiveIcps` → `personaVocabulary` = **0 labels** (both active ICPs have an empty People section). Full `scoreAllContactsIcp` run:

| metric | value |
| --- | --- |
| contacts | 612 |
| scored | 612 |
| score signature (md5 of id:score, ordered) | **unchanged** |
| LLM calls | 0 |

## R3 — measured dry-run (REAL resolver, REAL titles, read-only)

446 distinct live titles × demo vocabulary `[CEO, CFO, COO, Head of HR, Head of Operations, Head of Finance, IT Manager]`, through `resolveTitles` (claude-haiku-4-5, 9 batched calls, 43.5 s):

| metric | value |
| --- | --- |
| resolved | 443 / 446 (3 unresolved → fail-closed, no penalty) |
| matched ≥1 persona | 150 (34%) |
| CEO | 62 |
| Head of HR | 28 |
| COO | 22 |
| Head of Operations | 15 |
| CFO / Head of Finance | 12 / 12 |
| IT Manager | 12 |

Spot checks: `directeur general → CEO` · `owner → CEO` · `chief executive officer → CEO` · `head of human resources → Head of HR` · `deputy director → []` (function indeterminable — correctly a negative, not a guess).

## Verdict

All EARS criteria hold: unit suite (title-persona 12 + contact-icp-fit 14 + skill R8 2) green, tsc clean, dormant path byte-identical, resolver measured on real data. Feature activates the day a profile's People section is filled in Settings → ICP.

## Re-run

The dry-run script (was `scripts/_eval-title-persona.mts`, removed after the run):

```ts
import postgres from "postgres";
import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import { personaVocabulary, resolveTitles } from "@/lib/scoring/title-persona";
import { scoreAllContactsIcp } from "@/lib/scoring/contact-icp-fit";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const s = postgres(process.env.DATABASE_URL!, { max: 1 });
const sig = async () => (await s`
  SELECT count(*)::int n,
         md5(string_agg(id || ':' || coalesce(score, -1)::text, ',' ORDER BY id)) AS sig
  FROM contacts WHERE tenant_id = ${TENANT} AND deleted_at IS NULL`)[0];

const icps = await loadActiveIcps(TENANT);
console.log("VOCAB_SIZE", personaVocabulary(icps).length);
const before = await sig();
const run = await scoreAllContactsIcp(TENANT, icps);
const after = await sig();
console.log("REGRESSION", { contacts: before.n, scored: run.scored, scoresUnchanged: before.sig === after.sig });

const titles = (await s`
  SELECT DISTINCT lower(btrim(title)) AS t FROM contacts
  WHERE tenant_id = ${TENANT} AND deleted_at IS NULL AND title IS NOT NULL AND btrim(title) <> ''`)
  .map((r) => r.t as string);
const resolved = await resolveTitles(
  titles,
  ["CEO", "CFO", "COO", "Head of HR", "Head of Operations", "Head of Finance", "IT Manager"],
  TENANT,
);
console.log("DRYRUN", { titles: titles.length, resolved: resolved.size });
await s.end();
```

Run from `app/apps/web`: `pnpm dlx tsx --env-file=.env.local <file>` with `NODE_EXTRA_CA_CERTS` set.
