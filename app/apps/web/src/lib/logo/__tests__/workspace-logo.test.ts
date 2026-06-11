import { describe, it, expect } from "vitest";
import {
  isValidWorkspaceLogoDataUrl,
  parseWorkspaceLogoDataUrl,
  workspaceLogoUrl,
  WORKSPACE_LOGO_MAX_DATAURL_CHARS,
} from "@/lib/logo/workspace-logo";

// 1x1 transparent PNG.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_PNG_DATAURL = `data:image/png;base64,${TINY_PNG_B64}`;

describe("isValidWorkspaceLogoDataUrl", () => {
  it("accepts png, jpeg and webp data URLs", () => {
    expect(isValidWorkspaceLogoDataUrl(TINY_PNG_DATAURL)).toBe(true);
    expect(isValidWorkspaceLogoDataUrl(`data:image/jpeg;base64,${TINY_PNG_B64}`)).toBe(true);
    expect(isValidWorkspaceLogoDataUrl(`data:image/webp;base64,${TINY_PNG_B64}`)).toBe(true);
  });

  it("rejects SVG data URLs (scriptable markup must never be stored)", () => {
    const svgB64 = Buffer.from("<svg onload=alert(1)></svg>").toString("base64");
    expect(isValidWorkspaceLogoDataUrl(`data:image/svg+xml;base64,${svgB64}`)).toBe(false);
  });

  it("rejects non-data-URL strings", () => {
    expect(isValidWorkspaceLogoDataUrl("https://example.com/logo.png")).toBe(false);
    expect(isValidWorkspaceLogoDataUrl("")).toBe(false);
    expect(isValidWorkspaceLogoDataUrl("data:image/png;base64,")).toBe(false);
    expect(isValidWorkspaceLogoDataUrl("data:text/html;base64,PGh0bWw+")).toBe(false);
  });

  it("rejects base64 with illegal characters", () => {
    expect(isValidWorkspaceLogoDataUrl("data:image/png;base64,abc def")).toBe(false);
    expect(isValidWorkspaceLogoDataUrl("data:image/png;base64,abc<script>")).toBe(false);
  });

  it("rejects payloads over the size cap", () => {
    const oversize = `data:image/png;base64,${"A".repeat(WORKSPACE_LOGO_MAX_DATAURL_CHARS)}`;
    expect(isValidWorkspaceLogoDataUrl(oversize)).toBe(false);
  });
});

describe("parseWorkspaceLogoDataUrl", () => {
  it("round-trips mime and bytes", () => {
    const parsed = parseWorkspaceLogoDataUrl(TINY_PNG_DATAURL);
    expect(parsed).not.toBeNull();
    expect(parsed!.mime).toBe("image/png");
    expect(Buffer.from(parsed!.bytes).equals(Buffer.from(TINY_PNG_B64, "base64"))).toBe(true);
  });

  it("returns null on malformed input", () => {
    expect(parseWorkspaceLogoDataUrl("not a data url")).toBeNull();
    expect(parseWorkspaceLogoDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(
      parseWorkspaceLogoDataUrl(`data:image/png;base64,${"A".repeat(WORKSPACE_LOGO_MAX_DATAURL_CHARS)}`),
    ).toBeNull();
  });
});

describe("workspaceLogoUrl", () => {
  it("is null when no logo is stored", () => {
    expect(workspaceLogoUrl({})).toBeNull();
    expect(workspaceLogoUrl({ logoDataUrl: null })).toBeNull();
    expect(workspaceLogoUrl({ logoDataUrl: undefined })).toBeNull();
  });

  it("builds a versioned serving URL from logoUpdatedAt", () => {
    const url = workspaceLogoUrl({
      logoDataUrl: TINY_PNG_DATAURL,
      logoUpdatedAt: "2026-06-11T08:00:00.000Z",
    });
    expect(url).toBe(
      `/api/settings/workspace/logo?v=${encodeURIComponent("2026-06-11T08:00:00.000Z")}`,
    );
  });

  it("falls back to a stable version when logoUpdatedAt is missing", () => {
    expect(workspaceLogoUrl({ logoDataUrl: TINY_PNG_DATAURL })).toBe(
      "/api/settings/workspace/logo?v=0",
    );
  });
});
