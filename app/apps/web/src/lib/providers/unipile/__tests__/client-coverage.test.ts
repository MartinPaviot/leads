import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { UnipileConfig } from "../http";
import { resyncAccount, updateAccount } from "../accounts-lifecycle";
import { editMessage, forwardMessage, patchChat, getMessageAttachment } from "../messaging-extra";
import { closeJob, publishJob, linkedinRawRequest } from "../recruiter";
import { createCalendarEvent } from "../calendar";
import { sendEmail } from "../email";
import { createPost } from "../social-extra";

const cfg: UnipileConfig = { dsn: "https://api8.unipile.com:13443", apiKey: "k" };
const BASE = "https://api8.unipile.com:13443/api/v1";

let calls: Array<{ url: string; method: string; body: unknown; headers: Record<string, string> }>;

beforeEach(() => {
  calls = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

const last = () => calls[calls.length - 1];
const jsonBody = () => JSON.parse(String(last().body));

describe("unipile client coverage — URL / method / body construction", () => {
  it("resyncAccount → GET with the query params", async () => {
    await resyncAccount(cfg, "acc 1", { partial: true, linkedinProduct: "sales_navigator", chunkSize: 50 });
    expect(last().method).toBe("GET");
    expect(last().url).toBe(`${BASE}/accounts/acc%201/sync?partial=true&chunk_size=50&linkedin_product=sales_navigator`);
  });

  it("updateAccount → PATCH with a JSON body", async () => {
    await updateAccount(cfg, "a1", { country: "FR" });
    expect(last().method).toBe("PATCH");
    expect(last().url).toBe(`${BASE}/accounts/a1`);
    expect(jsonBody()).toEqual({ country: "FR" });
  });

  it("editMessage → PATCH {text}; forwardMessage → POST {chat_id}", async () => {
    await editMessage(cfg, "m1", "hi");
    expect(last().method).toBe("PATCH");
    expect(jsonBody()).toEqual({ text: "hi" });
    await forwardMessage(cfg, "m1", "c2");
    expect(last().url).toBe(`${BASE}/messages/m1/forward`);
    expect(jsonBody()).toEqual({ chat_id: "c2" });
  });

  it("patchChat → POST...wait PATCH /chats/{id} {action,value}", async () => {
    await patchChat(cfg, "c1", "setReadStatus", true);
    expect(last().method).toBe("PATCH");
    expect(last().url).toBe(`${BASE}/chats/c1`);
    expect(jsonBody()).toEqual({ action: "setReadStatus", value: true });
  });

  it("getMessageAttachment → GET binary (no content-type negotiation issue)", async () => {
    await getMessageAttachment(cfg, "m1", "att1");
    expect(last().method).toBe("GET");
    expect(last().url).toBe(`${BASE}/messages/m1/attachments/att1`);
  });

  it("closeJob puts account_id+service in QUERY; publishJob puts account_id in BODY", async () => {
    await closeJob(cfg, "j1", "acc", "RECRUITER");
    expect(last().url).toBe(`${BASE}/linkedin/jobs/j1/close?account_id=acc&service=RECRUITER`);
    await publishJob(cfg, "draft1", { account_id: "acc", service: "CLASSIC" });
    expect(last().url).toBe(`${BASE}/linkedin/jobs/draft1/publish`);
    expect(jsonBody()).toEqual({ account_id: "acc", service: "CLASSIC" });
  });

  it("linkedinRawRequest (magic route) → POST /linkedin with the raw body", async () => {
    await linkedinRawRequest(cfg, { account_id: "a", request_url: "https://www.linkedin.com/voyager/..." });
    expect(last().url).toBe(`${BASE}/linkedin`);
    expect(jsonBody()).toMatchObject({ account_id: "a", request_url: "https://www.linkedin.com/voyager/..." });
  });

  it("createCalendarEvent → POST JSON body with snake_case mapping", async () => {
    await createCalendarEvent(cfg, "cal1", "acc", { title: "T", start: 1, end: 2, attendees: [], isAttendeesListHidden: true });
    expect(last().url).toBe(`${BASE}/calendars/cal1/events?account_id=acc`);
    expect(jsonBody()).toMatchObject({ title: "T", is_attendees_list_hidden: true });
  });

  it("sendEmail and createPost use MULTIPART (FormData body, no manual content-type)", async () => {
    await sendEmail(cfg, { accountId: "a", to: [{ identifier: "x@y.com" }], body: "hello" });
    expect(last().body).toBeInstanceOf(FormData);
    expect(JSON.stringify(last().headers)).not.toMatch(/multipart/i); // boundary auto-set by fetch
    await createPost(cfg, { accountId: "a", text: "gm" });
    expect(last().url).toBe(`${BASE}/posts`);
    expect(last().body).toBeInstanceOf(FormData);
  });
});
