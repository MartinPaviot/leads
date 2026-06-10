# Backup Restore Drill — 2026-06-10

**Requirement**: 08-business-continuity-dr-plan.md (annual restore drill with evidence).
**Operator**: Martin Paviot (executed by the build agent under his account).
**Verdict**: PASS

## What was drilled

Restore of the encrypted application-level dump
`_credentials/db-backups/2026-06-09T13-33-33-274Z.tar.gz.enc`
(AES-256-GCM, key = ELEVAY_APP_SECRET) into a throwaway `restore_drill`
schema on the production Postgres instance (Supabase, eu-central-1),
using `app/apps/web/scripts/restore-drill.ts`.

## Procedure

1. Decrypt: `node _tools/backup-crypt/backup-crypt.mjs decrypt <dump>.tar.gz.enc` — authenticated decryption succeeded (GCM tag verified).
2. Extract the tarball (119 NDJSON table files + `_manifest.json`).
3. Restore every table into `restore_drill.*` (text ingest, server-side `::jsonb` cast).
4. Verify row counts per table against `_manifest.json`.
5. Spot-check content integrity: a restored contact has its email present and its `company_id` resolves to a restored company row.
6. Drop the `restore_drill` schema; delete the decrypted plaintext from disk.

## Results

| Metric | Value |
|---|---|
| Dump | 2026-06-09T13-33-33-274Z (source host wdgwytpaxuvgigqgzxrw, eu-central-1) |
| Tables restored | 119 |
| Rows restored | 15,900 |
| Count mismatches vs manifest | 0 |
| Content spot-check | email present: yes; contact→company link intact: yes |
| Restore duration | 120 s (well inside the 4-business-hour RTO) |

## Notes and limits

- This drill proves the PORTABLE dump path (logical JSON restore of content).
  It does not exercise full DDL reconstruction; the provider path for full
  recovery is Supabase daily backups / PITR (see Policy 08 runbook).
- A first run surfaced a real restore-tooling bug (driver double-encoding
  JSON params into scalars) — exactly what drills are for; fixed in
  `restore-drill.ts` and re-run to PASS.
- Next drill due: 2027-06 (annual).
