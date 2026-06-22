/**
 * Spec 18 — voice guide + asset blocks: deterministic resolution + structured
 * context export. Pure (operates on record arrays); the persistence port lives
 * in ./store. Reusable positioning/offer/proof/CTA blocks and a brand voice
 * guide ground all copy generation (specs 19/20), assembled from one source and
 * overridable per campaign.
 *
 * Blast radius: copy/assets/* only. No generation engine, no steering.
 */

export type AssetKind = "positioning" | "offer" | "proof" | "cta";
export const ASSET_KINDS: readonly AssetKind[] = ["positioning", "offer", "proof", "cta"];

/** EN + FR at launch (mirrors the app Locale). */
export type Lang = "en" | "fr";

export interface AssetBlock {
  id: string;
  tenantId: string;
  /** null = workspace default; a value = campaign override (AC5). */
  campaignId: string | null;
  lang: Lang;
  kind: AssetKind;
  content: string;
  /** 1-based; a new edit is max+1 (AC3). */
  version: number;
  /** Exactly one current row per (tenant, campaign, lang, kind). */
  isCurrent: boolean;
  createdAt: number;
}

/** The resolved current copy for a (workspace, campaign?, lang) — one string per kind. */
export type AssetSet = Partial<Record<AssetKind, string>>;

export interface VoiceTopic {
  topic: string;
  /** The point of view to take on the topic. */
  pov: string;
}

export interface VoiceGuide {
  id: string;
  tenantId: string;
  lang: Lang;
  favoredPhrasings: string[];
  formats: string[];
  topics: VoiceTopic[];
  bannedWords: string[];
  /** FR B2B formality — vouvoiement at launch. */
  frFormality: "vouvoiement" | "tutoiement";
  version: number;
  isCurrent: boolean;
  createdAt: number;
}

/** Always-banned tokens (AC2: no em-dashes). Merged into every guide's banned set. */
export const DEFAULT_BANNED_TOKENS: readonly string[] = ["—", "–", "--"];

/**
 * AC1/AC5 — resolve the current asset for each kind. A current campaign-scoped
 * block beats the current workspace default; both are filtered by tenant + lang.
 * Deterministic: among same-scope rows the highest version wins (defensive — the
 * store keeps a single current row, but a malformed input still resolves stably).
 */
export function resolveAssetSet(
  blocks: AssetBlock[],
  scope: { tenantId: string; campaignId?: string | null; lang: Lang },
): AssetSet {
  const out: AssetSet = {};
  for (const kind of ASSET_KINDS) {
    const candidates = blocks.filter(
      (b) => b.isCurrent && b.tenantId === scope.tenantId && b.lang === scope.lang && b.kind === kind,
    );
    const campaign = scope.campaignId
      ? best(candidates.filter((b) => b.campaignId === scope.campaignId))
      : null;
    const workspace = best(candidates.filter((b) => b.campaignId === null));
    const chosen = campaign ?? workspace; // AC5 — campaign overrides workspace
    if (chosen) out[kind] = chosen.content;
  }
  return out;
}

function best(rows: AssetBlock[]): AssetBlock | null {
  return rows.reduce<AssetBlock | null>((acc, r) => (!acc || r.version > acc.version ? r : acc), null);
}

/** The current voice guide for a (tenant, lang), or null. */
export function resolveVoiceGuide(guides: VoiceGuide[], scope: { tenantId: string; lang: Lang }): VoiceGuide | null {
  const rows = guides.filter((g) => g.isCurrent && g.tenantId === scope.tenantId && g.lang === scope.lang);
  return rows.reduce<VoiceGuide | null>((acc, g) => (!acc || g.version > acc.version ? g : acc), null);
}

/** The full banned set for a guide: its words plus the always-banned tokens (AC2). */
export function bannedSet(guide: VoiceGuide): string[] {
  return [...new Set([...guide.bannedWords, ...DEFAULT_BANNED_TOKENS].map((w) => w.toLowerCase()))];
}

/**
 * AC2 enforcement surface (read by 20's QC gate): the banned tokens present in
 * `text`, case-insensitively. Empty array = clean.
 */
export function voiceGuideViolations(text: string, guide: VoiceGuide): string[] {
  const lower = text.toLowerCase();
  return bannedSet(guide).filter((w) => w.length > 0 && lower.includes(w));
}

export interface CopyContext {
  assets: AssetSet;
  voice: {
    favoredPhrasings: string[];
    formats: string[];
    topics: VoiceTopic[];
    banned: string[];
    frFormality: VoiceGuide["frFormality"];
  } | null;
}

/** AC4 — flatten the resolved assets + voice guide into the structured object 19/20 read. */
export function copyContext(assets: AssetSet, guide: VoiceGuide | null): CopyContext {
  return {
    assets,
    voice: guide
      ? {
          favoredPhrasings: guide.favoredPhrasings,
          formats: guide.formats,
          topics: guide.topics,
          banned: bannedSet(guide),
          frFormality: guide.frFormality,
        }
      : null,
  };
}
