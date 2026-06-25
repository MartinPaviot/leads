import { describe, it, expect, vi } from "vitest";
import {
  runLinkedInAction,
  withinDailyLimit,
  remainingActions,
  DEFAULT_LINKEDIN_DAILY_LIMITS,
  LinkedInError,
  type LinkedInRequest,
  type LinkedInDeps,
  type LinkedInResult,
  type LinkedInPort,
  type LinkedInActionEvent,
} from "../index";
import {
  toHeyReachCustomFields,
  toHeyReachPayload,
  isValidCustomFieldKey,
  HeyReachAdapter,
  type HeyReachClient,
} from "@/lib/providers/heyreach/linkedin-adapter";

const req = (over: Partial<LinkedInRequest> = {}): LinkedInRequest => ({
  stepId: "step-1",
  action: "connect",
  contact: { id: "c1", profileUrl: "https://linkedin.com/in/jane", tenantId: "t1" },
  senderAccountId: "sa1",
  idempotencyKey: "",
  ...over,
});

function inMemoryIdempotency() {
  const m = new Map<string, LinkedInResult>();
  return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, r: LinkedInResult) => void m.set(k, r), _m: m };
}

const okResult = (action: LinkedInRequest["action"]): LinkedInResult => ({ providerActionId: "ha-1", action, status: "sent", senderAccountId: "sa1" });

function deps(over: Partial<LinkedInDeps> = {}): LinkedInDeps {
  return {
    port: {
      connect: vi.fn(async (r: LinkedInRequest) => okResult(r.action)),
      message: vi.fn(async (r: LinkedInRequest) => okResult(r.action)),
    },
    isSuppressed: () => false,
    isCollisionLocked: () => false,
    actionsToday: () => 0,
    idempotency: inMemoryIdempotency(),
    meter: (_op, fn) => fn(),
    tenantId: "t1",
    now: () => 1_000,
    ...over,
  };
}

describe("daily limits — AC2", () => {
  it("default limits: 20 connects, 100 messages", () => {
    expect(DEFAULT_LINKEDIN_DAILY_LIMITS).toEqual({ connect: 20, message: 100 });
  });
  it("withinDailyLimit / remainingActions respect the cap", () => {
    expect(withinDailyLimit("connect", 19)).toBe(true);
    expect(withinDailyLimit("connect", 20)).toBe(false);
    expect(remainingActions("message", 90)).toBe(10);
  });
});

describe("runLinkedInAction — AC3 hard preconditions", () => {
  it("refuses a suppressed contact (no port call)", async () => {
    const d = deps({ isSuppressed: () => true });
    expect((await runLinkedInAction(req(), d)).refusedReason).toBe("suppressed");
    expect(d.port.connect).not.toHaveBeenCalled();
  });
  it("refuses a collision-locked contact", async () => {
    expect((await runLinkedInAction(req(), deps({ isCollisionLocked: () => true }))).refusedReason).toBe("collision-locked");
  });
  it("refuses a contact with no profileUrl (identity)", async () => {
    expect((await runLinkedInAction(req({ contact: { id: "c1", profileUrl: "" } }), deps())).refusedReason).toBe("no-profile");
  });
  it("refuses a non-allowlisted target (spec-36 test-mode guardrail, no port call)", async () => {
    const d = deps({ isAllowedTarget: () => false });
    expect((await runLinkedInAction(req(), d)).refusedReason).toBe("not-allowlisted");
    expect(d.port.connect).not.toHaveBeenCalled();
  });
});

describe("runLinkedInAction — AC2 daily limit gate", () => {
  it("refuses when the sender account is at its connect limit", async () => {
    expect((await runLinkedInAction(req({ action: "connect" }), deps({ actionsToday: () => 20 }))).refusedReason).toBe("daily-limit");
  });
  it("allows when under the message limit", async () => {
    expect((await runLinkedInAction(req({ action: "message", message: "hi" }), deps({ actionsToday: () => 50 }))).acted).toBe(true);
  });
});

describe("runLinkedInAction — AC4 idempotency + AC5 meter/event", () => {
  it("connects, meters, emits an event, stores the result", async () => {
    const events: LinkedInActionEvent[] = [];
    let metered = 0;
    const d = deps({ meter: (op, fn) => { metered++; expect(op.kind).toBe("linkedin.connect"); return fn(); }, emitEvent: (e) => void events.push(e) });
    const out = await runLinkedInAction(req(), d);
    expect(out).toMatchObject({ acted: true, result: { providerActionId: "ha-1", action: "connect" } });
    expect(metered).toBe(1);
    expect(events[0]).toMatchObject({ action: "connect", contactId: "c1", senderAccountId: "sa1" });
  });

  it("routes a message action to port.message", async () => {
    const d = deps();
    await runLinkedInAction(req({ action: "message", message: "hi" }), d);
    expect(d.port.message).toHaveBeenCalledOnce();
    expect(d.port.connect).not.toHaveBeenCalled();
  });

  it("a retry under the same (stepId, contactId) returns prior result, single action", async () => {
    const d = deps();
    const first = await runLinkedInAction(req(), d);
    const second = await runLinkedInAction(req(), d);
    expect(second).toMatchObject({ acted: true, deduped: true, result: first.result });
    expect(d.port.connect).toHaveBeenCalledOnce();
  });
});

describe("runLinkedInAction — typed errors", () => {
  it("a 4xx surfaces terminally and is not stored", async () => {
    const idem = inMemoryIdempotency();
    const port: LinkedInPort = { connect: async () => { throw new LinkedInError("bad", "client_error", 422); }, message: async () => okResult("message") };
    const out = await runLinkedInAction(req(), deps({ port, idempotency: idem }));
    expect(out.acted).toBe(false);
    expect(out.error).toBeInstanceOf(LinkedInError);
    expect(idem._m.size).toBe(0);
  });
  it("a 5xx bubbles for retry", async () => {
    const port: LinkedInPort = { connect: async () => { throw new LinkedInError("upstream", "server_error", 503); }, message: async () => okResult("message") };
    await expect(runLinkedInAction(req(), deps({ port }))).rejects.toBeInstanceOf(LinkedInError);
  });
});

describe("HeyReach adapter — AC1 mapping", () => {
  it("validates custom field keys against [a-z0-9_]", () => {
    expect(isValidCustomFieldKey("first_name")).toBe(true);
    expect(isValidCustomFieldKey("First Name")).toBe(false);
    expect(isValidCustomFieldKey("name-1")).toBe(false);
  });

  it("keeps valid scalar fields and reports dropped keys", () => {
    const { fields, droppedKeys } = toHeyReachCustomFields({ first_name: "Jane", count_1: 3, ok: true, "Bad Key": "x", nested: { a: 1 } });
    expect(fields).toEqual({ first_name: "Jane", count_1: 3, ok: true });
    expect(droppedKeys).toEqual(expect.arrayContaining(["Bad Key", "nested"]));
  });

  it("maps a request to the HeyReach payload keyed on profileUrl", () => {
    const payload = toHeyReachPayload(req({ contact: { id: "c1", profileUrl: " https://linkedin.com/in/jane ", customUserFields: { company: "Acme" } }, note: "hi" }), "camp-1");
    expect(payload).toMatchObject({ campaign_id: "camp-1", profile_url: "https://linkedin.com/in/jane", custom_user_fields: { company: "Acme" }, note: "hi" });
  });

  it("the adapter connects via the injected client", async () => {
    const client: HeyReachClient = { postConnect: vi.fn(async () => ({ id: "hr-9", status: "sent" })), postMessage: vi.fn() };
    const adapter = new HeyReachAdapter(client, "camp-1");
    const out = await adapter.connect(req({ idempotencyKey: "step-1:c1" }));
    expect(out).toEqual({ providerActionId: "hr-9", action: "connect", status: "sent", senderAccountId: "sa1" });
    expect(client.postConnect).toHaveBeenCalledOnce();
  });

  it("the adapter rejects a missing profileUrl as a client_error", async () => {
    const client: HeyReachClient = { postConnect: vi.fn(), postMessage: vi.fn() };
    const adapter = new HeyReachAdapter(client);
    await expect(adapter.connect(req({ contact: { id: "c1", profileUrl: "" } }))).rejects.toMatchObject({ kind: "client_error" });
    expect(client.postConnect).not.toHaveBeenCalled();
  });
});
