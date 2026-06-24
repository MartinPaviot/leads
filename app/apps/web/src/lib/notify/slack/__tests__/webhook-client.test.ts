import { describe, it, expect, afterEach } from "vitest";
import { isSlackConfigured, postSlackWebhook } from "../webhook-client";

const ORIG = process.env.SLACK_WEBHOOK_URL;
afterEach(() => {
  if (ORIG === undefined) delete process.env.SLACK_WEBHOOK_URL;
  else process.env.SLACK_WEBHOOK_URL = ORIG;
});

describe("isSlackConfigured", () => {
  it("reflects the presence of SLACK_WEBHOOK_URL", () => {
    delete process.env.SLACK_WEBHOOK_URL;
    expect(isSlackConfigured()).toBe(false);
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/x";
    expect(isSlackConfigured()).toBe(true);
  });
});

describe("postSlackWebhook", () => {
  it("no-ops (returns false) when no webhook is configured", async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    let called = false;
    const ok = await postSlackWebhook("hi", { fetchImpl: (async () => { called = true; return new Response(null, { status: 200 }); }) as unknown as typeof fetch });
    expect(ok).toBe(false);
    expect(called).toBe(false);
  });

  it("POSTs the text as JSON and returns true on 2xx", async () => {
    let captured: { url: string; body: string } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, body: String(init.body) };
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const ok = await postSlackWebhook("hello", { url: "https://hooks.slack.com/y", fetchImpl });
    expect(ok).toBe(true);
    expect(captured!.url).toBe("https://hooks.slack.com/y");
    expect(JSON.parse(captured!.body)).toEqual({ text: "hello" });
  });

  it("returns false on a non-2xx and never throws on a network error", async () => {
    const bad = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await postSlackWebhook("x", { url: "https://h", fetchImpl: bad })).toBe(false);
    const threw = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect(await postSlackWebhook("x", { url: "https://h", fetchImpl: threw })).toBe(false);
  });
});
