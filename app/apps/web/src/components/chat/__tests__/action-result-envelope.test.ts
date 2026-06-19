import { describe, it, expect } from "vitest";
import {
  encodeActionResult,
  ACTION_RESULT_OPEN,
  ACTION_RESULT_CLOSE,
  type ActionResultEnvelope,
} from "@/components/chat/use-ui-directives";

function decode(text: string): ActionResultEnvelope {
  expect(text.startsWith(ACTION_RESULT_OPEN)).toBe(true);
  expect(text.endsWith(ACTION_RESULT_CLOSE)).toBe(true);
  const json = text.slice(ACTION_RESULT_OPEN.length, text.length - ACTION_RESULT_CLOSE.length);
  return JSON.parse(json) as ActionResultEnvelope;
}

describe("encodeActionResult — CLE-03 §3.5 envelope", () => {
  it("wraps the envelope in the frozen tags and round-trips", () => {
    const text = encodeActionResult("inv-9", { ok: true, summary: "moved deal to Won", data: { dealId: "d1" } });
    expect(decode(text)).toEqual({ invocationId: "inv-9", ok: true, summary: "moved deal to Won", data: { dealId: "d1" } });
  });

  it("omits data and error when absent", () => {
    const env = decode(encodeActionResult("inv-1", { ok: true, summary: "done" }));
    expect(env).toEqual({ invocationId: "inv-1", ok: true, summary: "done" });
    expect("data" in env).toBe(false);
    expect("error" in env).toBe(false);
  });

  it("includes the error and ok:false on failure", () => {
    const env = decode(encodeActionResult("inv-2", { ok: false, summary: "no such action", error: "action_not_registered" }));
    expect(env.ok).toBe(false);
    expect(env.error).toBe("action_not_registered");
    expect(env.invocationId).toBe("inv-2");
  });
});
