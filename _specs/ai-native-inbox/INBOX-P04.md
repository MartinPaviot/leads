# INBOX-P04 — Data residency / sovereign hosting (Pilae) — self-hostable inbox + AI
> Theme: T11 · Autonomy rung: passive (infrastructure profile) · Priority: P0
> Pillar: P5 GTM moat / cross (trust)

## User story
As a sovereignty-sensitive customer (Pilae: Suisse-romande public-sector, foundations, health,
parapublic; international institutions in Geneva), I want my entire inbox — mail transport, storage,
calendar, and AI — to run on EU/CH-resident, self-hostable infrastructure with no dependency on
Google/Microsoft or US clouds, so I can use an AI-native inbox while meeting EU/CH data-sovereignty
and CLOUD-Act-avoidance requirements.

## Why (audit anchor)
This is the moat Superhuman structurally cannot cross: it is **OAuth-only on Google/Microsoft**
(signup wall, `ai-native-mailbox-audit.md` §Method; `findings.md` header) and a US SaaS. We already
support a **provider-neutral mailbox** — `connected_mailboxes.provider` includes `smtp_custom` with
direct IMAP/SMTP + **CalDAV** + an AES-256-GCM-encrypted secret (`db/schema/outbound.ts:230-247`) —
and a documented sovereign stack: EU/CH DB, Mistral FR LLM, Clever Cloud / Infomaniak hosting, Brevo
email (`app/(legal)/security/page.tsx:218-240`), plus EU LLM routing already live (`ai-provider.ts:43`,
`:160`). What's missing is binding all of this into **one coherent "sovereign tenant" residency profile**
for the inbox — so a Pilae-style customer can run mail (IMAP/Zimbra) + calendar (CalDAV) + AI (Mistral
EU) + storage (CH) with zero Google/MS/US dependency, and the product *states and proves* it.

## Requirements (EARS)
- The system SHALL support connecting a mailbox over **direct IMAP/SMTP** (provider `smtp_custom`),
  including self-hosted **Zimbra** and generic IMAP servers, without any Google/Microsoft OAuth.
- The system SHALL support **CalDAV** for the calendar on `smtp_custom` mailboxes (read + write),
  using the same encrypted credentials, with no Google/MS Calendar dependency.
- The system SHALL encrypt mailbox credentials at rest with AES-256-GCM via `ELEVAY_APP_SECRET`
  (already implemented) and SHALL never log or expose the plaintext secret.
- WHEN the tenant is on the **sovereign residency profile**, the system SHALL keep all inbox data
  (mail bodies in `activities.rawContent`, embeddings, context-graph, attachments) in the EU/CH-resident
  datastore and SHALL route AI through the EU-sovereign model (composes with INBOX-P03 `sovereign`).
- The system SHALL run the entire inbox feature set (fidelity, reading, writing, triage, GTM sidebar)
  against an `smtp_custom`/CalDAV mailbox — sovereignty MUST NOT mean a degraded inbox.
- The system SHALL inject a **sovereign video link** (Jitsi on `visio.pilae.ch`, via
  `VIDEO_MEET_BASE_URL`) for meetings booked from the inbox, never a Google Meet / Teams widget
  (composes with INBOX-CAL05 / sovereign-visio).
- The system SHALL be deployable on EU/CH-sovereign hosting (Clever Cloud FR / Infomaniak CH) with the
  EU/CH datastore (Scaleway / Infomaniak / Supabase Frankfurt) — i.e. the deployment is self-hostable on
  sovereign infra, configured by environment, with no hard Vercel/US-cloud requirement at runtime.
- The system SHALL show the tenant its **residency posture** (where mail, storage, AI, and video run)
  honestly, including any remaining non-sovereign sub-processor (link to the Sub-processors page).
- The system SHALL assert EU/CH residency only when the datastore/region is actually configured for it
  (the existing `GDPR_REGION`/`DATABASE_URL` region check), never claim residency it can't prove.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a self-hosted Zimbra account WHEN the user connects it as `smtp_custom` (IMAP/SMTP host/port +
  password) THEN mail syncs, the credential is stored AES-256-GCM-encrypted, and no Google/MS OAuth is
  involved.
- GIVEN that mailbox WHEN the calendar connects over CalDAV THEN events read and write via CalDAV with
  the same encrypted secret and incremental sync (`caldav_last_sync_at`).
- GIVEN the sovereign residency profile WHEN a thread is summarized THEN the AI call routes to the EU
  Mistral provider (INBOX-P03) and the mail body never leaves the EU/CH datastore.
- GIVEN a Zimbra/IMAP mailbox WHEN the inbox loads THEN HTML rendering, summaries, the GTM sidebar, and
  triage lanes all work — feature parity with a Gmail-connected inbox.
- GIVEN a meeting booked from the inbox on a sovereign tenant WHEN the invite is created THEN the video
  link is `visio.pilae.ch` (Jitsi), never a Meet/Teams link.
- GIVEN the residency panel WHEN the tenant opens it THEN it shows mail = self-hosted/IMAP, storage =
  EU/CH region, AI = EU-sovereign, video = visio.pilae.ch, with any remaining US sub-processor named and
  linked.
- GIVEN `GDPR_REGION` not set to EU WHEN the residency panel renders THEN it does NOT claim EU residency
  (shows "Default / not configured"), matching the existing privacy-page behaviour.

## Edge cases & failure handling
- IMAP server with a self-signed/internal CA → support a configured trust anchor; fail with a clear
  connection error, never silently downgrade TLS.
- CalDAV discovery fails / non-standard collection URL → allow the user to supply the collection URL
  (the schema already permits a user-supplied `caldav_url`).
- Mixed tenant (some users on Gmail OAuth, some on Zimbra) → residency profile is per-tenant; the panel
  reflects the *weakest* link honestly (if any user is on Gmail, say so).
- Sovereign AI provider unprovisioned on a sovereign tenant → inbox AI degrades per INBOX-P03 (fail
  closed), fidelity/triage unaffected.
- Attachments storage → must also reside in the EU/CH datastore for a sovereign tenant; flag if a
  non-sovereign blob store is configured.
- Credential rotation / `ELEVAY_APP_SECRET` rotation → re-encrypt path; never leave plaintext at rest.
- Multi-tenant: residency profile, mailbox credentials, and AI routing are tenant-scoped
  (`withTenantTx`, `db/rls.ts:44`); one tenant's sovereign choice never affects another.

## Best-in-class bar
- **A genuinely sovereign AI inbox** — IMAP/Zimbra + CalDAV + Mistral-EU + CH storage + Jitsi video,
  end-to-end, with no Google/MS/US dependency. Superhuman is OAuth-only on Google/MS (it literally
  cannot connect a Zimbra box or run on CH infra). This is the single capability that wins the Pilae /
  international-Geneva segment outright.
- **Self-hostable** — the deployment runs on Clever Cloud FR / Infomaniak CH against an EU/CH datastore,
  configured by environment; sovereignty is a deployment + tenant profile, not a slide.
- **Honest residency panel** — we *show and prove* where every byte and every inference runs, naming any
  remaining non-sovereign sub-processor, instead of a blanket "we're secure". Grounded in the real
  region config, not marketing.
- **No feature tax** — the sovereign inbox is the full inbox (rendering, AI reading/writing, GTM moat),
  not a stripped "secure mode". Competitors that bolt on "EU hosting" usually lose features; we don't.

## Design sketch
- **Data:** `connected_mailboxes` already carries the sovereign path — `provider='smtp_custom'`,
  `imap_host/port`, `smtp_host/port`, `secret_encrypted`, `caldav_url`, `caldav_last_sync_at`
  (`db/schema/outbound.ts:230-247`). Add a per-tenant `residency_profile` (`standard|sovereign`) joined
  with the AI profile (INBOX-P03). Inbox bodies live in `activities.rawContent`; embeddings/context-graph
  in the same datastore — residency follows `DATABASE_URL`/`GDPR_REGION`.
- **API:** mailbox connect + sync already dispatch `email/sync-requested` for `smtp_custom`
  (`app/api/email/sync/route.ts`); IMAP poll is `lib/integrations/imap.ts`; CalDAV write path is the
  sovereign-visio/calendar-write work (memory: `calendar-write.ts`, CalDAV provider). Add
  `GET /api/inbox/residency` returning the posture (mail/storage/AI/video + sub-processor notes). Video
  link injection reuses `VIDEO_MEET_BASE_URL` (`visio.pilae.ch`) from the sovereign-visio work.
- **UI:** (1) Settings → Mailboxes (`settings/mailboxes/page.tsx`) already manages IMAP/SMTP/CalDAV — keep
  it as the connect surface (no Google/MS-only language). (2) A **Residency** card in Settings → Privacy
  and data (`settings/privacy/page.tsx`, same card idiom at `:220`, EU badge at `:254`) showing mail =
  self-hosted, storage = EU/CH, AI = EU-sovereign, video = visio.pilae.ch, with a link to
  `/sub-processors`. Tokens: card `--color-bg-card`, success/EU `--color-success(-soft)`, text
  `--color-text-secondary`; lucide `Server` (self-host), `ShieldCheck` (sovereign), `Globe` (region),
  `Video` (sovereign visio); no keyboard shortcut needed (settings surface). Light + dark via tokens,
  **no provider name shown as a vendor brand** — say "self-hosted mail (IMAP)", "EU/CH-resident storage",
  "EU-sovereign AI", "sovereign video" rather than naming Zimbra/Mistral/Infomaniak to the user; the
  Sub-processors page (`app/(legal)/sub-processors/page.tsx`) carries the named vendor list with CLOUD
  Act exposure. No emoji. The posture cites its source (the configured region/provider).
- **AI:** governed by INBOX-P03 (`sovereign` profile → Mistral EU + EU embeddings); this spec ensures the
  *data* stays resident too.
- **Security/perf:** AES-256-GCM at rest via `ELEVAY_APP_SECRET` (`lib/crypto/settings-encryption.ts`);
  TLS to IMAP/SMTP/CalDAV; SSRF/host validation on user-supplied mail/CalDAV hosts; residency claim
  gated on the real `GDPR_REGION`/`DATABASE_URL` check.

## Tasks (ordered, each with verify + test)
1. Per-tenant `residency_profile` storage joined with the AI profile (INBOX-P03). (verify: persists;
   tenant-scoped) (test: scope test)
2. Verify the `smtp_custom` IMAP/SMTP connect + sync path end-to-end against a self-hosted IMAP/Zimbra
   test server (no Google/MS OAuth). (verify: mail syncs; secret stored encrypted) (test: connect +
   capture integration, mocked IMAP)
3. Verify CalDAV read+write on `smtp_custom` (reuse sovereign-visio `calendar-write.ts`). (verify:
   event written via CalDAV; incremental sync via `caldav_last_sync_at`) (test: CalDAV path test)
4. `GET /api/inbox/residency` posture endpoint (mail/storage/AI/video + sub-processor notes), gated on
   the real region config. (verify: returns honest posture; no EU claim when `GDPR_REGION`≠eu) (test:
   route + region-matrix test)
5. Sovereign video link injection for inbox-booked meetings (`VIDEO_MEET_BASE_URL`). (verify: invite link
   = visio.pilae.ch, never Meet/Teams) (test: booking-from-inbox link test)
6. Residency card in Settings → Privacy (no vendor names; link to /sub-processors). (verify: browser —
   panel reflects a sovereign tenant correctly, names remaining US sub-processor honestly) (test:
   settings render matrix)
7. Confirm inbox feature parity on an `smtp_custom` mailbox (render/summary/sidebar/triage). (verify:
   browser on a Zimbra/IMAP inbox — full feature set works) (test: parity smoke)

## Current-state notes (VERIFY before building — code moves)
- `connected_mailboxes` already supports the full sovereign path: `provider` includes `smtp_custom`
  (`db/schema/outbound.ts:230`), with `imap_host/port` (`:236-237`), `smtp_host/port` (`:238-239`),
  `secret_encrypted` (`:240`, AES-256-GCM via `lib/crypto/settings-encryption`), `caldav_url` +
  `caldav_last_sync_at` (`:246-247`). Per-user owned (`user_id`, `:227`). DO NOT rebuild — compose.
- IMAP poll exists (`lib/integrations/imap.ts`); force-sync dispatches `email/sync-requested` for
  `smtp_custom` (`app/api/email/sync/route.ts`). CalDAV write + sovereign Jitsi via `VIDEO_MEET_BASE_URL`
  exist on the sovereign-visio branch (memory `project_sovereign-visio.md`: `video-meeting.ts`,
  `calendar-write.ts`, host `visio.pilae.ch`) — verify what's merged vs. branch before relying on it.
- `/security` page already documents the EU-sovereign stack and migration targets
  (`app/(legal)/security/page.tsx:218-240`) and the Sub-processors page exists
  (`app/(legal)/sub-processors/page.tsx`) with CLOUD Act exposure per line. This spec turns the
  documented stack into a per-tenant inbox residency profile + an honest in-product panel.
- AI EU routing is live (`ai-provider.ts:43` EU Anthropic default, `:160-179` Mistral EU); residency of
  *data* still follows `DATABASE_URL`/`GDPR_REGION` (privacy page checks `NEXT_PUBLIC_GDPR_REGION` at
  `:182`). Verify the datastore region before asserting CH/EU residency.
- No `GET /api/inbox/residency` endpoint exists yet. Settings → Mailboxes
  (`settings/mailboxes/page.tsx`) and Settings → Privacy (`settings/privacy/page.tsx`) are the surfaces.
- Pilae anti-creep: this is a sovereign *capability*, generally available; do not hardcode Pilae-only
  branching — drive everything by the residency/AI profile + env, so any sovereignty-sensitive tenant
  can opt in.
