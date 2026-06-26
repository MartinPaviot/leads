# Owner-SMTP provisioning runbook — Elevay cold domains

_2026-06-26. How to turn the 12 Instantly-warmed Elevay cold domains into
Elevay-OWNED owner-SMTP sending capacity, per the founder directive: cold mail
leaves via Elevay's own SMTP, NEVER the Instantly send API. Instantly stays on
warmup duty only._

Status: **configured, NOT activated** (B3 — "on lance pas encore"). Everything
below is verify-and-prepare; no mail is sent and no autopilot flag is flipped.

---

## 1. Verified state of the 12 domains (live DNS, 2026-06-26)

Tenant `fdf9b795-d0e3-4ca8-bb76-b298aa81e3b5`. All 12 are **Zoho-hosted**
(`MX = mx.zoho.com`), warmed via Instantly's connect-your-own-mailbox model.
The `connected_mailboxes` rows are `provider="instantly"` with **no SMTP creds
stored** — so today they earn **zero** owner-SMTP capacity (the capacity source
excludes provider `instantly`; the cold send path needs `smtp_custom` + creds).

| Domain | SPF | DKIM | DMARC |
|---|---|---|---|
| getelevay.com, startelevay.com, useelevay.com, useelevay.tech, useelevay.dev, tryelevay.com, elevay.net, elevay.tech, elevay.xyz, elevay.space, elevay.dev, getelevay.tech | `~all` **pass** | selector `dkim`, **1024-bit** | `p=none` |

Graded against the spec-21 capacity gate (`verify-sending-domains.ts`):
**0/12 sendable today** — every domain fails on `dkim-weak:1024bit` + `dmarc`.
SPF already passes.

---

## 2. Two blockers, two owners

### A. DNS hardening (founder action, in Zoho + DNS) — clears the capacity gate

The gate (spec-21 AC2) refuses anything below best-practice. For domains whose
ENTIRE JOB is cold sending, this is correct, not gold-plating: a 1024-bit key is
deprecated at several receivers, and `p=none` gives a spoofed cold-domain zero
protection. Two changes per domain:

1. **DKIM → 2048-bit.** Zoho Mail Admin → Email Configuration → DKIM → regenerate
   the `dkim` selector at 2048-bit, publish the new `dkim._domainkey.<domain>`
   TXT it gives you. (Zoho supports 2048; the current keys are its old 1024
   default.)
2. **DMARC → `p=quarantine`.** Edit `_dmarc.<domain>` TXT from
   `v=DMARC1; p=none;` to `v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>;`
   (keep/raise the policy to `reject` later once the rua reports are clean).

Re-check progress anytime (read-only, no DB needed):

```
cd app/apps/web
npx tsx scripts/verify-sending-domains.ts getelevay.com startelevay.com  # …or all 12
```

A domain flips to `SENDABLE` the moment both records propagate.

### B. Owner-SMTP credentials (founder export → script ingests) — enables the transport

Elevay never stored the Zoho SMTP passwords (Instantly held them). To send via
owner-SMTP, the `connected_mailboxes` rows must become `provider="smtp_custom"`
with the real creds. The founder exports them from Zoho; the script verifies +
converts. Converting is durable — the Instantly re-import is
`onConflictDoNothing` on `ee_account_id`, so it never reverts the provider tag,
and warmup keeps running (Instantly maps accounts by email, not by our tag).

**Zoho connection params** (same for all 12 unless a box differs):

| Field | Value |
|---|---|
| smtpHost | `smtp.zoho.eu` (or `smtp.zoho.com` for a `.com`-region account) |
| smtpPort | `465` (implicit TLS) |
| imapHost | `imap.zoho.eu` |
| imapPort | `993` |
| user | the full email address |
| password | the mailbox password, or an **app-specific password** if 2FA is on (Zoho → My Account → Security → App Passwords) |

---

## 3. Provisioning the creds (turnkey, safe-by-default)

1. Create `app/apps/web/scripts/.owner-smtp-creds.json` (GITIGNORED — real
   passwords, never commit):

```json
{
  "tenantId": "fdf9b795-d0e3-4ca8-bb76-b298aa81e3b5",
  "defaults": { "smtpHost": "smtp.zoho.eu", "smtpPort": 465, "imapHost": "imap.zoho.eu", "imapPort": 993 },
  "mailboxes": [
    { "email": "go@getelevay.com",   "password": "APP_SPECIFIC_PW" },
    { "email": "hi@startelevay.com", "password": "APP_SPECIFIC_PW" }
  ]
}
```

2. **Verify only** (default — real SMTP connect + AUTH per box, writes NOTHING,
   sends NOTHING):

```
cd app/apps/web
npx tsx scripts/provision-owner-smtp.ts
```

Every box must read `OK … verified_only`. A `FAIL … verify_failed` means the
password/host is wrong — fix it before applying. (Exit code is non-zero if any
box failed.)

3. **Apply** (convert the verified rows to owner-SMTP; needs
   `DATABASE_URL_OWNER` + `ELEVAY_APP_SECRET`):

```
npx tsx scripts/provision-owner-smtp.ts --apply
```

Each box reads `converted (was instantly)`. The password is stored AES-256-GCM
encrypted (`secret_encrypted`); it is never logged.

---

## 4. Activation order (when the founder says go — NOT now)

1. DNS hardened → `verify-sending-domains.ts` shows 12/12 SENDABLE.
2. Creds applied → 12 boxes are `provider="smtp_custom"`, verified.
3. Flip `MANAGED_DOMAIN_DNS_VERIFY` on → the DNS-authed smtp_custom domains earn
   capacity (`capacity-source.ts`).
4. `activateManagedSending` → `elevay-managed-active` (cold-allowing mode).
5. Only then `DAILY_AUTOPILOT_ENABLED` — and only after the dead-sequence
   circuit-breaker + operator kill-switch are in `enforce` (see
   `project_daily-autopilot`).

Until step 5, the engine fills the queue and the gate stack still decides every
send. No mail leaves.

---

## 5. Code shipped with this runbook

- `lib/sending/identity/provision-owner-smtp.ts` — pure provisioning logic
  (verify-before-write, encrypt-at-rest, fault-isolated). Tests alongside.
- `lib/sending/identity/dns-auth-lookup.ts` — added Zoho DKIM selectors
  (`dkim`, `zoho`, `zmail`); the generic list missed `dkim`, so a signed Zoho
  domain read as "no DKIM" instead of "weak key". Regression test added.
- `scripts/provision-owner-smtp.ts` — verify-only by default, `--apply` to write.
- `scripts/verify-sending-domains.ts` — the hardening checklist (reuses the
  spec-21 grader; public-DNS resolver).
