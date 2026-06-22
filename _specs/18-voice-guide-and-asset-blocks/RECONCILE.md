# RECONCILE.md — Spec 18 Voice Guide and Asset Blocks (T0)

> Read-only reconciliation. No authored, versioned, campaign-overridable copy asset store or brand voice guide exists. `db/schema/voice.ts` is **telephony** (calls/voicemail), not brand voice; `lib/inbox/writing-style.ts` + `lib/writing-profile.ts` are **derived inbox-reply mimicry**, not an authored voice guide with banned words + asset blocks.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Asset blocks (positioning/offer/proof/cta), workspace-scoped, campaign-overridable, per language (EN/FR) | **missing** | No asset-block model |
| AC2 | Voice guide (favored phrasings, formats, topics+POV, banned words; no em-dashes; FR vouvoiement) | **missing** | `writing-style`/`writing-profile` derive a per-user style; no authored guide with banned words |
| AC3 | Version assets + voice guide; edit creates a new version, retains prior | **missing** | No versioning |
| AC4 | Expose assets + voice guide as structured context the copy engine (19/20) reads | **missing** | No structured export |
| AC5 | Campaign override beats workspace default | **missing** | No override resolution |

## Reuse inventory
- Canonical column conventions from `db/schema/icp.ts` (tenantId text, versioned rows) — mirrored if/when a DB adapter is added.
- `lib/i18n/messages.ts` `Locale` — EN/FR language scoping aligns with the app locale.

## Decisions (taken, full autonomy)
1. The deliverable per AC4 is the **structured-context interface + deterministic resolution** (override precedence, version retention, language scoping) — provable without a table. Build `lib/copy/assets/*` **no-schema, mergeable** over an injected `AssetStore` port (inject pattern, as specs 14–17). A DB-backed adapter + `asset_block`/`voice_guide` tables is a deferred persistence task — and parking a schema PR delivers nothing live anyway (prod migrations need the owner cred I lack).
2. **AC1/AC5:** `resolveAssetSet(blocks, {tenantId, campaignId?, lang})` — per kind, current campaign block beats current workspace block (`campaignId=null`), filtered by tenant+lang.
3. **AC3:** `saveAssetVersion` / `saveVoiceGuideVersion` append a new version (max+1) and supersede prior `isCurrent`; prior versions retained.
4. **AC2:** `VoiceGuide` carries favoredPhrasings / formats / topics(+POV) / bannedWords + `frFormality` (vouvoiement); `DEFAULT_BANNED_TOKENS` seeds em-dashes; `voiceGuideViolations(text, guide)` makes the guide enforceable (20's QC gate reads it).
5. **AC4:** `copyContext(set, guide)` flattens to the structured object 19/20 consume.
6. Blast radius `copy/assets/*`. No `/spec/steering`, no generation engine. **No schema → mergeable.**
