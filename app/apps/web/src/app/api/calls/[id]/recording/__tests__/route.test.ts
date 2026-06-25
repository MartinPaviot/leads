import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  withAuthRLS: vi.fn((cb: (ctx: unknown) => unknown) =>
    cb({ tenantId: "t1", appUserId: "u1" }),
  ),
}));

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  calls: { id: "id", tenantId: "tenantId", recordingUrl: "recordingUrl" },
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));

import { db } from "@/db";

const route = await import("@/app/api/calls/[id]/recording/route");

function makeChain(row: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(row ? [row] : []));
  return chain;
}

function req(headers?: Record<string, string>) {
  return new Request("http://x/api/calls/c1/recording", { headers });
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

describe("GET /api/calls/[id]/recording", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "tok";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("404s when the call is not this tenant's", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain(null) as never);
    const res = await route.GET(req(), ctx);
    expect(res.status).toBe(404);
  });

  it("404s when the row has no recordingUrl (never recorded / purged)", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain({ recordingUrl: null }) as never);
    const res = await route.GET(req(), ctx);
    expect(res.status).toBe(404);
  });

  it("503s when Twilio credentials are missing", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    vi.mocked(db.select).mockReturnValue(
      makeChain({ recordingUrl: "https://api.twilio.com/.../Recordings/RE1" }) as never,
    );
    const res = await route.GET(req(), ctx);
    expect(res.status).toBe(503);
  });

  it("streams the mp3 with basic auth, normalising the extension", async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain({ recordingUrl: "https://api.twilio.com/2010-04-01/Accounts/AC/Recordings/RE1" }) as never,
    );
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/mpeg", "content-length": "3" },
      }),
    );
    globalThis.fetch = fetchMock as never;

    const res = await route.GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("accept-ranges")).toBe("bytes");

    const [calledUrl, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC/Recordings/RE1.mp3",
    );
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("ACtest:tok").toString("base64")}`);
  });

  it("forwards a Range request and propagates 206", async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain({ recordingUrl: "https://api.twilio.com/Recordings/RE1.mp3" }) as never,
    );
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1]), {
        status: 206,
        headers: { "content-range": "bytes 0-0/3" },
      }),
    );
    globalThis.fetch = fetchMock as never;

    const res = await route.GET(req({ range: "bytes=0-0" }), ctx);
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-0/3");
    const [, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((opts.headers as Record<string, string>).Range).toBe("bytes=0-0");
  });

  it("maps an upstream 404 (purged at Twilio) to 404", async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain({ recordingUrl: "https://api.twilio.com/Recordings/RE1" }) as never,
    );
    globalThis.fetch = vi.fn(async () => new Response("gone", { status: 404 })) as never;
    const res = await route.GET(req(), ctx);
    expect(res.status).toBe(404);
  });
});
