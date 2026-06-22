import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * P0-7 T6 — parity guard. P0-7 added the One-Click header to the BullMQ worker
 * path; this asserts the Inngest path (the reference we copied) STILL emits it
 * at both send sites, so a future edit can't silently drop bulk-sender
 * compliance on the Resend path.
 */

const src = readFileSync(
  fileURLToPath(new URL("../inngest/email-send-worker.ts", import.meta.url)),
  "utf8",
);

describe("email-send-worker — One-Click List-Unsubscribe parity", () => {
  it("emits List-Unsubscribe-Post One-Click at both send sites", () => {
    const oneClick = src.match(/["']List-Unsubscribe-Post["']\s*:\s*["']List-Unsubscribe=One-Click["']/g) || [];
    expect(oneClick.length).toBeGreaterThanOrEqual(2);
    const listUnsub = src.match(/["']List-Unsubscribe["']\s*:\s*`<\$\{unsubUrl\}>`/g) || [];
    expect(listUnsub.length).toBeGreaterThanOrEqual(2);
  });
});
