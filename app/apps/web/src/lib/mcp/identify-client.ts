/**
 * CHAT-08 Part B — identify which external MCP client is calling, from its
 * User-Agent header. Not an exhaustive registry: AC5's v1 exit bar only
 * gates on Claude Desktop; Cursor/ChatGPT are mentioned in requirements but
 * not required to pass. Add cases as new clients are actually tested.
 */
export function identifyMcpClient(userAgent: string | null | undefined): string {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return "unknown";
  if (ua.includes("claude")) return "claude";
  if (ua.includes("cursor")) return "cursor";
  if (ua.includes("chatgpt") || ua.includes("openai")) return "chatgpt";
  return "unknown";
}
