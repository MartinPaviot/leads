import { describe, it, expect, vi } from "vitest";
import {
  sendEmail,
  selectSendMailbox,
  isWithinSendWindow,
  SendError,
  type SendRequest,
  type SendDeps,
  type SendResult,
  type SendMailbox,
  type SendPort,
  type SendEvent,
} from "../index";
import {
  toInstantlyCustomVariables,
  toInstantlyPayload,
  InstantlySendAdapter,
  instantlyWebhookToStatus,
  type InstantlyClient,
} from "@/lib/providers/instantly/send-adapter";

const mailbox = (over: Partial<SendMailbox> = {}): SendMailbox => ({ id: "mb1", provider: "instantly", available: 10, authSendable: true, ...over });

const req = (over: Partial<SendRequest> = {}): SendRequest => ({
  stepId: "step-1",
  contact: { id: "c1", email: "jane@acme.com", tenantId: "t1" },
  message: { subject: "Hi", body: "Quick idea." },
  mailbox: mailbox(),
  idempotencyKey: "",
  ...over,
});

function inMemoryIdempotency() {
  const m = new Map<string, SendResult>();
  return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, r: SendResult) => void m.set(k, r), _m: m };
}
const passMeter: SendDeps["meter"] = (_op, fn) => fn();

function deps(over: Partial<SendDeps> = {}): SendDeps {
  return {
    port: { send: vi.fn(async (r: SendRequest): Promise<SendResult> => ({ providerMessageId: "pm-1", status: "sent", mailboxId: r.mailbox.id })) },
    isEmailSendable: () => true,
    isSuppressed: () => false,
    idempotency: inMemoryIdempotency(),
    meter: passMeter,
    tenantId: "t1",
    now: () => 1_000,
    ...over,
  };
}

describe("sendEmail — AC3 hard preconditions", () => {
  it("refuses an unverified email, never calling the port", async () => {
    const d = deps({ isEmailSendable: () => false });
    const out = await sendEmail(req(), d);
    expect(out).toMatchObject({ sent: false, refusedReason: "unverified" });
    expect(d.port.send).not.toHaveBeenCalled();
  });

  it("refuses a suppressed contact", async () => {
    const d = deps({ isSuppressed: () => true });
    const out = await sendEmail(req(), d);
    expect(out.refusedReason).toBe("suppressed");
    expect(d.port.send).not.toHaveBeenCalled();
  });
});

describe("sendEmail — AC2 capacity + window", () => {
  it("refuses when the mailbox has no remaining capacity", async () => {
    expect((await sendEmail(req({ mailbox: mailbox({ available: 0 }) }), deps())).refusedReason).toBe("no-capacity");
  });
  it("refuses an unauthenticated mailbox", async () => {
    expect((await sendEmail(req({ mailbox: mailbox({ authSendable: false }) }), deps())).refusedReason).toBe("no-capacity");
  });
  it("refuses outside the send window", async () => {
    // now=1000ms is Thursday 1970-01-01 00:00 UTC → outside 9–17.
    const out = await sendEmail(req(), deps({ sendWindow: { startHour: 9, endHour: 17 }, now: () => 1_000 }));
    expect(out.refusedReason).toBe("outside-window");
  });
});

describe("sendEmail — AC4 idempotency + AC5 meter/event", () => {
  it("sends, meters, emits a send event, and stores the result", async () => {
    const events: SendEvent[] = [];
    let metered = 0;
    const d = deps({ meter: (op, fn) => { metered++; expect(op.kind).toBe("send.email"); return fn(); }, emitSendEvent: (e) => void events.push(e) });
    const out = await sendEmail(req(), d);
    expect(out).toMatchObject({ sent: true, result: { providerMessageId: "pm-1", mailboxId: "mb1" } });
    expect(metered).toBe(1);
    expect(events[0]).toMatchObject({ stepId: "step-1", contactId: "c1", providerMessageId: "pm-1" });
  });

  it("a retry under the same (stepId, contactId) returns the prior result without a second send", async () => {
    const d = deps();
    const first = await sendEmail(req(), d);
    const second = await sendEmail(req(), d);
    expect(second).toMatchObject({ sent: true, deduped: true, result: first.result });
    expect(d.port.send).toHaveBeenCalledOnce(); // single provider call
  });

  it("defaults the idempotency key to stepId:contactId", async () => {
    const idem = inMemoryIdempotency();
    await sendEmail(req({ idempotencyKey: "" }), deps({ idempotency: idem }));
    expect(idem._m.has("step-1:c1")).toBe(true);
  });
});

describe("sendEmail — typed error handling", () => {
  it("a 4xx surfaces as a terminal error and is not stored (a later attempt can retry)", async () => {
    const idem = inMemoryIdempotency();
    const port: SendPort = { send: async () => { throw new SendError("bad request", "client_error", 422); } };
    const out = await sendEmail(req(), deps({ port, idempotency: idem }));
    expect(out.sent).toBe(false);
    expect(out.error).toBeInstanceOf(SendError);
    expect(idem._m.size).toBe(0);
  });

  it("a 5xx bubbles for retry under the same key (not stored)", async () => {
    const port: SendPort = { send: async () => { throw new SendError("upstream", "server_error", 503); } };
    await expect(sendEmail(req(), deps({ port }))).rejects.toBeInstanceOf(SendError);
  });
});

describe("selectSendMailbox / isWithinSendWindow — AC2", () => {
  it("rotates to the authenticated mailbox with the most remaining capacity", () => {
    const pick = selectSendMailbox([mailbox({ id: "a", available: 3 }), mailbox({ id: "b", available: 9 }), mailbox({ id: "c", available: 0 })]);
    expect(pick?.id).toBe("b");
  });
  it("skips unauthenticated and exhausted mailboxes; null when none eligible", () => {
    expect(selectSendMailbox([mailbox({ id: "a", available: 0 }), mailbox({ id: "b", authSendable: false, available: 5 })])).toBeNull();
  });
  it("ties break by id deterministically", () => {
    expect(selectSendMailbox([mailbox({ id: "z", available: 5 }), mailbox({ id: "a", available: 5 })])?.id).toBe("a");
  });
  it("send window respects hours and weekdays", () => {
    // 2026-06-22 is a Monday. 10:00 UTC inside 9–17 → true; 20:00 → false.
    expect(isWithinSendWindow(new Date("2026-06-22T10:00:00Z"), { startHour: 9, endHour: 17 })).toBe(true);
    expect(isWithinSendWindow(new Date("2026-06-22T20:00:00Z"), { startHour: 9, endHour: 17 })).toBe(false);
    // 2026-06-21 is a Sunday → excluded by default Mon–Fri.
    expect(isWithinSendWindow(new Date("2026-06-21T10:00:00Z"), { startHour: 9, endHour: 17 })).toBe(false);
  });
});

describe("Instantly adapter — AC1 mapping", () => {
  it("custom_variables keep scalars only; objects/arrays/null are dropped", () => {
    const cv = toInstantlyCustomVariables({ firstName: "Jane", count: 3, active: true, nested: { a: 1 }, list: [1, 2], empty: null, bad: NaN });
    expect(cv).toEqual({ firstName: "Jane", count: 3, active: true });
  });

  it("maps a canonical request to the Instantly v2 payload", () => {
    const payload = toInstantlyPayload(req({ contact: { id: "c1", email: "Jane@Acme.com", customVariables: { company: "Acme" } } }), "camp-1");
    expect(payload).toMatchObject({ campaign_id: "camp-1", email: "jane@acme.com", from_mailbox_id: "mb1", subject: "Hi", custom_variables: { company: "Acme" }, idempotency_key: "" });
  });

  it("the adapter sends via the injected client and returns a SendResult", async () => {
    const client: InstantlyClient = { postSend: vi.fn(async () => ({ id: "inst-99", status: "sent" })) };
    const adapter = new InstantlySendAdapter(client, "camp-1");
    const out = await adapter.send(req({ idempotencyKey: "step-1:c1" }));
    expect(out).toEqual({ providerMessageId: "inst-99", status: "sent", mailboxId: "mb1" });
    expect(client.postSend).toHaveBeenCalledOnce();
  });

  it("the adapter rejects a missing recipient as a client_error", async () => {
    const client: InstantlyClient = { postSend: vi.fn() };
    const adapter = new InstantlySendAdapter(client);
    await expect(adapter.send(req({ contact: { id: "c1", email: "" } }))).rejects.toMatchObject({ kind: "client_error" });
    expect(client.postSend).not.toHaveBeenCalled();
  });

  it("maps webhook event types to normalized statuses", () => {
    expect(instantlyWebhookToStatus("email_bounced")).toBe("bounced");
    expect(instantlyWebhookToStatus("reply_received")).toBe("replied");
    expect(instantlyWebhookToStatus("whatever")).toBe("unknown");
  });
});
