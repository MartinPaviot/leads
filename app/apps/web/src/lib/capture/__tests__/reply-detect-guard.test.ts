import { describe, it, expect } from "vitest";
import { canDetectReplyFromThread } from "../reply-detect-guard";

describe("canDetectReplyFromThread", () => {
  it("a threadId alone is sufficient — detection no longer depends on a resolved contact (the bug fix)", () => {
    // The regression case: an unresolved-sender reply (contactId=null upstream) on a
    // real tracked thread. The guard reads only threadId, so it now proceeds.
    expect(canDetectReplyFromThread({ threadId: "thread-123" })).toBe(true);
  });

  it("no threadId → cannot detect", () => {
    expect(canDetectReplyFromThread({ threadId: null })).toBe(false);
    expect(canDetectReplyFromThread({ threadId: undefined })).toBe(false);
    expect(canDetectReplyFromThread({ threadId: "" })).toBe(false);
    expect(canDetectReplyFromThread({})).toBe(false);
  });
});
