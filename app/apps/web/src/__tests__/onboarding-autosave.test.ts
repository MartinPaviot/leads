import { describe, it, expect, vi } from "vitest";
import {
  buildKey,
  serialiseDraft,
  parseDraft,
  pickDraft,
  createDebouncer,
  safeStorageAdapter,
  loadDraft,
  saveDraft,
  clearDraft,
  type StorageAdapter,
} from "@/lib/onboarding/autosave";

function makeMemoryStorage(): StorageAdapter & { _data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    _data: data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

describe("buildKey", () => {
  it("namespaces by tenant and phase", () => {
    expect(buildKey("tenant-abc", 3)).toBe(
      "elevay:onboarding:tenant-abc:phase:3",
    );
  });

  it("rejects empty tenantId", () => {
    expect(() => buildKey("", 1)).toThrow(/tenantId/);
  });

  it("rejects out-of-range phase", () => {
    expect(() => buildKey("t", 0)).toThrow(/1\.\.7/);
    expect(() => buildKey("t", 8)).toThrow(/1\.\.7/);
    expect(() => buildKey("t", 3.5)).toThrow(/1\.\.7/);
  });
});

describe("serialiseDraft + parseDraft round-trip", () => {
  const now = new Date("2026-05-07T10:00:00Z");

  it("round-trips a primitive payload", () => {
    const raw = serialiseDraft("hello", now);
    expect(parseDraft<string>(raw, { now })).toEqual({
      savedAt: now.toISOString(),
      payload: "hello",
    });
  });

  it("round-trips an object payload", () => {
    const payload = { industry: "Devtools", sizeRange: "11-50" };
    const raw = serialiseDraft(payload, now);
    expect(parseDraft<typeof payload>(raw, { now })?.payload).toEqual(payload);
  });

  it("returns null on null input", () => {
    expect(parseDraft(null)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseDraft("{not json")).toBeNull();
  });

  it("returns null when shape doesn't match", () => {
    expect(parseDraft(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(parseDraft(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(parseDraft(JSON.stringify("string"))).toBeNull();
  });

  it("rejects entries past the freshness window", () => {
    const old = new Date("2026-04-15T00:00:00Z");
    const raw = serialiseDraft({ x: 1 }, old);
    const future = new Date("2026-05-07T00:00:00Z");
    // Default window is 7 days — old is 22 days back → null.
    expect(parseDraft(raw, { now: future })).toBeNull();
  });

  it("custom freshness window keeps fresh-enough entries", () => {
    const earlier = new Date("2026-05-01T00:00:00Z");
    const raw = serialiseDraft({ x: 1 }, earlier);
    const now = new Date("2026-05-07T00:00:00Z");
    expect(
      parseDraft(raw, { now, freshnessWindowMs: 30 * 24 * 60 * 60 * 1000 }),
    ).toEqual({ savedAt: earlier.toISOString(), payload: { x: 1 } });
  });

  it("returns null on unparseable savedAt", () => {
    const raw = JSON.stringify({ savedAt: "not-a-date", payload: { x: 1 } });
    expect(parseDraft(raw)).toBeNull();
  });
});

describe("pickDraft", () => {
  it("returns local when available", () => {
    expect(
      pickDraft(
        { savedAt: "2026-05-07T10:00:00Z", payload: { local: true } },
        { server: true } as never,
      ),
    ).toEqual({ source: "local", payload: { local: true } });
  });

  it("falls back to server when local is null", () => {
    expect(pickDraft(null, { server: true } as never)).toEqual({
      source: "server",
      payload: { server: true },
    });
  });

  it("returns 'none' when neither has anything", () => {
    expect(pickDraft(null, null)).toEqual({ source: "none" });
    expect(pickDraft(null, undefined)).toEqual({ source: "none" });
  });
});

describe("createDebouncer", () => {
  it("collapses bursts into a single call after delay", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = createDebouncer(fn, 100);
    debounced("a");
    debounced("b");
    debounced("c");
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
    vi.useRealTimers();
  });

  it("flush invokes immediately with last args", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = createDebouncer(fn, 100);
    debounced("x");
    debounced.flush();
    expect(fn).toHaveBeenCalledWith("x");
    vi.useRealTimers();
  });

  it("cancel drops pending writes", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = createDebouncer(fn, 100);
    debounced("x");
    debounced.cancel();
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("flush is a no-op when nothing pending", () => {
    const fn = vi.fn();
    const debounced = createDebouncer(fn, 100);
    debounced.flush();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("safeStorageAdapter", () => {
  it("returns no-op adapter when storage is null/undefined", () => {
    const a = safeStorageAdapter(null);
    expect(a.getItem("k")).toBeNull();
    expect(() => a.setItem("k", "v")).not.toThrow();
    expect(() => a.removeItem("k")).not.toThrow();
  });

  it("swallows getItem exceptions (private-mode Safari)", () => {
    const broken: Storage = {
      getItem() {
        throw new Error("private-mode");
      },
      setItem() {
        throw new Error("private-mode");
      },
      removeItem() {
        throw new Error("private-mode");
      },
      clear() {},
      key() {
        return null;
      },
      length: 0,
    } as unknown as Storage;
    const a = safeStorageAdapter(broken);
    expect(a.getItem("k")).toBeNull();
    expect(() => a.setItem("k", "v")).not.toThrow();
    expect(() => a.removeItem("k")).not.toThrow();
  });

  it("delegates to underlying when present + functional", () => {
    const map = new Map<string, string>();
    const adapter = safeStorageAdapter({
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage);
    adapter.setItem("k", "v");
    expect(adapter.getItem("k")).toBe("v");
  });
});

describe("loadDraft / saveDraft / clearDraft round-trip", () => {
  it("save → load returns the payload", () => {
    const storage = makeMemoryStorage();
    const now = new Date("2026-05-07T10:00:00Z");
    saveDraft(storage, "tenant-1", 2, { x: 1, y: "z" }, now);
    const loaded = loadDraft<{ x: number; y: string }>(
      storage,
      "tenant-1",
      2,
      { now },
    );
    expect(loaded?.payload).toEqual({ x: 1, y: "z" });
  });

  it("clearDraft removes the entry", () => {
    const storage = makeMemoryStorage();
    saveDraft(storage, "tenant-1", 2, { x: 1 });
    clearDraft(storage, "tenant-1", 2);
    expect(loadDraft(storage, "tenant-1", 2)).toBeNull();
  });

  it("returns null on bad tenant / phase", () => {
    const storage = makeMemoryStorage();
    expect(loadDraft(storage, "", 2)).toBeNull();
    expect(loadDraft(storage, "t", 99)).toBeNull();
    // saveDraft with bad input is a no-op (doesn't throw)
    expect(() => saveDraft(storage, "", 2, {})).not.toThrow();
    expect(storage._data.size).toBe(0);
  });

  it("isolates tenants — tenant-A draft never reaches tenant-B", () => {
    const storage = makeMemoryStorage();
    saveDraft(storage, "tenant-A", 1, { secret: "A" });
    saveDraft(storage, "tenant-B", 1, { secret: "B" });
    expect(
      loadDraft<{ secret: string }>(storage, "tenant-A", 1)?.payload.secret,
    ).toBe("A");
    expect(
      loadDraft<{ secret: string }>(storage, "tenant-B", 1)?.payload.secret,
    ).toBe("B");
  });

  it("isolates phases — phase 1 draft never reaches phase 2", () => {
    const storage = makeMemoryStorage();
    saveDraft(storage, "tenant-1", 1, { kind: "p1" });
    saveDraft(storage, "tenant-1", 2, { kind: "p2" });
    expect(
      loadDraft<{ kind: string }>(storage, "tenant-1", 1)?.payload.kind,
    ).toBe("p1");
    expect(
      loadDraft<{ kind: string }>(storage, "tenant-1", 2)?.payload.kind,
    ).toBe("p2");
  });
});
