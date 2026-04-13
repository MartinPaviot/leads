import { describe, it, expect, vi } from "vitest";
import { runOptimisticMutation } from "@/hooks/use-optimistic-mutation";

describe("runOptimisticMutation", () => {
  it("calls optimisticUpdate synchronously before awaiting the mutation", async () => {
    const order: string[] = [];
    const optimisticUpdate = vi.fn(() => {
      order.push("optimistic");
    });
    const mutate = vi.fn(async () => {
      order.push("mutate");
      return { ok: true };
    });

    await runOptimisticMutation({}, { mutate }, { optimisticUpdate });

    expect(order).toEqual(["optimistic", "mutate"]);
    expect(optimisticUpdate).toHaveBeenCalledTimes(1);
  });

  it("calls onSuccess with the mutation result on happy path", async () => {
    const onSuccess = vi.fn();
    const input = { id: "1" };
    const result = await runOptimisticMutation(
      input,
      {
        mutate: async () => ({ id: "1", saved: true }),
        onSuccess,
      }
    );
    expect(result).toEqual({ id: "1", saved: true });
    expect(onSuccess).toHaveBeenCalledWith({ id: "1", saved: true }, input);
  });

  it("rolls back and rethrows when mutation rejects", async () => {
    const rollback = vi.fn();
    const onError = vi.fn();
    const boom = new Error("boom");

    await expect(
      runOptimisticMutation(
        { id: "x" },
        {
          mutate: async () => {
            throw boom;
          },
          onError,
        },
        { rollback }
      )
    ).rejects.toBe(boom);

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(boom, { id: "x" });
  });

  it("does not invoke rollback when no rollback is provided (safe no-op)", async () => {
    await expect(
      runOptimisticMutation(
        {},
        {
          mutate: async () => {
            throw new Error("nope");
          },
        }
      )
    ).rejects.toThrow("nope");
  });

  it("does not invoke onSuccess when mutation rejects", async () => {
    const onSuccess = vi.fn();
    await expect(
      runOptimisticMutation(
        {},
        {
          mutate: async () => {
            throw new Error("x");
          },
          onSuccess,
        }
      )
    ).rejects.toThrow("x");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("does not invoke onError on success", async () => {
    const onError = vi.fn();
    await runOptimisticMutation(
      {},
      {
        mutate: async () => "ok",
        onError,
      }
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("propagates the mutate return value verbatim", async () => {
    const payload = { x: 1, y: "z" };
    const result = await runOptimisticMutation({}, { mutate: async () => payload });
    expect(result).toBe(payload);
  });
});
