// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  draftStorageKey,
  saveDraftToStorage,
  loadDraftFromStorage,
  clearDraftFromStorage,
  DRAFT_KEY,
} from "@/lib/inbox/draft-storage";

beforeEach(() => {
  localStorage.clear();
});

describe("draftStorageKey — per-context (no clobber)", () => {
  it("prefers contactId, lowercased + trimmed", () => {
    expect(draftStorageKey({ contactId: "C-123", to: "x@a.com" })).toBe(`${DRAFT_KEY}:c-123`);
  });
  it("falls back to the seeded To when no contactId", () => {
    expect(draftStorageKey({ to: "Paul <P@Pilae.CH>" })).toBe(`${DRAFT_KEY}:paul <p@pilae.ch>`);
  });
  it("uses a stable 'compose' slot for a blank compose", () => {
    expect(draftStorageKey({})).toBe(`${DRAFT_KEY}:compose`);
  });
  it("a reply to A and a reply to B get different keys (no clobber)", () => {
    expect(draftStorageKey({ contactId: "a" })).not.toBe(draftStorageKey({ contactId: "b" }));
  });
});

describe("save / load / clear round-trip", () => {
  const key = draftStorageKey({ contactId: "c1" });
  const data = { to: ["x@a.com"], cc: [], bcc: [], subject: "Re: hi", body: "Bonjour" };

  it("round-trips the draft and stamps savedAt", () => {
    saveDraftToStorage(key, data);
    const loaded = loadDraftFromStorage(key);
    expect(loaded?.body).toBe("Bonjour");
    expect(loaded?.subject).toBe("Re: hi");
    expect(loaded?.to).toEqual(["x@a.com"]);
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("returns null for an unsaved / cleared key", () => {
    expect(loadDraftFromStorage("elevay:nope")).toBeNull();
    saveDraftToStorage(key, data);
    clearDraftFromStorage(key);
    expect(loadDraftFromStorage(key)).toBeNull();
  });

  it("survives a corrupt payload without throwing", () => {
    localStorage.setItem(key, "{not json");
    expect(loadDraftFromStorage(key)).toBeNull();
  });
});
