import { describe, it, expect } from "vitest";
import { processWorkspaceLogoFile, LOGO_FILE_ACCEPT } from "@/lib/logo/client-logo-file";

// The canvas rasterization path needs a real browser (covered by the live
// UI-cycle verification in _audit/2026-06-11-workspace-logo/). These tests
// pin the gates that reject a file BEFORE any canvas work happens.
describe("processWorkspaceLogoFile gates", () => {
  it("rejects unsupported file types with the friendly message", async () => {
    const gif = new File([new Uint8Array(10)], "logo.gif", { type: "image/gif" });
    await expect(processWorkspaceLogoFile(gif)).rejects.toThrow(/PNG, JPEG, WebP or SVG/);
  });

  it("rejects files with no type at all", async () => {
    const blob = new File([new Uint8Array(10)], "logo.bin", { type: "" });
    await expect(processWorkspaceLogoFile(blob)).rejects.toThrow(/PNG, JPEG, WebP or SVG/);
  });

  it("rejects source files over 4 MB before decoding", async () => {
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    await expect(processWorkspaceLogoFile(big)).rejects.toThrow(/larger than 4 MB/);
  });

  it("exposes an accept attribute covering exactly the four supported types", () => {
    const types = LOGO_FILE_ACCEPT.split(",");
    expect(types).toEqual(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
  });
});
