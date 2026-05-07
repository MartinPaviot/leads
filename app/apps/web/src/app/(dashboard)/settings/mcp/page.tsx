import { adminOnlyOrRedirect } from "@/lib/auth/admin-only";
import McpClient from "./mcp-client";

export default async function McpPage() {
  await adminOnlyOrRedirect();
  return <McpClient />;
}
