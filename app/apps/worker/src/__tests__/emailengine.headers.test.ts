import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendEmail } from "../services/emailengine.js";

/**
 * P0-7 T1 — emailengine.sendEmail must merge In-Reply-To/References with any
 * caller-supplied headers (e.g. List-Unsubscribe One-Click), and emit NO
 * `headers` key when there are none (compat with the prior behaviour).
 */

function postedBody(): Record<string, unknown> {
  const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
  const init = fetchMock.mock.calls[0][1] as { body: string };
  return JSON.parse(init.body);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ messageId: "m", id: "i", response: "OK" }),
      text: async () => "",
    })),
  );
});

const base = {
  from: { name: "", address: "a@b.com" },
  to: [{ address: "x@y.com" }],
  subject: "s",
  html: "<p>hi</p>",
};

describe("emailengine.sendEmail — header merge", () => {
  it("merges threading + arbitrary headers (4 keys)", async () => {
    await sendEmail("acc", {
      ...base,
      inReplyTo: "<id@x>",
      headers: {
        "List-Unsubscribe": "<https://app/api/unsubscribe?x>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    expect(postedBody().headers).toEqual({
      "In-Reply-To": "<id@x>",
      References: "<id@x>",
      "List-Unsubscribe": "<https://app/api/unsubscribe?x>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("arbitrary headers only, no threading (2 keys)", async () => {
    await sendEmail("acc", {
      ...base,
      headers: {
        "List-Unsubscribe": "<https://app/api/unsubscribe?x>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    expect(postedBody().headers).toEqual({
      "List-Unsubscribe": "<https://app/api/unsubscribe?x>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("no headers and no inReplyTo -> body.headers absent", async () => {
    await sendEmail("acc", { ...base });
    expect(postedBody().headers).toBeUndefined();
  });

  it("inReplyTo without arbitrary headers keeps threading only", async () => {
    await sendEmail("acc", { ...base, inReplyTo: "<id@x>", references: "<root@x>" });
    expect(postedBody().headers).toEqual({ "In-Reply-To": "<id@x>", References: "<root@x>" });
  });
});
