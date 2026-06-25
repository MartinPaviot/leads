import { describe, it, expect, vi } from "vitest";
import {
  startChatFormEntries,
  replyFormEntries,
  unipileMessagingClient,
  type FetchLike,
} from "../messaging-client";
import { UnipileApiError } from "../client";
import type { UnipileConfig } from "../http";

const cfg: UnipileConfig = { dsn: "https://api8.unipile.com:13443", apiKey: "key_123" };

function okFetch(json: unknown = { id: "x1" }): { fetch: FetchLike; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => json, text: async () => "" } as Response;
  }) as unknown as FetchLike;
  return { fetch, calls };
}

describe("form-entry builders (pure)", () => {
  it("startChatFormEntries: account, one attendee per id, text; no InMail by default", () => {
    expect(startChatFormEntries({ account_id: "acc", attendees_ids: ["PVD_1"], text: "hi" })).toEqual([
      ["account_id", "acc"],
      ["attendees_ids", "PVD_1"],
      ["text", "hi"],
    ]);
  });

  it("startChatFormEntries: InMail adds linkedin[inmail] + linkedin[api]", () => {
    const e = startChatFormEntries({ account_id: "acc", attendees_ids: ["PVD_1"], text: "hi", inmail: true, api: "sales_navigator" });
    expect(e).toContainEqual(["linkedin[inmail]", "true"]);
    expect(e).toContainEqual(["linkedin[api]", "sales_navigator"]);
  });

  it("replyFormEntries: just the text (chat_id is in the URL)", () => {
    expect(replyFormEntries({ chat_id: "c1", text: "yo" })).toEqual([["text", "yo"]]);
  });
});

describe("unipileMessagingClient", () => {
  it("sendInvitation posts JSON to /users/invite with provider_id + message", async () => {
    const { fetch, calls } = okFetch({ invitation_id: "inv_1" });
    const res = await unipileMessagingClient(cfg, fetch).sendInvitation({ account_id: "acc", provider_id: "PVD_1", message: "hi" });
    expect(res).toEqual({ invitation_id: "inv_1" });
    expect(calls[0].url).toBe("https://api8.unipile.com:13443/api/v1/users/invite");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ account_id: "acc", provider_id: "PVD_1", message: "hi" });
    expect((calls[0].init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect((calls[0].init.headers as Record<string, string>)["X-API-KEY"]).toBe("key_123");
  });

  it("startNewChat posts multipart FormData to /chats (no content-type set by us)", async () => {
    const { fetch, calls } = okFetch({ chat_id: "c9" });
    await unipileMessagingClient(cfg, fetch).startNewChat({ account_id: "acc", attendees_ids: ["PVD_1"], text: "hi" });
    expect(calls[0].url).toBe("https://api8.unipile.com:13443/api/v1/chats");
    const body = calls[0].init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("account_id")).toBe("acc");
    expect(body.getAll("attendees_ids")).toEqual(["PVD_1"]);
    expect(body.get("text")).toBe("hi");
    // We must NOT set content-type — fetch adds the multipart boundary itself.
    expect((calls[0].init.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });

  it("sendMessage posts to /chats/{id}/messages", async () => {
    const { fetch, calls } = okFetch({ message_id: "m1" });
    await unipileMessagingClient(cfg, fetch).sendMessage({ chat_id: "c 9", text: "yo" });
    expect(calls[0].url).toBe("https://api8.unipile.com:13443/api/v1/chats/c%209/messages");
    expect((calls[0].init.body as FormData).get("text")).toBe("yo");
  });

  it("a non-2xx response throws UnipileApiError carrying the status", async () => {
    const fetch = (async () => ({ ok: false, status: 422, json: async () => ({}), text: async () => "cannot_resend_yet" }) as Response) as unknown as FetchLike;
    await expect(unipileMessagingClient(cfg, fetch).sendInvitation({ account_id: "a", provider_id: "p" })).rejects.toMatchObject({
      name: "UnipileApiError",
      status: 422,
    });
    await expect(unipileMessagingClient(cfg, fetch).sendInvitation({ account_id: "a", provider_id: "p" })).rejects.toBeInstanceOf(UnipileApiError);
  });
});
