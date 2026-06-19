import { describe, it, expect } from "vitest";
import {
  attachmentsFromGmailPayload,
  attachmentsFromImap,
  normalizeAttachments,
  formatBytes,
} from "@/lib/inbox/attachment-meta";

describe("attachmentsFromGmailPayload (INBOX-R04)", () => {
  it("collects parts with a filename + attachmentId, recursively", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: "x" } },
        { filename: "report.pdf", mimeType: "application/pdf", body: { attachmentId: "a1", size: 2048 }, headers: [] },
        {
          mimeType: "multipart/related",
          parts: [
            { filename: "logo.png", mimeType: "image/png", body: { attachmentId: "a2", size: 512 }, headers: [{ name: "Content-ID", value: "<logo>" }] },
          ],
        },
      ],
    };
    const out = attachmentsFromGmailPayload(payload);
    expect(out.map((a) => a.filename)).toEqual(["report.pdf", "logo.png"]);
    expect(out[0].inline).toBe(false);
    expect(out[1].inline).toBe(true); // has Content-ID
    expect(out[0].size).toBe(2048);
  });

  it("ignores body parts without a filename", () => {
    expect(attachmentsFromGmailPayload({ mimeType: "text/html", body: { data: "x" } })).toEqual([]);
    expect(attachmentsFromGmailPayload(null)).toEqual([]);
  });
});

describe("attachmentsFromImap", () => {
  it("maps mailparser attachments and flags inline/related", () => {
    const out = attachmentsFromImap([
      { filename: "deck.pptx", contentType: "application/vnd...", size: 9000 },
      { filename: "sig.png", contentType: "image/png", size: 300, related: true },
      { contentType: "text/plain" }, // no filename → dropped
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].inline).toBe(true);
  });

  it("is null-safe", () => {
    expect(attachmentsFromImap(undefined)).toEqual([]);
  });
});

describe("normalizeAttachments + formatBytes", () => {
  it("round-trips stored JSON, dropping junk", () => {
    expect(normalizeAttachments([{ filename: "a.txt", size: 10 }, { size: 5 }])).toHaveLength(1);
    expect(normalizeAttachments("nope")).toEqual([]);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatBytes(0)).toBe("");
  });
});
