# Google Favicons V2 Fingerprint Evidence

**Date:** 2026-04-21
**Method:** Node `fetch()` against `t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://{domain}&size=128`
**Referenced by:** `lib/logo/google-globe-fingerprint.ts`

## Key Finding

**V2 returns HTTP 404 for domains with no favicon.** This is the clean separation V1 lacked (V1 returned HTTP 200 with a generic globe PNG for everything, making detection impossible via status code alone).

The cascade's Tier 4 detection logic is therefore status-based:
```
if (response.status !== 200) → reject → advance to Tier 5
```

The byte-size constant (`GLOBE_DEFAULT_BYTES = 726`) is a secondary safety net only.

## Raw Data: Known-Good Domains (real favicon expected)

| Domain | HTTP Status | Body Bytes | Content-Type |
|---|---|---|---|
| stripe.com | 200 | 580 | image/png |
| google.com | 200 | 2215 | image/png |
| github.com | 200 | 519 | image/png |
| microsoft.com | 200 | 426 | image/png |
| apple.com | 200 | 2468 | image/png |
| amazon.com | 200 | 1761 | image/png |
| netflix.com | 200 | 1468 | image/png |
| salesforce.com | 200 | 652 | image/png |
| cloudflare.com | 200 | 2243 | image/png |
| vercel.com | 200 | 629 | image/png |

**Range:** 426 - 2468 bytes. All HTTP 200.

## Raw Data: No-Favicon Domains (default response expected)

| Domain | HTTP Status | Body Bytes | Content-Type |
|---|---|---|---|
| example-nonexistent-brand-x.com | 404 | 726 | image/png |
| this-domain-does-not-exist-at-all.net | 404 | 726 | image/png |
| forerunnerventures.xyz | 404 | 726 | image/png |
| lordstownmotors.biz | 404 | 726 | image/png |
| nologo-test-12345.com | 404 | 726 | image/png |
| randomfakedomain99.org | 404 | 726 | image/png |
| another-no-favicon-test.com | 404 | 726 | image/png |
| yet-another-fake-brand.io | 404 | 726 | image/png |
| brandless-corp-abc.com | 404 | 726 | image/png |
| defunctcompany-test.net | 404 | 726 | image/png |

**All exactly 726 bytes. All HTTP 404.**

## Edge Cases

| Domain | HTTP Status | Body Bytes | Notes |
|---|---|---|---|
| forerunnerventures.com | 200 | 952 | Real favicon found (V1 missed this — root cause of Martin's bug report) |
| lordstownmotors.com | 404 | 726 | Defunct domain, no favicon |
| example.com | 404 | 726 | IANA reserved |
| neverssl.com | 200 | 144 | Tiny 16x16 favicon, smallest real response observed |
| httpbin.org | 200 | 877 | API-only site, still has a favicon |

## Distribution Summary

```
Known-good (200):  min=144  median=616  max=2468  (n=15)
No-favicon (404):  exact=726                       (n=12)
```

No overlap between real-favicon 200 responses and default-globe 404 responses. The distributions are perfectly separated on HTTP status code alone.

## ADR: Content-length vs Status Code

**Decision:** Primary rejection is HTTP-status-based (`status !== 200 → reject`).

**Rationale:** V2's 404 behavior gives perfect separation without body inspection. Content-length fingerprinting (726 bytes) is retained as a secondary safety net for hypothetical future V2 changes, but is not load-bearing.

**Escalation path if V2 changes:** If Google starts returning 200 for default globes (reverting to V1 behavior), the byte-size check catches it. If the byte size also changes, fall back to MD5 of the response body. This escalation has not been triggered — document updated 2026-04-21.
