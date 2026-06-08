import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the direct IMAP/SMTP mailbox path (no network): the IMAP
 * fetch→SyncedEmail mapping (dedup key, direction, UID high-water + filtering)
 * and the SMTP send/verify wrapper. imapflow / mailparser / nodemailer are
 * mocked so this runs offline.
 */

const fetchYield = vi.fn();

vi.mock("imapflow", () => ({
  ImapFlow: class {
    connect() {
      return Promise.resolve();
    }
    getMailboxLock() {
      return Promise.resolve({ release() {} });
    }
    fetch() {
      return fetchYield();
    }
    logout() {
      return Promise.resolve();
    }
  },
}));

const simpleParser = vi.fn();
vi.mock("mailparser", () => ({ simpleParser: (src: unknown) => simpleParser(src) }));

const sendMail = vi.fn();
const verify = vi.fn();
const close = vi.fn();
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail, verify, close })) },
}));

import { fetchRecentEmailsImap } from "@/lib/integrations/imap";
import { sendViaSmtp, verifySmtp } from "@/lib/integrations/smtp-send";

function asyncGen(items: unknown[]) {
  return (async function* () {
    for (const i of items) yield i;
  })();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchRecentEmailsImap", () => {
  it("maps messages to SyncedEmail, sets direction, dedup key, and max UID", async () => {
    fetchYield.mockReturnValue(asyncGen([
      { uid: 10, source: Buffer.from("raw1") },
      { uid: 11, source: Buffer.from("raw2") },
    ]));
    simpleParser
      .mockResolvedValueOnce({
        messageId: "<a@x>",
        from: { text: "Cust <cust@acme.com>", value: [{ address: "cust@acme.com" }] },
        to: { value: [{ address: "me@org.ch" }] },
        subject: "Hi",
        text: "Hello there",
        date: new Date("2026-01-01"),
      })
      .mockResolvedValueOnce({
        messageId: "<b@x>",
        from: { text: "Me <me@org.ch>", value: [{ address: "me@org.ch" }] },
        to: { value: [{ address: "cust@acme.com" }] },
        subject: "Re: Hi",
        text: "My reply",
        date: new Date("2026-01-02"),
      });

    const { emails, maxUid } = await fetchRecentEmailsImap(
      { emailAddress: "me@org.ch", imapHost: "mail.org.ch", imapPort: 993, password: "pw", imapLastUid: 9 },
      30,
    );

    expect(emails).toHaveLength(2);
    expect(maxUid).toBe(11);
    expect(emails[0].gmailMessageId).toBe("<a@x>");
    expect(emails[0].direction).toBe("inbound");
    expect(emails[0].to).toEqual(["me@org.ch"]);
    expect(emails[1].direction).toBe("outbound"); // sent by the mailbox owner
    expect(emails[1].subject).toBe("Re: Hi");
  });

  it("skips messages at or below the last seen UID", async () => {
    fetchYield.mockReturnValue(asyncGen([
      { uid: 10, source: Buffer.from("old") },
      { uid: 11, source: Buffer.from("new") },
    ]));
    simpleParser.mockResolvedValue({
      messageId: "<n@x>",
      from: { text: "x <x@y.com>", value: [{ address: "x@y.com" }] },
      to: { value: [{ address: "me@org.ch" }] },
      subject: "n",
      text: "n",
      date: new Date(),
    });

    const { emails, maxUid } = await fetchRecentEmailsImap(
      { emailAddress: "me@org.ch", imapHost: "h", imapPort: 993, password: "pw", imapLastUid: 10 },
      30,
    );

    expect(emails).toHaveLength(1); // uid 10 filtered, only 11 kept
    expect(maxUid).toBe(11);
  });

  it("falls back to a synthetic dedup key when Message-ID is absent", async () => {
    fetchYield.mockReturnValue(asyncGen([{ uid: 5, source: Buffer.from("r") }]));
    simpleParser.mockResolvedValueOnce({
      messageId: undefined,
      from: { text: "a <a@b.com>", value: [{ address: "a@b.com" }] },
      to: { value: [{ address: "me@org.ch" }] },
      subject: "s",
      text: "t",
      date: new Date(),
    });
    const { emails } = await fetchRecentEmailsImap(
      { emailAddress: "me@org.ch", imapHost: "h", imapPort: 993, password: "pw", imapLastUid: 0 },
      30,
    );
    expect(emails[0].gmailMessageId).toBe("imap-me@org.ch-5");
  });
});

describe("sendViaSmtp / verifySmtp", () => {
  it("sends from the mailbox identity and returns the message id", async () => {
    sendMail.mockResolvedValue({ messageId: "<sent@org.ch>" });
    const { messageId } = await sendViaSmtp(
      { emailAddress: "me@org.ch", smtpHost: "smtp.org.ch", smtpPort: 465, password: "pw", displayName: "Me" },
      { to: "cust@acme.com", subject: "Hello", html: "<p>Hi</p>" },
    );
    expect(messageId).toBe("<sent@org.ch>");
    const arg = sendMail.mock.calls[0][0];
    expect(arg.from).toBe('"Me" <me@org.ch>');
    expect(arg.to).toBe("cust@acme.com");
    expect(arg.subject).toBe("Hello");
    expect(arg.text).toContain("Hi"); // derived from html when text absent
    expect(close).toHaveBeenCalled();
  });

  it("verifySmtp throws a human-readable error on auth failure", async () => {
    verify.mockRejectedValue(new Error("Invalid login: 535 auth failed"));
    await expect(
      verifySmtp({ emailAddress: "me@org.ch", smtpHost: "h", smtpPort: 465, password: "bad" }),
    ).rejects.toThrow(/login failed/i);
  });
});
