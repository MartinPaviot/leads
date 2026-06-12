import { notFound } from "next/navigation";
import { adminOnlyOrRedirect } from "@/lib/auth/admin-only";
import { MCP_PAGE_ENABLED } from "@/lib/settings/admin-tools-visibility";
import McpClient from "./mcp-client";

export default async function McpPage() {
  if (!MCP_PAGE_ENABLED) notFound();
  await adminOnlyOrRedirect();
  return <McpClient />;
}
