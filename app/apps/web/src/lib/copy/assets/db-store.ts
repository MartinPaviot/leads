/**
 * Spec 18 — Drizzle-backed AssetStore (the prod adapter for the pure store port).
 * Implements the same interface InMemoryAssetStore does, so the tested versioning
 * logic (saveAssetVersion / saveVoiceGuideVersion) runs unchanged over real tables.
 * `copyContextForTenant` is the convenience the copy engine (specs 19/20) reads:
 * resolve current assets + voice guide → the structured CopyContext.
 */

import { db as defaultDb } from "@/db";
import { copyAssetBlock, copyVoiceGuide } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AssetStore } from "./store";
import {
  resolveAssetSet,
  resolveVoiceGuide,
  copyContext,
  type AssetBlock,
  type VoiceGuide,
  type VoiceTopic,
  type AssetKind,
  type Lang,
  type CopyContext,
} from "./resolve";

function ms(v: Date | string | null | undefined): number {
  if (v == null) return 0;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

export class DrizzleAssetStore implements AssetStore {
  constructor(private readonly database: typeof defaultDb = defaultDb) {}

  async loadAssets(tenantId: string): Promise<AssetBlock[]> {
    const rows = await this.database.select().from(copyAssetBlock).where(eq(copyAssetBlock.tenantId, tenantId));
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId ?? tenantId,
      campaignId: r.campaignId ?? null,
      lang: r.lang as Lang,
      kind: r.kind as AssetKind,
      content: r.content,
      version: r.version,
      isCurrent: r.isCurrent,
      createdAt: ms(r.createdAt),
    }));
  }

  async loadVoiceGuides(tenantId: string): Promise<VoiceGuide[]> {
    const rows = await this.database.select().from(copyVoiceGuide).where(eq(copyVoiceGuide.tenantId, tenantId));
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId ?? tenantId,
      lang: r.lang as Lang,
      favoredPhrasings: (r.favoredPhrasings as string[]) ?? [],
      formats: (r.formats as string[]) ?? [],
      topics: (r.topics as VoiceTopic[]) ?? [],
      bannedWords: (r.bannedWords as string[]) ?? [],
      frFormality: (r.frFormality as VoiceGuide["frFormality"]) ?? "vouvoiement",
      version: r.version,
      isCurrent: r.isCurrent,
      createdAt: ms(r.createdAt),
    }));
  }

  async putAsset(block: AssetBlock, supersededIds: string[]): Promise<void> {
    if (supersededIds.length > 0) {
      await this.database.update(copyAssetBlock).set({ isCurrent: false }).where(inArray(copyAssetBlock.id, supersededIds));
    }
    await this.database.insert(copyAssetBlock).values({
      id: block.id,
      tenantId: block.tenantId,
      campaignId: block.campaignId,
      lang: block.lang,
      kind: block.kind,
      content: block.content,
      version: block.version,
      isCurrent: block.isCurrent,
    });
  }

  async putVoiceGuide(guide: VoiceGuide, supersededIds: string[]): Promise<void> {
    if (supersededIds.length > 0) {
      await this.database.update(copyVoiceGuide).set({ isCurrent: false }).where(inArray(copyVoiceGuide.id, supersededIds));
    }
    await this.database.insert(copyVoiceGuide).values({
      id: guide.id,
      tenantId: guide.tenantId,
      lang: guide.lang,
      favoredPhrasings: guide.favoredPhrasings,
      formats: guide.formats,
      topics: guide.topics,
      bannedWords: guide.bannedWords,
      frFormality: guide.frFormality,
      version: guide.version,
      isCurrent: guide.isCurrent,
    });
  }
}

/** Build a tenant for the prod store. */
export function assetStoreFor(database: typeof defaultDb = defaultDb): AssetStore {
  return new DrizzleAssetStore(database);
}

/**
 * The structured copy context specs 19/20 read: resolve the current assets (with
 * campaign override) + the current voice guide for (tenant, lang). Empty assets +
 * null voice when nothing is configured (the engine then segment-falls-back).
 */
export async function copyContextForTenant(
  tenantId: string,
  scope: { lang: Lang; campaignId?: string | null },
  database: typeof defaultDb = defaultDb,
): Promise<CopyContext> {
  const store = new DrizzleAssetStore(database);
  const [assets, guides] = await Promise.all([store.loadAssets(tenantId), store.loadVoiceGuides(tenantId)]);
  const resolvedAssets = resolveAssetSet(assets, { tenantId, campaignId: scope.campaignId ?? null, lang: scope.lang });
  const guide = resolveVoiceGuide(guides, { tenantId, lang: scope.lang });
  return copyContext(resolvedAssets, guide);
}

/**
 * Resolve the language the copy engine should generate in for a tenant: the lang
 * of the tenant's most-recent current voice guide (i.e. the one the founder
 * actually populated). Falls back to "en" when nothing is configured. Lets the
 * cutover/shadow target the founder's real language instead of a hardcoded "en".
 */
export async function resolveTenantCopyLang(tenantId: string, database: typeof defaultDb = defaultDb): Promise<Lang> {
  try {
    const [row] = await database
      .select({ lang: copyVoiceGuide.lang })
      .from(copyVoiceGuide)
      .where(and(eq(copyVoiceGuide.tenantId, tenantId), eq(copyVoiceGuide.isCurrent, true)))
      .orderBy(desc(copyVoiceGuide.createdAt))
      .limit(1);
    return row?.lang === "fr" ? "fr" : "en";
  } catch {
    return "en";
  }
}
