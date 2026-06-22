/**
 * Spec 18 — asset/voice-guide persistence port + versioning (AC3). The port is
 * injected so the resolution logic (./resolve) stays pure and this ships with no
 * schema; a DB-backed adapter implements the same interface later. `save*Version`
 * appends a new version (max+1) and supersedes the prior current row, retaining
 * all prior versions.
 */

import type { AssetBlock, AssetKind, Lang, VoiceGuide, VoiceTopic } from "./resolve";

export interface AssetStore {
  loadAssets(tenantId: string): Promise<AssetBlock[]>;
  loadVoiceGuides(tenantId: string): Promise<VoiceGuide[]>;
  /** Persist a new row (already versioned) and supersede the prior current row(s) by id. */
  putAsset(block: AssetBlock, supersededIds: string[]): Promise<void>;
  putVoiceGuide(guide: VoiceGuide, supersededIds: string[]): Promise<void>;
}

export interface NewId {
  (): string;
}

export interface SaveAssetInput {
  tenantId: string;
  campaignId?: string | null;
  lang: Lang;
  kind: AssetKind;
  content: string;
}

/** Same-scope predicate for asset versioning: a version chain is per (tenant, campaign, lang, kind). */
function sameAssetScope(a: AssetBlock, i: SaveAssetInput): boolean {
  return a.tenantId === i.tenantId && a.campaignId === (i.campaignId ?? null) && a.lang === i.lang && a.kind === i.kind;
}

/**
 * AC3 — create a new asset version. Reads the existing chain for the scope, sets
 * version = max+1, marks all prior current rows superseded, persists the new
 * current row. Prior versions are retained (the store keeps them).
 */
export async function saveAssetVersion(store: AssetStore, input: SaveAssetInput, newId: NewId, now: () => number = () => Date.now()): Promise<AssetBlock> {
  const existing = (await store.loadAssets(input.tenantId)).filter((a) => sameAssetScope(a, input));
  const version = existing.reduce((m, a) => Math.max(m, a.version), 0) + 1;
  const supersededIds = existing.filter((a) => a.isCurrent).map((a) => a.id);
  const block: AssetBlock = {
    id: newId(),
    tenantId: input.tenantId,
    campaignId: input.campaignId ?? null,
    lang: input.lang,
    kind: input.kind,
    content: input.content,
    version,
    isCurrent: true,
    createdAt: now(),
  };
  await store.putAsset(block, supersededIds);
  return block;
}

export interface SaveVoiceGuideInput {
  tenantId: string;
  lang: Lang;
  favoredPhrasings: string[];
  formats: string[];
  topics: VoiceTopic[];
  bannedWords: string[];
  frFormality?: VoiceGuide["frFormality"];
}

/** AC3 — create a new voice-guide version for (tenant, lang). */
export async function saveVoiceGuideVersion(store: AssetStore, input: SaveVoiceGuideInput, newId: NewId, now: () => number = () => Date.now()): Promise<VoiceGuide> {
  const existing = (await store.loadVoiceGuides(input.tenantId)).filter((g) => g.lang === input.lang);
  const version = existing.reduce((m, g) => Math.max(m, g.version), 0) + 1;
  const supersededIds = existing.filter((g) => g.isCurrent).map((g) => g.id);
  const guide: VoiceGuide = {
    id: newId(),
    tenantId: input.tenantId,
    lang: input.lang,
    favoredPhrasings: input.favoredPhrasings,
    formats: input.formats,
    topics: input.topics,
    bannedWords: input.bannedWords,
    frFormality: input.frFormality ?? "vouvoiement",
    version,
    isCurrent: true,
    createdAt: now(),
  };
  await store.putVoiceGuide(guide, supersededIds);
  return guide;
}

/** Process-local store for tests + single-process dev. Append-only with supersede. */
export class InMemoryAssetStore implements AssetStore {
  private assets: AssetBlock[] = [];
  private guides: VoiceGuide[] = [];

  async loadAssets(tenantId: string): Promise<AssetBlock[]> {
    return this.assets.filter((a) => a.tenantId === tenantId).map((a) => ({ ...a }));
  }
  async loadVoiceGuides(tenantId: string): Promise<VoiceGuide[]> {
    return this.guides.filter((g) => g.tenantId === tenantId).map((g) => ({ ...g }));
  }
  async putAsset(block: AssetBlock, supersededIds: string[]): Promise<void> {
    const sup = new Set(supersededIds);
    this.assets = this.assets.map((a) => (sup.has(a.id) ? { ...a, isCurrent: false } : a));
    this.assets.push({ ...block });
  }
  async putVoiceGuide(guide: VoiceGuide, supersededIds: string[]): Promise<void> {
    const sup = new Set(supersededIds);
    this.guides = this.guides.map((g) => (sup.has(g.id) ? { ...g, isCurrent: false } : g));
    this.guides.push({ ...guide });
  }
}
