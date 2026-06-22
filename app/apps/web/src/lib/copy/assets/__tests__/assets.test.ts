import { describe, it, expect } from "vitest";
import {
  resolveAssetSet,
  resolveVoiceGuide,
  voiceGuideViolations,
  copyContext,
  saveAssetVersion,
  saveVoiceGuideVersion,
  InMemoryAssetStore,
  type AssetBlock,
  type VoiceGuide,
} from "../index";

let seq = 0;
const newId = () => `id-${++seq}`;
const clock = () => 1_000;

const block = (over: Partial<AssetBlock>): AssetBlock => ({
  id: over.id ?? newId(),
  tenantId: "t1",
  campaignId: null,
  lang: "en",
  kind: "positioning",
  content: "",
  version: 1,
  isCurrent: true,
  createdAt: 0,
  ...over,
});

describe("resolveAssetSet — AC1 + AC5 override precedence", () => {
  it("resolves the current block per kind for the workspace", () => {
    const blocks = [
      block({ kind: "positioning", content: "WS positioning" }),
      block({ kind: "cta", content: "WS cta" }),
    ];
    expect(resolveAssetSet(blocks, { tenantId: "t1", lang: "en" })).toEqual({ positioning: "WS positioning", cta: "WS cta" });
  });

  it("a campaign override beats the workspace default for that kind only", () => {
    const blocks = [
      block({ kind: "positioning", content: "WS positioning", campaignId: null }),
      block({ kind: "positioning", content: "Campaign positioning", campaignId: "c1" }),
      block({ kind: "offer", content: "WS offer", campaignId: null }),
    ];
    const set = resolveAssetSet(blocks, { tenantId: "t1", campaignId: "c1", lang: "en" });
    expect(set.positioning).toBe("Campaign positioning"); // overridden
    expect(set.offer).toBe("WS offer"); // falls back to workspace
  });

  it("scopes by language (FR vs EN are independent)", () => {
    const blocks = [
      block({ kind: "positioning", content: "EN", lang: "en" }),
      block({ kind: "positioning", content: "FR", lang: "fr" }),
    ];
    expect(resolveAssetSet(blocks, { tenantId: "t1", lang: "fr" }).positioning).toBe("FR");
  });

  it("ignores superseded (non-current) versions", () => {
    const blocks = [
      block({ kind: "cta", content: "old", version: 1, isCurrent: false }),
      block({ kind: "cta", content: "new", version: 2, isCurrent: true }),
    ];
    expect(resolveAssetSet(blocks, { tenantId: "t1", lang: "en" }).cta).toBe("new");
  });

  it("another tenant's blocks never leak", () => {
    const blocks = [block({ tenantId: "other", kind: "positioning", content: "leak" })];
    expect(resolveAssetSet(blocks, { tenantId: "t1", lang: "en" })).toEqual({});
  });
});

describe("saveAssetVersion — AC3 versioning retains prior", () => {
  it("a second save bumps version and supersedes the prior current row", async () => {
    const store = new InMemoryAssetStore();
    const v1 = await saveAssetVersion(store, { tenantId: "t1", lang: "en", kind: "offer", content: "v1" }, newId, clock);
    const v2 = await saveAssetVersion(store, { tenantId: "t1", lang: "en", kind: "offer", content: "v2" }, newId, clock);
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);

    const all = await store.loadAssets("t1");
    expect(all).toHaveLength(2); // prior retained
    expect(all.find((a) => a.id === v1.id)!.isCurrent).toBe(false); // superseded
    expect(all.find((a) => a.id === v2.id)!.isCurrent).toBe(true);
    expect(resolveAssetSet(all, { tenantId: "t1", lang: "en" }).offer).toBe("v2");
  });

  it("campaign and workspace chains version independently", async () => {
    const store = new InMemoryAssetStore();
    await saveAssetVersion(store, { tenantId: "t1", lang: "en", kind: "cta", content: "ws" }, newId, clock);
    const camp = await saveAssetVersion(store, { tenantId: "t1", campaignId: "c1", lang: "en", kind: "cta", content: "camp" }, newId, clock);
    expect(camp.version).toBe(1); // separate chain, not 2
  });
});

describe("voice guide — AC2 + AC3 + AC4", () => {
  const guideInput = {
    tenantId: "t1" as const,
    lang: "fr" as const,
    favoredPhrasings: ["concret", "sans détour"],
    formats: ["3-sentence cold email"],
    topics: [{ topic: "ROI", pov: "show the number, not the adjective" }],
    bannedWords: ["leverage", "synergy"],
  };

  it("saves and resolves the current voice guide, defaulting FR to vouvoiement", async () => {
    const store = new InMemoryAssetStore();
    await saveVoiceGuideVersion(store, guideInput, newId, clock);
    const g = resolveVoiceGuide(await store.loadVoiceGuides("t1"), { tenantId: "t1", lang: "fr" });
    expect(g?.frFormality).toBe("vouvoiement");
    expect(g?.version).toBe(1);
  });

  it("a new guide version supersedes the prior, retaining it (AC3)", async () => {
    const store = new InMemoryAssetStore();
    await saveVoiceGuideVersion(store, guideInput, newId, clock);
    await saveVoiceGuideVersion(store, { ...guideInput, favoredPhrasings: ["v2"] }, newId, clock);
    const guides = await store.loadVoiceGuides("t1");
    expect(guides).toHaveLength(2);
    expect(resolveVoiceGuide(guides, { tenantId: "t1", lang: "fr" })?.version).toBe(2);
  });

  it("AC2: banned words + em-dash are flagged; clean copy passes", () => {
    const guide: VoiceGuide = { id: "g", tenantId: "t1", lang: "fr", favoredPhrasings: [], formats: [], topics: [], bannedWords: ["leverage"], frFormality: "vouvoiement", version: 1, isCurrent: true, createdAt: 0 };
    expect(voiceGuideViolations("We leverage AI", guide)).toContain("leverage");
    expect(voiceGuideViolations("Clear value—now", guide)).toContain("—"); // em-dash always banned
    expect(voiceGuideViolations("Direct and clear value, today.", guide)).toEqual([]);
  });

  it("AC4: copyContext flattens assets + voice into structured context", () => {
    const guide: VoiceGuide = { id: "g", tenantId: "t1", lang: "fr", favoredPhrasings: ["concret"], formats: ["short"], topics: [{ topic: "ROI", pov: "numbers" }], bannedWords: ["leverage"], frFormality: "vouvoiement", version: 1, isCurrent: true, createdAt: 0 };
    const ctx = copyContext({ positioning: "P", cta: "C" }, guide);
    expect(ctx.assets).toEqual({ positioning: "P", cta: "C" });
    expect(ctx.voice?.banned).toEqual(expect.arrayContaining(["leverage", "—"]));
    expect(ctx.voice?.frFormality).toBe("vouvoiement");
  });

  it("copyContext tolerates a missing guide", () => {
    expect(copyContext({ positioning: "P" }, null)).toEqual({ assets: { positioning: "P" }, voice: null });
  });
});
