# PROPOSAL-010: Upload hardening (close the zip-bomb exposure)

Closes SELF-AUDIT C2 (MED-HIGH, demonstrated): the zip reader inflates every entry
with no cap (8 KB → 8 MB, 1012×; scales to a GB OOM/DoS from one authenticated
upload) and D8 (bytea-in-Postgres loads whole files into process memory).

## Requirements
**AC1 (decompressed cap)** WHEN reading any zip entry, THEN inflation aborts if the
declared OR actual uncompressed size exceeds a cap (default 50 MB per entry, 100 MB
per package) — returns an error, never allocates unboundedly.
**AC2 (ratio + count caps)** THEN a package with > N entries (default 512) or an
entry whose decompressed:compressed ratio exceeds a threshold (default 200×) without
a plausible declared size is rejected as `suspicious_archive`.
**AC3 (surface, don't crash)** THEN the upload route maps these to a 422
`archive_rejected` with a clear reason; nothing is persisted.
**AC4 (storage adapter)** THEN `ProposalStorage` gains a config-selected backend; an
S3/Supabase adapter (streamed, not buffered) is wired behind the same interface,
DB-blob remains the default. (Implementation may stub the remote adapter + test the
selector.)

### Edge cases
- A legitimate 10 MB .docx (already the upload cap) inflates well under 50 MB → allowed.
- Entry declares a small size but inflates large (lying header) → caught by the
  actual-size cap during streaming inflation.

## Design
- `ooxml.ts`: replace `inflateRawSync(comp)` with a capped inflate — use
  `zlib.inflateRawSync(comp, { maxOutputLength })` (Node supports `maxOutputLength`;
  it throws `RangeError` when exceeded) and check the central-directory uncompressed
  size first. Add per-package accumulation + entry-count guard in
  `readAllZipEntries`. New typed error `ArchiveTooLarge`.
- Upload route: catch → 422 `archive_rejected`.
- `storage.ts`: `getProposalStorage()` reads `PROPOSAL_STORAGE` env
  (`db` default | `s3`); add an S3 adapter skeleton (signed put/get) behind the
  interface.

## Tasks
1. Capped inflate + count/size guards in the zip reader (+ tests: a bomb fixture →
   ArchiveTooLarge; a normal docx → fine).
2. Upload route 422 mapping (+ route test).
3. Storage backend selector + S3 adapter skeleton (+ selector test).
4. Re-run `scripts/audit-proposal-weaknesses.ts` — Weakness 2 must now be bounded.
5. tsc + regression.
