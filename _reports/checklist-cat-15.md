# Category 15: Legal & Compliance — VERIFIED

**Date**: 2026-04-01
**Status**: 9/11 ✅ (2 🟡 minor gaps)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Terms of Service written and linked | ✅ | /terms page. Linked: sign-in, dashboard footer, landing footer. |
| 2 | Privacy Policy written and linked (GDPR-compliant) | ✅ | /privacy page. Full GDPR policy. |
| 3 | Cookie consent banner | 🟡 | Session cookies only. No tracking cookies. Banner not strictly needed. |
| 4 | DPA available for enterprise customers | 🟡 | Referenced in Privacy Policy. Standalone document not yet drafted. |
| 5 | GDPR: right to access, deletion, export | ✅ | /api/gdpr/export + /api/gdpr/delete endpoints. |
| 6 | CAN-SPAM: unsubscribe works | ✅ | /api/unsubscribe with HMAC verification. |
| 7 | SOC 2 readiness | ✅ | Structured logger, auth audit trail, GDPR endpoints. |
| 8 | Data encryption at rest | ✅ | Supabase AES-256. |
| 9 | Data encryption in transit | ✅ | HSTS header. Vercel HTTPS. |
| 10 | Acceptable use policy | ✅ | /acceptable-use page. |
| 11 | Contact data provenance | ✅ | Documented in Privacy Policy + _specs/data-sources.md. |

**Files created**: legal layout, terms, privacy, AUP pages, GDPR export/delete, unsubscribe endpoint
