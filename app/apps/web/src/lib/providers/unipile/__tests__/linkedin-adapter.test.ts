import { describe, it, expect, vi } from "vitest";
import {
  UnipileAdapter,
  clampInviteNote,
  toInvitePayload,
  toNewChatPayload,
  INVITE_NOTE_MAX,
  type ResolvedTarget,
  type TargetResolver,
} from "../linkedin-adapter";
import { UnipileApiError, type UnipileClient } from "../client";
import {
  runLinkedInAction,
  LinkedInError,
  type LinkedInRequest,
  type LinkedInDeps,
  type LinkedInResult,
} from "@/lib/sending/linkedin";

const req = (over: Partial<LinkedInRequest> = {}): LinkedInRequest => ({
  stepId: "step-1",
  action: "connect",
  contact: { id: "c1", profileUrl: "https://linkedin.com/in/jane", tenantId: "t1" },
  senderAccountId: "acc_unipile_1",
  idempotencyKey: "",
  ...over,
});

const target = (over: Partial<ResolvedTarget> = {}): ResolvedTarget => ({ providerId: "PVD_jane", ...over });
const resolver = (t: ResolvedTarget = target()): TargetResolver => () => t;

function fakeClient(over: Partial<UnipileClient> = {}): UnipileClient {
  return {
    sendInvitation: vi.fn(async () => ({ invitation_id: "inv_1" })),
    startNewChat: vi.fn(async () => ({ chat_id: "chat_1" })),
    sendMessage: vi.fn(async () => ({ message_id: "msg_1" })),
    ...over,
  };
}

describe("clampInviteNote — 300-char limit", () => {
  it("trims and passes a short note", () => {
    expect(clampInviteNote("  hi Jane  ")).toBe("hi Jane");
  });
  it("returns undefined for empty/whitespace", () => {
    expect(clampInviteNote("")).toBeUndefined();
    expect(clampInviteNote("   ")).toBeUndefined();
  });
  it("clamps to 300 chars", () => {
    const long = "x".repeat(400);
    expect(clampInviteNote(long)?.length).toBe(INVITE_NOTE_MAX);
  });
});

describe("payload mappers", () => {
  it("toInvitePayload keys on provider_id + clamps the note", () => {
    expect(toInvitePayload(req({ note: "  hello  " }), "PVD_x")).toEqual({
      account_id: "acc_unipile_1",
      provider_id: "PVD_x",
      message: "hello",
    });
  });
  it("toNewChatPayload sends provider_id as the attendee; no InMail by default", () => {
    expect(toNewChatPayload(req({ action: "message", message: "hi" }), target(), "hi")).toEqual({
      account_id: "acc_unipile_1",
      attendees_ids: ["PVD_jane"],
      text: "hi",
      inmail: undefined,
      api: undefined,
    });
  });
  it("toNewChatPayload carries inmail + api when flagged", () => {
    const p = toNewChatPayload(req({ action: "message", message: "hi" }), target({ inmail: true, api: "sales_navigator" }), "hi");
    expect(p).toMatchObject({ inmail: true, api: "sales_navigator" });
  });
});

describe("UnipileAdapter.connect — AC4", () => {
  it("sends an invitation keyed on the resolved provider_id", async () => {
    const client = fakeClient();
    const out = await new UnipileAdapter(client, resolver()).connect(req({ note: "hi" }));
    expect(out).toEqual({ providerActionId: "inv_1", action: "connect", status: "sent", senderAccountId: "acc_unipile_1" });
    expect(client.sendInvitation).toHaveBeenCalledWith({ account_id: "acc_unipile_1", provider_id: "PVD_jane", message: "hi" });
  });

  it("refuses an unresolved provider_id as client_error, no client call — AC5", async () => {
    const client = fakeClient();
    const adapter = new UnipileAdapter(client, resolver(target({ providerId: "" })));
    await expect(adapter.connect(req())).rejects.toMatchObject({ kind: "client_error", status: 400 });
    expect(client.sendInvitation).not.toHaveBeenCalled();
  });
});

describe("UnipileAdapter.message — AC4 chat vs reply branch", () => {
  it("starts a new chat when no chat exists", async () => {
    const client = fakeClient();
    const out = await new UnipileAdapter(client, resolver()).message(req({ action: "message", message: "hey" }));
    expect(out.providerActionId).toBe("chat_1");
    expect(client.startNewChat).toHaveBeenCalledOnce();
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it("replies in the existing chat when chatId is known (avoids 1st-degree re-check)", async () => {
    const client = fakeClient();
    const adapter = new UnipileAdapter(client, resolver(target({ chatId: "chat_existing" })));
    const out = await adapter.message(req({ action: "message", message: "follow up" }));
    expect(out.providerActionId).toBe("msg_1");
    expect(client.sendMessage).toHaveBeenCalledWith({ chat_id: "chat_existing", text: "follow up" });
    expect(client.startNewChat).not.toHaveBeenCalled();
  });

  it("refuses an empty message as client_error", async () => {
    const client = fakeClient();
    await expect(new UnipileAdapter(client, resolver()).message(req({ action: "message", message: "   " }))).rejects.toMatchObject({ kind: "client_error" });
    expect(client.startNewChat).not.toHaveBeenCalled();
  });
});

describe("UnipileAdapter — AC8 error mapping", () => {
  const throwing = (status: number) => fakeClient({ sendInvitation: async () => { throw new UnipileApiError("boom", status); } });

  it("429 (rate-limited) -> retryable server_error", async () => {
    await new UnipileAdapter(throwing(429), resolver()).connect(req()).catch((e) => {
      expect(e).toBeInstanceOf(LinkedInError);
      expect(e.kind).toBe("server_error");
      expect(e.retryable).toBe(true);
    });
    expect.assertions(3);
  });

  it("422 cannot_resend -> terminal client_error", async () => {
    await expect(new UnipileAdapter(throwing(422), resolver()).connect(req())).rejects.toMatchObject({ kind: "client_error", retryable: false });
  });

  it("500 -> retryable server_error", async () => {
    await expect(new UnipileAdapter(throwing(500), resolver()).connect(req())).rejects.toMatchObject({ kind: "server_error" });
  });
});

describe("UnipileAdapter.message — InMail branch (T3)", () => {
  it("sends as InMail (linkedin[inmail]+api) when the target is flagged and no chat exists", async () => {
    const client = fakeClient();
    const adapter = new UnipileAdapter(client, resolver(target({ inmail: true, api: "sales_navigator" })));
    await adapter.message(req({ action: "message", message: "open to a chat?" }));
    expect(client.startNewChat).toHaveBeenCalledWith({
      account_id: "acc_unipile_1",
      attendees_ids: ["PVD_jane"],
      text: "open to a chat?",
      inmail: true,
      api: "sales_navigator",
    });
  });

  it("an InMail with no credits (4xx) is terminal — surfaced as client_error", async () => {
    const client = fakeClient({ startNewChat: async () => { throw new UnipileApiError("no InMail credits", 403); } });
    const adapter = new UnipileAdapter(client, resolver(target({ inmail: true, api: "sales_navigator" })));
    await expect(adapter.message(req({ action: "message", message: "hi" }))).rejects.toMatchObject({ kind: "client_error", retryable: false });
  });

  it("an existing chat takes precedence over the InMail flag (reply, no new InMail)", async () => {
    const client = fakeClient();
    const adapter = new UnipileAdapter(client, resolver(target({ inmail: true, chatId: "chat_x" })));
    await adapter.message(req({ action: "message", message: "follow up" }));
    expect(client.sendMessage).toHaveBeenCalledOnce();
    expect(client.startNewChat).not.toHaveBeenCalled();
  });
});

// ── Proves the adapter slots into the spec-24 orchestration unchanged ──

function inMemoryIdempotency() {
  const m = new Map<string, LinkedInResult>();
  return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, r: LinkedInResult) => void m.set(k, r), _m: m };
}

function deps(port: UnipileAdapter, over: Partial<LinkedInDeps> = {}): LinkedInDeps {
  return {
    port,
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

describe("UnipileAdapter through runLinkedInAction — reuse of spec-24 orchestration", () => {
  it("connects once, meters, and dedupes a retry under the same (stepId, contactId)", async () => {
    const client = fakeClient();
    const port = new UnipileAdapter(client, resolver());
    const d = deps(port);
    const first = await runLinkedInAction(req(), d);
    const second = await runLinkedInAction(req(), d);
    expect(first.acted).toBe(true);
    expect(second).toMatchObject({ acted: true, deduped: true, result: first.result });
    expect(client.sendInvitation).toHaveBeenCalledOnce();
  });

  it("a suppressed contact never reaches the Unipile client", async () => {
    const client = fakeClient();
    const out = await runLinkedInAction(req(), deps(new UnipileAdapter(client, resolver()), { isSuppressed: () => true }));
    expect(out.refusedReason).toBe("suppressed");
    expect(client.sendInvitation).not.toHaveBeenCalled();
  });

  it("a 429 from Unipile bubbles for retry (not stored)", async () => {
    const client = fakeClient({ sendInvitation: async () => { throw new UnipileApiError("rl", 429); } });
    const idem = inMemoryIdempotency();
    await expect(runLinkedInAction(req(), deps(new UnipileAdapter(client, resolver()), { idempotency: idem }))).rejects.toBeInstanceOf(LinkedInError);
    expect(idem._m.size).toBe(0);
  });
});
