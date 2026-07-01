import { describe, it, expect } from "vitest";
import { identifyMcpClient } from "../identify-client";

describe("identifyMcpClient", () => {
  it("identifies Claude Desktop", () => {
    expect(identifyMcpClient("Claude-Desktop/1.2.3")).toBe("claude");
  });
  it("identifies Cursor", () => {
    expect(identifyMcpClient("Cursor/0.9")).toBe("cursor");
  });
  it("identifies ChatGPT/OpenAI clients", () => {
    expect(identifyMcpClient("ChatGPT-User/1.0")).toBe("chatgpt");
    expect(identifyMcpClient("OpenAI-MCP/1.0")).toBe("chatgpt");
  });
  it("falls back to unknown for an unrecognized or missing User-Agent", () => {
    expect(identifyMcpClient("SomeOtherClient/1.0")).toBe("unknown");
    expect(identifyMcpClient(null)).toBe("unknown");
    expect(identifyMcpClient(undefined)).toBe("unknown");
    expect(identifyMcpClient("")).toBe("unknown");
  });
  it("is case-insensitive", () => {
    expect(identifyMcpClient("CLAUDE-DESKTOP")).toBe("claude");
  });
});
