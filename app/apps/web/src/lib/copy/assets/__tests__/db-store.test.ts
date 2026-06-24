import { describe, it, expect } from "vitest";
import { DrizzleAssetStore, copyContextForTenant, resolveTenantCopyLang } from "../db-store";
import { copyAssetBlock, copyVoiceGuide } from "@/db/schema";
import type { AssetBlock, VoiceGuide } from "../resolve";

// Stub for resolveTenantCopyLang: select().from().where().orderBy().limit().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function langStub(rows: any[], opts: { throws?: boolean } = {}) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => { if (opts.throws) throw new Error("db down"); return rows; } }) }),
      }),
    }),
  } as any;
}

// Stub db: loadAssets/loadVoiceGuides do select().from(table).where(); putAsset/
// putVoiceGuide do update().set().where() (supersede) then insert().values().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(opts: { assets?: any[]; guides?: any[]; onUpdate?: (s: any) => void; onInsert?: (v: any) => void } = {}) {
  return {
    select: () => {
      let table: any;
      const chain: any = {
        from: (t: any) => { table = t; return chain; },
        where: async () => (table === copyAssetBlock ? (opts.assets ?? []) : (opts.guides ?? [])),
      };
      return chain;
    },
    update: () => ({ set: (s: any) => ({ where: async () => { opts.onUpdate?.(s); } }) }),
    insert: () => ({ values: async (v: any) => { opts.onInsert?.(v); } }),
  } as any;
}

const assetRow = (over: Record<string, unknown> = {}) => ({
  id: "a1", tenantId: "t1", campaignId: null, lang: "en", kind: "positioning", content: "We help X.",
  version: 1, isCurrent: true, createdAt: new Date(1000), ...over,
});

const guideRow = (over: Record<string, unknown> = {}) => ({
  id: "g1", tenantId: "t1", lang: "en", favoredPhrasings: ["concise"], formats: ["short"],
  topics: [{ topic: "AI", pov: "pragmatic" }], bannedWords: ["synergy"], frFormality: "vouvoiement",
  version: 1, isCurrent: true, createdAt: new Date(1000), ...over,
});

describe("DrizzleAssetStore mapping", () => {
  it("maps asset rows to AssetBlock", async () => {
    const store = new DrizzleAssetStore(stubDb({ assets: [assetRow()] }));
    const [a] = await store.loadAssets("t1");
    expect(a).toMatchObject({ id: "a1", tenantId: "t1", campaignId: null, lang: "en", kind: "positioning", version: 1, isCurrent: true });
    expect(a.createdAt).toBe(1000);
  });

  it("maps voice-guide rows to VoiceGuide (jsonb arrays preserved)", async () => {
    const store = new DrizzleAssetStore(stubDb({ guides: [guideRow()] }));
    const [g] = await store.loadVoiceGuides("t1");
    expect(g.favoredPhrasings).toEqual(["concise"]);
    expect(g.topics).toEqual([{ topic: "AI", pov: "pragmatic" }]);
    expect(g.frFormality).toBe("vouvoiement");
  });
});

describe("putAsset / putVoiceGuide", () => {
  it("supersedes prior current rows then inserts the new version", async () => {
    let updated = false; let inserted: any;
    const store = new DrizzleAssetStore(stubDb({ onUpdate: () => (updated = true), onInsert: (v) => (inserted = v) }));
    const block: AssetBlock = { id: "a2", tenantId: "t1", campaignId: null, lang: "en", kind: "offer", content: "Try it free.", version: 2, isCurrent: true, createdAt: 0 };
    await store.putAsset(block, ["a1"]);
    expect(updated).toBe(true);
    expect(inserted).toMatchObject({ id: "a2", kind: "offer", version: 2, isCurrent: true });
  });

  it("skips the supersede update when there is nothing to supersede", async () => {
    let updated = false;
    const store = new DrizzleAssetStore(stubDb({ onUpdate: () => (updated = true) }));
    const guide: VoiceGuide = { id: "g2", tenantId: "t1", lang: "en", favoredPhrasings: [], formats: [], topics: [], bannedWords: [], frFormality: "vouvoiement", version: 1, isCurrent: true, createdAt: 0 };
    await store.putVoiceGuide(guide, []);
    expect(updated).toBe(false);
  });
});

describe("copyContextForTenant", () => {
  it("resolves current assets + voice into the structured context the engine reads", async () => {
    const db = stubDb({ assets: [assetRow({ kind: "positioning", content: "We help X." })], guides: [guideRow()] });
    const ctx = await copyContextForTenant("t1", { lang: "en" }, db);
    expect(ctx.assets.positioning).toBe("We help X.");
    expect(ctx.voice?.frFormality).toBe("vouvoiement");
    expect(ctx.voice?.banned).toContain("synergy");
    expect(ctx.voice?.banned).toContain("—"); // always-banned em-dash merged in
  });

  it("returns empty assets + null voice when nothing is configured (engine then falls back)", async () => {
    const ctx = await copyContextForTenant("t1", { lang: "en" }, stubDb({ assets: [], guides: [] }));
    expect(ctx.assets).toEqual({});
    expect(ctx.voice).toBeNull();
  });
});

describe("resolveTenantCopyLang", () => {
  it("returns the lang of the tenant's current voice guide", async () => {
    expect(await resolveTenantCopyLang("t1", langStub([{ lang: "fr" }]))).toBe("fr");
    expect(await resolveTenantCopyLang("t1", langStub([{ lang: "en" }]))).toBe("en");
  });

  it("defaults to en when no voice guide is configured", async () => {
    expect(await resolveTenantCopyLang("t1", langStub([]))).toBe("en");
  });

  it("fails safe to en on a db error", async () => {
    expect(await resolveTenantCopyLang("t1", langStub([], { throws: true }))).toBe("en");
  });
});
