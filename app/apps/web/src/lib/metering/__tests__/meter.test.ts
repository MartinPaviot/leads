import { describe, it, expect, vi } from "vitest";
import { meter, type MeterOp } from "../meter";
import { InMemoryMeterStore } from "../store";
import { BudgetExhausted } from "../budget";

function op(over: Partial<MeterOp> = {}): MeterOp {
  return { workspace: "t1", kind: "enrich", provider: "apollo", amount: 10, ref: "r1", ...over };
}

describe("meter() — idempotency (AC3)", () => {
  it("charges once and skips fn on a repeated ref (retry returns prior result)", async () => {
    const store = new InMemoryMeterStore();
    store.setBudget("t1", "ws", 100);
    const fn = vi.fn(async () => ({ value: 42 }));

    const a = await meter(store, op(), fn);
    const b = await meter(store, op(), fn); // same ref

    expect(a).toEqual({ value: 42 });
    expect(b).toEqual({ value: 42 }); // prior result returned
    expect(fn).toHaveBeenCalledTimes(1); // not re-run
    expect(store.chargeCount()).toBe(1);
    expect(store.remaining("t1", "ws")).toBe(90); // charged once
  });

  it("net-charges once under concurrent same-ref calls (loser refunds)", async () => {
    const store = new InMemoryMeterStore();
    store.setBudget("t1", "ws", 100);
    const fn = vi.fn(async () => "ok");

    await Promise.all([meter(store, op(), fn), meter(store, op(), fn)]);

    expect(store.chargeCount()).toBe(1);
    expect(store.remaining("t1", "ws")).toBe(90); // decremented once net
  });
});

describe("meter() — budget block (AC2)", () => {
  it("throws BudgetExhausted and does not run fn when the budget can't cover", async () => {
    const store = new InMemoryMeterStore();
    store.setBudget("t1", "ws", 5);
    const fn = vi.fn(async () => "ok");

    await expect(meter(store, op({ amount: 10 }), fn)).rejects.toBeInstanceOf(BudgetExhausted);
    expect(fn).not.toHaveBeenCalled();
    expect(store.remaining("t1", "ws")).toBe(5); // untouched
    expect(store.chargeCount()).toBe(0);
  });

  it("blocks on the campaign scope even when the workspace has room", async () => {
    const store = new InMemoryMeterStore();
    store.setBudget("t1", "ws", 1000);
    store.setBudget("t1", "campaign:c1", 5);
    const fn = vi.fn(async () => "ok");

    await expect(meter(store, op({ amount: 10, campaign: "c1" }), fn)).rejects.toMatchObject({
      name: "BudgetExhausted",
      scopeKey: "campaign:c1",
    });
    expect(fn).not.toHaveBeenCalled();
    expect(store.remaining("t1", "ws")).toBe(1000); // workspace untouched (atomic pre-check)
  });

  it("decrements every applicable scope on success", async () => {
    const store = new InMemoryMeterStore();
    store.setBudget("t1", "ws", 100);
    store.setBudget("t1", "campaign:c1", 50);
    await meter(store, op({ amount: 10, campaign: "c1" }), async () => "ok");
    expect(store.remaining("t1", "ws")).toBe(90);
    expect(store.remaining("t1", "campaign:c1")).toBe(40);
  });
});

describe("meter() — fn failure refunds (AC3)", () => {
  it("does not consume budget when fn throws", async () => {
    const store = new InMemoryMeterStore();
    store.setBudget("t1", "ws", 100);
    await expect(meter(store, op(), async () => { throw new Error("provider down"); })).rejects.toThrow("provider down");
    expect(store.remaining("t1", "ws")).toBe(100); // refunded
    expect(store.chargeCount()).toBe(0);
  });
});

describe("meter() — no budget configured", () => {
  it("allows the call when no budget row exists (no cap)", async () => {
    const store = new InMemoryMeterStore();
    const out = await meter(store, op(), async () => "ran");
    expect(out).toBe("ran");
    expect(store.chargeCount()).toBe(1);
  });
});
