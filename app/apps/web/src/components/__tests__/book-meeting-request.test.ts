// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bookMeetingRequest } from "@/components/meeting-scheduler";

/**
 * bookMeetingRequest is the single POST /api/meetings/book the human card and
 * the agent path both call. It must forward EITHER a linked contactId OR the
 * sender's contactEmail/contactName, so a meeting can be booked from a thread
 * whose sender isn't a CRM contact yet (the server resolves-or-creates).
 */

let fetchMock: ReturnType<typeof vi.fn>;
function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}
function err(data: unknown, status = 400) {
  return { ok: false, status, json: async () => data } as Response;
}
function bodyOfLastCall(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1)!;
  return JSON.parse((call[1] as RequestInit).body as string);
}

beforeEach(() => {
  fetchMock = vi.fn(async () => ok({ booked: true, joinUrl: "https://visio.example/abc", conferencing: "sovereign" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("bookMeetingRequest", () => {
  it("forwards contactEmail + contactName when there is no contactId", async () => {
    const r = await bookMeetingRequest({
      contactEmail: "paul@hexa.io",
      contactName: "Paul Martin",
      startTime: "2026-07-01T09:00:00.000Z",
      durationMinutes: 30,
    });
    expect(r.ok).toBe(true);
    expect(r.joinUrl).toBe("https://visio.example/abc");

    const body = bodyOfLastCall();
    expect(body.contactId).toBeUndefined();
    expect(body.contactEmail).toBe("paul@hexa.io");
    expect(body.contactName).toBe("Paul Martin");
    expect(body.startTime).toBe("2026-07-01T09:00:00.000Z");
  });

  it("forwards contactId when a contact is linked", async () => {
    await bookMeetingRequest({
      contactId: "ct-1",
      startTime: "2026-07-01T09:00:00.000Z",
    });
    const body = bodyOfLastCall();
    expect(body.contactId).toBe("ct-1");
  });

  it("surfaces the apiError MESSAGE string (not the {code,message} object) so the toast never gets an object", async () => {
    // The real /api/meetings/book returns apiError(...) = { error: { code, message } }
    // with a 4xx status (e.g. the no-calendar VALIDATION_ERROR). bookMeetingRequest
    // must unwrap .message — passing the object straight to toast() throws in React.
    fetchMock.mockResolvedValueOnce(
      err({ error: { code: "VALIDATION_ERROR", message: "Aucune boîte connectée." } }, 400),
    );
    const r = await bookMeetingRequest({ contactEmail: "paul@hexa.io", startTime: "2026-07-01T09:00:00.000Z" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Aucune boîte connectée.");
    expect(typeof r.error).toBe("string");
  });

  it("still surfaces a bare-string error (the 409/500 paths)", async () => {
    fetchMock.mockResolvedValueOnce(err({ booked: false, error: "Deep-dive weekly cap reached." }, 409));
    const r = await bookMeetingRequest({ contactId: "ct-1", startTime: "2026-07-01T09:00:00.000Z" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Deep-dive weekly cap reached.");
  });
});
