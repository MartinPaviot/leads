import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enableInstantlyWarmup,
  disableInstantlyWarmup,
  getInstantlyAccount,
  getInstantlyWarmupAnalytics,
  getInstantlyBackgroundJob,
} from "../instantly-client";

const OPTS = { apiKey: "k_test" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRes = (status: number, body: unknown): any => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchMock: any;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
const calledUrl = () => String(lastCall()[0]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calledInit = () => lastCall()[1] as any;
const calledBody = () => JSON.parse(calledInit().body);

describe("enable/disable warmup", () => {
  it("enable → POST /accounts/warmup/enable with the emails, returns the job id", async () => {
    fetchMock.mockResolvedValue(mockRes(200, { id: "job_1", status: "pending" }));
    const r = await enableInstantlyWarmup(OPTS, ["a@x.com", "b@x.com"]);
    expect(calledUrl()).toBe("https://api.instantly.ai/api/v2/accounts/warmup/enable");
    expect(calledInit().method).toBe("POST");
    expect(calledBody()).toEqual({ emails: ["a@x.com", "b@x.com"] });
    expect(r).toMatchObject({ ok: true, status: 200, jobId: "job_1" });
  });

  it("disable → POST /accounts/warmup/disable", async () => {
    fetchMock.mockResolvedValue(mockRes(200, { id: "job_2" }));
    await disableInstantlyWarmup(OPTS, ["a@x.com"]);
    expect(calledUrl()).toBe("https://api.instantly.ai/api/v2/accounts/warmup/disable");
  });

  it("caps the email list at 100 (the API max)", async () => {
    fetchMock.mockResolvedValue(mockRes(200, { id: "j" }));
    await enableInstantlyWarmup(OPTS, Array.from({ length: 150 }, (_, i) => `u${i}@x.com`));
    expect(calledBody().emails).toHaveLength(100);
  });

  it("a non-2xx response → ok:false with the sliced error body", async () => {
    fetchMock.mockResolvedValue(mockRes(401, "unauthorized"));
    const r = await enableInstantlyWarmup(OPTS, ["a@x.com"]);
    expect(r).toMatchObject({ ok: false, status: 401, errorMessage: "unauthorized" });
  });

  it("a fetch throw → ok:false, status 0 (never throws)", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const r = await enableInstantlyWarmup(OPTS, ["a@x.com"]);
    expect(r).toMatchObject({ ok: false, status: 0, errorMessage: "network down" });
  });
});

describe("getInstantlyAccount — warmup status + score", () => {
  it("GET /accounts/{email} (url-encoded), parses warmup_status + stat_warmup_score", async () => {
    fetchMock.mockResolvedValue(mockRes(200, { warmup_status: 1, stat_warmup_score: 85, email: "a+tag@x.com" }));
    const r = await getInstantlyAccount(OPTS, "a+tag@x.com");
    expect(calledUrl()).toBe("https://api.instantly.ai/api/v2/accounts/a%2Btag%40x.com");
    expect(calledInit().method).toBe("GET");
    expect(r).toMatchObject({ ok: true, warmupStatus: 1, warmupScore: 85 });
    expect(r.account).toMatchObject({ warmup_status: 1 });
  });

  it("absent warmup fields → null (not undefined-coerced to a falsy score)", async () => {
    fetchMock.mockResolvedValue(mockRes(200, { email: "a@x.com" }));
    const r = await getInstantlyAccount(OPTS, "a@x.com");
    expect(r).toMatchObject({ ok: true, warmupStatus: null, warmupScore: null });
  });
});

describe("getInstantlyWarmupAnalytics", () => {
  it("POST /accounts/warmup-analytics with emails, returns aggregate_data", async () => {
    fetchMock.mockResolvedValue(
      mockRes(200, { aggregate_data: { "a@x.com": { sent: 15, landed_inbox: 13, landed_spam: 2, health_score: 87 } } }),
    );
    const r = await getInstantlyWarmupAnalytics(OPTS, ["a@x.com"]);
    expect(calledUrl()).toBe("https://api.instantly.ai/api/v2/accounts/warmup-analytics");
    expect(calledInit().method).toBe("POST");
    expect(calledBody()).toEqual({ emails: ["a@x.com"] });
    expect(r.aggregate?.["a@x.com"]).toEqual({ sent: 15, landed_inbox: 13, landed_spam: 2, health_score: 87 });
  });

  it("missing aggregate_data → empty object, ok:true", async () => {
    fetchMock.mockResolvedValue(mockRes(200, {}));
    const r = await getInstantlyWarmupAnalytics(OPTS, ["a@x.com"]);
    expect(r).toMatchObject({ ok: true, aggregate: {} });
  });
});

describe("getInstantlyBackgroundJob", () => {
  it("GET /background-jobs/{id}, parses status + progress", async () => {
    fetchMock.mockResolvedValue(mockRes(200, { id: "job_1", status: "success", progress: 100 }));
    const r = await getInstantlyBackgroundJob(OPTS, "job_1");
    expect(calledUrl()).toBe("https://api.instantly.ai/api/v2/background-jobs/job_1");
    expect(r).toMatchObject({ ok: true, jobStatus: "success", progress: 100 });
  });
});
